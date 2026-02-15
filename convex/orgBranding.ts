import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { withOrg } from "./lib/org";

const DEFAULT_PRIMARY_COLOR = "#10B981";
const DEFAULT_SECONDARY_COLOR = "#3B82F6";

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function fallbackSlugFromOrgId(orgId: string): string {
  const raw = orgId.replace(/^org_/, "org-");
  const normalized = normalizeSlug(raw);
  return normalized.length > 0 ? normalized : "tenant";
}

/**
 * Get white-label branding settings for the active organization.
 * Returns sensible defaults when no DB row exists yet.
 */
export const getCurrent = query({
  args: {},
  handler: async (ctx) => withOrg(ctx, async (orgId) => {
    const existing = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();

    if (existing) {
      return existing;
    }

    const identity = await ctx.auth.getUserIdentity();
    const orgSlug = (identity as { org_slug?: string } | null)?.org_slug;
    const slug = normalizeSlug(orgSlug ?? fallbackSlugFromOrgId(orgId));

    return {
      _id: undefined,
      _creationTime: undefined,
      orgId,
      slug: slug.length > 0 ? slug : fallbackSlugFromOrgId(orgId),
      displayName: "GFAM Agency",
      shortName: "GFAM",
      logoMark: "G",
      logoUrl: undefined,
      primaryColor: DEFAULT_PRIMARY_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }),
});

/**
 * Create or update white-label branding for the active organization.
 */
export const upsertCurrent = mutation({
  args: {
    slug: v.string(),
    displayName: v.string(),
    shortName: v.optional(v.string()),
    logoMark: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const slug = normalizeSlug(args.slug);
    if (!slug) {
      throw new Error("Slug is required");
    }

    const slugInUse = await ctx.db
      .query("orgBranding")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (slugInUse && slugInUse.orgId !== orgId) {
      throw new Error("Slug is already in use by another organization");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();

    const payload = {
      orgId,
      slug,
      displayName: args.displayName.trim(),
      shortName: args.shortName?.trim() || undefined,
      logoMark: args.logoMark?.trim() || undefined,
      logoUrl: args.logoUrl?.trim() || undefined,
      primaryColor: args.primaryColor?.trim() || DEFAULT_PRIMARY_COLOR,
      secondaryColor: args.secondaryColor?.trim() || DEFAULT_SECONDARY_COLOR,
      updatedAt: now,
    };

    if (!existing) {
      const id = await ctx.db.insert("orgBranding", {
        ...payload,
        createdAt: now,
      });

      return await ctx.db.get(id);
    }

    await ctx.db.patch(existing._id, payload);
    return await ctx.db.get(existing._id);
  }),
});

