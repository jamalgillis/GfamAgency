import { v } from "convex/values";
import { query } from "./_generated/server";
import { brandUnion } from "./schema";
import { withOrg } from "./lib/org";

/**
 * List services for the active org.
 * By default returns active services only; set includeInactive=true to return both.
 */
export const list = query({
  args: {
    brand: v.optional(brandUnion),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    // Prevent expensive reads from unbounded client limits.
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const includeInactive = args.includeInactive ?? false;
    const scanLimit = Math.min(Math.max(limit * 10, limit), 5000);

    try {
      const services = await ctx.db
        .query("services")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .take(scanLimit);

      const filtered = services.filter((service) => {
        if (args.brand && service.brand !== args.brand) {
          return false;
        }

        if (args.category && service.category !== args.category) {
          return false;
        }

        // Be tolerant of legacy/malformed status values: only explicit "inactive" is excluded.
        if (!includeInactive && service.status === "inactive") {
          return false;
        }

        return true;
      });

      return filtered.slice(0, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ services.list failed for org ${orgId}: ${message}`);
      return [];
    }
  }),
});

/**
 * Get a single service by ID
 */
export const get = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const service = await ctx.db.get(args.serviceId);
    return service?.orgId === orgId ? service : null;
  }),
});

/**
 * Get services grouped by brand
 */
export const listByBrand = query({
  args: {},
  handler: async (ctx) => withOrg(ctx, async (orgId) => {
    try {
      const services = await ctx.db
        .query("services")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect();

      const activeServices = services.filter((service) => service.status !== "inactive");

      // Group by brand
      const grouped: Record<string, typeof activeServices> = {
        Sankofa: [],
        Lighthouse: [],
        Centex: [],
        "GFAM Media Studios": [],
      };

      for (const service of activeServices) {
        if (grouped[service.brand]) {
          grouped[service.brand].push(service);
        }
      }

      return grouped;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ services.listByBrand failed for org ${orgId}: ${message}`);
      return {
        Sankofa: [],
        Lighthouse: [],
        Centex: [],
        "GFAM Media Studios": [],
      };
    }
  }),
});

/**
 * Get unique categories
 */
export const getCategories = query({
  args: {},
  handler: async (ctx) => withOrg(ctx, async (orgId) => {
    try {
      const services = await ctx.db
        .query("services")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect();

      const activeServices = services.filter((service) => service.status !== "inactive");

      const categories = new Set(activeServices.map((s) => s.category));
      return [...categories].sort();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ services.getCategories failed for org ${orgId}: ${message}`);
      return [];
    }
  }),
});
