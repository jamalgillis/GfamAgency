import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { brandUnion, serviceStatusUnion } from "./schema";
import { ensureOrgAccess, withOrg } from "./lib/org";

function requireNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeTags(tags: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(tag);
  }

  return normalized;
}

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
 * Update an existing service for the active org.
 */
export const update = mutation({
  args: {
    serviceId: v.id("services"),
    brand: v.optional(brandUnion),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    price: v.optional(v.string()),
    priceValue: v.optional(v.number()),
    priceSuffix: v.optional(v.string()),
    status: v.optional(serviceStatusUnion),
    stripeSynced: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const { serviceId, ...input } = args;
    ensureOrgAccess(await ctx.db.get(serviceId), orgId, "Service not found");

    const updates: Partial<{
      brand: string;
      name: string;
      description: string;
      category: string;
      price: string;
      priceValue: number;
      priceSuffix: string;
      status: "active" | "inactive";
      stripeSynced: boolean;
      tags: string[];
    }> = {};

    if (input.brand !== undefined) {
      updates.brand = requireNonEmpty(input.brand, "Brand");
    }
    if (input.name !== undefined) {
      updates.name = requireNonEmpty(input.name, "Service name");
    }
    if (input.description !== undefined) {
      updates.description = requireNonEmpty(input.description, "Description");
    }
    if (input.category !== undefined) {
      updates.category = requireNonEmpty(input.category, "Category");
    }
    if (input.price !== undefined) {
      updates.price = requireNonEmpty(input.price, "Display price");
    }
    if (input.priceValue !== undefined) {
      if (!Number.isFinite(input.priceValue) || input.priceValue < 0) {
        throw new Error("Base price must be a non-negative number");
      }
      updates.priceValue = Math.round(input.priceValue * 100) / 100;
    }
    if (input.priceSuffix !== undefined) {
      updates.priceSuffix = input.priceSuffix.trim();
    }
    if (input.status !== undefined) {
      updates.status = input.status;
    }
    if (input.stripeSynced !== undefined) {
      updates.stripeSynced = input.stripeSynced;
    }
    if (input.tags !== undefined) {
      updates.tags = normalizeTags(input.tags);
    }

    if (Object.keys(updates).length === 0) {
      throw new Error("No updates provided");
    }

    await ctx.db.patch(serviceId, updates);
    return await ctx.db.get(serviceId);
  }),
});

/**
 * Remove a service from active catalogs (soft delete).
 */
export const remove = mutation({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const service = ensureOrgAccess(await ctx.db.get(args.serviceId), orgId, "Service not found");

    if (service.status === "inactive") {
      return { success: true, alreadyInactive: true };
    }

    await ctx.db.patch(args.serviceId, { status: "inactive" });
    return { success: true, alreadyInactive: false };
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
      const grouped: Record<string, typeof activeServices> = {};

      for (const service of activeServices) {
        if (!grouped[service.brand]) {
          grouped[service.brand] = [];
        }
        grouped[service.brand].push(service);
      }

      return grouped;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ services.listByBrand failed for org ${orgId}: ${message}`);
      return {};
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
