import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { brandUnion } from "./schema";
import {
  getStripeClient,
  getStripeContext,
  buildStripeMetadata,
  PARENT_ORGANIZATION,
  type StripeBrand,
} from "./lib/stripe";
import type { Id } from "./_generated/dataModel";

// Line item input type for invoice creation
const lineItemValidator = v.object({
  serviceId: v.optional(v.id("services")),
  brand: brandUnion,
  category: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  quantity: v.number(),
  stripePriceId: v.optional(v.string()),
  unitPriceCents: v.number(),
  customPriceCents: v.optional(v.number()),
  isCustomItem: v.boolean(),
});

/**
 * Generate a unique invoice number
 */
function generateInvoiceNumber(): string {
  const prefix = "INV";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Internal query to get a client by ID
 */
export const getClientById = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

/**
 * Internal mutation to update client's Stripe customer ID
 * Single Stripe account means single customer ID per client
 */
export const updateClientStripeId = internalMutation({
  args: {
    clientId: v.id("clients"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.clientId, {
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

/**
 * Internal mutation to create invoice record in Convex
 */
export const createInvoiceRecord = internalMutation({
  args: {
    invoiceNumber: v.string(),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    clientId: v.id("clients"),
    stripeInvoiceId: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
    totalCents: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("invoices", {
      invoiceNumber: args.invoiceNumber,
      primaryBrand: args.primaryBrand,
      participatingBrands: args.participatingBrands,
      clientId: args.clientId,
      stripeInvoiceId: args.stripeInvoiceId,
      status: args.status,
      totalCents: args.totalCents,
      notes: args.notes,
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to update invoice with Stripe ID
 */
export const updateInvoiceStripeId = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    stripeInvoiceId: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, {
      stripeInvoiceId: args.stripeInvoiceId,
      status: args.status,
    });
  },
});

/**
 * Internal mutation to create line item records
 */
export const createLineItemRecords = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
  },
  handler: async (ctx, args) => {
    const ids: Id<"invoiceLineItems">[] = [];
    for (const item of args.lineItems) {
      const id = await ctx.db.insert("invoiceLineItems", {
        invoiceId: args.invoiceId,
        serviceId: item.serviceId,
        brand: item.brand,
        category: item.category,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        customPriceCents: item.customPriceCents,
        stripePriceId: item.stripePriceId,
        isCustomItem: item.isCustomItem,
      });
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Main action to create an invoice
 * Uses single GFAM Agency Stripe account with brand metadata tracking
 */
export const createInvoice = action({
  args: {
    clientId: v.id("clients"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    sendImmediately: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    stripeInvoiceId?: string;
    invoiceNumber?: string;
    status?: "draft" | "open";
    totalCents?: number;
    error?: string;
  }> => {
    try {
      // 1. Get client info
      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        clientId: args.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      // 2. Calculate totals and determine brands
      const brands = new Set<string>();
      let totalCents = 0;

      for (const item of args.lineItems) {
        brands.add(item.brand);
        const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
        totalCents += effectivePrice * item.quantity;
      }

      const participatingBrands = [...brands];
      const primaryBrand = brands.size === 1 ? participatingBrands[0] : PARENT_ORGANIZATION;

      console.log(`📧 Creating invoice for ${primaryBrand} on ${PARENT_ORGANIZATION} Stripe`);

      // 3. Get the single Stripe client
      const stripe = getStripeClient();

      // 4. Get context for Organization API keys (required for sk_org_* keys)
      // Use primary brand for all invoice operations to keep everything on same account
      const context = getStripeContext(primaryBrand as StripeBrand);

      // 5. Ensure client has a Stripe customer ID
      let stripeCustomerId = client.stripeCustomerId;

      if (!stripeCustomerId) {
        // Create Stripe customer
        const customer = await stripe.customers.create({
          name: client.name,
          email: client.email,
          metadata: {
            agency: PARENT_ORGANIZATION,
            company: client.company,
            convexClientId: args.clientId,
          },
        }, context);

        stripeCustomerId = customer.id;

        // Update client record
        await ctx.runMutation(internal.invoiceActions.updateClientStripeId, {
          clientId: args.clientId,
          stripeCustomerId: customer.id,
        });

        console.log(`👤 Created customer ${customer.id} on ${PARENT_ORGANIZATION} Stripe`);
      }

      // 6. Generate invoice number
      const invoiceNumber = generateInvoiceNumber();

      // 7. Create Convex invoice record first (as draft)
      const invoiceId = await ctx.runMutation(
        internal.invoiceActions.createInvoiceRecord,
        {
          invoiceNumber,
          primaryBrand,
          participatingBrands,
          clientId: args.clientId,
          status: "draft",
          totalCents,
          notes: args.notes,
        }
      );

      // 8. Create Stripe invoice with brand metadata
      const stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        collection_method: "send_invoice",
        days_until_due: 30,
        metadata: {
          agency: PARENT_ORGANIZATION,
          primaryBrand,
          participatingBrands: JSON.stringify(participatingBrands),
          convexInvoiceId: invoiceId,
          invoiceNumber,
        },
        description: `Services by ${participatingBrands.join(" & ")}`,
      }, context);

      // 9. Add line items to Stripe invoice
      for (const item of args.lineItems) {
        const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
        const hasCustomPrice = item.customPriceCents !== undefined;

        // Build metadata with brand tracking
        const itemMetadata = buildStripeMetadata(
          item.brand as StripeBrand,
          item.category,
          {
            convexInvoiceId: invoiceId,
            isCustomPrice: hasCustomPrice ? "true" : "false",
            ...(item.serviceId && { serviceId: item.serviceId }),
          }
        );

        // Use catalog price if available and not custom
        const usesCatalogPrice = item.stripePriceId && !hasCustomPrice;

        if (usesCatalogPrice && item.stripePriceId) {
          // Use catalog price
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice: stripeInvoice.id,
            price: item.stripePriceId,
            quantity: item.quantity,
            metadata: itemMetadata,
          }, context);
        } else {
          // Use price_data for custom pricing or ad-hoc items
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice: stripeInvoice.id,
            quantity: item.quantity,
            price_data: {
              currency: "usd",
              product_data: {
                name: hasCustomPrice
                  ? `${item.brand} Custom: ${item.name}`
                  : item.name,
                metadata: {
                  agency: PARENT_ORGANIZATION,
                  brand: item.brand,
                  category: item.category,
                },
              },
              unit_amount: effectivePrice,
            },
            metadata: itemMetadata,
          }, context);
        }
      }

      // 10. Save line items to Convex
      await ctx.runMutation(internal.invoiceActions.createLineItemRecords, {
        invoiceId,
        lineItems: args.lineItems,
      });

      // 11. Finalize and optionally send
      let finalStatus: "draft" | "open" = "draft";

      if (args.sendImmediately) {
        await stripe.invoices.finalizeInvoice(stripeInvoice.id, context);
        await stripe.invoices.sendInvoice(stripeInvoice.id, context);
        finalStatus = "open";
      }

      // 12. Update invoice with Stripe ID and final status
      await ctx.runMutation(internal.invoiceActions.updateInvoiceStripeId, {
        invoiceId,
        stripeInvoiceId: stripeInvoice.id,
        status: finalStatus,
      });

      console.log(`✅ Created invoice ${invoiceNumber} (${finalStatus})`);

      return {
        success: true,
        invoiceId,
        stripeInvoiceId: stripeInvoice.id,
        invoiceNumber,
        status: finalStatus,
        totalCents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to create invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Send a draft invoice
 */
export const sendDraftInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get the invoice from Convex
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (!invoice.stripeInvoiceId) {
        return { success: false, error: "Invoice has no Stripe ID" };
      }

      if (invoice.status !== "draft") {
        return { success: false, error: "Invoice is not a draft" };
      }

      // Get the single Stripe client
      const stripe = getStripeClient();

      // Get context for Organization API keys (required for sk_org_* keys)
      const context = getStripeContext(invoice.primaryBrand as StripeBrand);

      // Finalize and send in Stripe
      await stripe.invoices.finalizeInvoice(invoice.stripeInvoiceId, context);
      await stripe.invoices.sendInvoice(invoice.stripeInvoiceId, context);

      // Update status in Convex
      await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
        invoiceId: args.invoiceId,
        status: "open",
      });

      console.log(`✅ Sent invoice ${invoice.invoiceNumber}`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to send invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Internal query to get invoice by ID
 */
export const getInvoiceById = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.invoiceId);
  },
});

/**
 * Internal mutation to update invoice status
 */
export const updateInvoiceStatus = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, { status: args.status });
  },
});

/**
 * Public query to list invoices
 */
export const listInvoices = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("open"),
        v.literal("paid"),
        v.literal("void"),
        v.literal("uncollectible")
      )
    ),
    brand: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let invoicesQuery = ctx.db.query("invoices");

    if (args.status) {
      invoicesQuery = invoicesQuery.withIndex("by_status", (q) =>
        q.eq("status", args.status!)
      );
    }

    const invoices = await invoicesQuery.order("desc").take(limit);

    // Filter by brand if specified
    if (args.brand) {
      return invoices.filter((inv) =>
        inv.participatingBrands.includes(args.brand!)
      );
    }

    return invoices;
  },
});

/**
 * Public query to get invoice with line items
 */
export const getInvoiceWithLineItems = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const client = await ctx.db.get(invoice.clientId);

    return {
      ...invoice,
      lineItems,
      client,
    };
  },
});

/**
 * Get invoice revenue breakdown by brand
 */
export const getRevenueByBrand = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoices = await ctx.db.query("invoices").collect();

    // Filter by status if provided
    const filteredInvoices = args.status
      ? invoices.filter((inv) => inv.status === args.status)
      : invoices;

    // Get all line items for these invoices
    const revenueByBrand: Record<string, number> = {};

    for (const invoice of filteredInvoices) {
      const lineItems = await ctx.db
        .query("invoiceLineItems")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
        .collect();

      for (const item of lineItems) {
        const amount =
          (item.customPriceCents ?? item.unitPriceCents) * item.quantity;
        revenueByBrand[item.brand] = (revenueByBrand[item.brand] ?? 0) + amount;
      }
    }

    return revenueByBrand;
  },
});
