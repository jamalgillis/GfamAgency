import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  dashboardPathToTenantPath,
  getTenantSlugFromPath,
  tenantPathToDashboardPath,
} from "@/lib/tenant-routing";

const isDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  const tenantSlug = getTenantSlugFromPath(pathname);

  // Tenant-slug URLs (e.g. /acme, /acme/invoices) rewrite to internal /dashboard routes.
  if (tenantSlug) {
    await auth.protect();

    const authState = await auth();
    const { orgId } = authState;
    const activeOrgSlug = (authState as { orgSlug?: string | null }).orgSlug ?? null;

    if (!orgId) {
      const orgSelectionUrl = new URL("/organization-select", req.url);
      orgSelectionUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(orgSelectionUrl);
    }

    if (activeOrgSlug && activeOrgSlug !== tenantSlug) {
      const canonicalUrl = req.nextUrl.clone();
      canonicalUrl.pathname = `/${activeOrgSlug}${pathname.slice(tenantSlug.length + 1) || ""}`;
      return NextResponse.redirect(canonicalUrl);
    }

    const internalPath = tenantPathToDashboardPath(pathname);
    if (!internalPath) return;

    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = internalPath;
    return NextResponse.rewrite(rewriteUrl);
  }

  if (!isDashboardRoute(req)) return;

  await auth.protect();

  const authState = await auth();
  const { orgId } = authState;
  const activeOrgSlug = (authState as { orgSlug?: string | null }).orgSlug ?? null;

  if (!orgId && !pathname.startsWith("/organization-select")) {
    const orgSelectionUrl = new URL("/organization-select", req.url);
    return NextResponse.redirect(orgSelectionUrl);
  }

  // Canonicalize old /dashboard URLs to /{tenantSlug}/... when org slug is available.
  if (activeOrgSlug) {
    const tenantPath = dashboardPathToTenantPath(pathname, activeOrgSlug);
    if (tenantPath !== pathname) {
      const canonicalUrl = req.nextUrl.clone();
      canonicalUrl.pathname = tenantPath;
      return NextResponse.redirect(canonicalUrl);
    }
  }
}, (req) => {
  // Keep Clerk's active org in sync with /{tenantSlug}/... URLs.
  // This allows slug-based navigation to drive org context when the user has access.
  const tenantSlug = getTenantSlugFromPath(req.nextUrl.pathname);
  if (!tenantSlug) return {};

  return {
    organizationSyncOptions: {
      organizationPatterns: ["/:slug", "/:slug/(.*)"],
    },
  };
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
