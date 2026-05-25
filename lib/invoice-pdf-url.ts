function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase();
}

function getConfiguredCanonicalHost(): string | null {
  const host =
    process.env.CANONICAL_PRODUCTION_DOMAIN ??
    process.env.NEXT_PUBLIC_CANONICAL_PRODUCTION_DOMAIN;

  if (!host) {
    return null;
  }

  const normalized = normalizeHostname(host);
  return normalized.length > 0 ? normalized : null;
}

function getConfiguredTenantBaseDomain(): string | null {
  const baseDomain =
    process.env.TENANT_SUBDOMAIN_BASE_DOMAIN ??
    process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE_DOMAIN ??
    getConfiguredCanonicalHost();

  if (!baseDomain) {
    return null;
  }

  const normalized = normalizeHostname(baseDomain);
  return normalized.length > 0 ? normalized : null;
}

function getProtocolForHost(host: string): "http" | "https" {
  return host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
}

export function getTenantAppOrigin(tenantSlug?: string | null): string | null {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();
  const tenantBaseDomain = getConfiguredTenantBaseDomain();

  if (normalizedSlug && tenantBaseDomain) {
    const host = `${normalizedSlug}.${tenantBaseDomain}`;
    return `${getProtocolForHost(host)}://${host}`;
  }

  const canonicalHost = getConfiguredCanonicalHost();
  if (!canonicalHost) {
    return null;
  }

  return `${getProtocolForHost(canonicalHost)}://${canonicalHost}`;
}

export function buildTenantInvoicePdfProxyUrl(params: {
  invoiceId: string;
  token: string;
  tenantSlug?: string | null;
}): string | null {
  const appOrigin = getTenantAppOrigin(params.tenantSlug);
  if (!appOrigin) {
    return null;
  }

  const url = new URL("/api/invoice-pdf", normalizeBaseUrl(appOrigin));
  url.searchParams.set("invoiceId", params.invoiceId);
  url.searchParams.set("token", params.token);
  return url.toString();
}

export function getConvexSiteBaseUrl(): string | null {
  const explicitSiteUrl =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL;
  if (explicitSiteUrl) {
    return normalizeBaseUrl(explicitSiteUrl);
  }

  const convexCloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexCloudUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(convexCloudUrl);
    if (parsedUrl.hostname.endsWith(".convex.cloud")) {
      parsedUrl.hostname = `${parsedUrl.hostname.slice(0, -".convex.cloud".length)}.convex.site`;
    }

    parsedUrl.pathname = "";
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return normalizeBaseUrl(parsedUrl.toString());
  } catch {
    return null;
  }
}
