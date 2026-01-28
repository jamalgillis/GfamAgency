import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getStripeClient,
  getStripeContext,
  checkStripeConfiguration,
  checkBrandAccountConfiguration,
  buildStripeMetadata,
  PARENT_ORGANIZATION,
  isOrganizationKey,
  type StripeBrand,
} from "./lib/stripe";

/**
 * Internal query to get unsynced services
 */
export const getUnsyncedServices = internalQuery({
  args: {
    limit: v.optional(v.number()),
    brand: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.brand) {
      // Filter by brand
      return await ctx.db
        .query("services")
        .withIndex("by_sync_status", (q) => q.eq("stripeSynced", false))
        .filter((q) => q.eq(q.field("brand"), args.brand))
        .take(limit);
    }

    return await ctx.db
      .query("services")
      .withIndex("by_sync_status", (q) => q.eq("stripeSynced", false))
      .take(limit);
  },
});

/**
 * Internal mutation to update a service with Stripe IDs
 */
export const updateServiceStripeIds = internalMutation({
  args: {
    serviceId: v.id("services"),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.serviceId, {
      stripeProductId: args.stripeProductId,
      stripePriceId: args.stripePriceId,
      stripeSynced: true,
    });
  },
});

/**
 * Internal mutation to mark a service sync as failed
 */
export const markServiceSyncFailed = internalMutation({
  args: {
    serviceId: v.id("services"),
  },
  handler: async (ctx, args) => {
    // Keep stripeSynced as false so it can be retried
    console.error(`Failed to sync service ${args.serviceId}`);
  },
});

/**
 * Sync a single service to the GFAM Agency Stripe account
 * Creates a Product and Price with brand metadata for tracking
 */
export const syncSingleService = action({
  args: {
    serviceId: v.id("services"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Get the service from Convex
    const service = await ctx.runQuery(internal.stripeSync.getServiceById, {
      serviceId: args.serviceId,
    });

    if (!service) {
      return { success: false, error: "Service not found" };
    }

    if (service.stripeSynced) {
      return { success: true }; // Already synced
    }

    try {
      // Get the Stripe client
      const stripe = getStripeClient();

      // Get context for Organization API keys (required for sk_org_* keys)
      const context = getStripeContext(service.brand as StripeBrand);

      // Build metadata with brand tracking
      const metadata = buildStripeMetadata(
        service.brand as StripeBrand,
        service.category,
        {
          convexServiceId: args.serviceId,
          tags: service.tags.join(","),
        }
      );

      // Create Stripe Product with brand metadata
      // Pass context as second argument for Organization API keys
      const product = await stripe.products.create({
        name: service.name,
        description: service.description,
        metadata,
      }, context);

      // Create Stripe Price (convert dollars to cents)
      const unitAmountCents = Math.round(service.priceValue * 100);

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: unitAmountCents,
        currency: "usd",
        metadata,
      }, context);

      // Update Convex record with Stripe IDs
      await ctx.runMutation(internal.stripeSync.updateServiceStripeIds, {
        serviceId: args.serviceId,
        stripeProductId: product.id,
        stripePriceId: price.id,
      });

      console.log(
        `✅ Synced "${service.name}" (${service.brand}) to ${PARENT_ORGANIZATION} Stripe`
      );
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Failed to sync "${service.name}" (${service.brand}):`, errorMessage);

      await ctx.runMutation(internal.stripeSync.markServiceSyncFailed, {
        serviceId: args.serviceId,
      });

      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Internal query to get a single service by ID
 */
export const getServiceById = internalQuery({
  args: {
    serviceId: v.id("services"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.serviceId);
  },
});

/**
 * Sync services for a specific brand
 * All services sync to the single GFAM Agency Stripe account
 */
export const syncBrandServices = action({
  args: {
    brand: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    brand: string;
    total: number;
    synced: number;
    failed: number;
    errors: string[];
  }> => {
    const limit = args.limit ?? 50;
    const errors: string[] = [];
    let synced = 0;
    let failed = 0;

    // Get unsynced services for this brand
    const unsyncedServices = await ctx.runQuery(
      internal.stripeSync.getUnsyncedServices,
      { limit, brand: args.brand }
    );

    console.log(`🔄 Syncing ${unsyncedServices.length} ${args.brand} services...`);

    for (const service of unsyncedServices) {
      const result = await ctx.runAction(internal.stripeSync.syncSingleService, {
        serviceId: service._id,
      });

      if (result.success) {
        synced++;
      } else {
        failed++;
        if (result.error) {
          errors.push(`${service.name}: ${result.error}`);
        }
      }

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`✅ ${args.brand} sync complete: ${synced} synced, ${failed} failed`);

    return {
      brand: args.brand,
      total: unsyncedServices.length,
      synced,
      failed,
      errors,
    };
  },
});

/**
 * Batch sync all unsynced services to GFAM Agency Stripe account
 * Processes by brand for organized logging
 */
export const syncAllServices = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    total: number;
    synced: number;
    failed: number;
    byBrand: Record<string, { synced: number; failed: number }>;
    errors: string[];
  }> => {
    const limit = args.limit ?? 100;
    const allErrors: string[] = [];
    let totalSynced = 0;
    let totalFailed = 0;
    const byBrand: Record<string, { synced: number; failed: number }> = {};

    const brands = ["Sankofa", "Lighthouse", "Centex", "GFAM Media Studios"];

    console.log(`\n🏢 Syncing all services to ${PARENT_ORGANIZATION} Stripe account...\n`);

    for (const brand of brands) {
      console.log(`📦 Processing ${brand}...`);

      try {
        const result = await ctx.runAction(internal.stripeSync.syncBrandServices, {
          brand,
          limit: Math.ceil(limit / brands.length),
        });

        byBrand[brand] = { synced: result.synced, failed: result.failed };
        totalSynced += result.synced;
        totalFailed += result.failed;
        allErrors.push(...result.errors.map((e) => `[${brand}] ${e}`));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`❌ Failed to process ${brand}:`, errorMessage);
        allErrors.push(`[${brand}] Brand sync failed: ${errorMessage}`);
        byBrand[brand] = { synced: 0, failed: 0 };
      }
    }

    console.log(`\n✅ Total sync complete: ${totalSynced} synced, ${totalFailed} failed`);

    return {
      total: totalSynced + totalFailed,
      synced: totalSynced,
      failed: totalFailed,
      byBrand,
      errors: allErrors,
    };
  },
});

/**
 * Check sync status - how many services need syncing (internal)
 */
export const getSyncStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const unsynced = await ctx.db
      .query("services")
      .withIndex("by_sync_status", (q) => q.eq("stripeSynced", false))
      .collect();

    const synced = await ctx.db
      .query("services")
      .withIndex("by_sync_status", (q) => q.eq("stripeSynced", true))
      .collect();

    return {
      unsyncedCount: unsynced.length,
      syncedCount: synced.length,
      totalCount: unsynced.length + synced.length,
    };
  },
});

/**
 * Public query for sync status - can be used from dashboard
 */
export const checkSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db.query("services").collect();

    // Group by brand and sync status
    const byBrand: Record<string, { synced: number; unsynced: number }> = {};

    for (const service of services) {
      if (!byBrand[service.brand]) {
        byBrand[service.brand] = { synced: 0, unsynced: 0 };
      }
      if (service.stripeSynced) {
        byBrand[service.brand].synced++;
      } else {
        byBrand[service.brand].unsynced++;
      }
    }

    const totalUnsynced = services.filter((s) => !s.stripeSynced).length;
    const totalSynced = services.filter((s) => s.stripeSynced).length;

    return {
      unsyncedCount: totalUnsynced,
      syncedCount: totalSynced,
      totalCount: services.length,
      needsSync: totalUnsynced > 0,
      byBrand,
    };
  },
});

/**
 * Check if Stripe is properly configured
 */
export const checkStripeAccount = action({
  args: {},
  handler: async (): Promise<{
    configured: boolean;
    hasApiKey: boolean;
    hasWebhookSecret: boolean;
    organization: string;
    isOrgKey: boolean;
    brandAccountsConfigured: boolean;
    missingBrandAccounts: string[];
  }> => {
    const status = checkStripeConfiguration();
    const isOrgKey = isOrganizationKey();
    const brandStatus = checkBrandAccountConfiguration();

    return {
      ...status,
      organization: PARENT_ORGANIZATION,
      isOrgKey,
      brandAccountsConfigured: brandStatus.configured,
      missingBrandAccounts: brandStatus.missing,
    };
  },
});
