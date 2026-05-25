const RESERVED_ORG_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "billing",
  "dashboard",
  "help",
  "mail",
  "root",
  "security",
  "settings",
  "support",
  "www",
]);

const SLUG_SUFFIX_CHARACTERS = "abcdefghijklmnopqrstuvwxyz";

export function normalizeOrgSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function getInitialOrgSlugSeed(businessName: string): string {
  const firstWord = businessName.trim().split(/\s+/)[0] ?? "";
  const firstWordSlug = normalizeOrgSlug(firstWord);

  if (firstWordSlug) {
    return firstWordSlug;
  }

  const fullNameSlug = normalizeOrgSlug(businessName);
  return fullNameSlug || "team";
}

export function buildOrgSlugCandidate(baseSlug: string, attempt: number): string {
  const normalizedBase = normalizeOrgSlug(baseSlug) || "team";

  if (attempt <= 0) {
    return normalizedBase;
  }

  if (attempt <= SLUG_SUFFIX_CHARACTERS.length) {
    return `${normalizedBase}${SLUG_SUFFIX_CHARACTERS[attempt - 1]}`;
  }

  return `${normalizedBase}${attempt - SLUG_SUFFIX_CHARACTERS.length + 1}`;
}

export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_ORG_SLUGS.has(normalizeOrgSlug(slug));
}

export function getReservedOrgSlugs(): string[] {
  return Array.from(RESERVED_ORG_SLUGS);
}
