import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define the brand union for consistency
export const brandUnion = v.union(
  v.literal("Sankofa"),
  v.literal("Lighthouse"),
  v.literal("Centex"),
  v.literal("GFAM Media Studios")
);

// Define service status
export const serviceStatusUnion = v.union(
  v.literal("active"),
  v.literal("inactive")
);

export default defineSchema({
  services: defineTable({
    // Core fields
    brand: brandUnion,
    name: v.string(),
    description: v.string(),
    category: v.string(),

    // Pricing
    price: v.string(), // Display price (e.g., "$500 - $1,000")
    priceValue: v.number(), // Base numeric value for calculations (in dollars)
    priceSuffix: v.optional(v.string()), // e.g., "/month", "/episode"

    // Metadata
    tags: v.array(v.string()),
    status: serviceStatusUnion,

    // Stripe integration
    stripeSynced: v.boolean(),
    stripeProductId: v.optional(v.string()), // Stripe Product ID (prod_xxx)
    stripePriceId: v.optional(v.string()), // Stripe Price ID (price_xxx)
  })
    .index("by_brand", ["brand"])
    .index("by_category", ["category"])
    .index("by_status", ["status"])
    .index("by_sync_status", ["stripeSynced"]),

  invoices: defineTable({
    invoiceNumber: v.string(),
    // Primary brand - single brand if all items from one, "GFAM Agency" if mixed
    primaryBrand: v.string(),
    // All brands represented in this invoice
    participatingBrands: v.array(v.string()),
    clientId: v.id("clients"),
    stripeInvoiceId: v.optional(v.string()), // Optional until invoice is created in Stripe
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
    totalCents: v.number(), // Total in cents for precision
    notes: v.optional(v.string()),
    createdAt: v.number(), // Timestamp
  })
    .index("by_primary_brand", ["primaryBrand"])
    .index("by_status", ["status"])
    .index("by_client", ["clientId"]),

  // Line items for each invoice - supports both catalog and custom pricing
  invoiceLineItems: defineTable({
    invoiceId: v.id("invoices"),
    // Reference to catalog service (null for custom/ad-hoc items)
    serviceId: v.optional(v.id("services")),
    // Brand attribution for revenue reporting
    brand: brandUnion,
    category: v.string(),
    // Item details
    name: v.string(),
    description: v.optional(v.string()),
    quantity: v.number(),
    // Pricing (in cents)
    unitPriceCents: v.number(), // Standard catalog rate
    customPriceCents: v.optional(v.number()), // Override rate (e.g., legacy $1,100 package)
    // Stripe reference (null for custom items using price_data)
    stripePriceId: v.optional(v.string()),
    // Flag for ad-hoc items
    isCustomItem: v.boolean(),
  })
    .index("by_invoice", ["invoiceId"])
    .index("by_brand", ["brand"]),

  clients: defineTable({
    name: v.string(),
    company: v.string(),
    email: v.string(),
    stripeCustomerId: v.optional(v.string()), // Optional until synced to Stripe
  }).index("by_email", ["email"]),
});
