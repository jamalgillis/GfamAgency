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

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase();
}

function getBaseDomainSuffix(baseDomain: string): string {
  return `.${normalizeHostname(baseDomain)}`;
}

export function getTenantSlugFromHost(
  hostname: string,
  options?: {
    baseDomain?: string | null;
    canonicalHost?: string | null;
  },
): string | null {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedCanonicalHost = options?.canonicalHost
    ? normalizeHostname(options.canonicalHost)
    : null;
  const normalizedBaseDomain = options?.baseDomain
    ? normalizeHostname(options.baseDomain)
    : null;

  if (!normalizedBaseDomain || !normalizedHostname || normalizedHostname === normalizedCanonicalHost) {
    return null;
  }

  if (normalizedHostname === normalizedBaseDomain) {
    return null;
  }

  const suffix = getBaseDomainSuffix(normalizedBaseDomain);
  if (!normalizedHostname.endsWith(suffix)) {
    return null;
  }

  const subdomain = normalizedHostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) {
    return null;
  }

  return subdomain;
}

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

export function tenantHostPathToDashboardPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";

  if (!first) {
    return "/dashboard";
  }

  if (first === "dashboard") {
    return pathname;
  }

  if (RESERVED_ROOT_SEGMENTS.has(first) || first.includes(".")) {
    return null;
  }

  return `/dashboard${pathname}`;
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

export function dashboardPathToTenantHostPath(pathname: string): string {
  if (pathname === "/dashboard") {
    return "/";
  }

  if (pathname.startsWith("/dashboard/")) {
    return pathname.slice("/dashboard".length);
  }

  return pathname;
}

export function dashboardPathToTenantSyncPath(pathname: string, tenantSlug: string): string {
  if (pathname === "/dashboard") {
    return `/${tenantSlug}`;
  }

  if (pathname.startsWith("/dashboard/")) {
    return `/${tenantSlug}${pathname.slice("/dashboard".length)}`;
  }

  if (pathname === "/") {
    return `/${tenantSlug}`;
  }

  return `/${tenantSlug}${pathname}`;
}

export function isTenantScopedPath(pathname: string): boolean {
  return getTenantSlugFromPath(pathname) !== null;
}
