import { v } from "convex/values";
import { query } from "./_generated/server";
import { brandUnion } from "./schema";

/**
 * List all active services
 */
export const list = query({
  args: {
    brand: v.optional(brandUnion),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    // Filter by brand if specified
    if (args.brand) {
      const services = await ctx.db
        .query("services")
        .withIndex("by_brand", (q) => q.eq("brand", args.brand!))
        .filter((q) => q.eq(q.field("status"), "active"))
        .take(limit);

      // Further filter by category if specified
      if (args.category) {
        return services.filter((s) => s.category === args.category);
      }
      return services;
    }

    // Filter by category if specified
    if (args.category) {
      return await ctx.db
        .query("services")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .filter((q) => q.eq(q.field("status"), "active"))
        .take(limit);
    }

    // Return all active services
    return await ctx.db
      .query("services")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(limit);
  },
});

/**
 * Get a single service by ID
 */
export const get = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.serviceId);
  },
});

/**
 * Get services grouped by brand
 */
export const listByBrand = query({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db
      .query("services")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Group by brand
    const grouped: Record<string, typeof services> = {
      Sankofa: [],
      Lighthouse: [],
      Centex: [],
      "GFAM Media Studios": [],
    };

    for (const service of services) {
      if (grouped[service.brand]) {
        grouped[service.brand].push(service);
      }
    }

    return grouped;
  },
});

/**
 * Get unique categories
 */
export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db
      .query("services")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const categories = new Set(services.map((s) => s.category));
    return [...categories].sort();
  },
});
