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
