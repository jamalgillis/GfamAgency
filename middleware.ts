import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  dashboardPathToTenantHostPath,
  dashboardPathToTenantPath,
  dashboardPathToTenantSyncPath,
  getTenantSlugFromHost,
  getTenantSlugFromPath,
  tenantHostPathToDashboardPath,
  tenantPathToDashboardPath,
} from "@/lib/tenant-routing";

const isDashboardRoute = createRouteMatcher(["/dashboard(.*)"]);
const CANONICAL_PRODUCTION_DOMAIN =
  process.env.CANONICAL_PRODUCTION_DOMAIN?.trim().toLowerCase() || null;
const TENANT_SUBDOMAIN_BASE_DOMAIN =
  process.env.TENANT_SUBDOMAIN_BASE_DOMAIN?.trim().toLowerCase() ||
  CANONICAL_PRODUCTION_DOMAIN;

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1"
  );
}

function isAllowedProductionHost(hostname: string): boolean {
  if (!CANONICAL_PRODUCTION_DOMAIN && !TENANT_SUBDOMAIN_BASE_DOMAIN) {
    return true;
  }

  const normalizedHostname = hostname.toLowerCase();
  const canonicalMatch =
    !!CANONICAL_PRODUCTION_DOMAIN &&
    (
      normalizedHostname === CANONICAL_PRODUCTION_DOMAIN ||
      normalizedHostname.endsWith(`.${CANONICAL_PRODUCTION_DOMAIN}`)
    );
  const tenantBaseMatch =
    !!TENANT_SUBDOMAIN_BASE_DOMAIN &&
    (
      normalizedHostname === TENANT_SUBDOMAIN_BASE_DOMAIN ||
      normalizedHostname.endsWith(`.${TENANT_SUBDOMAIN_BASE_DOMAIN}`)
    );

  return canonicalMatch || tenantBaseMatch;
}

function buildTenantHost(tenantSlug: string): string | null {
  if (!TENANT_SUBDOMAIN_BASE_DOMAIN) {
    return null;
  }

  return `${tenantSlug}.${TENANT_SUBDOMAIN_BASE_DOMAIN}`;
}

function buildOrganizationSelectUrl(
  req: Request,
  nextPath: string,
  hostOverride?: string | null,
): URL {
  const url = new URL(req.url);
  if (hostOverride) {
    url.host = hostOverride;
  }
  url.pathname = "/organization-select";
  url.search = "";
  url.searchParams.set("next", nextPath);
  return url;
}

function buildTenantRedirectUrl(
  req: Request,
  tenantSlug: string,
  dashboardPath: string,
): URL {
  const url = new URL(req.url);
  const tenantHost = buildTenantHost(tenantSlug);

  if (tenantHost) {
    url.host = tenantHost;
    url.pathname = dashboardPathToTenantHostPath(dashboardPath);
    return url;
  }

  url.pathname = dashboardPathToTenantPath(dashboardPath, tenantSlug);
  return url;
}

function isTenantRedirectRequired(
  currentHost: string,
  currentPathname: string,
  targetUrl: URL,
): boolean {
  return (
    currentHost !== targetUrl.host ||
    currentPathname !== targetUrl.pathname
  );
}

export default clerkMiddleware(async (auth, req) => {
  const hostname = req.nextUrl.hostname.toLowerCase();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const usingLiveClerkKey = publishableKey.startsWith("pk_live_");

  // Guard against loading production Clerk keys from non-production hosts.
  // This prevents a blank screen when users hit an unsupported deployment domain.
  if (
    usingLiveClerkKey &&
    CANONICAL_PRODUCTION_DOMAIN &&
    !isLocalHost(hostname) &&
    !isAllowedProductionHost(hostname)
  ) {
    const canonicalUrl = req.nextUrl.clone();
    canonicalUrl.protocol = "https";
    canonicalUrl.host = CANONICAL_PRODUCTION_DOMAIN;
    return NextResponse.redirect(canonicalUrl);
  }

  const pathname = req.nextUrl.pathname;
  const pathTenantSlug = getTenantSlugFromPath(pathname);
  const hostTenantSlug = getTenantSlugFromHost(hostname, {
    baseDomain: TENANT_SUBDOMAIN_BASE_DOMAIN,
    canonicalHost: CANONICAL_PRODUCTION_DOMAIN,
  });

  if (hostTenantSlug) {
    const isHostSyncPath =
      pathname === `/${hostTenantSlug}` ||
      pathname.startsWith(`/${hostTenantSlug}/`);
    const dashboardPath =
      (isHostSyncPath ? tenantPathToDashboardPath(pathname) : null) ??
      tenantHostPathToDashboardPath(pathname);

    if (!dashboardPath) {
      return;
    }

    await auth.protect();

    const authState = await auth();
    const { orgId } = authState;
    const activeOrgSlug = (authState as { orgSlug?: string | null }).orgSlug ?? null;

    if (!orgId) {
      return NextResponse.redirect(
        buildOrganizationSelectUrl(req, dashboardPathToTenantHostPath(dashboardPath)),
      );
    }

    if (activeOrgSlug !== hostTenantSlug) {
      if (isHostSyncPath) {
        return NextResponse.redirect(
          buildOrganizationSelectUrl(req, "/dashboard", CANONICAL_PRODUCTION_DOMAIN),
        );
      }

      const syncUrl = req.nextUrl.clone();
      syncUrl.pathname = dashboardPathToTenantSyncPath(dashboardPath, hostTenantSlug);
      return NextResponse.redirect(syncUrl);
    }

    const canonicalTenantPath = dashboardPathToTenantHostPath(dashboardPath);
    if (pathname !== canonicalTenantPath) {
      const canonicalUrl = req.nextUrl.clone();
      canonicalUrl.pathname = canonicalTenantPath;
      return NextResponse.redirect(canonicalUrl);
    }

    if (dashboardPath !== pathname) {
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = dashboardPath;
      return NextResponse.rewrite(rewriteUrl);
    }

    return;
  }

  // Tenant-slug URLs (e.g. /acme, /acme/invoices) rewrite to internal /dashboard routes.
  if (pathTenantSlug) {
    await auth.protect();

    const authState = await auth();
    const { orgId } = authState;
    const activeOrgSlug = (authState as { orgSlug?: string | null }).orgSlug ?? null;

    if (!orgId) {
      return NextResponse.redirect(buildOrganizationSelectUrl(req, pathname));
    }

    const internalPath = tenantPathToDashboardPath(pathname);
    if (!internalPath) return;

    if (activeOrgSlug && activeOrgSlug !== pathTenantSlug) {
      return NextResponse.redirect(buildTenantRedirectUrl(req, activeOrgSlug, internalPath));
    }

    if (activeOrgSlug && activeOrgSlug === pathTenantSlug && buildTenantHost(activeOrgSlug)) {
      const canonicalUrl = buildTenantRedirectUrl(req, activeOrgSlug, internalPath);
      if (isTenantRedirectRequired(req.nextUrl.host, pathname, canonicalUrl)) {
        return NextResponse.redirect(canonicalUrl);
      }
    }

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
    return NextResponse.redirect(buildOrganizationSelectUrl(req, pathname));
  }

  // Canonicalize old /dashboard URLs to tenant host or /{tenantSlug}/... when org slug is available.
  if (activeOrgSlug) {
    const canonicalUrl = buildTenantRedirectUrl(req, activeOrgSlug, pathname);
    if (isTenantRedirectRequired(req.nextUrl.host, pathname, canonicalUrl)) {
      return NextResponse.redirect(canonicalUrl);
    }
  }
}, (req) => {
  // Keep Clerk's active org in sync with /{tenantSlug}/... URLs.
  // This allows slug-based navigation to drive org context when the user has access.
  const hostTenantSlug = getTenantSlugFromHost(req.nextUrl.hostname, {
    baseDomain: TENANT_SUBDOMAIN_BASE_DOMAIN,
    canonicalHost: CANONICAL_PRODUCTION_DOMAIN,
  });
  const tenantSlug =
    hostTenantSlug &&
    (
      req.nextUrl.pathname === `/${hostTenantSlug}` ||
      req.nextUrl.pathname.startsWith(`/${hostTenantSlug}/`)
    )
      ? hostTenantSlug
      : !hostTenantSlug
        ? getTenantSlugFromPath(req.nextUrl.pathname)
        : null;
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
