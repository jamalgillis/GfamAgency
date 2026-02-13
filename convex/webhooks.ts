import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const PLATFORM_FEE_BPS = 200; // 2.00%

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
    // Note: This requires iterating since we don't have an index on stripeInvoiceId
    // In production, you'd want to add this index
    const invoices = await ctx.db.query("invoices").collect();
    return invoices.find((inv) => inv.stripeInvoiceId === args.stripeInvoiceId);
  },
});

/**
 * Create brandLedger entries only after confirmed payment settlement events.
 * Supported triggers:
 * - payment_intent.succeeded
 * - invoice.paid
 * - checkout.session.completed
 * - checkout.session.async_payment_succeeded
 */
export const processPaidInvoiceLedgerAttribution = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    settlementSource: v.union(
      v.literal("payment_intent.succeeded"),
      v.literal("invoice.paid"),
      v.literal("checkout.session.completed"),
      v.literal("checkout.session.async_payment_succeeded")
    ),
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
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
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
    const existingLedgerRows = await ctx.db
      .query("brandLedger")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const existingBrands = new Set<(typeof lineItems)[number]["brand"]>(
      existingLedgerRows.map((entry) => entry.brand as (typeof lineItems)[number]["brand"])
    );

    let insertedCount = 0;
    let patchedCount = 0;
    const createdAt = Date.now();

    // Backfill payment intent ID for existing rows created before audit field rollout.
    for (const entry of existingLedgerRows) {
      if (!entry.stripePaymentIntentId) {
        await ctx.db.patch(entry._id, {
          stripePaymentIntentId: args.stripePaymentIntentId,
        });
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
