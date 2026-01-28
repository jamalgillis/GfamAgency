import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { brandUnion, serviceStatusUnion } from "./schema";

/**
 * Seed the services table with mapped brand data
 * Run with: bunx convex run seed:seedServices
 */
export const seedServices = mutation({
  args: {
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
    // Optionally clear existing services
    if (args.clearExisting) {
      const existing = await ctx.db.query("services").collect();
      for (const service of existing) {
        await ctx.db.delete(service._id);
      }
      console.log(`Cleared ${existing.length} existing services`);
    }

    // Insert new services
    const inserted: string[] = [];
    for (const service of args.services) {
      const id = await ctx.db.insert("services", service);
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
    const id = await ctx.db.insert("services", args);
    return { success: true, id };
  },
});

/**
 * Clear all services (use with caution)
 */
export const clearServices = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("services").collect();
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
 * Seed test clients
 * Run with: npx convex run seed:seedClients
 */
export const seedClients = mutation({
  args: {
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Optionally clear existing clients
    if (args.clearExisting) {
      const existing = await ctx.db.query("clients").collect();
      for (const client of existing) {
        await ctx.db.delete(client._id);
      }
      console.log(`Cleared ${existing.length} existing clients`);
    }

    // Sample clients for testing
    const testClients = [
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

    const inserted: string[] = [];
    for (const client of testClients) {
      // Check if client already exists
      const existing = await ctx.db
        .query("clients")
        .withIndex("by_email", (q) => q.eq("email", client.email))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("clients", {
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
