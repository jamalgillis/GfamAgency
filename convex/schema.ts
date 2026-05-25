import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Tenant-defined brand names are stored as plain strings.
export const brandUnion = v.string();

// Define service status
export const serviceStatusUnion = v.union(
  v.literal("active"),
  v.literal("inactive"),
);

export const billingTypeUnion = v.union(
  v.literal("one_time"),
  v.literal("recurring"),
);

export const recurringIntervalUnion = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
  v.literal("year"),
);

export const dunningActionUnion = v.union(
  v.literal("none"),
  v.literal("pause"),
  v.literal("cancel"),
);

export default defineSchema({
  services: defineTable({
    orgId: v.string(),

    // Core fields
    brand: brandUnion,
    name: v.string(),
    description: v.string(),
    category: v.string(),

    // Pricing
    price: v.string(), // Display price (e.g., "$500 - $1,000")
    priceValue: v.number(), // Base numeric value for calculations (in dollars)
    priceSuffix: v.optional(v.string()), // e.g., "/month", "/episode"
    billingType: v.optional(billingTypeUnion), // Defaults to one_time if omitted
    recurringInterval: v.optional(recurringIntervalUnion),
    recurringIntervalCount: v.optional(v.number()),

    // Metadata
    tags: v.array(v.string()),
    status: serviceStatusUnion,

    // Stripe integration
    stripeSynced: v.boolean(),
    stripeProductId: v.optional(v.string()), // Stripe Product ID (prod_xxx)
    stripePriceId: v.optional(v.string()), // Stripe Price ID (price_xxx)
    stripeRecurringPriceId: v.optional(v.string()), // Stripe recurring Price ID (price_xxx)
  })
    .index("by_org", ["orgId"])
    .index("by_org_brand", ["orgId", "brand"])
    .index("by_org_category", ["orgId", "category"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_sync_status", ["orgId", "stripeSynced"])
    .index("by_brand", ["brand"])
    .index("by_category", ["category"])
    .index("by_status", ["status"])
    .index("by_sync_status", ["stripeSynced"]),

  invoices: defineTable({
    orgId: v.string(),

    invoiceNumber: v.string(),
    // Primary brand - single brand if all items from one, parent organization label if mixed
    primaryBrand: v.string(),
    // All brands represented in this invoice
    participatingBrands: v.array(v.string()),
    clientId: v.id("clients"),
    stripeInvoiceId: v.optional(v.string()), // Optional until invoice is created in Stripe
    stripeCheckoutSessionId: v.optional(v.string()), // Optional for Checkout Session flow
    revisesInvoiceId: v.optional(v.id("invoices")), // If this is a revision, link to original invoice
    revisesStripeInvoiceId: v.optional(v.string()), // Stripe invoice ID of the original
    sourceType: v.optional(
      v.union(v.literal("one_time"), v.literal("subscription"))
    ),
    subscriptionId: v.optional(v.id("subscriptions")),
    stripeSubscriptionId: v.optional(v.string()),
    billingPeriodStart: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible"),
    ),
    totalCents: v.number(), // Total in cents for precision
    notes: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    createdAt: v.number(), // Timestamp
  })
    .index("by_org", ["orgId"])
    .index("by_org_primary_brand", ["orgId", "primaryBrand"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_client", ["orgId", "clientId"])
    .index("by_org_stripe_invoice_id", ["orgId", "stripeInvoiceId"])
    .index("by_org_source_type", ["orgId", "sourceType"])
    .index("by_org_subscription", ["orgId", "subscriptionId"])
    .index("by_org_stripe_subscription_id", ["orgId", "stripeSubscriptionId"])
    .index("by_primary_brand", ["primaryBrand"])
    .index("by_status", ["status"])
    .index("by_client", ["clientId"])
    .index("by_stripe_invoice_id", ["stripeInvoiceId"]),

  subscriptions: defineTable({
    orgId: v.string(),
    clientId: v.id("clients"),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    stripeSubscriptionId: v.string(),
    stripeCustomerId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("paused"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("unpaid"),
    ),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    dunningEnabled: v.optional(v.boolean()),
    dunningMaxAttempts: v.optional(v.number()),
    dunningRetryIntervalDays: v.optional(v.number()),
    dunningAction: v.optional(dunningActionUnion),
    dunningFailureCount: v.optional(v.number()),
    dunningLastFailureAt: v.optional(v.number()),
    dunningLastFailedInvoiceId: v.optional(v.string()),
    dunningLastActionAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        serviceId: v.optional(v.id("services")),
        brand: brandUnion,
        category: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        quantity: v.number(),
        stripePriceId: v.optional(v.string()),
        unitPriceCents: v.number(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_client", ["orgId", "clientId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_primary_brand", ["orgId", "primaryBrand"])
    .index("by_org_stripe_subscription_id", ["orgId", "stripeSubscriptionId"])
    .index("by_client", ["clientId"])
    .index("by_stripe_subscription_id", ["stripeSubscriptionId"]),

  // Line items for each invoice - supports both catalog and custom pricing
  invoiceLineItems: defineTable({
    orgId: v.string(),

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
    .index("by_org", ["orgId"])
    .index("by_org_invoice", ["orgId", "invoiceId"])
    .index("by_org_brand", ["orgId", "brand"])
    .index("by_invoice", ["invoiceId"])
    .index("by_brand", ["brand"]),

  // Internal ledger for brand-level earnings attribution and transfer audit trail
  brandLedger: defineTable({
    orgId: v.string(),

    brand: brandUnion,
    invoiceId: v.id("invoices"),
    amountCents: v.number(), // Net amount after platform fee
    platformFeeCents: v.number(), // Amount retained by platform
    stripePaymentIntentId: v.optional(v.string()), // Audit trail back to settled Stripe payment
    stripeTransferId: v.optional(v.string()), // Transfer that paid this brand out (if automated)
    status: v.union(
      v.literal("pending"),
      v.literal("credited"),
      v.literal("withdrawable"),
      v.literal("paid_out"),
    ),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_brand", ["orgId", "brand"])
    .index("by_org_invoice", ["orgId", "invoiceId"])
    .index("by_org_created_at", ["orgId", "createdAt"])
    .index("by_brand", ["brand"])
    .index("by_invoice", ["invoiceId"])
    .index("by_created_at", ["createdAt"]),

  clients: defineTable({
    orgId: v.string(),

    name: v.string(),
    company: v.string(),
    email: v.string(),
    stripeCustomerId: v.optional(v.string()), // Optional until synced to Stripe
  })
    .index("by_org", ["orgId"])
    .index("by_org_email", ["orgId", "email"])
    .index("by_email", ["email"]),

  // White-label branding configuration scoped to a Clerk organization.
  orgBranding: defineTable({
    orgId: v.string(),
    slug: v.string(), // URL slug used for /{tenantSlug}/...
    displayName: v.string(), // Full name shown in UI
    shortName: v.optional(v.string()), // Compact sidebar/mobile label
    logoMark: v.optional(v.string()), // Single-character fallback mark
    logoUrl: v.optional(v.string()), // Optional hosted logo URL
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    emailMode: v.optional(v.union(v.literal("platform"), v.literal("org_sender"))),
    senderName: v.optional(v.string()),
    senderEmail: v.optional(v.string()),
    senderReplyTo: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_slug", ["slug"]),

  feedback: defineTable({
    orgId: v.string(),
    orgDisplayName: v.string(),
    submittedByUserId: v.optional(v.string()),
    submittedByName: v.string(),
    submittedByEmail: v.optional(v.string()),
    topic: v.union(
      v.literal("bug"),
      v.literal("feature_request"),
      v.literal("usability"),
      v.literal("billing"),
      v.literal("general"),
    ),
    sentiment: v.optional(
      v.union(
        v.literal("frustrated"),
        v.literal("neutral"),
        v.literal("excited"),
        v.literal("love_it"),
      ),
    ),
    message: v.string(),
    pagePath: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    flaggedForReview: v.boolean(),
    status: v.union(
      v.literal("new"),
      v.literal("reviewed"),
      v.literal("resolved"),
    ),
    notificationStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    notificationError: v.optional(v.string()),
    notificationSentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_org_flagged", ["orgId", "flaggedForReview"])
    .index("by_org_created_at", ["orgId", "createdAt"]),
});
