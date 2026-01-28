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
        "Please set this in your Convex dashboard under Settings > Environment Variables."
    );
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: "2024-12-18.acacia",
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
        "Get this from Stripe Dashboard > Developers > Webhooks."
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
} {
  const hasApiKey = !!process.env.STRIPE_SECRET_KEY;
  const hasWebhookSecret = !!process.env.STRIPE_WEBHOOK_SECRET;

  return {
    configured: hasApiKey,
    hasApiKey,
    hasWebhookSecret,
  };
}

/**
 * Build standard metadata for Stripe objects
 * Ensures consistent brand tracking across all API calls
 */
export function buildStripeMetadata(
  brand: StripeBrand,
  category: string,
  additionalData?: Record<string, string>
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
 * Required when using Organization API keys (sk_org_*).
 * These must be set in your Convex Environment Variables.
 */
export function getBrandAccountId(brand: StripeBrand): string | undefined {
  const accountMap: Record<StripeBrand, string | undefined> = {
    "Sankofa": process.env.STRIPE_ACCOUNT_ID_SANKOFA,
    "Lighthouse": process.env.STRIPE_ACCOUNT_ID_LIGHTHOUSE,
    "Centex": process.env.STRIPE_ACCOUNT_ID_CENTEX,
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
  return apiKey?.startsWith("sk_org_") || apiKey?.startsWith("rk_") || false;
}

/**
 * Generates the options object required for Organization API keys.
 * The stripeAccount property tells the SDK to include the Stripe-Context header.
 * Returns undefined if not using an Organization key.
 */
export function getStripeContext(brand: StripeBrand): Stripe.RequestOptions | undefined {
  // If not using an Organization key, no context needed
  if (!isOrganizationKey()) {
    return undefined;
  }

  const accountId = getBrandAccountId(brand);
  if (!accountId) {
    throw new Error(
      `Missing Stripe Account ID for brand: ${brand}. ` +
      `Please set STRIPE_ACCOUNT_ID_${brand.toUpperCase().replace(/ /g, "_")} in your Convex environment variables.`
    );
  }

  return { stripeAccount: accountId };
}

/**
 * All brands that need Stripe Account IDs configured (including parent for multi-brand invoices)
 */
export const ALL_BRANDS_WITH_ACCOUNTS: StripeBrand[] = [
  ...SUB_BRANDS,
  "GFAM Agency",
];

/**
 * Check if all brand account IDs are configured (for Organization keys)
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
