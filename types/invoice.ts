import type { Id } from "@/convex/_generated/dataModel";

// Re-export BrandType for convenience
export type BrandType = "Sankofa" | "Lighthouse" | "Centex" | "GFAM Media Studios";

// Invoice status matching schema
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

/**
 * Line item for invoice creation - supports both catalog and custom pricing
 *
 * For catalog items: provide serviceId and stripePriceId
 * For custom/override items: provide customPriceCents (e.g., legacy $1,100 package)
 */
export interface InvoiceLineItem {
  // Reference to catalog service (undefined for ad-hoc items)
  serviceId?: Id<"services">;

  // Brand attribution for revenue reporting
  brand: BrandType;
  category: string;

  // Item details
  name: string;
  description?: string;
  quantity: number;

  // Pricing - use ONE of these approaches:
  // 1. Catalog price: stripePriceId is set, use it directly with Stripe
  // 2. Custom/override: customPriceCents is set, use Stripe price_data
  stripePriceId?: string;
  unitPriceCents: number; // Base rate in cents (for display/calculations)
  customPriceCents?: number; // Override rate in cents (takes precedence)

  // Flag for ad-hoc items created in the wizard
  isCustomItem: boolean;
}

/**
 * Input for creating a new invoice
 */
export interface CreateInvoiceInput {
  clientId: Id<"clients">;
  lineItems: InvoiceLineItem[];
  notes?: string;
  sendImmediately?: boolean; // If true, finalize and send; if false, create as draft
}

/**
 * Response from invoice creation
 */
export interface CreateInvoiceResult {
  success: boolean;
  invoiceId: Id<"invoices">;
  stripeInvoiceId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalCents: number;
  error?: string;
}

/**
 * Stripe metadata attached to invoice line items for reporting
 */
export interface StripeLineItemMetadata {
  brand: BrandType;
  category: string;
  serviceId?: string; // Convex document ID
  convexInvoiceId: string;
  isCustomPrice: "true" | "false";
}

/**
 * Stripe metadata attached to the invoice itself
 */
export interface StripeInvoiceMetadata {
  primaryBrand: string;
  participatingBrands: string; // JSON stringified array
  convexInvoiceId: string;
}

/**
 * Helper to convert dollars to cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Helper to convert cents to dollars for display
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Format cents as currency string
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(centsToDollars(cents));
}

/**
 * Determine effective price for a line item (custom takes precedence)
 */
export function getEffectivePrice(item: InvoiceLineItem): number {
  return item.customPriceCents ?? item.unitPriceCents;
}

/**
 * Calculate line item total
 */
export function getLineItemTotal(item: InvoiceLineItem): number {
  return getEffectivePrice(item) * item.quantity;
}

/**
 * Determine primary brand based on line items
 * Returns single brand if all items are from one brand, "GFAM Agency" if mixed
 */
export function determinePrimaryBrand(lineItems: InvoiceLineItem[]): string {
  const brands = new Set(lineItems.map((item) => item.brand));
  return brands.size === 1 ? [...brands][0] : "GFAM Agency";
}

/**
 * Get all unique brands from line items
 */
export function getParticipatingBrands(lineItems: InvoiceLineItem[]): BrandType[] {
  return [...new Set(lineItems.map((item) => item.brand))];
}
