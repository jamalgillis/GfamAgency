import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { withOrg } from "./lib/org";
import {
  buildOrgSlugCandidate,
  getInitialOrgSlugSeed,
  isReservedOrgSlug,
  normalizeOrgSlug,
} from "../lib/org-slug";

const DEFAULT_PRIMARY_COLOR = "#10B981";
const DEFAULT_SECONDARY_COLOR = "#3B82F6";

type EmailMode = "platform" | "org_sender";

const EMAIL_MODE_OPTIONS: ReadonlySet<EmailMode> = new Set([
  "platform",
  "org_sender",
]);

function normalizeEmailMode(input: string | undefined): EmailMode {
  if (input && EMAIL_MODE_OPTIONS.has(input as EmailMode)) {
    return input as EmailMode;
  }

  return "platform";
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Sender email must be a valid email address.");
  }

  return normalized;
}

function defaultBranding(orgId: string, slug: string) {
  return {
    _id: undefined,
    _creationTime: undefined,
    orgId,
    slug,
    displayName: "Agency",
    shortName: "AGENCY",
    logoMark: "A",
    logoUrl: undefined,
    primaryColor: DEFAULT_PRIMARY_COLOR,
    secondaryColor: DEFAULT_SECONDARY_COLOR,
    emailMode: "platform" as const,
    senderName: undefined,
    senderEmail: undefined,
    senderReplyTo: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function fallbackSlugFromOrgId(orgId: string): string {
  const raw = orgId.replace(/^org_/, "org-");
  const normalized = normalizeOrgSlug(raw);
  return normalized.length > 0 ? normalized : "tenant";
}

async function findAvailableCreationSlug(
  ctx: any,
  businessName: string,
  excludeOrgId?: string,
): Promise<{ slug: string; baseSlug: string; adjusted: boolean }> {
  const baseSlug = getInitialOrgSlugSeed(businessName);

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = buildOrgSlugCandidate(baseSlug, attempt);

    if (isReservedOrgSlug(candidate)) {
      continue;
    }

    const existing = await ctx.db
      .query("orgBranding")
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .first();

    if (!existing || existing.orgId === excludeOrgId) {
      return {
        slug: candidate,
        baseSlug,
        adjusted: attempt > 0,
      };
    }
  }

  return {
    slug: `${baseSlug}${Date.now().toString(36).slice(-3)}`,
    baseSlug,
    adjusted: true,
  };
}

/**
 * Get white-label branding settings for the active organization.
 * Returns sensible defaults when no DB row exists yet.
 */
export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity?.org_id;

    if (typeof orgId !== "string" || orgId.length === 0) {
      return defaultBranding("", "tenant");
    }

    const existing = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();

    if (existing) {
      return existing;
    }

    const orgSlug = (identity as { org_slug?: string } | null)?.org_slug;
    const slug = normalizeOrgSlug(orgSlug ?? fallbackSlugFromOrgId(orgId));

    return defaultBranding(
      orgId,
      slug.length > 0 ? slug : fallbackSlugFromOrgId(orgId),
    );
  },
});

export const suggestCreationSlug = query({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const suggested = await findAvailableCreationSlug(ctx, args.name);

    return {
      slug: suggested.slug,
      baseSlug: suggested.baseSlug,
      adjusted: suggested.adjusted,
    };
  },
});

export const bootstrapCurrent = mutation({
  args: {
    displayName: v.optional(v.string()),
    shortName: v.optional(v.string()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const existing = await ctx.db
      .query("orgBranding")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();

    if (existing) {
      return existing;
    }

    const identity = await ctx.auth.getUserIdentity();
    const orgSlug = normalizeOrgSlug(
      ((identity as { org_slug?: string } | null)?.org_slug) ?? fallbackSlugFromOrgId(orgId),
    );
    const slug = orgSlug.length > 0 ? orgSlug : fallbackSlugFromOrgId(orgId);
    const now = Date.now();
    const displayName = args.displayName?.trim() || "Agency";
    const shortName = args.shortName?.trim() || undefined;

    const id = await ctx.db.insert("orgBranding", {
      ...defaultBranding(orgId, slug),
      displayName,
      shortName,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(id);
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
    emailMode: v.optional(v.union(v.literal("platform"), v.literal("org_sender"))),
    senderName: v.optional(v.string()),
    senderEmail: v.optional(v.string()),
    senderReplyTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const slug = normalizeOrgSlug(args.slug);
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
    const emailMode = normalizeEmailMode(args.emailMode);
    const senderName = args.senderName?.trim() || undefined;
    const senderEmail = normalizeEmail(args.senderEmail);
    const senderReplyTo = normalizeEmail(args.senderReplyTo);

    if (emailMode === "org_sender" && !senderEmail) {
      throw new Error("Sender email is required when using your own sender.");
    }

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
      emailMode,
      senderName,
      senderEmail,
      senderReplyTo,
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
