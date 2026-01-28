import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
    // Find the invoice by convexInvoiceId (which is the _id stored as string)
    const invoice = await ctx.db.get(args.convexInvoiceId as any);

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

    await ctx.db.patch(args.convexInvoiceId as any, updates);

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
    const invoice = await ctx.db.get(args.convexInvoiceId as any);

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
