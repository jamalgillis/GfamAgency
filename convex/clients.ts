import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureOrgAccess, withOrg } from "./lib/org";

/**
 * List all clients
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(limit);
  }),
});

/**
 * Get a single client by ID
 */
export const get = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const client = await ctx.db.get(args.clientId);
    return client?.orgId === orgId ? client : null;
  }),
});

/**
 * Get client by email
 */
export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_org_email", (q) => q.eq("orgId", orgId).eq("email", args.email))
      .first();
  }),
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
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    // Check if client with this email already exists
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_org_email", (q) => q.eq("orgId", orgId).eq("email", args.email))
      .first();

    if (existing) {
      throw new Error(`Client with email ${args.email} already exists`);
    }

    return await ctx.db.insert("clients", {
      orgId,
      name: args.name,
      company: args.company,
      email: args.email,
      stripeCustomerId: undefined,
    });
  }),
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
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const { clientId, ...updates } = args;
    const existingClient = ensureOrgAccess(
      await ctx.db.get(clientId),
      orgId,
      "Client not found"
    );

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

    if (filteredUpdates.email && filteredUpdates.email !== existingClient.email) {
      const emailInUse = await ctx.db
        .query("clients")
        .withIndex("by_org_email", (q) =>
          q.eq("orgId", orgId).eq("email", filteredUpdates.email!)
        )
        .first();

      if (emailInUse && emailInUse._id !== clientId) {
        throw new Error(`Client with email ${filteredUpdates.email} already exists`);
      }
    }

    await ctx.db.patch(clientId, filteredUpdates);
    return await ctx.db.get(clientId);
  }),
});

/**
 * Delete a client
 */
export const remove = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    ensureOrgAccess(await ctx.db.get(args.clientId), orgId, "Client not found");

    const existingInvoice = await ctx.db
      .query("invoices")
      .withIndex("by_org_client", (q) =>
        q.eq("orgId", orgId).eq("clientId", args.clientId)
      )
      .first();

    if (existingInvoice) {
      throw new Error(
        "This client has associated invoices. Reassign or remove those invoices before deleting the client."
      );
    }

    await ctx.db.delete(args.clientId);
    return { success: true };
  }),
});

/**
 * Repair one client record missing orgId by deriving orgId from linked invoices.
 * Falls back to current org if no linked invoices exist.
 */
export const repairClientOrgId = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) {
      throw new Error("Client not found");
    }

    if (client.orgId === orgId) {
      return {
        success: true,
        patched: false,
        clientId: args.clientId,
        orgId,
      };
    }

    if (client.orgId && client.orgId !== orgId) {
      throw new Error("Client not found");
    }

    const linkedInvoice = await ctx.db
      .query("invoices")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();

    if (linkedInvoice && linkedInvoice.orgId !== orgId) {
      throw new Error("Client does not belong to the active organization");
    }

    const resolvedOrgId = linkedInvoice?.orgId ?? orgId;

    await ctx.db.patch(args.clientId, { orgId: resolvedOrgId });

    return {
      success: true,
      patched: true,
      clientId: args.clientId,
      orgId: resolvedOrgId,
      inferredFromInvoice: !!linkedInvoice,
    };
  }),
});

/**
 * Backfill missing client orgId values.
 * By default only patches rows that can be linked to invoices in the active org.
 */
export const backfillClientOrgIds = mutation({
  args: {
    limit: v.optional(v.number()),
    fallbackToCurrentOrg: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const limit = Math.min(Math.max(args.limit ?? 2000, 1), 5000);
    const fallbackToCurrentOrg = args.fallbackToCurrentOrg ?? false;

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_email")
      .order("desc")
      .take(limit);

    let patchedCount = 0;
    let alreadyCorrectCount = 0;
    let skippedOtherOrgCount = 0;
    let skippedNoInvoiceCount = 0;

    for (const client of clients) {
      if (client.orgId === orgId) {
        alreadyCorrectCount += 1;
        continue;
      }

      if (client.orgId && client.orgId !== orgId) {
        skippedOtherOrgCount += 1;
        continue;
      }

      const linkedInvoice = await ctx.db
        .query("invoices")
        .withIndex("by_client", (q) => q.eq("clientId", client._id))
        .first();

      if (linkedInvoice) {
        if (linkedInvoice.orgId !== orgId) {
          skippedOtherOrgCount += 1;
          continue;
        }

        await ctx.db.patch(client._id, { orgId: linkedInvoice.orgId });
        patchedCount += 1;
        continue;
      }

      if (!fallbackToCurrentOrg) {
        skippedNoInvoiceCount += 1;
        continue;
      }

      await ctx.db.patch(client._id, { orgId });
      patchedCount += 1;
    }

    return {
      success: true,
      scannedCount: clients.length,
      patchedCount,
      alreadyCorrectCount,
      skippedOtherOrgCount,
      skippedNoInvoiceCount,
      fallbackToCurrentOrg,
    };
  }),
});

/**
 * One-shot audit for orgId coverage across org-scoped tables.
 * Useful before making legacy optional orgId fields required again.
 */
export const auditOrgIdCoverage = query({
  args: {
    sampleSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const sampleSize = Math.min(Math.max(args.sampleSize ?? 5, 1), 25);

    const summarize = (
      table: string,
      schemaOrgIdRequired: boolean,
      docs: Array<{ _id: string; orgId?: string }>
    ) => {
      const missing = docs.filter(
        (doc) => typeof doc.orgId !== "string" || doc.orgId.length === 0
      );
      return {
        table,
        schemaOrgIdRequired,
        scanStatus: "ok" as const,
        totalCount: docs.length,
        missingOrgIdCount: missing.length,
        sampleMissingIds: missing.slice(0, sampleSize).map((doc) => doc._id),
      };
    };

    const failed = (table: string, schemaOrgIdRequired: boolean, error: unknown) => ({
      table,
      schemaOrgIdRequired,
      scanStatus: "error" as const,
      totalCount: null,
      missingOrgIdCount: null,
      sampleMissingIds: [] as string[],
      error: error instanceof Error ? error.message : String(error),
    });

    const results: Array<
      | {
          table: string;
          schemaOrgIdRequired: boolean;
          scanStatus: "ok";
          totalCount: number;
          missingOrgIdCount: number;
          sampleMissingIds: string[];
        }
      | {
          table: string;
          schemaOrgIdRequired: boolean;
          scanStatus: "error";
          totalCount: null;
          missingOrgIdCount: null;
          sampleMissingIds: string[];
          error: string;
        }
    > = [];

    try {
      const services = await ctx.db.query("services").collect();
      results.push(
        summarize(
          "services",
          false,
          services as Array<{ _id: string; orgId?: string }>
        )
      );
    } catch (error) {
      results.push(failed("services", true, error));
    }

    try {
      const invoices = await ctx.db.query("invoices").collect();
      results.push(
        summarize(
          "invoices",
          false,
          invoices as Array<{ _id: string; orgId?: string }>
        )
      );
    } catch (error) {
      results.push(failed("invoices", true, error));
    }

    try {
      const invoiceLineItems = await ctx.db.query("invoiceLineItems").collect();
      results.push(
        summarize(
          "invoiceLineItems",
          false,
          invoiceLineItems as Array<{ _id: string; orgId?: string }>
        )
      );
    } catch (error) {
      results.push(failed("invoiceLineItems", true, error));
    }

    try {
      const clients = await ctx.db.query("clients").collect();
      results.push(
        summarize(
          "clients",
          false,
          clients as Array<{ _id: string; orgId?: string }>
        )
      );
    } catch (error) {
      results.push(failed("clients", false, error));
    }

    try {
      const brandLedger = await ctx.db.query("brandLedger").collect();
      results.push(
        summarize(
          "brandLedger",
          false,
          brandLedger as Array<{ _id: string; orgId?: string }>
        )
      );
    } catch (error) {
      results.push(failed("brandLedger", false, error));
    }

    const tablesWithErrors = results
      .filter((row) => row.scanStatus === "error")
      .map((row) => row.table);

    const totalMissingOrgId = results
      .filter((row) => row.scanStatus === "ok")
      .reduce((sum, row) => sum + row.missingOrgIdCount, 0);

    const migrationReadyForRequiredOrgId =
      tablesWithErrors.length === 0 && totalMissingOrgId === 0;

    return {
      generatedAt: Date.now(),
      requestedByOrgId: orgId,
      sampleSize,
      migrationReadyForRequiredOrgId,
      summary: {
        tablesScanned: results.length,
        tablesWithErrors,
        totalMissingOrgId,
      },
      results,
    };
  }),
});
