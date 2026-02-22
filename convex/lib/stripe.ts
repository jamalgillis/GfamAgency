import Stripe from "stripe";

/**
 * Brand types for the GFAM Agency ecosystem
 * All brands operate under a single Stripe account with metadata-based tracking
 */
export type StripeBrand =
  | "Sankofa"
  | "Lighthouse"
  | "Centex"
  | "GFAM Media Studios"
  | "GFAM Agency"; // Parent organization for multi-brand invoices

/**
 * Parent organization - owns the single Stripe account
 */
export const PARENT_ORGANIZATION = "GFAM Agency";

/**
 * All sub-brands under GFAM Agency
 */
export const SUB_BRANDS: StripeBrand[] = [
  "Sankofa",
  "Lighthouse",
  "Centex",
  "GFAM Media Studios",
];

// Singleton Stripe client instance
let stripeClient: Stripe | null = null;

function isOrganizationLikeKey(apiKey: string | undefined): boolean {
  return !!apiKey && (apiKey.startsWith("sk_org_") || apiKey.startsWith("rk_"));
}

/**
 * Get the single Stripe client for GFAM Agency
 * All brands use this same account with metadata differentiation
 */
export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY environment variable. " +
        "Please set this in your Convex dashboard under Settings > Environment Variables.",
    );
  }

  // This app runs in single-account mode only.
  // Organization keys require per-request Stripe-Context and are intentionally unsupported.
  if (isOrganizationLikeKey(apiKey)) {
    throw new Error(
      "Unsupported STRIPE_SECRET_KEY for current app mode. " +
        "Use a standard account key (sk_test_* or sk_live_*), not an Organization key (sk_org_* or rk_*).",
    );
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: "2025-02-24.acacia",
  });

  return stripeClient;
}

/**
 * Get webhook secret for signature verification
 */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      "Missing STRIPE_WEBHOOK_SECRET environment variable. " +
        "Get this from Stripe Dashboard > Developers > Webhooks.",
    );
  }

  return secret;
}

/**
 * Check if Stripe is properly configured
 */
export function checkStripeConfiguration(): {
  configured: boolean;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  supportsSingleAccountMode: boolean;
} {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  const hasApiKey = !!apiKey;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;
  const supportsSingleAccountMode = hasApiKey && !isOrganizationLikeKey(apiKey);

  return {
    configured: supportsSingleAccountMode,
    hasApiKey,
    hasWebhookSecret,
    supportsSingleAccountMode,
  };
}

/**
 * Determine whether the configured Stripe key is test or live.
 * Returns "unknown" if the key is missing or unrecognized.
 */
export function getStripeKeyMode(): "test" | "live" | "unknown" {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    return "unknown";
  }
  if (apiKey.includes("_test_")) {
    return "test";
  }
  if (apiKey.includes("_live_")) {
    return "live";
  }
  return "unknown";
}

/**
 * Build standard metadata for Stripe objects
 * Ensures consistent brand tracking across all API calls
 */
export function buildStripeMetadata(
  brand: StripeBrand,
  category: string,
  additionalData?: Record<string, string>,
): Record<string, string> {
  return {
    agency: PARENT_ORGANIZATION,
    brand,
    category,
    ...additionalData,
  };
}

/**
 * Validate that a string is a valid brand
 */
export function isValidBrand(brand: string): brand is StripeBrand {
  return SUB_BRANDS.includes(brand as StripeBrand);
}

/**
 * Environment variable names reference
 */
export const STRIPE_ENV_VARS = {
  apiKey: "STRIPE_SECRET_KEY",
  webhookSecret: "STRIPE_WEBHOOK_SECRET",
  accountIdSankofa: "STRIPE_ACCOUNT_ID_SANKOFA",
  accountIdLighthouse: "STRIPE_ACCOUNT_ID_LIGHTHOUSE",
  accountIdCentex: "STRIPE_ACCOUNT_ID_CENTEX",
  accountIdGfamStudios: "STRIPE_ACCOUNT_ID_GFAM_STUDIOS",
  accountIdGfamAgency: "STRIPE_ACCOUNT_ID_GFAM_AGENCY",
} as const;

/**
 * Mapping of brands to their respective Stripe Account IDs.
 * Used for transfer destinations when optional brand payout transfers are enabled.
 */
export function getBrandAccountId(brand: StripeBrand): string | undefined {
  const accountMap: Record<StripeBrand, string | undefined> = {
    Sankofa: process.env.STRIPE_ACCOUNT_ID_SANKOFA,
    Lighthouse: process.env.STRIPE_ACCOUNT_ID_LIGHTHOUSE,
    Centex: process.env.STRIPE_ACCOUNT_ID_CENTEX,
    "GFAM Media Studios": process.env.STRIPE_ACCOUNT_ID_GFAM_STUDIOS,
    "GFAM Agency": process.env.STRIPE_ACCOUNT_ID_GFAM_AGENCY,
  };
  return accountMap[brand];
}

/**
 * Check if we're using an Organization API key (sk_org_*)
 */
export function isOrganizationKey(): boolean {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  return isOrganizationLikeKey(apiKey);
}

/**
 * Legacy helper retained for existing call sites.
 * In single-account mode it always returns undefined.
 * If an Organization key is detected, it throws a clear configuration error.
 */
export function getStripeContext(
  _brand: StripeBrand,
): (Stripe.RequestOptions & { stripeContext?: string }) | undefined {
  // If not using an Organization key, no context needed
  if (!isOrganizationKey()) {
    return undefined;
  }

  // Organization key mode is intentionally unsupported in this app.
  throw new Error(
    "Organization API keys are not supported in this app mode. " +
      "Use sk_test_* or sk_live_* for STRIPE_SECRET_KEY.",
  );
}

/**
 * All brands that need Stripe Account IDs configured (including parent for multi-brand invoices)
 */
export const ALL_BRANDS_WITH_ACCOUNTS: StripeBrand[] = [
  ...SUB_BRANDS,
  "GFAM Agency",
];

/**
 * Legacy diagnostic for Organization-key mode.
 * Single-account mode does not require brand account IDs.
 */
export function checkBrandAccountConfiguration(): {
  configured: boolean;
  missing: StripeBrand[];
} {
  if (!isOrganizationKey()) {
    return { configured: true, missing: [] };
  }

  const missing: StripeBrand[] = [];
  for (const brand of ALL_BRANDS_WITH_ACCOUNTS) {
    if (!getBrandAccountId(brand)) {
      missing.push(brand);
    }
  }

  return {
    configured: missing.length === 0,
    missing,
  };
}
