import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getBrandAccountId, getStripeClient, type StripeBrand } from "./lib/stripe";
import { brandUnion } from "./schema";

const PLATFORM_FEE_BPS = 200; // 2.00%
const paidSettlementSourceValidator = v.union(
  v.literal("payment_intent.succeeded"),
  v.literal("invoice.paid"),
  v.literal("checkout.session.completed"),
  v.literal("checkout.session.async_payment_succeeded"),
  v.literal("manual")
);
const checkoutSettlementSourceValidator = v.union(
  v.literal("checkout.session.completed"),
  v.literal("checkout.session.async_payment_succeeded")
);

/**
 * Update invoice status from Stripe webhook
 */
export const updateInvoiceFromWebhook = internalMutation({
  args: {
    convexInvoiceId: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
    stripeInvoiceId: v.string(),
    paidAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const invoiceId = args.convexInvoiceId as Id<"invoices">;
    // Find the invoice by convexInvoiceId (which is the _id stored as string)
    const invoice = await ctx.db.get(invoiceId);

    if (!invoice) {
      console.error(`Invoice not found: ${args.convexInvoiceId}`);
      return { success: false, error: "Invoice not found" };
    }

    // Build update object
    const updates: Record<string, any> = {
      status: args.status,
    };

    // Add optional fields if present
    if (args.paidAt) {
      updates.paidAt = args.paidAt;
    }

    if (args.sentAt) {
      updates.sentAt = args.sentAt;
    }

    // Ensure stripeInvoiceId matches (safety check)
    if (invoice.stripeInvoiceId && invoice.stripeInvoiceId !== args.stripeInvoiceId) {
      console.warn(
        `Stripe invoice ID mismatch: expected ${invoice.stripeInvoiceId}, got ${args.stripeInvoiceId}`
      );
    }

    await ctx.db.patch(invoiceId, updates);

    console.log(`✅ Updated invoice ${args.convexInvoiceId} status to ${args.status}`);

    return { success: true };
  },
});

/**
 * Record a payment failure
 */
export const recordPaymentFailure = internalMutation({
  args: {
    convexInvoiceId: v.string(),
    stripeInvoiceId: v.string(),
    failureMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const invoiceId = args.convexInvoiceId as Id<"invoices">;
    const invoice = await ctx.db.get(invoiceId);

    if (!invoice) {
      console.error(`Invoice not found: ${args.convexInvoiceId}`);
      return { success: false, error: "Invoice not found" };
    }

    // Record the failure - could add a paymentFailures array to track history
    // For now, just log it
    console.error(
      `Payment failed for invoice ${args.convexInvoiceId}: ${args.failureMessage}`
    );

    // Invoice stays "open" after payment failure - customer can retry
    // But we could add a lastPaymentError field

    return { success: true };
  },
});

/**
 * Get invoice by Stripe invoice ID
 */
export const getInvoiceByStripeId = internalQuery({
  args: {
    stripeInvoiceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("invoices")
      .withIndex("by_stripe_invoice_id", (q) =>
        q.eq("stripeInvoiceId", args.stripeInvoiceId)
      )
      .first();
  },
});

/**
 * Create brandLedger entries only after confirmed payment settlement events.
 * Supported triggers:
 * - payment_intent.succeeded
 * - invoice.paid
 * - checkout.session.completed
 * - checkout.session.async_payment_succeeded
 * - manual (admin-only fallback)
 */
export const processPaidInvoiceLedgerAttribution = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    settlementSource: paidSettlementSourceValidator,
    settlementId: v.string(),
    stripePaymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);

    if (!invoice) {
      console.error(
        `Invoice not found for ${args.settlementSource} (${args.settlementId})`
      );
      return { success: false, error: "Invoice not found" as const };
    }

    if (invoice.status !== "paid") {
      await ctx.db.patch(args.invoiceId, { status: "paid" });
    }

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", invoice.orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();

    if (lineItems.length === 0) {
      console.error(
        `Invoice ${args.invoiceId} has no line items for ${args.settlementSource} (${args.settlementId})`
      );
      return { success: false, error: "Invoice has no line items" as const };
    }

    // Group gross totals by brand. In the single-brand case this map has one entry.
    const totalsByBrand = new Map<(typeof lineItems)[number]["brand"], number>();

    for (const item of lineItems) {
      const effectiveUnitPrice = item.customPriceCents ?? item.unitPriceCents;
      const lineTotal = effectiveUnitPrice * item.quantity;
      totalsByBrand.set(item.brand, (totalsByBrand.get(item.brand) ?? 0) + lineTotal);
    }

    // Idempotency: webhook retries should not create duplicate brand ledger rows.
    // Include legacy rows missing orgId via by_invoice and backfill them.
    const existingLedgerRowsByOrg = await ctx.db
      .query("brandLedger")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", invoice.orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();

    const existingLedgerRowsByInvoice = await ctx.db
      .query("brandLedger")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const existingLedgerRowsMap = new Map(
      existingLedgerRowsByOrg.map((entry) => [entry._id, entry])
    );
    for (const entry of existingLedgerRowsByInvoice) {
      existingLedgerRowsMap.set(entry._id, entry);
    }
    const existingLedgerRows = Array.from(existingLedgerRowsMap.values());

    const existingBrands = new Set<(typeof lineItems)[number]["brand"]>(
      existingLedgerRows.map((entry) => entry.brand as (typeof lineItems)[number]["brand"])
    );

    let insertedCount = 0;
    let patchedCount = 0;
    const createdAt = Date.now();

    // Backfill orgId and payment intent ID for legacy rows.
    for (const entry of existingLedgerRows) {
      const updates: { orgId?: string; stripePaymentIntentId?: string } = {};

      if (entry.orgId !== invoice.orgId) {
        updates.orgId = invoice.orgId;
      }

      if (!entry.stripePaymentIntentId) {
        updates.stripePaymentIntentId = args.stripePaymentIntentId;
      }

      if (updates.orgId || updates.stripePaymentIntentId) {
        await ctx.db.patch(entry._id, updates);
        patchedCount += 1;
      }
    }

    for (const [brand, grossAmountCents] of totalsByBrand.entries()) {
      if (existingBrands.has(brand)) {
        continue;
      }

      const platformFeeCents = Math.round((grossAmountCents * PLATFORM_FEE_BPS) / 10_000);
      const amountCents = grossAmountCents - platformFeeCents;

      await ctx.db.insert("brandLedger", {
        orgId: invoice.orgId,
        brand,
        invoiceId: args.invoiceId,
        amountCents,
        platformFeeCents,
        stripePaymentIntentId: args.stripePaymentIntentId,
        status: "credited",
        createdAt,
      });

      insertedCount += 1;
    }

    console.log(
      `✅ Processed ${args.settlementSource} (${args.settlementId}): invoice=${args.invoiceId}, insertedLedgerRows=${insertedCount}`
    );

    return {
      success: true,
      invoiceId: args.invoiceId,
      settlementSource: args.settlementSource,
      settlementId: args.settlementId,
      stripePaymentIntentId: args.stripePaymentIntentId,
      insertedLedgerRows: insertedCount,
      patchedLedgerRows: patchedCount,
      skippedExistingRows: totalsByBrand.size - insertedCount,
    };
  },
});

/**
 * Load invoice settlement data for payout transfer processing.
 */
export const getCheckoutTransferWorkset = internalQuery({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      return null;
    }

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", invoice.orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();

    const totalsByBrand = new Map<(typeof lineItems)[number]["brand"], number>();
    for (const item of lineItems) {
      const effectiveUnitPrice = item.customPriceCents ?? item.unitPriceCents;
      const lineTotal = effectiveUnitPrice * item.quantity;
      totalsByBrand.set(item.brand, (totalsByBrand.get(item.brand) ?? 0) + lineTotal);
    }

    const existingLedgerRowsByOrg = await ctx.db
      .query("brandLedger")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", invoice.orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();

    const existingLedgerRowsByInvoice = await ctx.db
      .query("brandLedger")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const existingLedgerRowsMap = new Map(
      existingLedgerRowsByOrg.map((entry) => [entry._id, entry])
    );
    for (const entry of existingLedgerRowsByInvoice) {
      existingLedgerRowsMap.set(entry._id, entry);
    }
    const existingLedgerRows = Array.from(existingLedgerRowsMap.values());

    const brands = Array.from(totalsByBrand.entries()).map(([brand, grossAmountCents]) => {
      const platformFeeCents = Math.round((grossAmountCents * PLATFORM_FEE_BPS) / 10_000);
      const netAmountCents = grossAmountCents - platformFeeCents;

      return {
        brand,
        grossAmountCents,
        platformFeeCents,
        netAmountCents,
      };
    });

    return {
      invoiceId: args.invoiceId,
      orgId: invoice.orgId,
      brands,
      ledgerRows: existingLedgerRows.map((entry) => ({
        _id: entry._id,
        brand: entry.brand,
        amountCents: entry.amountCents,
        platformFeeCents: entry.platformFeeCents,
        stripePaymentIntentId: entry.stripePaymentIntentId,
        stripeTransferId: entry.stripeTransferId,
        status: entry.status,
        orgId: entry.orgId,
      })),
    };
  },
});

/**
 * Mark all ledger rows for an invoice+brand as transferred.
 * Handles legacy rows missing orgId.
 */
export const markBrandLedgerTransferForInvoiceBrand = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    orgId: v.string(),
    brand: brandUnion,
    stripeTransferId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rowsByOrg = await ctx.db
      .query("brandLedger")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", args.orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();

    const rowsByInvoice = await ctx.db
      .query("brandLedger")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const rowMap = new Map(rowsByOrg.map((entry) => [entry._id, entry]));
    for (const row of rowsByInvoice) {
      rowMap.set(row._id, row);
    }

    let patchedCount = 0;
    for (const row of rowMap.values()) {
      if (row.brand !== args.brand) {
        continue;
      }

      const updates: {
        orgId?: string;
        stripeTransferId?: string;
        stripePaymentIntentId?: string;
        status?: "pending" | "credited" | "withdrawable" | "paid_out";
      } = {};

      if (row.orgId !== args.orgId) {
        updates.orgId = args.orgId;
      }
      if (!row.stripeTransferId) {
        updates.stripeTransferId = args.stripeTransferId;
      }
      if (!row.stripePaymentIntentId && args.stripePaymentIntentId) {
        updates.stripePaymentIntentId = args.stripePaymentIntentId;
      }
      if (row.status !== "paid_out") {
        updates.status = "paid_out";
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(row._id, updates);
        patchedCount += 1;
      }
    }

    return {
      success: true,
      patchedCount,
    };
  },
});

/**
 * Checkout-session settlement path:
 * - ensure brand ledger attribution exists
 * - create one transfer per brand (idempotent)
 */
export const processCheckoutSessionTransferPayout = internalAction({
  args: {
    invoiceId: v.id("invoices"),
    settlementSource: checkoutSettlementSourceValidator,
    settlementId: v.string(),
    stripePaymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    const attribution = await ctx.runMutation(
      "webhooks:processPaidInvoiceLedgerAttribution" as any,
      {
        invoiceId: args.invoiceId,
        settlementSource: args.settlementSource,
        settlementId: args.settlementId,
        stripePaymentIntentId: args.stripePaymentIntentId,
      }
    );

    if (!attribution?.success) {
      return {
        success: false,
        error: attribution?.error ?? "Failed to attribute paid invoice settlement",
      };
    }

    const workset = await ctx.runQuery("webhooks:getCheckoutTransferWorkset" as any, {
      invoiceId: args.invoiceId,
    });

    if (!workset) {
      return { success: false, error: "Invoice not found" };
    }

    const stripe = getStripeClient();
    const errors: string[] = [];
    const skipped: Array<{ brand: string; reason: string }> = [];
    let transferredCount = 0;

    for (const brandTotals of workset.brands as Array<{
      brand: string;
      grossAmountCents: number;
      platformFeeCents: number;
      netAmountCents: number;
    }>) {
      const brand = brandTotals.brand;
      const rowsForBrand = (workset.ledgerRows as Array<{
        _id: Id<"brandLedger">;
        brand: string;
        amountCents: number;
        platformFeeCents: number;
        stripePaymentIntentId?: string;
        stripeTransferId?: string;
        status: "pending" | "credited" | "withdrawable" | "paid_out";
        orgId?: string;
      }>).filter((row) => row.brand === brand);

      if (rowsForBrand.some((row) => typeof row.stripeTransferId === "string")) {
        skipped.push({ brand, reason: "already_transferred" });
        continue;
      }

      const ledgerRow = rowsForBrand[0];
      if (!ledgerRow) {
        errors.push(`${brand}: missing_ledger_row`);
        continue;
      }

      if (ledgerRow.amountCents <= 0) {
        skipped.push({ brand, reason: "non_positive_amount" });
        continue;
      }

      const destinationAccountId = getBrandAccountId(brand as StripeBrand);
      if (!destinationAccountId) {
        errors.push(`${brand}: missing_destination_account_id`);
        continue;
      }

      try {
        const transfer = await stripe.transfers.create(
          {
            amount: ledgerRow.amountCents,
            currency: "usd",
            destination: destinationAccountId,
            transfer_group: args.invoiceId,
            metadata: {
              invoiceId: args.invoiceId,
              brand,
              settlementSource: args.settlementSource,
              settlementId: args.settlementId,
              stripePaymentIntentId: args.stripePaymentIntentId,
            },
          },
          {
            idempotencyKey: `invoice-transfer:${args.invoiceId}:${brand}`,
          }
        );

        await ctx.runMutation("webhooks:markBrandLedgerTransferForInvoiceBrand" as any, {
          invoiceId: args.invoiceId,
          orgId: workset.orgId,
          brand,
          stripeTransferId: transfer.id,
          stripePaymentIntentId: args.stripePaymentIntentId,
        });

        transferredCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${brand}: ${message}`);
      }
    }

    return {
      success: errors.length === 0,
      invoiceId: args.invoiceId,
      transferredCount,
      skippedCount: skipped.length,
      skipped,
      errorCount: errors.length,
      errors,
    };
  },
});
