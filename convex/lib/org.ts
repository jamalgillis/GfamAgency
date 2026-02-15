import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

type AuthContext = Pick<QueryCtx, "auth"> | Pick<MutationCtx, "auth"> | Pick<ActionCtx, "auth">;

export async function requireOrgId(ctx: AuthContext): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Unauthorized");
  }

  const orgId = identity.org_id;

  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new Error("No active organization selected");
  }

  return orgId;
}

export async function withOrg<Ctx extends AuthContext, T>(
  ctx: Ctx,
  handler: (orgId: string) => Promise<T>
): Promise<T> {
  const orgId = await requireOrgId(ctx);
  return handler(orgId);
}

export function ensureOrgAccess<T extends { orgId?: string }>(
  document: T | null,
  orgId: string,
  notFoundMessage: string
): T {
  if (!document || document.orgId !== orgId) {
    throw new Error(notFoundMessage);
  }

  return document;
}
