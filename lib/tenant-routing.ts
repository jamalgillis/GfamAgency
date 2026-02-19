const RESERVED_ROOT_SEGMENTS = new Set([
  "",
  "dashboard",
  "payment",
  "sign-in",
  "sign-up",
  "organization-select",
  "api",
  "_next",
]);

export function getTenantSlugFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";

  if (!first || RESERVED_ROOT_SEGMENTS.has(first)) {
    return null;
  }

  // Ignore extension-like root paths (e.g. /favicon.ico)
  if (first.includes(".")) {
    return null;
  }

  return first;
}

export function tenantPathToDashboardPath(pathname: string): string | null {
  const tenantSlug = getTenantSlugFromPath(pathname);
  if (!tenantSlug) return null;

  const withoutSlug = pathname.slice(tenantSlug.length + 1);
  const remainderSegments = withoutSlug.split("/").filter(Boolean);

  if (remainderSegments[0] === "dashboard") {
    remainderSegments.shift();
  }

  if (remainderSegments.length === 0) {
    return "/dashboard";
  }

  return `/dashboard/${remainderSegments.join("/")}`;
}

export function dashboardPathToTenantPath(pathname: string, tenantSlug: string): string {
  if (pathname === "/dashboard") {
    return `/${tenantSlug}`;
  }

  if (pathname.startsWith("/dashboard/")) {
    return `/${tenantSlug}${pathname.slice("/dashboard".length)}`;
  }

  return pathname;
}

export function isTenantScopedPath(pathname: string): boolean {
  return getTenantSlugFromPath(pathname) !== null;
}
