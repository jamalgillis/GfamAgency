import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { brandUnion, serviceStatusUnion } from "./schema";

/**
 * Seed the services table with mapped brand data
 * Run with: bunx convex run seed:seedServices
 */
export const seedServices = mutation({
  args: {
    orgId: v.optional(v.string()),
    services: v.array(
      v.object({
        brand: brandUnion,
        name: v.string(),
        description: v.string(),
        category: v.string(),
        price: v.string(),
        priceValue: v.number(),
        priceSuffix: v.optional(v.string()),
        tags: v.array(v.string()),
        status: serviceStatusUnion,
        stripeSynced: v.boolean(),
        stripeProductId: v.optional(v.string()),
        stripePriceId: v.optional(v.string()),
      })
    ),
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const orgId = args.orgId ?? "dev-seed-org";

    // Optionally clear existing services
    if (args.clearExisting) {
      const existing = await ctx.db
        .query("services")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect();
      for (const service of existing) {
        await ctx.db.delete(service._id);
      }
      console.log(`Cleared ${existing.length} existing services`);
    }

    // Insert new services
    const inserted: string[] = [];
    for (const service of args.services) {
      const id = await ctx.db.insert("services", { ...service, orgId });
      inserted.push(id);
    }

    return {
      success: true,
      inserted: inserted.length,
      message: `Successfully seeded ${inserted.length} services`,
    };
  },
});

/**
 * Seed a single service (useful for testing)
 */
export const seedSingleService = mutation({
  args: {
    orgId: v.optional(v.string()),
    brand: brandUnion,
    name: v.string(),
    description: v.string(),
    category: v.string(),
    price: v.string(),
    priceValue: v.number(),
    priceSuffix: v.optional(v.string()),
    tags: v.array(v.string()),
    status: serviceStatusUnion,
    stripeSynced: v.boolean(),
    stripeProductId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId = "dev-seed-org", ...service } = args;
    const id = await ctx.db.insert("services", { ...service, orgId });
    return { success: true, id };
  },
});

/**
 * Clear all services (use with caution)
 */
export const clearServices = mutation({
  args: {
    orgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orgId = args.orgId ?? "dev-seed-org";
    const existing = await ctx.db
      .query("services")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const service of existing) {
      await ctx.db.delete(service._id);
    }
    return {
      success: true,
      deleted: existing.length,
    };
  },
});

/**
 * Backfill orgId for all services.
 * Run with:
 *   CI=1 bunx convex run seed:backfillServicesOrgId '{"orgId":"org_...","overwriteExisting":true}'
 */
export const backfillServicesOrgId = mutation({
  args: {
    orgId: v.string(),
    overwriteExisting: v.optional(v.boolean()),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const overwriteExisting = args.overwriteExisting ?? true;
    const dryRun = args.dryRun ?? false;
    const limit = Math.min(Math.max(args.limit ?? 10000, 1), 50000);

    const services = await ctx.db.query("services").take(limit);

    let patched = 0;
    let alreadyTargetOrg = 0;
    let skippedDifferentOrg = 0;

    for (const service of services) {
      const currentOrgId = service.orgId;

      if (currentOrgId === args.orgId) {
        alreadyTargetOrg += 1;
        continue;
      }

      if (!overwriteExisting && typeof currentOrgId === "string" && currentOrgId.length > 0) {
        skippedDifferentOrg += 1;
        continue;
      }

      if (!dryRun) {
        await ctx.db.patch(service._id, { orgId: args.orgId });
      }
      patched += 1;
    }

    return {
      success: true,
      orgId: args.orgId,
      dryRun,
      overwriteExisting,
      scanned: services.length,
      patched,
      alreadyTargetOrg,
      skippedDifferentOrg,
      limit,
    };
  },
});

/**
 * Audit and optionally normalize services for a given org.
 * Useful when records were inserted manually and UI expects complete fields.
 */
export const auditServicesForOrg = mutation({
  args: {
    orgId: v.string(),
    normalize: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalize = args.normalize ?? false;
    const limit = Math.min(Math.max(args.limit ?? 10000, 1), 50000);

    const services = await ctx.db
      .query("services")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(limit);

    let activeCount = 0;
    let inactiveCount = 0;
    let unknownStatusCount = 0;
    let missingTagsCount = 0;
    let missingDescriptionCount = 0;
    let missingPriceCount = 0;
    let missingPriceValueCount = 0;
    let missingCategoryCount = 0;
    let missingStripeSyncedCount = 0;
    let normalizedCount = 0;

    const samples = services.slice(0, 8).map((service) => ({
      id: service._id,
      name: service.name,
      status: (service as { status?: unknown }).status,
      hasTags: Array.isArray((service as { tags?: unknown }).tags),
      hasDescription:
        typeof (service as { description?: unknown }).description === "string" &&
        ((service as { description?: string }).description ?? "").length > 0,
      hasPrice:
        typeof (service as { price?: unknown }).price === "string" &&
        ((service as { price?: string }).price ?? "").length > 0,
      hasPriceValue: typeof (service as { priceValue?: unknown }).priceValue === "number",
      hasCategory:
        typeof (service as { category?: unknown }).category === "string" &&
        ((service as { category?: string }).category ?? "").length > 0,
      hasStripeSynced:
        typeof (service as { stripeSynced?: unknown }).stripeSynced === "boolean",
    }));

    for (const service of services) {
      const statusValue = (service as { status?: unknown }).status;
      if (statusValue === "active") {
        activeCount += 1;
      } else if (statusValue === "inactive") {
        inactiveCount += 1;
      } else {
        unknownStatusCount += 1;
      }

      const tagsValue = (service as { tags?: unknown }).tags;
      const hasTags = Array.isArray(tagsValue);
      if (!hasTags) {
        missingTagsCount += 1;
      }

      const descriptionValue = (service as { description?: unknown }).description;
      const hasDescription = typeof descriptionValue === "string" && descriptionValue.length > 0;
      if (!hasDescription) {
        missingDescriptionCount += 1;
      }

      const priceValueRaw = (service as { price?: unknown }).price;
      const hasPrice = typeof priceValueRaw === "string" && priceValueRaw.length > 0;
      if (!hasPrice) {
        missingPriceCount += 1;
      }

      const hasPriceValue =
        typeof (service as { priceValue?: unknown }).priceValue === "number";
      if (!hasPriceValue) {
        missingPriceValueCount += 1;
      }

      const categoryValue = (service as { category?: unknown }).category;
      const hasCategory = typeof categoryValue === "string" && categoryValue.length > 0;
      if (!hasCategory) {
        missingCategoryCount += 1;
      }

      const hasStripeSynced =
        typeof (service as { stripeSynced?: unknown }).stripeSynced === "boolean";
      if (!hasStripeSynced) {
        missingStripeSyncedCount += 1;
      }

      if (!normalize) {
        continue;
      }

      const patch: {
        status?: "active" | "inactive";
        tags?: string[];
        description?: string;
        price?: string;
        category?: string;
        stripeSynced?: boolean;
      } = {};

      if (statusValue !== "active" && statusValue !== "inactive") {
        patch.status = "active";
      }

      if (!hasTags) {
        patch.tags = [];
      }

      if (!hasDescription) {
        patch.description = service.name;
      }

      if (!hasPrice) {
        const value = (service as { priceValue?: number }).priceValue;
        patch.price =
          typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "$0.00";
      }

      if (!hasCategory) {
        patch.category = "General";
      }

      if (!hasStripeSynced) {
        patch.stripeSynced = false;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(service._id, patch);
        normalizedCount += 1;
      }
    }

    return {
      success: true,
      orgId: args.orgId,
      scanned: services.length,
      activeCount,
      inactiveCount,
      unknownStatusCount,
      missingTagsCount,
      missingDescriptionCount,
      missingPriceCount,
      missingPriceValueCount,
      missingCategoryCount,
      missingStripeSyncedCount,
      normalized: normalize,
      normalizedCount,
      sample: samples,
      limit,
    };
  },
});

/**
 * Seed test clients
 * Run with: npx convex run seed:seedClients
 */
export const seedClients = mutation({
  args: {
    orgId: v.optional(v.string()),
    clearExisting: v.optional(v.boolean()),
    clients: v.optional(
      v.array(
        v.object({
          name: v.string(),
          company: v.string(),
          email: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const orgId = args.orgId ?? "dev-seed-org";

    // Optionally clear existing clients
    if (args.clearExisting) {
      const existing = await ctx.db
        .query("clients")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect();
      for (const client of existing) {
        await ctx.db.delete(client._id);
      }
      console.log(`Cleared ${existing.length} existing clients`);
    }

    // Sample clients for testing
    const fallbackClients = [
      {
        name: "John Smith",
        company: "Smith & Co Marketing",
        email: "john@smithco.com",
      },
      {
        name: "Sarah Johnson",
        company: "Bright Ideas Agency",
        email: "sarah@brightideas.com",
      },
      {
        name: "Michael Chen",
        company: "Chen Media Group",
        email: "michael@chenmedia.com",
      },
      {
        name: "Emily Davis",
        company: "Davis Productions",
        email: "emily@davisproductions.com",
      },
      {
        name: "Robert Wilson",
        company: "Wilson Sports Network",
        email: "robert@wilsonsports.com",
      },
    ];
    const testClients = args.clients ?? fallbackClients;

    const inserted: string[] = [];
    for (const client of testClients) {
      // Check if client already exists
      const existing = await ctx.db
        .query("clients")
        .withIndex("by_org_email", (q) => q.eq("orgId", orgId).eq("email", client.email))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("clients", {
          orgId,
          ...client,
          stripeCustomerId: undefined,
        });
        inserted.push(id);
      }
    }

    return {
      success: true,
      inserted: inserted.length,
      message: `Successfully seeded ${inserted.length} clients`,
    };
  },
});

/**
 * Audit orgId coverage across org-scoped tables.
 * Useful in dev when seeded data was written to a fallback orgId.
 * Run with: bunx convex run seed:auditOrgCoverage '{}'
 */
export const auditOrgCoverage = mutation({
  args: {
    limitPerTable: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limitPerTable = Math.min(Math.max(args.limitPerTable ?? 50000, 1), 100000);

    const tally = <T extends { orgId?: string }>(rows: T[]) => {
      const byOrg: Record<string, number> = {};
      let missingOrg = 0;

      for (const row of rows) {
        if (typeof row.orgId !== "string" || row.orgId.length === 0) {
          missingOrg += 1;
          continue;
        }
        byOrg[row.orgId] = (byOrg[row.orgId] ?? 0) + 1;
      }

      return {
        scanned: rows.length,
        byOrg,
        missingOrg,
      };
    };

    const services = tally(await ctx.db.query("services").take(limitPerTable));
    const clients = tally(await ctx.db.query("clients").take(limitPerTable));
    const invoices = tally(await ctx.db.query("invoices").take(limitPerTable));
    const invoiceLineItems = tally(await ctx.db.query("invoiceLineItems").take(limitPerTable));
    const subscriptions = tally(await ctx.db.query("subscriptions").take(limitPerTable));
    const brandLedger = tally(await ctx.db.query("brandLedger").take(limitPerTable));
    const orgBranding = tally(await ctx.db.query("orgBranding").take(limitPerTable));

    const aggregateByOrg: Record<string, number> = {};
    for (const table of [
      services,
      clients,
      invoices,
      invoiceLineItems,
      subscriptions,
      brandLedger,
      orgBranding,
    ]) {
      for (const [orgId, count] of Object.entries(table.byOrg)) {
        aggregateByOrg[orgId] = (aggregateByOrg[orgId] ?? 0) + count;
      }
    }

    return {
      success: true,
      limitPerTable,
      aggregateByOrg,
      tables: {
        services,
        clients,
        invoices,
        invoiceLineItems,
        subscriptions,
        brandLedger,
        orgBranding,
      },
    };
  },
});

/**
 * Delete duplicate service rows by explicit keep/delete pairs with safety checks.
 * Intended for one-time production cleanup after a manual audit.
 */
export const dedupeServicesByIdPairs = mutation({
  args: {
    orgId: v.string(),
    pairs: v.array(
      v.object({
        keepId: v.id("services"),
        deleteId: v.id("services"),
      }),
    ),
    dryRun: v.optional(v.boolean()),
    confirm: v.optional(v.string()),
    requireKeepStripeSynced: v.optional(v.boolean()),
    requireDeleteUnsynced: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const requireKeepStripeSynced = args.requireKeepStripeSynced ?? true;
    const requireDeleteUnsynced = args.requireDeleteUnsynced ?? true;

    if (!dryRun && args.confirm !== "DELETE_DUPLICATE_SERVICES") {
      throw new Error(
        "Refusing to delete in non-dry-run mode without confirm=DELETE_DUPLICATE_SERVICES",
      );
    }

    const normalize = (value: string) => value.trim().toLowerCase();

    if (args.pairs.length === 0) {
      return {
        success: true,
        dryRun,
        orgId: args.orgId,
        requestedPairs: 0,
        deleted: 0,
      };
    }

    const pairKeys = new Set<string>();
    const keepIds = new Set<string>();
    const deleteIds = new Set<string>();

    for (const pair of args.pairs) {
      if (pair.keepId === pair.deleteId) {
        throw new Error(`Invalid pair: keepId and deleteId are the same (${pair.keepId})`);
      }

      const key = `${pair.keepId}=>${pair.deleteId}`;
      if (pairKeys.has(key)) {
        throw new Error(`Duplicate pair specified: ${key}`);
      }
      pairKeys.add(key);

      if (keepIds.has(pair.keepId)) {
        throw new Error(`A keepId is used more than once: ${pair.keepId}`);
      }
      if (deleteIds.has(pair.deleteId)) {
        throw new Error(`A deleteId is used more than once: ${pair.deleteId}`);
      }
      if (deleteIds.has(pair.keepId) || keepIds.has(pair.deleteId)) {
        throw new Error(
          `ID appears across keep/delete sets; refusing to continue (${pair.keepId}, ${pair.deleteId})`,
        );
      }

      keepIds.add(pair.keepId);
      deleteIds.add(pair.deleteId);
    }

    const orgServices = await ctx.db
      .query("services")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(50000);
    const servicesById = new Map(orgServices.map((service) => [service._id, service]));

    const pairAudit = args.pairs.map((pair) => {
      const keep = servicesById.get(pair.keepId);
      const duplicate = servicesById.get(pair.deleteId);

      if (!keep) {
        throw new Error(`Keep service not found in org ${args.orgId}: ${pair.keepId}`);
      }
      if (!duplicate) {
        throw new Error(`Delete service not found in org ${args.orgId}: ${pair.deleteId}`);
      }

      if (keep.orgId !== args.orgId || duplicate.orgId !== args.orgId) {
        throw new Error(`Pair contains service outside org ${args.orgId}`);
      }

      if (keep.brand !== duplicate.brand) {
        throw new Error(
          `Brand mismatch for pair ${pair.keepId}/${pair.deleteId}: ${keep.brand} vs ${duplicate.brand}`,
        );
      }
      if (normalize(keep.name) !== normalize(duplicate.name)) {
        throw new Error(
          `Name mismatch for pair ${pair.keepId}/${pair.deleteId}: "${keep.name}" vs "${duplicate.name}"`,
        );
      }
      if (keep.category !== duplicate.category) {
        throw new Error(
          `Category mismatch for pair ${pair.keepId}/${pair.deleteId}: ${keep.category} vs ${duplicate.category}`,
        );
      }
      if (keep.priceValue !== duplicate.priceValue) {
        throw new Error(
          `priceValue mismatch for pair ${pair.keepId}/${pair.deleteId}: ${keep.priceValue} vs ${duplicate.priceValue}`,
        );
      }

      if (requireKeepStripeSynced && keep.stripeSynced !== true) {
        throw new Error(`Keep service must be stripeSynced=true: ${pair.keepId}`);
      }
      if (requireDeleteUnsynced && duplicate.stripeSynced !== false) {
        throw new Error(`Delete service must be stripeSynced=false: ${pair.deleteId}`);
      }

      if (duplicate.stripeProductId || duplicate.stripePriceId || duplicate.stripeRecurringPriceId) {
        throw new Error(
          `Delete service has Stripe IDs; refusing to delete without manual review: ${pair.deleteId}`,
        );
      }

      return {
        keepId: pair.keepId,
        deleteId: pair.deleteId,
        brand: keep.brand,
        name: keep.name,
        category: keep.category,
        keepStripeSynced: keep.stripeSynced,
        deleteStripeSynced: duplicate.stripeSynced,
      };
    });

    const invoiceLineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const invoiceLineItemReferences = invoiceLineItems
      .filter((row) => !!row.serviceId && deleteIds.has(row.serviceId))
      .map((row) => ({
        lineItemId: row._id,
        invoiceId: row.invoiceId,
        serviceId: row.serviceId,
        name: row.name,
        stripePriceId: row.stripePriceId,
      }));

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const subscriptionReferences = subscriptions.flatMap((subscription) =>
      subscription.items
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => !!item.serviceId && deleteIds.has(item.serviceId))
        .map(({ item, itemIndex }) => ({
          subscriptionId: subscription._id,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          itemIndex,
          serviceId: item.serviceId,
          itemName: item.name,
          stripePriceId: item.stripePriceId,
          status: subscription.status,
        })),
    );

    if (invoiceLineItemReferences.length > 0 || subscriptionReferences.length > 0) {
      return {
        success: false,
        dryRun,
        blocked: true,
        reason: "references_to_delete_ids_found",
        orgId: args.orgId,
        requestedPairs: args.pairs.length,
        invoiceLineItemReferences,
        subscriptionReferences,
      };
    }

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        blocked: false,
        orgId: args.orgId,
        requestedPairs: args.pairs.length,
        validatedPairs: pairAudit.length,
        wouldDelete: pairAudit.map((pair) => pair.deleteId),
        pairAudit,
      };
    }

    for (const pair of pairAudit) {
      await ctx.db.delete(pair.deleteId);
    }

    return {
      success: true,
      dryRun: false,
      blocked: false,
      orgId: args.orgId,
      requestedPairs: args.pairs.length,
      deleted: pairAudit.length,
      deletedIds: pairAudit.map((pair) => pair.deleteId),
      keptIds: pairAudit.map((pair) => pair.keepId),
    };
  },
});
