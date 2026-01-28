import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * List all clients
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db.query("clients").take(limit);
  },
});

/**
 * Get a single client by ID
 */
export const get = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

/**
 * Get client by email
 */
export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

/**
 * Create a new client
 */
export const create = mutation({
  args: {
    name: v.string(),
    company: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if client with this email already exists
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      throw new Error(`Client with email ${args.email} already exists`);
    }

    return await ctx.db.insert("clients", {
      name: args.name,
      company: args.company,
      email: args.email,
      stripeCustomerId: undefined,
    });
  },
});

/**
 * Update a client
 */
export const update = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clientId, ...updates } = args;

    // Filter out undefined values
    const filteredUpdates: Partial<{
      name: string;
      company: string;
      email: string;
    }> = {};

    if (updates.name !== undefined) filteredUpdates.name = updates.name;
    if (updates.company !== undefined) filteredUpdates.company = updates.company;
    if (updates.email !== undefined) filteredUpdates.email = updates.email;

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error("No updates provided");
    }

    await ctx.db.patch(clientId, filteredUpdates);
    return await ctx.db.get(clientId);
  },
});

/**
 * Delete a client
 */
export const remove = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.clientId);
    return { success: true };
  },
});
