import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Resend } from "resend";
import Stripe from "stripe";
import { brandUnion } from "./schema";
import {
  getStripeClient,
  getStripeContext,
  isOrganizationKey,
  buildStripeMetadata,
  PARENT_ORGANIZATION,
  type StripeBrand,
} from "./lib/stripe";
import type { Id } from "./_generated/dataModel";
import { ensureOrgAccess, withOrg } from "./lib/org";

// Line item input type for invoice creation
const lineItemValidator = v.object({
  serviceId: v.optional(v.id("services")),
  brand: brandUnion,
  category: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  quantity: v.number(),
  stripePriceId: v.optional(v.string()),
  unitPriceCents: v.number(),
  customPriceCents: v.optional(v.number()),
  isCustomItem: v.boolean(),
});

const subscriptionStatusValidator = v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("past_due"),
  v.literal("paused"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("unpaid"),
);

const subscriptionLineItemValidator = v.object({
  serviceId: v.optional(v.id("services")),
  brand: brandUnion,
  category: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  quantity: v.number(),
  stripePriceId: v.optional(v.string()),
  unitPriceCents: v.number(),
});

const sourceTypeValidator = v.union(
  v.literal("one_time"),
  v.literal("subscription"),
);

const dunningActionValidator = v.union(
  v.literal("none"),
  v.literal("pause"),
  v.literal("cancel"),
);

const prorationBehaviorValidator = v.union(
  v.literal("always_invoice"),
  v.literal("create_prorations"),
  v.literal("none"),
);

const subscriptionPlanUpdateItemValidator = v.object({
  stripePriceId: v.string(),
  quantity: v.number(),
  unitPriceCents: v.optional(v.number()),
});

type InvoiceBrand = Exclude<StripeBrand, typeof PARENT_ORGANIZATION>;

type InvoiceLineItemInput = {
  serviceId?: Id<"services">;
  brand: InvoiceBrand;
  category: string;
  name: string;
  description?: string;
  quantity: number;
  stripePriceId?: string;
  unitPriceCents: number;
  customPriceCents?: number;
  isCustomItem: boolean;
};

type SubscriptionLineItemInput = {
  serviceId?: Id<"services">;
  brand: InvoiceBrand;
  category: string;
  name: string;
  description?: string;
  quantity: number;
  stripePriceId?: string;
  unitPriceCents: number;
};

type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

type SubscriptionDunningAction = "none" | "pause" | "cancel";

function toMillis(timestampSeconds?: number | null): number | undefined {
  if (!timestampSeconds || timestampSeconds <= 0) {
    return undefined;
  }
  return timestampSeconds * 1000;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SUBSCRIPTION_DUE_DAYS = 30;

function endOfDayTimestamp(timestampMs: number): number {
  const date = new Date(timestampMs);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function normalizeDueAt(
  dueAtMs: number | undefined,
  issueAtMs: number,
): number {
  if (typeof dueAtMs === "number" && Number.isFinite(dueAtMs)) {
    return Math.max(dueAtMs, issueAtMs);
  }

  return endOfDayTimestamp(issueAtMs);
}

function resolveStoredInvoiceDueAt(invoice: {
  createdAt: number;
  sourceType?: "one_time" | "subscription";
  subscriptionId?: Id<"subscriptions">;
  stripeSubscriptionId?: string;
  billingPeriodEnd?: number;
}): number {
  const isSubscriptionInvoice =
    invoice.sourceType === "subscription" ||
    !!invoice.subscriptionId ||
    !!invoice.stripeSubscriptionId;

  if (
    !isSubscriptionInvoice &&
    typeof invoice.billingPeriodEnd === "number" &&
    Number.isFinite(invoice.billingPeriodEnd)
  ) {
    return normalizeDueAt(invoice.billingPeriodEnd, invoice.createdAt);
  }

  if (isSubscriptionInvoice) {
    return endOfDayTimestamp(
      invoice.createdAt + DEFAULT_SUBSCRIPTION_DUE_DAYS * DAY_IN_MS,
    );
  }

  return endOfDayTimestamp(invoice.createdAt);
}

function getPaymentTermsLabel(issueAtMs: number, dueAtMs: number): string {
  const normalizedIssue = endOfDayTimestamp(issueAtMs);
  const normalizedDue = endOfDayTimestamp(dueAtMs);
  const extraDays = Math.max(
    0,
    Math.round((normalizedDue - normalizedIssue) / DAY_IN_MS),
  );

  return extraDays === 0 ? "Due on issue date" : `Net ${extraDays}`;
}

function mapStripeInvoiceStatus(
  status: string | null | undefined
): "draft" | "open" | "paid" | "void" | "uncollectible" {
  switch (status) {
    case "draft":
      return "draft";
    case "paid":
      return "paid";
    case "void":
      return "void";
    case "uncollectible":
      return "uncollectible";
    case "open":
    default:
      return "open";
  }
}

function mapStripeSubscriptionStatus(
  status: string | null | undefined
): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "paused":
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return status;
    default:
      return "incomplete";
  }
}

function getSubscriptionStatusFromStripe(
  status: string | null | undefined,
  pauseCollection: Stripe.Subscription.PauseCollection | null | undefined,
): SubscriptionStatus {
  const mappedStatus = mapStripeSubscriptionStatus(status);
  if (mappedStatus === "canceled" || mappedStatus === "incomplete_expired") {
    return mappedStatus;
  }
  if (pauseCollection) {
    return "paused";
  }
  return mappedStatus;
}

function normalizeDunningSettings(value: {
  dunningEnabled?: boolean;
  dunningMaxAttempts?: number;
  dunningRetryIntervalDays?: number;
  dunningAction?: SubscriptionDunningAction;
}) {
  return {
    dunningEnabled: value.dunningEnabled ?? true,
    dunningMaxAttempts: Math.max(1, value.dunningMaxAttempts ?? 3),
    dunningRetryIntervalDays: Math.max(1, value.dunningRetryIntervalDays ?? 3),
    dunningAction: value.dunningAction ?? "pause",
  } as const;
}

function toInvoiceBrand(value: string | undefined, fallback: InvoiceBrand): InvoiceBrand {
  switch (value) {
    case "Sankofa":
    case "Lighthouse":
    case "Centex":
    case "GFAM Media Studios":
      return value;
    default:
      return fallback;
  }
}

function calculateInvoiceTotals(
  lineItems: Array<
    Pick<
      InvoiceLineItemInput,
      "brand" | "quantity" | "unitPriceCents" | "customPriceCents"
    >
  >
): {
  participatingBrands: string[];
  primaryBrand: string;
  totalCents: number;
} {
  const brands = new Set<string>();
  let totalCents = 0;

  for (const item of lineItems) {
    brands.add(item.brand);
    const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
    totalCents += effectivePrice * item.quantity;
  }

  const participatingBrands = [...brands];
  const primaryBrand =
    brands.size === 1 ? participatingBrands[0] : PARENT_ORGANIZATION;

  return {
    participatingBrands,
    primaryBrand,
    totalCents,
  };
}

function resolveStatementDescriptorSuffix(participatingBrands: string[]): string {
  if (participatingBrands.length === 1) {
    const singleBrand = participatingBrands[0];
    switch (singleBrand) {
      case "Sankofa":
        return "SANKOFA";
      case "Lighthouse":
        return "LIGHTHOUSE";
      case "Centex":
        return "CENTEX";
      case "GFAM Media Studios":
        return "GFAMSTUDIOS";
      default:
        return "GFAM";
    }
  }

  // Requirement: mixed-brand invoices should still display Sankofa on statements.
  return "SANKOFA";
}

async function createCheckoutSessionForInvoiceRecord(
  stripe: any,
  invoice: {
    _id: Id<"invoices">;
    invoiceNumber: string;
    participatingBrands: string[];
  },
  client: {
    email: string;
    name: string;
    company: string;
  },
  totalCents: number,
  successUrl: string,
  cancelUrl: string,
) {
  const statementDescriptorSuffix = resolveStatementDescriptorSuffix(
    invoice.participatingBrands
  );

  return await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: client.email,
      client_reference_id: invoice._id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: totalCents,
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
              description: `Services by ${invoice.participatingBrands.join(" & ")}`,
            },
          },
        },
      ],
      // Keep this minimal: local invoiceId is the bridge back to Convex.
      metadata: {
        invoiceId: invoice._id,
      },
      payment_intent_data: {
        // Hybrid model: keep org merchant of record but append a brand hint on statements.
        statement_descriptor_suffix: statementDescriptorSuffix,
        transfer_group: invoice._id,
        metadata: {
          invoiceId: invoice._id,
        },
      },
    },
  );
}

async function replaceStripeInvoiceItems(
  ctx: any,
  stripe: any,
  stripeInvoiceId: string,
  stripeCustomerId: string,
  lineItems: InvoiceLineItemInput[],
  context: any,
  convexInvoiceId: Id<"invoices">,
): Promise<InvoiceLineItemInput[]> {
  let startingAfter: string | undefined;
  do {
    const existingItems = await stripe.invoiceItems.list(
      {
        invoice: stripeInvoiceId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      context,
    );

    for (const item of existingItems.data) {
      await stripe.invoiceItems.del(item.id, context);
    }

    startingAfter = existingItems.has_more
      ? existingItems.data[existingItems.data.length - 1]?.id
      : undefined;
  } while (startingAfter);

  const normalizedLineItems: InvoiceLineItemInput[] = [];

  for (const item of lineItems) {
    const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
    const hasCustomPrice =
      item.customPriceCents !== undefined &&
      item.customPriceCents !== item.unitPriceCents;

    const itemMetadata = buildStripeMetadata(
      item.brand as StripeBrand,
      item.category,
      {
        convexInvoiceId,
        isCustomPrice: hasCustomPrice ? "true" : "false",
        ...(item.serviceId && { serviceId: item.serviceId }),
      },
    );

    let resolvedStripePriceId = item.stripePriceId;
    if (!resolvedStripePriceId && item.serviceId) {
      const service = await ctx.runQuery(api.services.get, {
        serviceId: item.serviceId,
      });
      resolvedStripePriceId = service?.stripePriceId;
    }

    const usesCatalogPrice = resolvedStripePriceId && !hasCustomPrice;

    if (usesCatalogPrice && resolvedStripePriceId) {
      await stripe.invoiceItems.create(
        {
          customer: stripeCustomerId,
          invoice: stripeInvoiceId,
          price: resolvedStripePriceId,
          quantity: item.quantity,
          metadata: itemMetadata,
        },
        context,
      );
    } else {
      await stripe.invoiceItems.create(
        {
          customer: stripeCustomerId,
          invoice: stripeInvoiceId,
          amount: effectivePrice * item.quantity,
          currency: "usd",
          description: hasCustomPrice
            ? `${item.brand} Custom: ${item.name}`
            : item.name,
          metadata: itemMetadata,
        },
        context,
      );
    }

    normalizedLineItems.push({
      ...item,
      stripePriceId: resolvedStripePriceId,
    });
  }

  return normalizedLineItems;
}

function parseParticipatingBrandsMetadata(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parseStripeInvoiceLineItems(params: {
  stripeInvoice: Stripe.Invoice;
  fallbackBrand: InvoiceBrand;
  fallbackCategory?: string;
}): InvoiceLineItemInput[] {
  const lineItems: InvoiceLineItemInput[] = [];
  const lines = params.stripeInvoice.lines?.data ?? [];

  for (const line of lines) {
    const quantity = Math.max(1, line.quantity ?? 1);
    const metadata = line.metadata ?? {};
    const priceMetadata =
      line.price && typeof line.price === "object" && !("deleted" in line.price)
        ? line.price.metadata
        : undefined;

    const rawBrand =
      metadata.brand ??
      priceMetadata?.brand ??
      params.stripeInvoice.metadata?.primaryBrand ??
      params.fallbackBrand;
    const brand = toInvoiceBrand(rawBrand, params.fallbackBrand);

    const category =
      metadata.category ??
      priceMetadata?.category ??
      params.fallbackCategory ??
      "subscription";

    const stripePriceId =
      line.price && typeof line.price === "object" && !("deleted" in line.price)
        ? line.price.id
        : undefined;

    const priceUnitAmount =
      line.price && typeof line.price === "object" && !("deleted" in line.price)
        ? line.price.unit_amount
        : undefined;
    const unitPriceCents =
      typeof priceUnitAmount === "number"
        ? priceUnitAmount
        : Math.round((line.amount ?? 0) / quantity);

    const serviceIdValue =
      metadata.serviceId ??
      metadata.convexServiceId ??
      priceMetadata?.serviceId ??
      priceMetadata?.convexServiceId;
    const serviceId = serviceIdValue
      ? (serviceIdValue as Id<"services">)
      : undefined;

    lineItems.push({
      serviceId,
      brand,
      category,
      name: line.description || `Subscription item (${brand})`,
      description: line.description || undefined,
      quantity,
      stripePriceId,
      unitPriceCents,
      customPriceCents: stripePriceId ? undefined : unitPriceCents,
      isCustomItem: !stripePriceId,
    });
  }

  return lineItems;
}

async function resolveRecurringStripePriceForSubscriptionItem(
  ctx: any,
  stripe: Stripe,
  context: Stripe.RequestOptions | undefined,
  orgId: string,
  item: InvoiceLineItemInput,
): Promise<{ stripePriceId: string; unitPriceCents: number }> {
  if (item.quantity <= 0) {
    throw new Error(`Subscription item "${item.name}" must have quantity > 0`);
  }

  const hasCustomPrice =
    item.customPriceCents !== undefined &&
    item.customPriceCents !== item.unitPriceCents;
  if (hasCustomPrice) {
    throw new Error(
      `Custom recurring pricing is not supported in Phase 1 for "${item.name}".`
    );
  }

  const effectiveUnitPrice = item.customPriceCents ?? item.unitPriceCents;
  let service:
    | {
        _id: Id<"services">;
        name: string;
        description: string;
        category: string;
        brand: InvoiceBrand;
        priceValue: number;
        tags: string[];
        stripeProductId?: string;
        stripePriceId?: string;
        stripeRecurringPriceId?: string;
        recurringInterval?: "day" | "week" | "month" | "year";
        recurringIntervalCount?: number;
      }
    | null = null;

  if (item.serviceId) {
    service = await ctx.runQuery(api.services.get, {
      serviceId: item.serviceId,
    });
  }

  if (item.serviceId && service && !service.stripeProductId) {
    service = await ensureStripeServiceSync(ctx, stripe, orgId, item.serviceId);
  }

  const candidatePriceIds = [
    item.stripePriceId,
    service?.stripeRecurringPriceId,
    service?.stripePriceId,
  ].filter((value): value is string => !!value);

  for (const priceId of candidatePriceIds) {
    try {
      const price = await stripe.prices.retrieve(priceId, context);
      if ("deleted" in price && price.deleted) {
        continue;
      }

      if (price.recurring) {
        if (item.serviceId && service && service.stripeRecurringPriceId !== price.id) {
          await ctx.runMutation(internal.stripeSync.updateServiceRecurringStripePriceId, {
            orgId,
            serviceId: item.serviceId,
            stripeRecurringPriceId: price.id,
          });
        }

        return {
          stripePriceId: price.id,
          unitPriceCents:
            typeof price.unit_amount === "number" ? price.unit_amount : effectiveUnitPrice,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(`⚠️ Unable to validate Stripe Price ${priceId}: ${message}`);
    }
  }

  if (!service?.stripeProductId) {
    throw new Error(
      `Service "${item.name}" is missing stripeProductId and no recurring Stripe Price is available.`
    );
  }

  const recurringInterval = service.recurringInterval ?? "month";
  const recurringIntervalCount = Math.max(1, service.recurringIntervalCount ?? 1);

  const recurringPrice = await stripe.prices.create(
    {
      product: service.stripeProductId,
      unit_amount: effectiveUnitPrice,
      currency: "usd",
      recurring: {
        interval: recurringInterval,
        interval_count: recurringIntervalCount,
      },
      metadata: buildStripeMetadata(item.brand as StripeBrand, item.category, {
        serviceId: item.serviceId ?? "",
        convexServiceId: item.serviceId ?? "",
        billingType: "recurring",
      }),
    },
    context,
  );

  if (item.serviceId) {
    await ctx.runMutation(internal.stripeSync.updateServiceRecurringStripePriceId, {
      orgId,
      serviceId: item.serviceId,
      stripeRecurringPriceId: recurringPrice.id,
    });
  }

  return {
    stripePriceId: recurringPrice.id,
    unitPriceCents: effectiveUnitPrice,
  };
}

async function ensureStripeServiceSync(
  ctx: any,
  stripe: Stripe,
  orgId: string,
  serviceId: Id<"services">,
): Promise<{
  _id: Id<"services">;
  name: string;
  description: string;
  category: string;
  brand: InvoiceBrand;
  priceValue: number;
  tags: string[];
  stripeProductId?: string;
  stripePriceId?: string;
  stripeRecurringPriceId?: string;
}> {
  const service = await ctx.runQuery(api.services.get, { serviceId });
  if (!service) {
    throw new Error("Service not found while syncing Stripe product.");
  }

  if (service.stripeProductId && service.stripeRecurringPriceId) {
    return service;
  }

  const serviceContext = getStripeContext(service.brand as StripeBrand);
  const unitAmountCents = Math.max(1, Math.round(service.priceValue * 100));
  const metadata = buildStripeMetadata(service.brand as StripeBrand, service.category, {
    serviceId: service._id,
    convexServiceId: service._id,
    tags: service.tags.join(","),
  });

  let stripeProductId = service.stripeProductId;
  if (!stripeProductId) {
    const product = await stripe.products.create(
      {
        name: service.name,
        description: service.description,
        metadata,
      },
      serviceContext,
    );
    stripeProductId = product.id;
  }

  let stripePriceId = service.stripePriceId;
  if (!stripePriceId) {
    const oneTimePrice = await stripe.prices.create(
      {
        product: stripeProductId,
        unit_amount: unitAmountCents,
        currency: "usd",
        metadata: {
          ...metadata,
          billingType: "one_time",
        },
      },
      serviceContext,
    );
    stripePriceId = oneTimePrice.id;
  }

  let stripeRecurringPriceId = service.stripeRecurringPriceId;
  if (!stripeRecurringPriceId) {
    const recurringPrice = await stripe.prices.create(
      {
        product: stripeProductId,
        unit_amount: unitAmountCents,
        currency: "usd",
        recurring: {
          interval: "month",
          interval_count: 1,
        },
        metadata: {
          ...metadata,
          billingType: "recurring",
        },
      },
      serviceContext,
    );
    stripeRecurringPriceId = recurringPrice.id;
  }

  await ctx.runMutation(internal.stripeSync.updateServiceStripeIds, {
    orgId,
    serviceId,
    stripeProductId,
    stripePriceId,
    stripeRecurringPriceId,
  });

  const syncedService = await ctx.runQuery(api.services.get, { serviceId });
  if (!syncedService?.stripeProductId || !syncedService.stripeRecurringPriceId) {
    throw new Error("Failed to confirm Stripe service sync.");
  }

  return syncedService;
}

async function ensureStripeCustomer(
  ctx: any,
  stripe: any,
  client: any,
  context: any,
  orgId: string,
): Promise<string> {
  const createCustomer = async () => {
    const customer = await stripe.customers.create(
      {
        name: client.name,
        email: client.email,
        metadata: {
          agency: PARENT_ORGANIZATION,
          company: client.company,
          convexClientId: client._id,
        },
      },
      context,
    );

    await ctx.runMutation(internal.invoiceActions.updateClientStripeId, {
      orgId,
      clientId: client._id,
      stripeCustomerId: customer.id,
    });

    return customer.id;
  };

  if (!client.stripeCustomerId) {
    return await createCustomer();
  }

  try {
    const retrieved = await stripe.customers.retrieve(
      client.stripeCustomerId,
      context,
    );

    if (retrieved && typeof retrieved === "object" && "deleted" in retrieved && retrieved.deleted) {
      return await createCustomer();
    }

    return client.stripeCustomerId;
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "resource_missing" || err?.message?.includes("No such customer")) {
      return await createCustomer();
    }
    throw error;
  }
}

/**
 * Generate a unique invoice number
 */
function generateInvoiceNumber(): string {
  const prefix = "INV";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDateValue(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function getInvoiceDownloadBaseUrl(): string | null {
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

function buildInvoicePdfDownloadUrl(
  invoiceId: Id<"invoices">,
  accessToken: string
): string | undefined {
  const baseUrl = getInvoiceDownloadBaseUrl();
  if (!baseUrl) {
    return undefined;
  }

  const params = new URLSearchParams({
    invoiceId,
    token: accessToken,
  });

  return `${baseUrl}/invoice-pdf?${params.toString()}`;
}

function getInvoiceDisplayBrand(participatingBrands: string[]): string {
  return participatingBrands.length === 1 ? participatingBrands[0] : "Sankofa";
}

function renderInvoiceEmailHtml(params: {
  invoiceNumber: string;
  displayBrand: string;
  participatingBrands: string[];
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  notes?: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  lineItems: Array<{
    brand: string;
    name: string;
    description?: string;
    quantity: number;
    unitPriceCents: number;
    customPriceCents?: number;
  }>;
  subtotalCents: number;
  totalCents: number;
  checkoutUrl: string;
  pdfDownloadUrl?: string;
}): string {
  const lineItemRows = params.lineItems
    .map((item) => {
      const rateCents = item.customPriceCents ?? item.unitPriceCents;
      const amountCents = rateCents * item.quantity;
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <div class="item-title" style="font-weight:600;color:#111827;line-height:1.35;">${escapeHtml(
              item.name
            )}</div>
            <div class="item-desc" style="font-size:12px;color:#6b7280;margin-top:4px;line-height:1.4;">${escapeHtml(
              item.description || ""
            )}</div>
            <div style="display:inline-block;margin-top:6px;padding:3px 8px;border-radius:999px;background:#f3f4f6;font-size:11px;color:#374151;line-height:1.2;">${escapeHtml(
              item.brand
            )}</div>
          </td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:top;">${item.quantity}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;">${formatCurrencyFromCents(
            rateCents
          )}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;vertical-align:top;">${formatCurrencyFromCents(
            amountCents
          )}</td>
        </tr>
      `;
    })
    .join("");

  const brandPills = params.participatingBrands
    .map(
      (brand) =>
        `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#f3f4f6;color:#374151;font-size:12px;margin:0 6px 6px 0;">${escapeHtml(
          brand
        )}</span>`
    )
    .join("");

  const downloadButton = params.pdfDownloadUrl
    ? `<a href="${escapeHtml(
        params.pdfDownloadUrl
      )}" class="btn btn-secondary" style="display:inline-block;background:#ffffff;color:#111827;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:600;border:1px solid #d1d5db;font-size:14px;line-height:1.2;margin-left:10px;">Download PDF</a>`
    : "";

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Invoice ${escapeHtml(params.invoiceNumber)}</title>
    <style>
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      table { border-collapse: collapse !important; }
      .outer { padding: 24px; }
      .container { width: 100%; max-width: 760px; }
      .stack-col { width: 50%; }
      .btn { display: inline-block; padding: 12px 16px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; line-height: 1.2; }
      .btn-secondary { margin-left: 10px; }
      .totals-box { width: 240px; margin-left: auto; }

      @media screen and (max-width: 600px) {
        .outer { padding: 12px !important; }
        .inner-pad { padding: 18px !important; }
        .stack-col { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
        .mobile-gap { padding-top: 14px !important; }
        .btn, .btn-secondary { display: block !important; width: 100% !important; box-sizing: border-box !important; margin: 0 0 10px 0 !important; text-align: center !important; }
        .invoice-table th, .invoice-table td { padding: 8px !important; font-size: 12px !important; }
        .item-title { font-size: 13px !important; }
        .item-desc { font-size: 12px !important; line-height: 1.4 !important; }
        .totals-box { width: 100% !important; margin-left: 0 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="background:#f3f4f6;">
      <tr>
        <td align="center" class="outer" style="padding:24px;">
          <table role="presentation" width="100%" class="container" style="max-width:760px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
            <tr>
              <td class="inner-pad" style="padding:24px 24px 10px 24px;border-bottom:1px solid #e5e7eb;">
                <h1 style="margin:0;font-size:28px;color:#111827;line-height:1.2;">${escapeHtml(
                  params.displayBrand
                )}</h1>
                <p style="margin:6px 0 0 0;color:#6b7280;font-size:13px;">Invoice ${escapeHtml(
                  params.invoiceNumber
                )}</p>
              </td>
            </tr>

            <tr>
              <td class="inner-pad" style="padding:22px 24px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td class="stack-col" valign="top" style="width:50%;padding-right:8px;">
                      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Bill To</div>
                      <div style="margin-top:6px;font-weight:600;color:#111827;">${escapeHtml(
                        params.clientCompany
                      )}</div>
                      <div style="color:#4b5563;line-height:1.5;">${escapeHtml(
                        params.clientName
                      )}</div>
                      <div style="color:#4b5563;line-height:1.5;">${escapeHtml(
                        params.clientEmail
                      )}</div>
                    </td>
                    <td class="stack-col mobile-gap" valign="top" style="width:50%;padding-left:8px;">
                      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Details</div>
                      <div style="margin-top:6px;color:#4b5563;line-height:1.5;">Issue Date: ${escapeHtml(
                        params.issueDate
                      )}</div>
                      <div style="color:#4b5563;line-height:1.5;">Due Date: ${escapeHtml(
                        params.dueDate
                      )}</div>
                      <div style="color:#4b5563;line-height:1.5;">Payment Terms: ${escapeHtml(
                        params.paymentTerms
                      )}</div>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" style="margin-top:18px;">
                  <tr>
                    <td style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;">
                      <a href="${escapeHtml(
                        params.checkoutUrl
                      )}" class="btn" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:600;font-size:14px;line-height:1.2;">Pay Invoice</a>
                      ${downloadButton}
                    </td>
                  </tr>
                </table>

                <table class="invoice-table" role="presentation" width="100%" style="margin-top:18px;width:100%;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="text-align:left;padding:10px;font-size:12px;color:#6b7280;">Description</th>
                      <th style="text-align:center;padding:10px;font-size:12px;color:#6b7280;">Qty</th>
                      <th style="text-align:right;padding:10px;font-size:12px;color:#6b7280;">Rate</th>
                      <th style="text-align:right;padding:10px;font-size:12px;color:#6b7280;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lineItemRows}
                  </tbody>
                </table>

                <table role="presentation" class="totals-box" style="width:240px;margin-top:16px;margin-left:auto;">
                  <tr>
                    <td style="padding:6px 0;color:#4b5563;">Subtotal</td>
                    <td style="padding:6px 0;color:#4b5563;text-align:right;">${formatCurrencyFromCents(
                      params.subtotalCents
                    )}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:18px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;">Total</td>
                    <td style="padding:8px 0;font-size:18px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;text-align:right;">${formatCurrencyFromCents(
                      params.totalCents
                    )}</td>
                  </tr>
                </table>

                <div style="margin-top:18px;">
                  <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Notes</div>
                  <div style="margin-top:6px;color:#374151;font-size:14px;line-height:1.5;">${escapeHtml(
                    params.notes || "No notes added"
                  )}</div>
                </div>

                ${
                  params.participatingBrands.length > 1
                    ? `<div style="margin-top:18px;">
                         <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;">Services Provided By</div>
                         ${brandPills}
                       </div>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td class="inner-pad" style="padding:18px 24px;border-top:1px solid #e5e7eb;background:#fafafa;text-align:center;">
                <div style="font-size:14px;color:#111827;line-height:1.5;">Thank you for your business Sankofa Marketing Group</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

async function sendInvoiceEmailWithResend(params: {
  invoiceNumber: string;
  participatingBrands: string[];
  client: {
    email: string;
    name: string;
    company: string;
  };
  notes?: string;
  lineItems: Array<{
    brand: string;
    name: string;
    description?: string;
    quantity: number;
    unitPriceCents: number;
    customPriceCents?: number;
  }>;
  issueAt?: number;
  dueAt?: number;
  checkoutUrl?: string;
  pdfDownloadUrl?: string;
}) {
  if (!params.checkoutUrl) {
    return { sent: false, skipped: "missing_checkout_url" as const };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !fromEmail) {
    return {
      sent: false,
      skipped: "missing_resend_config" as const,
    };
  }

  const issueAtMs =
    typeof params.issueAt === "number" && Number.isFinite(params.issueAt)
      ? params.issueAt
      : Date.now();
  const dueAtMs = normalizeDueAt(params.dueAt, issueAtMs);
  const paymentTerms = getPaymentTermsLabel(issueAtMs, dueAtMs);

  const subtotalCents = params.lineItems.reduce((sum, item) => {
    const rateCents = item.customPriceCents ?? item.unitPriceCents;
    return sum + rateCents * item.quantity;
  }, 0);

  const emailHtml = renderInvoiceEmailHtml({
    invoiceNumber: params.invoiceNumber,
    displayBrand: getInvoiceDisplayBrand(params.participatingBrands),
    participatingBrands: params.participatingBrands,
    clientName: params.client.name,
    clientCompany: params.client.company,
    clientEmail: params.client.email,
    notes: params.notes,
    issueDate: formatDateValue(new Date(issueAtMs)),
    dueDate: formatDateValue(new Date(dueAtMs)),
    paymentTerms,
    lineItems: params.lineItems,
    subtotalCents,
    totalCents: subtotalCents,
    checkoutUrl: params.checkoutUrl,
    pdfDownloadUrl: params.pdfDownloadUrl,
  });

  const resend = new Resend(resendApiKey);
  await resend.emails.send({
    from: fromEmail,
    to: params.client.email,
    subject: `Invoice ${params.invoiceNumber} from ${getInvoiceDisplayBrand(
      params.participatingBrands
    )}`,
    html: emailHtml,
  });

  return { sent: true };
}

/**
 * Internal query to get a client by ID
 */
export const getClientById = internalQuery({
  args: {
    orgId: v.string(),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    return client?.orgId === args.orgId ? client : null;
  },
});

/**
 * Internal mutation to update client's Stripe customer ID
 * Single Stripe account means single customer ID per client
 */
export const updateClientStripeId = internalMutation({
  args: {
    orgId: v.string(),
    clientId: v.id("clients"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.clientId), args.orgId, "Client not found");
    await ctx.db.patch(args.clientId, {
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

/**
 * Internal query to get a subscription by Stripe subscription ID.
 */
export const getSubscriptionByStripeId = internalQuery({
  args: {
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();
  },
});

/**
 * Internal query to get a subscription by ID scoped to an org.
 */
export const getSubscriptionById = internalQuery({
  args: {
    orgId: v.string(),
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    return subscription?.orgId === args.orgId ? subscription : null;
  },
});

/**
 * Internal mutation to upsert a subscription record from app or webhook flows.
 */
export const upsertSubscriptionRecord = internalMutation({
  args: {
    orgId: v.string(),
    clientId: v.id("clients"),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    stripeSubscriptionId: v.string(),
    stripeCustomerId: v.string(),
    status: subscriptionStatusValidator,
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    dunningEnabled: v.optional(v.boolean()),
    dunningMaxAttempts: v.optional(v.number()),
    dunningRetryIntervalDays: v.optional(v.number()),
    dunningAction: v.optional(dunningActionValidator),
    notes: v.optional(v.string()),
    items: v.array(subscriptionLineItemValidator),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.clientId), args.orgId, "Client not found");

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_org_stripe_subscription_id", (q) =>
        q
          .eq("orgId", args.orgId)
          .eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    const now = Date.now();
    const dunningSettings = normalizeDunningSettings(args);

    if (existing) {
      await ctx.db.patch(existing._id, {
        clientId: args.clientId,
        primaryBrand: args.primaryBrand,
        participatingBrands: args.participatingBrands,
        stripeCustomerId: args.stripeCustomerId,
        status: args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAt: args.cancelAt,
        canceledAt: args.canceledAt,
        endedAt: args.endedAt,
        dunningEnabled:
          args.dunningEnabled ?? existing.dunningEnabled ?? dunningSettings.dunningEnabled,
        dunningMaxAttempts:
          args.dunningMaxAttempts ??
          existing.dunningMaxAttempts ??
          dunningSettings.dunningMaxAttempts,
        dunningRetryIntervalDays:
          args.dunningRetryIntervalDays ??
          existing.dunningRetryIntervalDays ??
          dunningSettings.dunningRetryIntervalDays,
        dunningAction:
          args.dunningAction ?? existing.dunningAction ?? dunningSettings.dunningAction,
        notes: args.notes,
        items: args.items,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("subscriptions", {
      orgId: args.orgId,
      clientId: args.clientId,
      primaryBrand: args.primaryBrand,
      participatingBrands: args.participatingBrands,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCustomerId: args.stripeCustomerId,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAt: args.cancelAt,
      canceledAt: args.canceledAt,
      endedAt: args.endedAt,
      dunningEnabled: dunningSettings.dunningEnabled,
      dunningMaxAttempts: dunningSettings.dunningMaxAttempts,
      dunningRetryIntervalDays: dunningSettings.dunningRetryIntervalDays,
      dunningAction: dunningSettings.dunningAction,
      dunningFailureCount: 0,
      notes: args.notes,
      items: args.items,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Internal mutation to update only status/timing fields on an existing subscription.
 */
export const updateSubscriptionStatus = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    status: subscriptionStatusValidator,
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(args.subscriptionId, {
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAt: args.cancelAt,
      canceledAt: args.canceledAt,
      endedAt: args.endedAt,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to update a subscription by Stripe subscription ID from webhook payloads.
 */
export const updateSubscriptionFromWebhook = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    status: subscriptionStatusValidator,
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      return { success: false, error: "Subscription not found" as const };
    }

    await ctx.db.patch(subscription._id, {
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAt: args.cancelAt,
      canceledAt: args.canceledAt,
      endedAt: args.endedAt,
      updatedAt: Date.now(),
    });

    return { success: true, subscriptionId: subscription._id };
  },
});

/**
 * Internal mutation to update dunning policy settings for a subscription.
 */
export const updateSubscriptionDunningPolicyRecord = internalMutation({
  args: {
    orgId: v.string(),
    subscriptionId: v.id("subscriptions"),
    dunningEnabled: v.boolean(),
    dunningMaxAttempts: v.number(),
    dunningRetryIntervalDays: v.number(),
    dunningAction: dunningActionValidator,
  },
  handler: async (ctx, args) => {
    const subscription = ensureOrgAccess(
      await ctx.db.get(args.subscriptionId),
      args.orgId,
      "Subscription not found",
    );

    const normalized = normalizeDunningSettings({
      dunningEnabled: args.dunningEnabled,
      dunningMaxAttempts: args.dunningMaxAttempts,
      dunningRetryIntervalDays: args.dunningRetryIntervalDays,
      dunningAction: args.dunningAction,
    });

    await ctx.db.patch(subscription._id, {
      dunningEnabled: normalized.dunningEnabled,
      dunningMaxAttempts: normalized.dunningMaxAttempts,
      dunningRetryIntervalDays: normalized.dunningRetryIntervalDays,
      dunningAction: normalized.dunningAction,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      subscriptionId: subscription._id,
      dunningEnabled: normalized.dunningEnabled,
      dunningMaxAttempts: normalized.dunningMaxAttempts,
      dunningRetryIntervalDays: normalized.dunningRetryIntervalDays,
      dunningAction: normalized.dunningAction,
    };
  },
});

/**
 * Internal mutation to record a subscription payment failure attempt.
 * Uses stripeInvoiceId for idempotency across webhook retries.
 */
export const recordSubscriptionDunningFailure = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    stripeInvoiceId: v.string(),
    failedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      return { success: false, error: "subscription_not_tracked" as const };
    }

    const settings = normalizeDunningSettings(subscription);
    const failedAt = args.failedAt ?? Date.now();
    const lastFailedInvoiceId = subscription.dunningLastFailedInvoiceId;
    const isDuplicate = lastFailedInvoiceId === args.stripeInvoiceId;
    const priorFailureCount = subscription.dunningFailureCount ?? 0;
    const failureCount = isDuplicate ? priorFailureCount : priorFailureCount + 1;

    if (!isDuplicate) {
      await ctx.db.patch(subscription._id, {
        dunningFailureCount: failureCount,
        dunningLastFailureAt: failedAt,
        dunningLastFailedInvoiceId: args.stripeInvoiceId,
        updatedAt: Date.now(),
      });
    }

    const shouldEscalate =
      !isDuplicate &&
      settings.dunningEnabled &&
      settings.dunningAction !== "none" &&
      failureCount >= settings.dunningMaxAttempts &&
      subscription.status !== "canceled" &&
      subscription.status !== "incomplete_expired";

    return {
      success: true,
      subscriptionId: subscription._id,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      primaryBrand: subscription.primaryBrand,
      dunningEnabled: settings.dunningEnabled,
      dunningAction: settings.dunningAction,
      dunningMaxAttempts: settings.dunningMaxAttempts,
      dunningRetryIntervalDays: settings.dunningRetryIntervalDays,
      failureCount,
      isDuplicate,
      shouldEscalate,
    };
  },
});

/**
 * Internal mutation to reset dunning failure counters after successful payment.
 */
export const resetSubscriptionDunningFailureState = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      return { success: false, error: "subscription_not_tracked" as const };
    }

    await ctx.db.patch(subscription._id, {
      dunningFailureCount: 0,
      dunningLastFailureAt: undefined,
      dunningLastFailedInvoiceId: undefined,
      updatedAt: Date.now(),
    });

    return { success: true, subscriptionId: subscription._id };
  },
});

/**
 * Internal mutation to stamp when an automated dunning action executed.
 */
export const markSubscriptionDunningAction = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      return { success: false, error: "subscription_not_tracked" as const };
    }

    await ctx.db.patch(subscription._id, {
      dunningLastActionAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true, subscriptionId: subscription._id };
  },
});

/**
 * Internal mutation to upsert a local invoice record for subscription billing cycles.
 */
export const upsertSubscriptionInvoiceRecord = internalMutation({
  args: {
    orgId: v.string(),
    clientId: v.id("clients"),
    subscriptionId: v.id("subscriptions"),
    stripeSubscriptionId: v.string(),
    stripeInvoiceId: v.string(),
    invoiceNumber: v.string(),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible"),
    ),
    totalCents: v.number(),
    notes: v.optional(v.string()),
    billingPeriodStart: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.clientId), args.orgId, "Client not found");
    ensureOrgAccess(
      await ctx.db.get(args.subscriptionId),
      args.orgId,
      "Subscription not found",
    );

    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_org_stripe_invoice_id", (q) =>
        q.eq("orgId", args.orgId).eq("stripeInvoiceId", args.stripeInvoiceId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        invoiceNumber: args.invoiceNumber,
        primaryBrand: args.primaryBrand,
        participatingBrands: args.participatingBrands,
        clientId: args.clientId,
        subscriptionId: args.subscriptionId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        sourceType: "subscription",
        status: args.status,
        totalCents: args.totalCents,
        notes: args.notes,
        billingPeriodStart: args.billingPeriodStart,
        billingPeriodEnd: args.billingPeriodEnd,
        sentAt: args.sentAt,
        paidAt: args.paidAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("invoices", {
      orgId: args.orgId,
      invoiceNumber: args.invoiceNumber,
      primaryBrand: args.primaryBrand,
      participatingBrands: args.participatingBrands,
      clientId: args.clientId,
      stripeInvoiceId: args.stripeInvoiceId,
      sourceType: "subscription",
      subscriptionId: args.subscriptionId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      status: args.status,
      totalCents: args.totalCents,
      notes: args.notes,
      billingPeriodStart: args.billingPeriodStart,
      billingPeriodEnd: args.billingPeriodEnd,
      sentAt: args.sentAt,
      paidAt: args.paidAt,
      createdAt: args.createdAt,
    });
  },
});

/**
 * Internal mutation to create invoice record in Convex
 */
export const createInvoiceRecord = internalMutation({
  args: {
    orgId: v.string(),
    invoiceNumber: v.string(),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    clientId: v.id("clients"),
    stripeInvoiceId: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    revisesInvoiceId: v.optional(v.id("invoices")),
    revisesStripeInvoiceId: v.optional(v.string()),
    sourceType: v.optional(sourceTypeValidator),
    subscriptionId: v.optional(v.id("subscriptions")),
    stripeSubscriptionId: v.optional(v.string()),
    billingPeriodStart: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
    totalCents: v.number(),
    notes: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.clientId), args.orgId, "Client not found");

    if (args.revisesInvoiceId) {
      ensureOrgAccess(
        await ctx.db.get(args.revisesInvoiceId),
        args.orgId,
        "Revision source invoice not found"
      );
    }

    return await ctx.db.insert("invoices", {
      orgId: args.orgId,
      invoiceNumber: args.invoiceNumber,
      primaryBrand: args.primaryBrand,
      participatingBrands: args.participatingBrands,
      clientId: args.clientId,
      stripeInvoiceId: args.stripeInvoiceId,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      revisesInvoiceId: args.revisesInvoiceId,
      revisesStripeInvoiceId: args.revisesStripeInvoiceId,
      sourceType: args.sourceType ?? "one_time",
      subscriptionId: args.subscriptionId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      billingPeriodStart: args.billingPeriodStart,
      billingPeriodEnd: args.billingPeriodEnd,
      status: args.status,
      totalCents: args.totalCents,
      notes: args.notes,
      sentAt: args.sentAt,
      paidAt: args.paidAt,
      createdAt: args.createdAt ?? Date.now(),
    });
  },
});

/**
 * Internal mutation to update invoice with Stripe ID
 */
export const updateInvoiceStripeId = internalMutation({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
    stripeInvoiceId: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.invoiceId), args.orgId, "Invoice not found");
    await ctx.db.patch(args.invoiceId, {
      stripeInvoiceId: args.stripeInvoiceId,
      status: args.status,
    });
  },
});

/**
 * Internal mutation to update invoice with Checkout Session ID
 */
export const updateInvoiceCheckoutSession = internalMutation({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
    stripeCheckoutSessionId: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.invoiceId), args.orgId, "Invoice not found");
    await ctx.db.patch(args.invoiceId, {
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      status: args.status,
    });
  },
});

/**
 * Internal mutation to create line item records
 */
export const createLineItemRecords = internalMutation({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.invoiceId), args.orgId, "Invoice not found");
    const ids: Id<"invoiceLineItems">[] = [];
    for (const item of args.lineItems) {
      const id = await ctx.db.insert("invoiceLineItems", {
        orgId: args.orgId,
        invoiceId: args.invoiceId,
        serviceId: item.serviceId,
        brand: item.brand,
        category: item.category,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        customPriceCents: item.customPriceCents,
        stripePriceId: item.stripePriceId,
        isCustomItem: item.isCustomItem,
      });
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Internal mutation to replace line item records for an invoice
 */
export const replaceLineItemRecords = internalMutation({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.invoiceId), args.orgId, "Invoice not found");
    const existing = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", args.orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();

    for (const item of existing) {
      await ctx.db.delete(item._id);
    }

    const ids: Id<"invoiceLineItems">[] = [];
    for (const item of args.lineItems) {
      const id = await ctx.db.insert("invoiceLineItems", {
        orgId: args.orgId,
        invoiceId: args.invoiceId,
        serviceId: item.serviceId,
        brand: item.brand,
        category: item.category,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        customPriceCents: item.customPriceCents,
        stripePriceId: item.stripePriceId,
        isCustomItem: item.isCustomItem,
      });
      ids.push(id);
    }

    return ids;
  },
});

/**
 * Internal mutation to update invoice fields after draft edits
 */
export const updateInvoiceRecord = internalMutation({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    totalCents: v.number(),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.invoiceId), args.orgId, "Invoice not found");
    const updates: {
      primaryBrand: string;
      participatingBrands: string[];
      totalCents: number;
      notes?: string;
      billingPeriodEnd?: number;
    } = {
      primaryBrand: args.primaryBrand,
      participatingBrands: args.participatingBrands,
      totalCents: args.totalCents,
      notes: args.notes,
    };

    if (typeof args.dueAt === "number") {
      updates.billingPeriodEnd = args.dueAt;
    }

    await ctx.db.patch(args.invoiceId, updates);
  },
});

/**
 * Create a local draft invoice in Convex only (no Stripe Invoice object).
 */
export const createLedgerDraftInvoice = action({
  args: {
    clientId: v.id("clients"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        orgId,
        clientId: args.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      const { participatingBrands, primaryBrand, totalCents } =
        calculateInvoiceTotals(args.lineItems);

      if (totalCents <= 0) {
        return { success: false, error: "Invoice total must be greater than 0" };
      }

      const invoiceNumber = generateInvoiceNumber();

      const invoiceId = await ctx.runMutation(internal.invoiceActions.createInvoiceRecord, {
        orgId,
        invoiceNumber,
        primaryBrand,
        participatingBrands,
        clientId: args.clientId,
        status: "draft",
        totalCents,
        notes: args.notes,
        billingPeriodEnd: args.dueAt,
      });

      await ctx.runMutation(internal.invoiceActions.createLineItemRecords, {
        orgId,
        invoiceId,
        lineItems: args.lineItems,
      });

      return {
        success: true,
        invoiceId,
        invoiceNumber,
        status: "draft",
        totalCents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to create local draft invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Update a local draft invoice in Convex only (no Stripe Invoice object).
 */
export const updateLedgerDraftInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status !== "draft") {
        return { success: false, error: "Only draft invoices can be updated" };
      }

      const { participatingBrands, primaryBrand, totalCents } =
        calculateInvoiceTotals(args.lineItems);

      if (totalCents <= 0) {
        return { success: false, error: "Invoice total must be greater than 0" };
      }

      await ctx.runMutation(internal.invoiceActions.updateInvoiceRecord, {
        orgId,
        invoiceId: args.invoiceId,
        primaryBrand,
        participatingBrands,
        totalCents,
        notes: args.notes,
        dueAt: args.dueAt,
      });

      await ctx.runMutation(internal.invoiceActions.replaceLineItemRecords, {
        orgId,
        invoiceId: args.invoiceId,
        lineItems: args.lineItems,
      });

      return {
        success: true,
        invoiceId: args.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        status: "draft",
        totalCents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to update local draft invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Create a local draft revision for an existing invoice (no Stripe Invoice object).
 */
export const reviseLedgerInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status === "paid" || invoice.status === "void") {
        return {
          success: false,
          error: "Paid or void invoices can’t be revised.",
        };
      }

      const { participatingBrands, primaryBrand, totalCents } =
        calculateInvoiceTotals(args.lineItems);

      if (totalCents <= 0) {
        return { success: false, error: "Invoice total must be greater than 0" };
      }

      const invoiceNumber = generateInvoiceNumber();

      const revisionInvoiceId = await ctx.runMutation(
        internal.invoiceActions.createInvoiceRecord,
        {
          orgId,
          invoiceNumber,
          primaryBrand,
          participatingBrands,
          clientId: invoice.clientId,
          status: "draft",
          totalCents,
          notes: args.notes,
          billingPeriodEnd: args.dueAt,
          revisesInvoiceId: invoice._id,
          revisesStripeInvoiceId: invoice.stripeInvoiceId,
        },
      );

      await ctx.runMutation(internal.invoiceActions.createLineItemRecords, {
        orgId,
        invoiceId: revisionInvoiceId,
        lineItems: args.lineItems,
      });

      return {
        success: true,
        invoiceId: revisionInvoiceId,
        invoiceNumber,
        status: "draft",
        totalCents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to revise local invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Create a Stripe subscription and persist a local subscription record.
 * Phase 1 constraints:
 * - single-brand subscriptions only
 * - no custom recurring pricing overrides
 */
export const createSubscription = action({
  args: {
    clientId: v.id("clients"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    collectionMethod: v.optional(
      v.union(v.literal("send_invoice"), v.literal("charge_automatically")),
    ),
    daysUntilDue: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    subscriptionId?: Id<"subscriptions">;
    stripeSubscriptionId?: string;
    latestStripeInvoiceId?: string;
    latestInvoiceId?: Id<"invoices">;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      if (args.lineItems.length === 0) {
        return { success: false, error: "At least one line item is required" };
      }

      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        orgId,
        clientId: args.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      const { participatingBrands, primaryBrand } = calculateInvoiceTotals(args.lineItems);

      if (participatingBrands.length !== 1) {
        return {
          success: false,
          error: "Phase 1 supports single-brand subscriptions only.",
        };
      }

      const subscriptionBrand = toInvoiceBrand(
        primaryBrand,
        participatingBrands[0] as InvoiceBrand,
      );

      const stripe = getStripeClient();
      const context = getStripeContext(subscriptionBrand as StripeBrand);
      const stripeCustomerId = await ensureStripeCustomer(
        ctx,
        stripe,
        client,
        context,
        orgId,
      );

      const stripeItems: Stripe.SubscriptionCreateParams.Item[] = [];
      const normalizedItems: SubscriptionLineItemInput[] = [];

      for (const lineItem of args.lineItems) {
        const resolved = await resolveRecurringStripePriceForSubscriptionItem(
          ctx,
          stripe,
          context,
          orgId,
          lineItem,
        );

        stripeItems.push({
          price: resolved.stripePriceId,
          quantity: lineItem.quantity,
        });

        normalizedItems.push({
          serviceId: lineItem.serviceId,
          brand: lineItem.brand,
          category: lineItem.category,
          name: lineItem.name,
          description: lineItem.description,
          quantity: lineItem.quantity,
          stripePriceId: resolved.stripePriceId,
          unitPriceCents: resolved.unitPriceCents,
        });
      }

      const collectionMethod = args.collectionMethod ?? "send_invoice";
      const subscriptionPayload: Stripe.SubscriptionCreateParams = {
        customer: stripeCustomerId,
        items: stripeItems,
        collection_method: collectionMethod,
        metadata: {
          agency: PARENT_ORGANIZATION,
          primaryBrand: subscriptionBrand,
          participatingBrands: JSON.stringify(participatingBrands),
          convexClientId: args.clientId,
        },
      };

      if (collectionMethod === "send_invoice") {
        subscriptionPayload.days_until_due = Math.max(1, args.daysUntilDue ?? 30);
      }

      const stripeSubscription = await stripe.subscriptions.create(
        subscriptionPayload,
        context,
      );

      const subscriptionId = await ctx.runMutation(
        internal.invoiceActions.upsertSubscriptionRecord,
        {
          orgId,
          clientId: args.clientId,
          primaryBrand: subscriptionBrand,
          participatingBrands,
          stripeSubscriptionId: stripeSubscription.id,
          stripeCustomerId,
          status: getSubscriptionStatusFromStripe(
            stripeSubscription.status,
            stripeSubscription.pause_collection,
          ),
          currentPeriodStart: toMillis(stripeSubscription.current_period_start),
          currentPeriodEnd: toMillis(stripeSubscription.current_period_end),
          cancelAt: toMillis(stripeSubscription.cancel_at),
          canceledAt: toMillis(stripeSubscription.canceled_at),
          endedAt: toMillis(stripeSubscription.ended_at),
          notes: args.notes,
          items: normalizedItems,
        },
      );

      const latestStripeInvoiceId =
        typeof stripeSubscription.latest_invoice === "string"
          ? stripeSubscription.latest_invoice
          : stripeSubscription.latest_invoice &&
              typeof stripeSubscription.latest_invoice === "object" &&
              "id" in stripeSubscription.latest_invoice
            ? stripeSubscription.latest_invoice.id
            : undefined;

      let latestInvoiceId: Id<"invoices"> | undefined;
      if (latestStripeInvoiceId) {
        const syncResult = await ctx.runAction(
          internal.invoiceActions.syncSubscriptionInvoiceFromStripe,
          {
            stripeInvoiceId: latestStripeInvoiceId,
            stripeSubscriptionId: stripeSubscription.id,
          },
        );

        if (syncResult.success && syncResult.invoiceId) {
          latestInvoiceId = syncResult.invoiceId;
        }
      }

      return {
        success: true,
        subscriptionId,
        stripeSubscriptionId: stripeSubscription.id,
        latestStripeInvoiceId,
        latestInvoiceId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to create subscription:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Pause recurring billing for a subscription.
 * Stripe implementation uses pause_collection behavior=void.
 */
export const pauseSubscription = action({
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    subscriptionId?: Id<"subscriptions">;
    status?: SubscriptionStatus;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const subscription = await ctx.runQuery(
        internal.invoiceActions.getSubscriptionById,
        {
          orgId,
          subscriptionId: args.subscriptionId,
        },
      );

      if (!subscription) {
        return { success: false, error: "Subscription not found" };
      }

      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
        return {
          success: false,
          error: "Canceled subscriptions can’t be paused.",
        };
      }

      if (subscription.status === "paused") {
        return { success: true, subscriptionId: subscription._id, status: "paused" };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(subscription.primaryBrand as StripeBrand);

      await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          pause_collection: {
            behavior: "void",
          },
        },
        context,
      );

      const syncResult = await ctx.runAction(
        internal.invoiceActions.syncSubscriptionFromStripe,
        {
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        },
      );

      if (!syncResult.success || !syncResult.subscriptionId) {
        return {
          success: false,
          error: syncResult.error ?? "Failed to sync paused subscription",
        };
      }

      return { success: true, subscriptionId: syncResult.subscriptionId, status: "paused" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to pause subscription:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Resume billing for a paused/scheduled-cancel subscription.
 */
export const resumeSubscription = action({
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    subscriptionId?: Id<"subscriptions">;
    status?: SubscriptionStatus;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const subscription = await ctx.runQuery(
        internal.invoiceActions.getSubscriptionById,
        {
          orgId,
          subscriptionId: args.subscriptionId,
        },
      );

      if (!subscription) {
        return { success: false, error: "Subscription not found" };
      }

      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
        return {
          success: false,
          error: "Canceled subscriptions can’t be resumed.",
        };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(subscription.primaryBrand as StripeBrand);

      await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          pause_collection: null,
          cancel_at_period_end: false,
        },
        context,
      );

      const syncResult = await ctx.runAction(
        internal.invoiceActions.syncSubscriptionFromStripe,
        {
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        },
      );

      if (!syncResult.success || !syncResult.subscriptionId) {
        return {
          success: false,
          error: syncResult.error ?? "Failed to sync resumed subscription",
        };
      }

      const refreshed = await ctx.runQuery(internal.invoiceActions.getSubscriptionById, {
        orgId,
        subscriptionId: syncResult.subscriptionId,
      });

      return {
        success: true,
        subscriptionId: syncResult.subscriptionId,
        status: refreshed?.status as SubscriptionStatus | undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to resume subscription:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Cancel a subscription now or at period end.
 */
export const cancelSubscription = action({
  args: {
    subscriptionId: v.id("subscriptions"),
    atPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    subscriptionId?: Id<"subscriptions">;
    status?: SubscriptionStatus;
    canceledAtPeriodEnd?: boolean;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const subscription = await ctx.runQuery(
        internal.invoiceActions.getSubscriptionById,
        {
          orgId,
          subscriptionId: args.subscriptionId,
        },
      );

      if (!subscription) {
        return { success: false, error: "Subscription not found" };
      }

      if (subscription.status === "canceled") {
        return {
          success: true,
          subscriptionId: subscription._id,
          status: "canceled",
          canceledAtPeriodEnd: false,
        };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(subscription.primaryBrand as StripeBrand);
      const cancelAtPeriodEnd = args.atPeriodEnd ?? true;

      if (cancelAtPeriodEnd) {
        await stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          {
            cancel_at_period_end: true,
          },
          context,
        );
      } else {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId, {}, context);
      }

      const syncResult = await ctx.runAction(
        internal.invoiceActions.syncSubscriptionFromStripe,
        {
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        },
      );

      if (!syncResult.success || !syncResult.subscriptionId) {
        return {
          success: false,
          error: syncResult.error ?? "Failed to sync canceled subscription",
        };
      }

      const refreshed = await ctx.runQuery(internal.invoiceActions.getSubscriptionById, {
        orgId,
        subscriptionId: syncResult.subscriptionId,
      });

      return {
        success: true,
        subscriptionId: syncResult.subscriptionId,
        status: refreshed?.status as SubscriptionStatus | undefined,
        canceledAtPeriodEnd: cancelAtPeriodEnd,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to cancel subscription:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Read live Stripe collection mode for a subscription.
 * Used by UI to show whether auto-transition to autopay is active.
 */
export const getSubscriptionCollectionMode = action({
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    collectionMethod?: "send_invoice" | "charge_automatically";
    autoTransitioned?: boolean;
    defaultPaymentMethodSet?: boolean;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const subscription = await ctx.runQuery(
        internal.invoiceActions.getSubscriptionById,
        {
          orgId,
          subscriptionId: args.subscriptionId,
        },
      );

      if (!subscription) {
        return { success: false, error: "Subscription not found" };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(subscription.primaryBrand as StripeBrand);
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        {},
        context,
      );

      const collectionMethod = stripeSubscription.collection_method;
      if (
        collectionMethod !== "send_invoice" &&
        collectionMethod !== "charge_automatically"
      ) {
        return { success: false, error: "Unknown Stripe collection method" };
      }

      const defaultPaymentMethodSet = !!stripeSubscription.default_payment_method;

      return {
        success: true,
        collectionMethod,
        autoTransitioned: collectionMethod === "charge_automatically",
        defaultPaymentMethodSet,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to fetch subscription collection mode:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Read live Stripe collection modes for multiple subscriptions.
 * Used by the subscriptions list page for filtering/export.
 */
export const getSubscriptionCollectionModes = action({
  args: {
    subscriptionIds: v.array(v.id("subscriptions")),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    modes: Array<{
      subscriptionId: Id<"subscriptions">;
      collectionMethod: "send_invoice" | "charge_automatically" | "unknown";
      defaultPaymentMethodSet: boolean;
      error?: string;
    }>;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const uniqueIds: Id<"subscriptions">[] = [];
      const seen = new Set<string>();
      for (const id of args.subscriptionIds) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        uniqueIds.push(id);
      }

      const stripe = getStripeClient();
      const modes: Array<{
        subscriptionId: Id<"subscriptions">;
        collectionMethod: "send_invoice" | "charge_automatically" | "unknown";
        defaultPaymentMethodSet: boolean;
        error?: string;
      }> = [];

      for (const subscriptionId of uniqueIds) {
        const subscription = await ctx.runQuery(
          internal.invoiceActions.getSubscriptionById,
          {
            orgId,
            subscriptionId,
          },
        );

        if (!subscription) {
          modes.push({
            subscriptionId,
            collectionMethod: "unknown",
            defaultPaymentMethodSet: false,
            error: "Subscription not found",
          });
          continue;
        }

        try {
          const context = getStripeContext(subscription.primaryBrand as StripeBrand);
          const stripeSubscription = await stripe.subscriptions.retrieve(
            subscription.stripeSubscriptionId,
            {},
            context,
          );

          const collectionMethod =
            stripeSubscription.collection_method === "send_invoice" ||
            stripeSubscription.collection_method === "charge_automatically"
              ? stripeSubscription.collection_method
              : "unknown";

          modes.push({
            subscriptionId,
            collectionMethod,
            defaultPaymentMethodSet: !!stripeSubscription.default_payment_method,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          modes.push({
            subscriptionId,
            collectionMethod: "unknown",
            defaultPaymentMethodSet: false,
            error: errorMessage,
          });
        }
      }

      return {
        success: true,
        modes,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to fetch subscription collection modes:", errorMessage);
      return {
        success: false,
        modes: [],
        error: errorMessage,
      };
    }
  }),
});

/**
 * Update subscription quantities/prices with a configurable proration behavior.
 */
export const updateSubscriptionPlan = action({
  args: {
    subscriptionId: v.id("subscriptions"),
    items: v.array(subscriptionPlanUpdateItemValidator),
    prorationBehavior: prorationBehaviorValidator,
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    subscriptionId?: Id<"subscriptions">;
    latestInvoiceId?: Id<"invoices">;
    latestStripeInvoiceId?: string;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      if (args.items.length === 0) {
        return { success: false, error: "At least one item update is required." };
      }

      const subscription = await ctx.runQuery(
        internal.invoiceActions.getSubscriptionById,
        {
          orgId,
          subscriptionId: args.subscriptionId,
        },
      );

      if (!subscription) {
        return { success: false, error: "Subscription not found" };
      }

      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
        return { success: false, error: "Canceled subscriptions can’t be updated." };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(subscription.primaryBrand as StripeBrand);

      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        {
          expand: ["items.data.price"],
        },
        context,
      );

      const subscriptionItemsByPriceId = new Map<string, Stripe.SubscriptionItem>();
      for (const item of stripeSubscription.items.data) {
        const priceId =
          item.price && typeof item.price === "object" && !("deleted" in item.price)
            ? item.price.id
            : undefined;
        if (priceId) {
          subscriptionItemsByPriceId.set(priceId, item);
        }
      }

      const localItemsByPriceId = new Map<
        string,
        (typeof subscription.items)[number]
      >();
      for (const item of subscription.items) {
        if (!item.stripePriceId) {
          continue;
        }
        localItemsByPriceId.set(item.stripePriceId, item);
      }

      const updates: Stripe.SubscriptionUpdateParams.Item[] = [];
      for (const item of args.items) {
        const quantity = Math.max(1, Math.round(item.quantity));
        const existingStripeItem = subscriptionItemsByPriceId.get(item.stripePriceId);
        if (!existingStripeItem) {
          return {
            success: false,
            error: `Stripe price ${item.stripePriceId} is not on this subscription.`,
          };
        }

        const existingPrice =
          existingStripeItem.price &&
          typeof existingStripeItem.price === "object" &&
          !("deleted" in existingStripeItem.price)
            ? existingStripeItem.price
            : null;

        const currentUnitPriceCents =
          typeof existingPrice?.unit_amount === "number"
            ? existingPrice.unit_amount
            : localItemsByPriceId.get(item.stripePriceId)?.unitPriceCents;

        if (currentUnitPriceCents === undefined || currentUnitPriceCents <= 0) {
          return {
            success: false,
            error: `Unable to resolve current unit price for ${item.stripePriceId}.`,
          };
        }

        const requestedUnitPriceCents =
          item.unitPriceCents === undefined
            ? currentUnitPriceCents
            : Math.max(1, Math.round(item.unitPriceCents));

        if (requestedUnitPriceCents !== currentUnitPriceCents) {
          if (!existingPrice?.recurring) {
            return {
              success: false,
              error: `Stripe price ${item.stripePriceId} is not a recurring price.`,
            };
          }

          const productId =
            typeof existingPrice.product === "string"
              ? existingPrice.product
              : existingPrice.product &&
                  typeof existingPrice.product === "object" &&
                  "id" in existingPrice.product
                ? existingPrice.product.id
                : undefined;

          if (!productId) {
            return {
              success: false,
              error: `Unable to resolve Stripe product for ${item.stripePriceId}.`,
            };
          }

          const replacementPrice = await stripe.prices.create(
            {
              product: productId,
              unit_amount: requestedUnitPriceCents,
              currency: existingPrice.currency || "usd",
              recurring: {
                interval: existingPrice.recurring.interval,
                interval_count: Math.max(1, existingPrice.recurring.interval_count ?? 1),
              },
              metadata: {
                ...existingPrice.metadata,
                billingType: "recurring",
                source: "subscription_plan_update",
                previousPriceId: item.stripePriceId,
                previousUnitAmountCents: String(currentUnitPriceCents),
              },
            },
            context,
          );

          updates.push({
            id: existingStripeItem.id,
            quantity,
            price: replacementPrice.id,
          });
          continue;
        }

        updates.push({
          id: existingStripeItem.id,
          quantity,
        });
      }

      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          items: updates,
          proration_behavior: args.prorationBehavior,
        },
        context,
      );

      const syncResult = await ctx.runAction(
        internal.invoiceActions.syncSubscriptionFromStripe,
        {
          stripeSubscriptionId: updatedSubscription.id,
        },
      );

      if (!syncResult.success || !syncResult.subscriptionId) {
        return {
          success: false,
          error: syncResult.error ?? "Failed to sync updated subscription",
        };
      }

      const latestStripeInvoiceIdFromSubscription =
        typeof updatedSubscription.latest_invoice === "string"
          ? updatedSubscription.latest_invoice
          : updatedSubscription.latest_invoice &&
              typeof updatedSubscription.latest_invoice === "object" &&
              "id" in updatedSubscription.latest_invoice
            ? updatedSubscription.latest_invoice.id
            : undefined;

      const invoiceIdsToSync: string[] = [];
      const seenInvoiceIds = new Set<string>();
      const addInvoiceId = (value?: string) => {
        if (!value || seenInvoiceIds.has(value)) {
          return;
        }
        seenInvoiceIds.add(value);
        invoiceIdsToSync.push(value);
      };

      try {
        const recentSubscriptionInvoices = await stripe.invoices.list(
          {
            subscription: subscription.stripeSubscriptionId,
            limit: 5,
          },
          context,
        );

        for (const invoice of recentSubscriptionInvoices.data) {
          // Keep local records in sync for the most recent invoices that users
          // actually see on the subscription detail page.
          addInvoiceId(invoice.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `⚠️ Failed listing recent invoices for subscription ${subscription.stripeSubscriptionId}: ${message}`,
        );
      }

      addInvoiceId(latestStripeInvoiceIdFromSubscription);

      let latestInvoiceId: Id<"invoices"> | undefined;
      let latestStripeInvoiceId: string | undefined;

      for (const stripeInvoiceId of invoiceIdsToSync) {
        const invoiceSync = await ctx.runAction(
          internal.invoiceActions.syncSubscriptionInvoiceFromStripe,
          {
            stripeInvoiceId,
            stripeSubscriptionId: updatedSubscription.id,
          },
        );

        if (!latestInvoiceId && invoiceSync.success && invoiceSync.invoiceId) {
          latestInvoiceId = invoiceSync.invoiceId;
          latestStripeInvoiceId = stripeInvoiceId;
        }
      }

      if (!latestStripeInvoiceId) {
        latestStripeInvoiceId = latestStripeInvoiceIdFromSubscription;
      }

      return {
        success: true,
        subscriptionId: syncResult.subscriptionId,
        latestInvoiceId,
        latestStripeInvoiceId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to update subscription plan:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Update dunning policy values for a subscription.
 */
export const updateSubscriptionDunningPolicy = action({
  args: {
    subscriptionId: v.id("subscriptions"),
    dunningEnabled: v.boolean(),
    dunningMaxAttempts: v.number(),
    dunningRetryIntervalDays: v.number(),
    dunningAction: dunningActionValidator,
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    subscriptionId?: Id<"subscriptions">;
    dunningEnabled?: boolean;
    dunningMaxAttempts?: number;
    dunningRetryIntervalDays?: number;
    dunningAction?: SubscriptionDunningAction;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const result = await ctx.runMutation(
        internal.invoiceActions.updateSubscriptionDunningPolicyRecord,
        {
          orgId,
          subscriptionId: args.subscriptionId,
          dunningEnabled: args.dunningEnabled,
          dunningMaxAttempts: args.dunningMaxAttempts,
          dunningRetryIntervalDays: args.dunningRetryIntervalDays,
          dunningAction: args.dunningAction,
        },
      );

      if (!result.success) {
        return { success: false, error: "Failed to update dunning policy" };
      }

      return {
        success: true,
        subscriptionId: result.subscriptionId,
        dunningEnabled: result.dunningEnabled,
        dunningMaxAttempts: result.dunningMaxAttempts,
        dunningRetryIntervalDays: result.dunningRetryIntervalDays,
        dunningAction: result.dunningAction as SubscriptionDunningAction,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to update dunning policy:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Apply dunning policy based on a subscription payment failure event.
 */
export const applySubscriptionDunningPolicyFromPaymentFailure = internalAction({
  args: {
    stripeSubscriptionId: v.string(),
    stripeInvoiceId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    skipped?: string;
    appliedAction?: SubscriptionDunningAction;
    failureCount?: number;
    error?: string;
  }> => {
    try {
      const failureRecord = await ctx.runMutation(
        internal.invoiceActions.recordSubscriptionDunningFailure,
        {
          stripeSubscriptionId: args.stripeSubscriptionId,
          stripeInvoiceId: args.stripeInvoiceId,
          failedAt: Date.now(),
        },
      );

      if (!failureRecord.success) {
        return { success: true, skipped: failureRecord.error };
      }

      if (failureRecord.isDuplicate) {
        return {
          success: true,
          skipped: "duplicate_failure_event",
          failureCount: failureRecord.failureCount,
        };
      }

      if (!failureRecord.shouldEscalate) {
        return {
          success: true,
          skipped: "below_dunning_threshold",
          failureCount: failureRecord.failureCount,
        };
      }

      const actionToApply = failureRecord.dunningAction;
      const stripe = getStripeClient();
      const context = getStripeContext(failureRecord.primaryBrand as StripeBrand);

      if (actionToApply === "pause") {
        await stripe.subscriptions.update(
          failureRecord.stripeSubscriptionId,
          {
            pause_collection: {
              behavior: "void",
            },
          },
          context,
        );
      } else if (actionToApply === "cancel") {
        await stripe.subscriptions.cancel(failureRecord.stripeSubscriptionId, {}, context);
      } else {
        return {
          success: true,
          skipped: "dunning_action_none",
          failureCount: failureRecord.failureCount,
        };
      }

      await ctx.runMutation(internal.invoiceActions.markSubscriptionDunningAction, {
        stripeSubscriptionId: failureRecord.stripeSubscriptionId,
      });

      await ctx.runAction(internal.invoiceActions.syncSubscriptionFromStripe, {
        stripeSubscriptionId: failureRecord.stripeSubscriptionId,
      });

      return {
        success: true,
        appliedAction: actionToApply,
        failureCount: failureRecord.failureCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to apply dunning policy:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Sync an existing Stripe subscription by ID into the local subscriptions table.
 * Useful for webhook-driven status updates.
 */
export const syncSubscriptionFromStripe = internalAction({
  args: {
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    subscriptionId?: Id<"subscriptions">;
    skipped?: string;
    error?: string;
  }> => {
    try {
      const localSubscription = await ctx.runQuery(
        internal.invoiceActions.getSubscriptionByStripeId,
        {
          stripeSubscriptionId: args.stripeSubscriptionId,
        },
      );

      if (!localSubscription) {
        return { success: false, skipped: "subscription_not_tracked" };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(localSubscription.primaryBrand as StripeBrand);

      const stripeSubscription = await stripe.subscriptions.retrieve(
        args.stripeSubscriptionId,
        {
          expand: ["items.data.price"],
        },
        context,
      );

      const parsedMetadataBrands = parseParticipatingBrandsMetadata(
        stripeSubscription.metadata?.participatingBrands,
      );
      const participatingBrands =
        parsedMetadataBrands.length > 0
          ? parsedMetadataBrands
          : localSubscription.participatingBrands;

      const fallbackBrand = toInvoiceBrand(
        localSubscription.primaryBrand,
        localSubscription.participatingBrands[0] as InvoiceBrand,
      );

      const itemsFromStripe: SubscriptionLineItemInput[] = stripeSubscription.items.data.map(
        (item) => {
          const price =
            item.price && typeof item.price === "object" && !("deleted" in item.price)
              ? item.price
              : undefined;
          const brand = toInvoiceBrand(price?.metadata?.brand, fallbackBrand);

          return {
            serviceId: price?.metadata?.serviceId
              ? (price.metadata.serviceId as Id<"services">)
              : price?.metadata?.convexServiceId
                ? (price.metadata.convexServiceId as Id<"services">)
              : undefined,
            brand,
            category: price?.metadata?.category ?? "subscription",
            name: price?.nickname ?? `Subscription item (${brand})`,
            description: price?.nickname ?? undefined,
            quantity: Math.max(1, item.quantity ?? 1),
            stripePriceId: price?.id,
            unitPriceCents: price?.unit_amount ?? 0,
          };
        },
      );

      const subscriptionId = await ctx.runMutation(
        internal.invoiceActions.upsertSubscriptionRecord,
        {
          orgId: localSubscription.orgId,
          clientId: localSubscription.clientId,
          primaryBrand: fallbackBrand,
          participatingBrands,
          stripeSubscriptionId: stripeSubscription.id,
          stripeCustomerId:
            typeof stripeSubscription.customer === "string"
              ? stripeSubscription.customer
              : stripeSubscription.customer?.id ?? localSubscription.stripeCustomerId,
          status: getSubscriptionStatusFromStripe(
            stripeSubscription.status,
            stripeSubscription.pause_collection,
          ),
          currentPeriodStart: toMillis(stripeSubscription.current_period_start),
          currentPeriodEnd: toMillis(stripeSubscription.current_period_end),
          cancelAt: toMillis(stripeSubscription.cancel_at),
          canceledAt: toMillis(stripeSubscription.canceled_at),
          endedAt: toMillis(stripeSubscription.ended_at),
          notes: localSubscription.notes,
          items: itemsFromStripe.length > 0 ? itemsFromStripe : localSubscription.items,
        },
      );

      return {
        success: true,
        subscriptionId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to sync subscription from Stripe:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Sync a Stripe subscription invoice into local invoices + invoiceLineItems.
 * Called by webhook handlers for invoice lifecycle events.
 */
export const syncSubscriptionInvoiceFromStripe = internalAction({
  args: {
    stripeInvoiceId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    skipped?: string;
    error?: string;
  }> => {
    try {
      const subscriptionId = args.stripeSubscriptionId;
      if (!subscriptionId) {
        return { success: false, skipped: "missing_subscription_id" };
      }

      const localSubscription = await ctx.runQuery(
        internal.invoiceActions.getSubscriptionByStripeId,
        {
          stripeSubscriptionId: subscriptionId,
        },
      );

      if (!localSubscription) {
        return { success: false, skipped: "subscription_not_tracked" };
      }

      const fallbackBrand = toInvoiceBrand(
        localSubscription.primaryBrand,
        localSubscription.participatingBrands[0] as InvoiceBrand,
      );
      const stripe = getStripeClient();
      const context = getStripeContext(fallbackBrand as StripeBrand);

      const stripeInvoice = await stripe.invoices.retrieve(
        args.stripeInvoiceId,
        { expand: ["lines.data.price"] },
        context,
      );

      const allStripeLineItems: Stripe.InvoiceLineItem[] = [];
      let startingAfter: string | undefined;
      do {
        const linePage = await stripe.invoices.listLineItems(
          args.stripeInvoiceId,
          {
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          },
          context,
        );

        allStripeLineItems.push(...linePage.data);
        startingAfter = linePage.has_more
          ? linePage.data[linePage.data.length - 1]?.id
          : undefined;
      } while (startingAfter);

      const invoiceForParsing = {
        ...stripeInvoice,
        lines: {
          ...stripeInvoice.lines,
          data: allStripeLineItems,
        },
      } as Stripe.Invoice;

      const localLineItems = parseStripeInvoiceLineItems({
        stripeInvoice: invoiceForParsing,
        fallbackBrand,
        fallbackCategory: localSubscription.items[0]?.category,
      });

      const lineItemsForStorage =
        localLineItems.length > 0
          ? localLineItems
          : localSubscription.items.map((item) => ({
              serviceId: item.serviceId,
              brand: item.brand,
              category: item.category,
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              stripePriceId: item.stripePriceId,
              unitPriceCents: item.unitPriceCents,
              customPriceCents: undefined,
              isCustomItem: !item.stripePriceId,
            }));

      const parsedMetadataBrands = parseParticipatingBrandsMetadata(
        stripeInvoice.metadata?.participatingBrands,
      );
      const brandsFromLineItems = [
        ...new Set(lineItemsForStorage.map((item) => item.brand)),
      ];
      const participatingBrands =
        brandsFromLineItems.length > 0
          ? brandsFromLineItems
          : parsedMetadataBrands.length > 0
            ? parsedMetadataBrands
            : localSubscription.participatingBrands;
      const primaryBrand =
        participatingBrands.length === 1 ? participatingBrands[0] : PARENT_ORGANIZATION;

      const status = mapStripeInvoiceStatus(stripeInvoice.status);
      const totalCents =
        typeof stripeInvoice.total === "number"
          ? stripeInvoice.total
          : stripeInvoice.amount_due ?? 0;
      const invoiceNumber =
        stripeInvoice.number ??
        `INV-SUB-${stripeInvoice.id.slice(-8).toUpperCase()}`;

      const invoiceId = await ctx.runMutation(
        internal.invoiceActions.upsertSubscriptionInvoiceRecord,
        {
          orgId: localSubscription.orgId,
          clientId: localSubscription.clientId,
          subscriptionId: localSubscription._id,
          stripeSubscriptionId: localSubscription.stripeSubscriptionId,
          stripeInvoiceId: stripeInvoice.id,
          invoiceNumber,
          primaryBrand,
          participatingBrands,
          status,
          totalCents,
          notes: localSubscription.notes,
          billingPeriodStart: toMillis(stripeInvoice.period_start),
          billingPeriodEnd: toMillis(stripeInvoice.period_end),
          sentAt: toMillis(stripeInvoice.status_transitions?.finalized_at),
          paidAt: toMillis(stripeInvoice.status_transitions?.paid_at),
          createdAt: toMillis(stripeInvoice.created) ?? Date.now(),
        },
      );

      if (lineItemsForStorage.length > 0) {
        await ctx.runMutation(internal.invoiceActions.replaceLineItemRecords, {
          orgId: localSubscription.orgId,
          invoiceId,
          lineItems: lineItemsForStorage,
        });
      }

      return {
        success: true,
        invoiceId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to sync subscription invoice from Stripe:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Create a Stripe Checkout Session for an existing Convex invoice.
 * This keeps payment collection centralized while ledger attribution happens via webhook.
 */
export const createCheckoutSessionForInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    invoiceNumber?: string;
    status?: "open";
    totalCents?: number;
    checkoutSessionId?: string;
    checkoutUrl?: string;
    emailSent?: boolean;
    emailSkipped?: string;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status === "paid" || invoice.status === "void") {
        return { success: false, error: "Only draft/open/uncollectible invoices can be sent" };
      }

      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        orgId,
        clientId: invoice.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      const lineItems = await ctx.runQuery(
        internal.invoiceActions.getInvoiceLineItemsByInvoiceId,
        {
          orgId,
          invoiceId: args.invoiceId,
        },
      );

      if (lineItems.length === 0) {
        return { success: false, error: "Invoice has no line items" };
      }

      const { totalCents } = calculateInvoiceTotals(lineItems);

      if (totalCents <= 0) {
        return { success: false, error: "Invoice total must be greater than 0" };
      }

      const stripe = getStripeClient();

      const checkoutSession = await createCheckoutSessionForInvoiceRecord(
        stripe,
        {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          participatingBrands: invoice.participatingBrands,
        },
        {
          email: client.email,
          name: client.name,
          company: client.company,
        },
        totalCents,
        args.successUrl,
        args.cancelUrl,
      );

      await ctx.runMutation(internal.invoiceActions.updateInvoiceCheckoutSession, {
        orgId,
        invoiceId: args.invoiceId,
        stripeCheckoutSessionId: checkoutSession.id,
        status: "open",
      });

      if (invoice.revisesInvoiceId) {
        const revisedInvoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
          orgId,
          invoiceId: invoice.revisesInvoiceId,
        });

        if (revisedInvoice?.stripeCheckoutSessionId) {
          const context = getStripeContext(PARENT_ORGANIZATION as StripeBrand);

          try {
            const previousCheckoutSession = await stripe.checkout.sessions.retrieve(
              revisedInvoice.stripeCheckoutSessionId,
              {},
              context,
            );

            if (previousCheckoutSession.status === "open") {
              await stripe.checkout.sessions.expire(
                revisedInvoice.stripeCheckoutSessionId,
                {},
                context,
              );
            }
          } catch (checkoutError) {
            const message =
              checkoutError instanceof Error ? checkoutError.message : "Unknown error";
            console.warn(
              `⚠️ Unable to expire replaced invoice checkout session ${revisedInvoice.stripeCheckoutSessionId}: ${message}`,
            );
          }
        }

        await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
          orgId,
          invoiceId: invoice.revisesInvoiceId,
          status: "void",
        });
      }

      let emailSent = false;
      let emailSkipped: string | undefined;
      const dueAt = resolveStoredInvoiceDueAt(invoice);
      try {
        const emailResult = await sendInvoiceEmailWithResend({
          invoiceNumber: invoice.invoiceNumber,
          participatingBrands: invoice.participatingBrands,
          client: {
            email: client.email,
            name: client.name,
            company: client.company,
          },
          notes: invoice.notes,
          lineItems,
          issueAt: invoice.createdAt,
          dueAt,
          checkoutUrl: checkoutSession.url ?? undefined,
          pdfDownloadUrl: buildInvoicePdfDownloadUrl(invoice._id, checkoutSession.id),
        });

        emailSent = emailResult.sent;
        if (!emailResult.sent && "skipped" in emailResult) {
          emailSkipped = emailResult.skipped;
        }
      } catch (emailError) {
        const emailMessage =
          emailError instanceof Error ? emailError.message : "Unknown error";
        emailSkipped = `send_failed:${emailMessage}`;
        console.error(
          `❌ Failed to send invoice email for ${invoice.invoiceNumber}:`,
          emailMessage
        );
      }

      return {
        success: true,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        status: "open",
        totalCents,
        checkoutSessionId: checkoutSession.id,
        checkoutUrl: checkoutSession.url ?? undefined,
        emailSent,
        emailSkipped,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to create Checkout Session:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Main action to create an invoice
 * Uses single GFAM Agency Stripe account with brand metadata tracking
 */
export const createInvoice = action({
  args: {
    clientId: v.id("clients"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    sendImmediately: v.optional(v.boolean()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    stripeInvoiceId?: string;
    invoiceNumber?: string;
    status?: "draft" | "open";
    totalCents?: number;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      // 1. Get client info
      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        orgId,
        clientId: args.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      // 2. Calculate totals and determine brands
      const brands = new Set<string>();
      let totalCents = 0;

      for (const item of args.lineItems) {
        brands.add(item.brand);
        const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
        totalCents += effectivePrice * item.quantity;
      }

      const participatingBrands = [...brands];
      const primaryBrand = brands.size === 1 ? participatingBrands[0] : PARENT_ORGANIZATION;

      console.log(`📧 Creating invoice for ${primaryBrand} on ${PARENT_ORGANIZATION} Stripe`);

      // 3. Get the single Stripe client
      const stripe = getStripeClient();

      // 4. Get context for Organization API keys (required for sk_org_* keys)
      // Use primary brand for all invoice operations to keep everything on same account
      const context = getStripeContext(primaryBrand as StripeBrand);

      // 5. Ensure client has a Stripe customer ID
      const stripeCustomerId = await ensureStripeCustomer(
        ctx,
        stripe,
        client,
        context,
        orgId
      );

      // 6. Generate invoice number
      const invoiceNumber = generateInvoiceNumber();
      const issueAtMs = Date.now();
      const dueAtMs = normalizeDueAt(args.dueAt, issueAtMs);

      // 7. Create Convex invoice record first (as draft)
      const invoiceId = await ctx.runMutation(
        internal.invoiceActions.createInvoiceRecord,
        {
          orgId,
          invoiceNumber,
          primaryBrand,
          participatingBrands,
          clientId: args.clientId,
          status: "draft",
          totalCents,
          notes: args.notes,
          createdAt: issueAtMs,
          billingPeriodEnd: dueAtMs,
        }
      );

      // 8. Create Stripe invoice with brand metadata
      const stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        collection_method: "send_invoice",
        due_date: Math.floor(dueAtMs / 1000),
        metadata: {
          agency: PARENT_ORGANIZATION,
          primaryBrand,
          participatingBrands: JSON.stringify(participatingBrands),
          convexInvoiceId: invoiceId,
          invoiceNumber,
        },
        description: `Services by ${participatingBrands.join(" & ")}`,
      }, context);

      // 9. Add line items to Stripe invoice
      for (const item of args.lineItems) {
        const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
        const hasCustomPrice =
          item.customPriceCents !== undefined &&
          item.customPriceCents !== item.unitPriceCents;

        let resolvedStripePriceId = item.stripePriceId;
        if (!resolvedStripePriceId && item.serviceId) {
          const service = await ctx.runQuery(api.services.get, {
            serviceId: item.serviceId,
          });
          resolvedStripePriceId = service?.stripePriceId;
        }

        // Build metadata with brand tracking
        const itemMetadata = buildStripeMetadata(
          item.brand as StripeBrand,
          item.category,
          {
            convexInvoiceId: invoiceId,
            isCustomPrice: hasCustomPrice ? "true" : "false",
            ...(item.serviceId && { serviceId: item.serviceId }),
          }
        );

        // Use catalog price if available and not custom
        const usesCatalogPrice = resolvedStripePriceId && !hasCustomPrice;

        if (isOrganizationKey()) {
          console.log(
            `🔐 Stripe context: brand=${item.brand} account=${
              context && "stripeContext" in context && context.stripeContext
                ? "set"
                : "missing"
            } catalogPrice=${usesCatalogPrice ? "yes" : "no"}`
          );
        }

        if (usesCatalogPrice && resolvedStripePriceId) {
          // Use catalog price
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice: stripeInvoice.id,
            price: resolvedStripePriceId,
            quantity: item.quantity,
            metadata: itemMetadata,
          }, context);
        } else {
          // Use legacy amount/currency for custom pricing or ad-hoc items
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice: stripeInvoice.id,
            amount: effectivePrice * item.quantity,
            currency: "usd",
            description: hasCustomPrice
              ? `${item.brand} Custom: ${item.name}`
              : item.name,
            metadata: itemMetadata,
          }, context);
        }
      }

      // 10. Save line items to Convex
      await ctx.runMutation(internal.invoiceActions.createLineItemRecords, {
        orgId,
        invoiceId,
        lineItems: args.lineItems,
      });

      // 11. Finalize and optionally send
      let finalStatus: "draft" | "open" = "draft";

      if (args.sendImmediately) {
        await stripe.invoices.finalizeInvoice(stripeInvoice.id, context);
        await stripe.invoices.sendInvoice(stripeInvoice.id, context);
        finalStatus = "open";
      }

      // 12. Update invoice with Stripe ID and final status
      await ctx.runMutation(internal.invoiceActions.updateInvoiceStripeId, {
        orgId,
        invoiceId,
        stripeInvoiceId: stripeInvoice.id,
        status: finalStatus,
      });

      console.log(`✅ Created invoice ${invoiceNumber} (${finalStatus})`);

      return {
        success: true,
        invoiceId,
        stripeInvoiceId: stripeInvoice.id,
        invoiceNumber,
        status: finalStatus,
        totalCents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to create invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Update an existing draft invoice (Stripe + Convex)
 */
export const updateDraftInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    stripeInvoiceId?: string;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status !== "draft") {
        return { success: false, error: "Only draft invoices can be updated" };
      }

      if (!invoice.stripeInvoiceId) {
        return { success: false, error: "Invoice has no Stripe ID" };
      }

      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        orgId,
        clientId: invoice.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      const brands = new Set<string>();
      let totalCents = 0;

      for (const item of args.lineItems) {
        brands.add(item.brand);
        const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
        totalCents += effectivePrice * item.quantity;
      }

      const participatingBrands = [...brands];
      const primaryBrand = brands.size === 1 ? participatingBrands[0] : PARENT_ORGANIZATION;

      if (isOrganizationKey() && primaryBrand !== invoice.primaryBrand) {
        return {
          success: false,
          error:
            "Draft invoices can’t change the Stripe account context. " +
            "Create a new invoice to change brands.",
        };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(invoice.primaryBrand as StripeBrand);
      const stripeCustomerId = await ensureStripeCustomer(
        ctx,
        stripe,
        client,
        context,
        orgId
      );

      const normalizedDueAt =
        typeof args.dueAt === "number"
          ? normalizeDueAt(args.dueAt, invoice.createdAt)
          : undefined;

      await stripe.invoices.update(
        invoice.stripeInvoiceId,
        {
          metadata: {
            agency: PARENT_ORGANIZATION,
            primaryBrand: invoice.primaryBrand,
            participatingBrands: JSON.stringify(participatingBrands),
            convexInvoiceId: args.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
          },
          description: `Services by ${participatingBrands.join(" & ")}`,
          ...(typeof normalizedDueAt === "number"
            ? { due_date: Math.floor(normalizedDueAt / 1000) }
            : {}),
        },
        context,
      );

      const normalizedLineItems = await replaceStripeInvoiceItems(
        ctx,
        stripe,
        invoice.stripeInvoiceId,
        stripeCustomerId,
        args.lineItems,
        context,
        args.invoiceId,
      );

      await ctx.runMutation(internal.invoiceActions.updateInvoiceRecord, {
        orgId,
        invoiceId: args.invoiceId,
        primaryBrand,
        participatingBrands,
        totalCents,
        notes: args.notes,
        dueAt: normalizedDueAt,
      });

      await ctx.runMutation(internal.invoiceActions.replaceLineItemRecords, {
        orgId,
        invoiceId: args.invoiceId,
        lineItems: normalizedLineItems,
      });

      console.log(`✅ Updated draft invoice ${invoice.invoiceNumber}`);

      return {
        success: true,
        invoiceId: args.invoiceId,
        stripeInvoiceId: invoice.stripeInvoiceId,
        invoiceNumber: invoice.invoiceNumber,
        status: "draft",
        totalCents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to update draft invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Revise a finalized invoice by creating a draft revision (Stripe rules enforced)
 */
export const reviseInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    stripeInvoiceId?: string;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (!invoice.stripeInvoiceId) {
        return { success: false, error: "Invoice has no Stripe ID" };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(invoice.primaryBrand as StripeBrand);

      const stripeInvoice = await stripe.invoices.retrieve(
        invoice.stripeInvoiceId,
        { expand: ["payment_intent"] },
        context,
      );

      const status = stripeInvoice.status;

      if (status === "draft") {
        return { success: false, error: "Invoice is already a draft" };
      }

      if (status === "paid" || status === "void") {
        return {
          success: false,
          error: "Paid or void invoices can’t be revised. Use credit notes or a new invoice.",
        };
      }

      const billingReason = stripeInvoice.billing_reason ?? "";
      if (
        stripeInvoice.subscription ||
        stripeInvoice.subscription_details ||
        billingReason.startsWith("subscription")
      ) {
        return {
          success: false,
          error:
            "Subscription invoices can’t be revised. Update the subscription for future invoices.",
        };
      }

      const creditNotesTotal =
        (stripeInvoice.pre_payment_credit_notes_amount ?? 0) +
        (stripeInvoice.post_payment_credit_notes_amount ?? 0);

      if (creditNotesTotal > 0) {
        return {
          success: false,
          error: "Invoices with credit notes can’t be revised.",
        };
      }

      const paymentIntent = stripeInvoice.payment_intent;
      if (
        paymentIntent &&
        typeof paymentIntent !== "string" &&
        paymentIntent.status === "processing"
      ) {
        return {
          success: false,
          error: "Invoices with a processing PaymentIntent can’t be revised.",
        };
      }

      if (status !== "open" && status !== "uncollectible") {
        return {
          success: false,
          error: "Only open or uncollectible invoices can be revised.",
        };
      }

      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        orgId,
        clientId: invoice.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      const stripeCustomerId = await ensureStripeCustomer(
        ctx,
        stripe,
        client,
        context,
        orgId
      );

      const brands = new Set<string>();
      let totalCents = 0;

      for (const item of args.lineItems) {
        brands.add(item.brand);
        const effectivePrice = item.customPriceCents ?? item.unitPriceCents;
        totalCents += effectivePrice * item.quantity;
      }

      const participatingBrands = [...brands];
      const primaryBrand =
        brands.size === 1 ? participatingBrands[0] : PARENT_ORGANIZATION;

      if (isOrganizationKey() && primaryBrand !== invoice.primaryBrand) {
        return {
          success: false,
          error:
            "Revisions can’t change the Stripe account context. Create a new invoice to change brands.",
        };
      }

      const revision = await stripe.invoices.create(
        {
          from_invoice: {
            action: "revision",
            invoice: stripeInvoice.id,
          },
        },
        context,
      );

      const invoiceNumber = generateInvoiceNumber();
      const revisionIssueAtMs = Date.now();
      const revisionDueAtMs = normalizeDueAt(args.dueAt, revisionIssueAtMs);

      const revisionInvoiceId = await ctx.runMutation(
        internal.invoiceActions.createInvoiceRecord,
        {
          orgId,
          invoiceNumber,
          primaryBrand,
          participatingBrands,
          clientId: invoice.clientId,
          stripeInvoiceId: revision.id,
          revisesInvoiceId: invoice._id,
          revisesStripeInvoiceId: stripeInvoice.id,
          status: "draft",
          totalCents,
          notes: args.notes,
          createdAt: revisionIssueAtMs,
          billingPeriodEnd: revisionDueAtMs,
        },
      );

      await stripe.invoices.update(
        revision.id,
        {
          metadata: {
            agency: PARENT_ORGANIZATION,
            primaryBrand,
            participatingBrands: JSON.stringify(participatingBrands),
            convexInvoiceId: revisionInvoiceId,
            invoiceNumber,
            revisesStripeInvoiceId: stripeInvoice.id,
          },
          description: `Services by ${participatingBrands.join(" & ")}`,
          due_date: Math.floor(revisionDueAtMs / 1000),
        },
        context,
      );

      const normalizedLineItems = await replaceStripeInvoiceItems(
        ctx,
        stripe,
        revision.id,
        stripeCustomerId,
        args.lineItems,
        context,
        revisionInvoiceId,
      );

      await ctx.runMutation(internal.invoiceActions.replaceLineItemRecords, {
        orgId,
        invoiceId: revisionInvoiceId,
        lineItems: normalizedLineItems,
      });

      console.log(`✅ Created revision for invoice ${invoice.invoiceNumber}`);

      return {
        success: true,
        invoiceId: revisionInvoiceId,
        stripeInvoiceId: revision.id,
        invoiceNumber,
        status: "draft",
        totalCents,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to revise invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Send a draft invoice
 */
export const sendDraftInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    checkoutSessionId?: string;
    checkoutUrl?: string;
    emailSent?: boolean;
    emailSkipped?: string;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      // Get the invoice from Convex
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status !== "draft") {
        return { success: false, error: "Invoice is not a draft" };
      }

      // Checkout Session flow: no Stripe Invoice object needed.
      if (!invoice.stripeInvoiceId) {
        if (!args.successUrl || !args.cancelUrl) {
          return {
            success: false,
            error: "successUrl and cancelUrl are required for Checkout Session flow",
          };
        }

        const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
          orgId,
          clientId: invoice.clientId,
        });

        if (!client) {
          return { success: false, error: "Client not found" };
        }

        const lineItems = await ctx.runQuery(
          internal.invoiceActions.getInvoiceLineItemsByInvoiceId,
          { orgId, invoiceId: args.invoiceId },
        );

        if (lineItems.length === 0) {
          return { success: false, error: "Invoice has no line items" };
        }

        const { totalCents } = calculateInvoiceTotals(lineItems);
        if (totalCents <= 0) {
          return { success: false, error: "Invoice total must be greater than 0" };
        }

        const stripe = getStripeClient();

        const checkoutSession = await createCheckoutSessionForInvoiceRecord(
          stripe,
          {
            _id: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            participatingBrands: invoice.participatingBrands,
          },
          {
            email: client.email,
            name: client.name,
            company: client.company,
          },
          totalCents,
          args.successUrl,
          args.cancelUrl,
        );

        await ctx.runMutation(internal.invoiceActions.updateInvoiceCheckoutSession, {
          orgId,
          invoiceId: args.invoiceId,
          stripeCheckoutSessionId: checkoutSession.id,
          status: "open",
        });

        if (invoice.revisesInvoiceId) {
          const revisedInvoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
            orgId,
            invoiceId: invoice.revisesInvoiceId,
          });

          if (revisedInvoice?.stripeCheckoutSessionId) {
            const context = getStripeContext(PARENT_ORGANIZATION as StripeBrand);

            try {
              const previousCheckoutSession = await stripe.checkout.sessions.retrieve(
                revisedInvoice.stripeCheckoutSessionId,
                {},
                context,
              );

              if (previousCheckoutSession.status === "open") {
                await stripe.checkout.sessions.expire(
                  revisedInvoice.stripeCheckoutSessionId,
                  {},
                  context,
                );
              }
            } catch (checkoutError) {
              const message =
                checkoutError instanceof Error ? checkoutError.message : "Unknown error";
              console.warn(
                `⚠️ Unable to expire replaced invoice checkout session ${revisedInvoice.stripeCheckoutSessionId}: ${message}`,
              );
            }
          }

          await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
            orgId,
            invoiceId: invoice.revisesInvoiceId,
            status: "void",
          });
        }

        let emailSent = false;
        let emailSkipped: string | undefined;
        const dueAt = resolveStoredInvoiceDueAt(invoice);
        try {
          const emailResult = await sendInvoiceEmailWithResend({
            invoiceNumber: invoice.invoiceNumber,
            participatingBrands: invoice.participatingBrands,
            client: {
              email: client.email,
              name: client.name,
              company: client.company,
            },
            notes: invoice.notes,
            lineItems,
            issueAt: invoice.createdAt,
            dueAt,
            checkoutUrl: checkoutSession.url ?? undefined,
            pdfDownloadUrl: buildInvoicePdfDownloadUrl(invoice._id, checkoutSession.id),
          });

          emailSent = emailResult.sent;
          if (!emailResult.sent && "skipped" in emailResult) {
            emailSkipped = emailResult.skipped;
          }
        } catch (emailError) {
          const emailMessage =
            emailError instanceof Error ? emailError.message : "Unknown error";
          emailSkipped = `send_failed:${emailMessage}`;
          console.error(
            `❌ Failed to send invoice email for ${invoice.invoiceNumber}:`,
            emailMessage
          );
        }

        return {
          success: true,
          checkoutSessionId: checkoutSession.id,
          checkoutUrl: checkoutSession.url ?? undefined,
          emailSent,
          emailSkipped,
        };
      }

      // Get the single Stripe client
      const stripe = getStripeClient();

      // Get context for Organization API keys (required for sk_org_* keys)
      const context = getStripeContext(invoice.primaryBrand as StripeBrand);

      // Finalize and send in Stripe
      await stripe.invoices.finalizeInvoice(invoice.stripeInvoiceId, context);
      await stripe.invoices.sendInvoice(invoice.stripeInvoiceId, context);

      // Update status in Convex
      await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
        orgId,
        invoiceId: args.invoiceId,
        status: "open",
      });

      if (invoice.revisesInvoiceId) {
        await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
          orgId,
          invoiceId: invoice.revisesInvoiceId,
          status: "void",
        });
      }

      console.log(`✅ Sent invoice ${invoice.invoiceNumber}`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to send invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Mark an invoice as paid manually.
 * For Stripe invoices, this records out-of-band payment in Stripe first.
 */
export const markInvoiceAsPaid = action({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    status?: "paid";
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status === "paid") {
        return { success: true, status: "paid" };
      }

      if (invoice.status === "void") {
        return { success: false, error: "Void invoices can’t be marked as paid." };
      }

      const lineItems = await ctx.runQuery(
        internal.invoiceActions.getInvoiceLineItemsByInvoiceId,
        {
          orgId,
          invoiceId: args.invoiceId,
        },
      );

      if (lineItems.length === 0) {
        return { success: false, error: "Invoice has no line items" };
      }

      let stripePaymentIntentId = `manual:${args.invoiceId}:${Date.now()}`;

      if (invoice.stripeInvoiceId) {
        const stripe = getStripeClient();
        const context = getStripeContext(invoice.primaryBrand as StripeBrand);

        let stripeInvoice = await stripe.invoices.retrieve(
          invoice.stripeInvoiceId,
          {
            expand: ["payment_intent"],
          },
          context,
        );

        if (stripeInvoice.status === "void") {
          return { success: false, error: "Void invoices can’t be marked as paid." };
        }

        if (stripeInvoice.status === "draft") {
          stripeInvoice = await stripe.invoices.finalizeInvoice(
            invoice.stripeInvoiceId,
            {
              expand: ["payment_intent"],
            },
            context,
          );
        }

        if (stripeInvoice.status !== "paid") {
          stripeInvoice = await stripe.invoices.pay(
            invoice.stripeInvoiceId,
            {
              paid_out_of_band: true,
              expand: ["payment_intent"],
            },
            context,
          );
        }

        const paymentIntent = stripeInvoice.payment_intent;
        const resolvedPaymentIntentId =
          typeof paymentIntent === "string"
            ? paymentIntent
            : paymentIntent &&
                typeof paymentIntent === "object" &&
                "id" in paymentIntent
              ? paymentIntent.id
              : undefined;

        if (resolvedPaymentIntentId) {
          stripePaymentIntentId = resolvedPaymentIntentId;
        }
      }

      await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
        orgId,
        invoiceId: args.invoiceId,
        status: "paid",
        paidAt: Date.now(),
      });

      await ctx.runMutation(internal.webhooks.processPaidInvoiceLedgerAttribution, {
        invoiceId: args.invoiceId,
        settlementSource: "manual",
        settlementId: invoice.stripeInvoiceId ?? args.invoiceId,
        stripePaymentIntentId,
      });

      return {
        success: true,
        status: "paid",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to mark invoice as paid:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Delete a draft one-time invoice.
 */
export const deleteInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status !== "draft") {
        return {
          success: false,
          error: "Only draft invoices can be deleted. Sent invoices should be voided instead.",
        };
      }

      if (
        invoice.sourceType === "subscription" ||
        !!invoice.subscriptionId ||
        !!invoice.stripeSubscriptionId
      ) {
        return {
          success: false,
          error: "Subscription invoices can’t be deleted from here.",
        };
      }

      if (invoice.stripeInvoiceId) {
        const stripe = getStripeClient();
        const context = getStripeContext(invoice.primaryBrand as StripeBrand);

        const stripeInvoice = await stripe.invoices.retrieve(
          invoice.stripeInvoiceId,
          {},
          context,
        );

        if (stripeInvoice.status && stripeInvoice.status !== "draft") {
          return {
            success: false,
            error: "Only draft Stripe invoices can be deleted.",
          };
        }

        await stripe.invoices.del(invoice.stripeInvoiceId, context);
      }

      await ctx.runMutation(internal.invoiceActions.deleteInvoiceCascade, {
        orgId,
        invoiceId: args.invoiceId,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to delete invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Cancel the current subscription billing cycle by deleting a draft subscription invoice in Stripe
 * and marking the local invoice record as void for audit history.
 */
export const cancelSubscriptionInvoiceCycle = action({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    status?: "void";
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      const isSubscriptionInvoice =
        invoice.sourceType === "subscription" ||
        !!invoice.subscriptionId ||
        !!invoice.stripeSubscriptionId ||
        invoice.invoiceNumber.startsWith("INV-SUB-");

      if (!isSubscriptionInvoice) {
        return {
          success: false,
          error: "Only subscription invoices support cycle cancellation.",
        };
      }

      if (invoice.status === "paid") {
        return { success: false, error: "Paid invoices can’t be cancelled." };
      }

      if (invoice.status === "void") {
        return { success: true, status: "void" };
      }

      if (invoice.status !== "draft") {
        return {
          success: false,
          error: "Only draft subscription invoices can be cancelled.",
        };
      }

      if (!invoice.stripeInvoiceId) {
        return {
          success: false,
          error: "Draft subscription invoice is missing Stripe invoice ID.",
        };
      }

      const stripe = getStripeClient();
      const context = getStripeContext(invoice.primaryBrand as StripeBrand);
      const stripeInvoice = await stripe.invoices.retrieve(
        invoice.stripeInvoiceId,
        {},
        context,
      );
      const mappedStripeStatus = mapStripeInvoiceStatus(stripeInvoice.status);
      const paidAt =
        mappedStripeStatus === "paid"
          ? toMillis(stripeInvoice.status_transitions?.paid_at) ?? Date.now()
          : undefined;

      if (mappedStripeStatus !== invoice.status) {
        await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
          orgId,
          invoiceId: args.invoiceId,
          status: mappedStripeStatus,
          paidAt,
        });
      }

      if (stripeInvoice.status === "paid") {
        return {
          success: false,
          error:
            "Stripe shows this invoice as paid, so it can’t be cancelled. Local status has been synced.",
        };
      }

      if (stripeInvoice.status === "void") {
        await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
          orgId,
          invoiceId: args.invoiceId,
          status: "void",
        });
        return { success: true, status: "void" };
      }

      if (stripeInvoice.status !== "draft") {
        return {
          success: false,
          error: "Only draft Stripe invoices can be cancelled for this cycle. Use Void Invoice instead.",
        };
      }

      await stripe.invoices.del(invoice.stripeInvoiceId, context);

      await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
        orgId,
        invoiceId: args.invoiceId,
        status: "void",
      });

      return { success: true, status: "void" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to cancel subscription invoice cycle:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Void an open/uncollectible invoice.
 * For Checkout Session invoices, this expires the session before voiding locally.
 */
export const voidInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    status?: "void";
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status === "paid") {
        return { success: false, error: "Paid invoices can’t be voided." };
      }

      if (invoice.status === "void") {
        return { success: true, status: "void" };
      }

      if (invoice.status !== "open" && invoice.status !== "uncollectible") {
        return {
          success: false,
          error: "Only open or uncollectible invoices can be voided.",
        };
      }

      const stripe = getStripeClient();

      if (invoice.stripeInvoiceId) {
        const context = getStripeContext(invoice.primaryBrand as StripeBrand);
        const stripeInvoice = await stripe.invoices.retrieve(
          invoice.stripeInvoiceId,
          {},
          context,
        );

        if (stripeInvoice.status === "paid") {
          return { success: false, error: "Paid invoices can’t be voided." };
        }

        if (stripeInvoice.status !== "void") {
          await stripe.invoices.voidInvoice(invoice.stripeInvoiceId, context);
        }
      } else if (invoice.stripeCheckoutSessionId) {
        const context = getStripeContext(PARENT_ORGANIZATION as StripeBrand);

        try {
          const checkoutSession = await stripe.checkout.sessions.retrieve(
            invoice.stripeCheckoutSessionId,
            {},
            context,
          );

          if (checkoutSession.status === "open") {
            await stripe.checkout.sessions.expire(
              invoice.stripeCheckoutSessionId,
              {},
              context,
            );
          }
        } catch (checkoutError) {
          const message =
            checkoutError instanceof Error ? checkoutError.message : "Unknown error";
          console.warn(
            `⚠️ Unable to expire checkout session ${invoice.stripeCheckoutSessionId}: ${message}`,
          );
        }
      }

      await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
        orgId,
        invoiceId: args.invoiceId,
        status: "void",
      });

      return { success: true, status: "void" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to void invoice:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Create a direct PaymentIntent for an existing invoice.
 * Ledger-only phase: collect funds to platform and attribute earnings internally later.
 */
export const createInvoicePaymentIntent = action({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    paymentIntentId?: string;
    clientSecret?: string;
    amountCents?: number;
    currency?: string;
    error?: string;
  }> => withOrg(ctx, async (orgId) => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        orgId,
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status === "paid" || invoice.status === "void") {
        return {
          success: false,
          error: "Only draft/open/uncollectible invoices can be paid",
        };
      }

      const lineItems = await ctx.runQuery(
        internal.invoiceActions.getInvoiceLineItemsByInvoiceId,
        {
          orgId,
          invoiceId: args.invoiceId,
        },
      );

      if (lineItems.length === 0) {
        return { success: false, error: "Invoice has no line items" };
      }

      // Mixed-safe total: sum every line item regardless of brand.
      // Single-brand invoices naturally collapse to one brand's total.
      const totalCents = lineItems.reduce((sum, item) => {
        const effectiveUnitPrice = item.customPriceCents ?? item.unitPriceCents;
        return sum + effectiveUnitPrice * item.quantity;
      }, 0);

      if (totalCents <= 0) {
        return { success: false, error: "Invoice total must be greater than 0" };
      }

      const participatingBrands = [
        ...new Set(lineItems.map((item) => item.brand)),
      ];
      const statementDescriptorSuffix =
        resolveStatementDescriptorSuffix(participatingBrands);

      const stripe = getStripeClient();
      const context = getStripeContext(PARENT_ORGANIZATION as StripeBrand);

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: totalCents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          // Hybrid model: org-level charge with brand-specific descriptor context.
          statement_descriptor_suffix: statementDescriptorSuffix,
          metadata: {
            // Keep metadata minimal for ledger-only attribution.
            invoiceId: args.invoiceId,
          },
        },
        context,
      );

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret ?? undefined,
        amountCents: totalCents,
        currency: paymentIntent.currency,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to create PaymentIntent:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }),
});

/**
 * Internal query to get invoice by ID
 */
export const getInvoiceById = internalQuery({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    return invoice?.orgId === args.orgId ? invoice : null;
  },
});

/**
 * Internal query to fetch all line items for one invoice.
 */
export const getInvoiceLineItemsByInvoiceId = internalQuery({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", args.orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();
  },
});

/**
 * Internal query for public invoice PDF downloads.
 * Access is token-gated by the Stripe Checkout Session ID stored on the invoice.
 */
export const getInvoiceForPdfDownload = internalQuery({
  args: {
    invoiceId: v.id("invoices"),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    if (!invoice.stripeCheckoutSessionId) return null;
    if (invoice.stripeCheckoutSessionId !== args.accessToken) return null;

    const client = await ctx.db.get(invoice.clientId);
    if (!client || client.orgId !== invoice.orgId) return null;

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", invoice.orgId).eq("invoiceId", invoice._id)
      )
      .collect();

    return {
      invoice,
      client,
      lineItems,
    };
  },
});

/**
 * Internal mutation to update invoice status
 */
export const updateInvoiceStatus = internalMutation({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
    paidAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureOrgAccess(await ctx.db.get(args.invoiceId), args.orgId, "Invoice not found");
    const updates: {
      status: "draft" | "open" | "paid" | "void" | "uncollectible";
      paidAt?: number;
    } = { status: args.status };

    if (typeof args.paidAt === "number") {
      updates.paidAt = args.paidAt;
    }

    await ctx.db.patch(args.invoiceId, updates);
  },
});

/**
 * Internal mutation to delete an invoice and all its line items.
 */
export const deleteInvoiceCascade = internalMutation({
  args: {
    orgId: v.string(),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const invoice = ensureOrgAccess(
      await ctx.db.get(args.invoiceId),
      args.orgId,
      "Invoice not found",
    );

    const ledgerEntries = await ctx.db
      .query("brandLedger")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", args.orgId).eq("invoiceId", args.invoiceId),
      )
      .collect();

    if (ledgerEntries.length > 0) {
      throw new Error("Invoice has settled ledger entries and can't be deleted.");
    }

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", args.orgId).eq("invoiceId", args.invoiceId),
      )
      .collect();

    for (const lineItem of lineItems) {
      await ctx.db.delete(lineItem._id);
    }

    await ctx.db.delete(invoice._id);
  },
});

/**
 * Amount owed for a brand from the internal ledger.
 */
export const getBrandBalance = query({
  args: {
    brand: brandUnion,
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const ledgerEntries = await ctx.db
      .query("brandLedger")
      .withIndex("by_org_brand", (q) => q.eq("orgId", orgId).eq("brand", args.brand))
      .collect();

    let pendingCents = 0;
    let creditedCents = 0;
    let withdrawableCents = 0;

    for (const entry of ledgerEntries) {
      if (entry.status === "pending") {
        pendingCents += entry.amountCents;
        continue;
      }

      if (entry.status === "credited") {
        creditedCents += entry.amountCents;
        continue;
      }

      if (entry.status === "withdrawable") {
        withdrawableCents += entry.amountCents;
      }
    }

    return {
      brand: args.brand,
      pendingCents,
      creditedCents,
      withdrawableCents,
      amountOwedCents: pendingCents + creditedCents + withdrawableCents,
    };
  }),
});

/**
 * Monthly settlement report grouped by brand.
 * Amounts are in cents for precision.
 */
export const getMonthlyBrandSummary = query({
  args: {
    month: v.number(), // 1-12
    year: v.number(), // e.g. 2026
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    if (!Number.isInteger(args.month) || args.month < 1 || args.month > 12) {
      throw new Error("month must be an integer between 1 and 12");
    }

    if (!Number.isInteger(args.year) || args.year < 2000) {
      throw new Error("year must be a valid 4-digit year");
    }

    const periodStart = Date.UTC(args.year, args.month - 1, 1);
    const periodEnd = Date.UTC(args.year, args.month, 1);

    const ledgerEntries = await ctx.db
      .query("brandLedger")
      .withIndex("by_org_created_at", (q) =>
        q.eq("orgId", orgId).gte("createdAt", periodStart).lt("createdAt", periodEnd)
      )
      .collect();

    const byBrand: Record<
      string,
      {
        totalGross: number;
        totalFees: number;
        totalNetOwed: number;
        entryCount: number;
      }
    > = {};

    let totalGross = 0;
    let totalFees = 0;
    let totalNetOwed = 0;

    for (const entry of ledgerEntries) {
      const gross = entry.amountCents + entry.platformFeeCents;

      if (!byBrand[entry.brand]) {
        byBrand[entry.brand] = {
          totalGross: 0,
          totalFees: 0,
          totalNetOwed: 0,
          entryCount: 0,
        };
      }

      byBrand[entry.brand].totalGross += gross;
      byBrand[entry.brand].totalFees += entry.platformFeeCents;
      byBrand[entry.brand].totalNetOwed += entry.amountCents;
      byBrand[entry.brand].entryCount += 1;

      totalGross += gross;
      totalFees += entry.platformFeeCents;
      totalNetOwed += entry.amountCents;
    }

    return {
      month: args.month,
      year: args.year,
      periodStart,
      periodEnd,
      totals: {
        totalGross,
        totalFees,
        totalNetOwed,
      },
      byBrand,
      entryCount: ledgerEntries.length,
    };
  }),
});

/**
 * Repair legacy brandLedger rows that are missing orgId by deriving orgId from the linked invoice.
 * Run this after deploying the optional brandLedger.orgId schema update.
 */
export const backfillBrandLedgerOrgIds = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const limit = Math.min(Math.max(args.limit ?? 2000, 1), 5000);
    const ledgerEntries = await ctx.db
      .query("brandLedger")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);

    let patchedCount = 0;
    let alreadyCorrectCount = 0;
    let skippedOtherOrgCount = 0;
    let missingInvoiceCount = 0;

    for (const entry of ledgerEntries) {
      const invoice = await ctx.db.get(entry.invoiceId);

      if (!invoice) {
        missingInvoiceCount += 1;
        continue;
      }

      if (invoice.orgId !== orgId) {
        skippedOtherOrgCount += 1;
        continue;
      }

      if (entry.orgId === orgId) {
        alreadyCorrectCount += 1;
        continue;
      }

      await ctx.db.patch(entry._id, { orgId });
      patchedCount += 1;
    }

    return {
      success: true,
      scannedCount: ledgerEntries.length,
      patchedCount,
      alreadyCorrectCount,
      skippedOtherOrgCount,
      missingInvoiceCount,
    };
  }),
});

/**
 * Repair one specific brandLedger row by copying orgId from its linked invoice.
 */
export const repairBrandLedgerEntryOrgId = mutation({
  args: {
    ledgerEntryId: v.id("brandLedger"),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const entry = await ctx.db.get(args.ledgerEntryId);
    if (!entry) {
      throw new Error("Ledger entry not found");
    }

    const invoice = ensureOrgAccess(
      await ctx.db.get(entry.invoiceId),
      orgId,
      "Linked invoice not found"
    );

    if (entry.orgId === orgId) {
      return {
        success: true,
        patched: false,
        ledgerEntryId: args.ledgerEntryId,
      };
    }

    await ctx.db.patch(args.ledgerEntryId, { orgId: invoice.orgId });

    return {
      success: true,
      patched: true,
      ledgerEntryId: args.ledgerEntryId,
    };
  }),
});

/**
 * Mark specific credited ledger entries as paid out after manual bank transfer.
 */
export const processManualPayout = mutation({
  args: {
    brand: brandUnion,
    ledgerEntryIds: v.array(v.id("brandLedger")),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    if (args.ledgerEntryIds.length === 0) {
      return {
        success: false,
        error: "No ledger entries provided",
        updatedCount: 0,
      };
    }

    let updatedCount = 0;
    const skipped: Array<{
      ledgerEntryId: Id<"brandLedger">;
      reason: string;
    }> = [];

    for (const ledgerEntryId of args.ledgerEntryIds) {
      const entry = await ctx.db.get(ledgerEntryId);

      if (!entry) {
        skipped.push({
          ledgerEntryId,
          reason: "not_found",
        });
        continue;
      }

      let entryOrgId = entry.orgId;
      if (entryOrgId !== orgId && !entryOrgId) {
        const linkedInvoice = await ctx.db.get(entry.invoiceId);
        if (linkedInvoice?.orgId === orgId) {
          await ctx.db.patch(ledgerEntryId, { orgId });
          entryOrgId = orgId;
        }
      }

      if (entryOrgId !== orgId) {
        skipped.push({
          ledgerEntryId,
          reason: "org_mismatch",
        });
        continue;
      }

      if (entry.brand !== args.brand) {
        skipped.push({
          ledgerEntryId,
          reason: "brand_mismatch",
        });
        continue;
      }

      if (entry.status !== "credited") {
        skipped.push({
          ledgerEntryId,
          reason: `invalid_status:${entry.status}`,
        });
        continue;
      }

      await ctx.db.patch(ledgerEntryId, {
        status: "paid_out",
      });

      updatedCount += 1;
    }

    return {
      success: true,
      brand: args.brand,
      requestedCount: args.ledgerEntryIds.length,
      updatedCount,
      skippedCount: skipped.length,
      skipped,
    };
  }),
});

/**
 * Public query to list subscriptions.
 */
export const listSubscriptions = query({
  args: {
    status: v.optional(subscriptionStatusValidator),
    clientId: v.optional(v.id("clients")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const limit = args.limit ?? 100;

    if (args.clientId) {
      ensureOrgAccess(await ctx.db.get(args.clientId), orgId, "Client not found");
      const byClient = await ctx.db
        .query("subscriptions")
        .withIndex("by_org_client", (q) =>
          q.eq("orgId", orgId).eq("clientId", args.clientId!)
        )
        .order("desc")
        .take(limit);

      return args.status
        ? byClient.filter((subscription) => subscription.status === args.status)
        : byClient;
    }

    const subscriptions = args.status
      ? await ctx.db
          .query("subscriptions")
          .withIndex("by_org_status", (q) =>
            q.eq("orgId", orgId).eq("status", args.status!)
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("subscriptions")
          .withIndex("by_org", (q) => q.eq("orgId", orgId))
          .order("desc")
          .take(limit);

    return subscriptions;
  }),
});

/**
 * Public query to fetch one subscription with its invoices and client.
 */
export const getSubscriptionWithInvoices = query({
  args: {
    subscriptionId: v.id("subscriptions"),
    invoiceLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const subscription = ensureOrgAccess(
      await ctx.db.get(args.subscriptionId),
      orgId,
      "Subscription not found",
    );

    const invoiceLimit = args.invoiceLimit ?? 100;
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_org_subscription", (q) =>
        q.eq("orgId", orgId).eq("subscriptionId", args.subscriptionId)
      )
      .order("desc")
      .take(invoiceLimit);

    const client = await ctx.db.get(subscription.clientId);
    const scopedClient = client?.orgId === orgId ? client : null;

    return {
      ...subscription,
      client: scopedClient,
      invoices,
    };
  }),
});

/**
 * Public query to list invoices
 */
export const listInvoices = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("open"),
        v.literal("paid"),
        v.literal("void"),
        v.literal("uncollectible")
      )
    ),
    brand: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const limit = args.limit ?? 50;
    const invoices = args.status
      ? await ctx.db
          .query("invoices")
          .withIndex("by_org_status", (q) =>
            q.eq("orgId", orgId).eq("status", args.status!)
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("invoices")
          .withIndex("by_org", (q) => q.eq("orgId", orgId))
          .order("desc")
          .take(limit);

    // Filter by brand if specified
    if (args.brand) {
      return invoices.filter((inv) =>
        inv.participatingBrands.includes(args.brand!)
      );
    }

    return invoices;
  }),
});

/**
 * Public query to list invoices for a specific client with line-item previews.
 */
export const listInvoicesForClientWithItems = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    ensureOrgAccess(await ctx.db.get(args.clientId), orgId, "Client not found");

    const limit = args.limit ?? 100;
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_org_client", (q) =>
        q.eq("orgId", orgId).eq("clientId", args.clientId)
      )
      .order("desc")
      .take(limit);

    return await Promise.all(
      invoices.map(async (invoice) => {
        const lineItems = await ctx.db
          .query("invoiceLineItems")
          .withIndex("by_org_invoice", (q) =>
            q.eq("orgId", orgId).eq("invoiceId", invoice._id)
          )
          .collect();

        return {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          totalCents: invoice.totalCents,
          createdAt: invoice.createdAt,
          lineItems: lineItems.map((item) => ({
            _id: item._id,
            name: item.name,
            quantity: item.quantity,
            unitPriceCents: item.customPriceCents ?? item.unitPriceCents,
          })),
        };
      })
    );
  }),
});

/**
 * Public query to get invoice with line items
 */
export const getInvoiceWithLineItems = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.orgId !== orgId) return null;

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org_invoice", (q) =>
        q.eq("orgId", orgId).eq("invoiceId", args.invoiceId)
      )
      .collect();

    const client = await ctx.db.get(invoice.clientId);
    const scopedClient = client?.orgId === orgId ? client : null;

    return {
      ...invoice,
      lineItems,
      client: scopedClient,
    };
  }),
});

/**
 * Get invoice revenue breakdown by brand
 */
export const getRevenueByBrand = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("open"),
        v.literal("paid"),
        v.literal("void"),
        v.literal("uncollectible")
      )
    ),
    timeRange: v.optional(
      v.union(
        v.literal("this_month"),
        v.literal("last_month"),
        v.literal("this_quarter"),
        v.literal("all_time")
      )
    ),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const getRangeWindow = (timeRange: "this_month" | "last_month" | "this_quarter") => {
      const now = new Date();

      if (timeRange === "this_month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        return { start, end: now.getTime() };
      }

      if (timeRange === "last_month") {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        return { start, end };
      }

      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStartMonth, 1).getTime();
      return { start, end: now.getTime() };
    };

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    const filteredByStatus = args.status
      ? invoices.filter((inv) => inv.status === args.status)
      : invoices;

    const rangeWindow =
      args.timeRange && args.timeRange !== "all_time"
        ? getRangeWindow(args.timeRange)
        : null;

    const filteredInvoices =
      rangeWindow
        ? filteredByStatus.filter((invoice) => {
            const { start, end } = rangeWindow;
            return invoice.createdAt >= start && invoice.createdAt < end;
          })
        : filteredByStatus;

    const invoiceIds = new Set(filteredInvoices.map((invoice) => invoice._id));

    const brandRevenueCents: Record<string, number> = {
      Sankofa: 0,
      Lighthouse: 0,
      Centex: 0,
      "GFAM Media Studios": 0,
    };

    if (invoiceIds.size === 0) {
      return {
        totalRevenueCents: 0,
        brands: Object.entries(brandRevenueCents).map(([brand, revenueCents]) => ({
          brand,
          revenueCents,
        })),
      };
    }

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    for (const item of lineItems) {
      if (!invoiceIds.has(item.invoiceId)) {
        continue;
      }

      const amount = (item.customPriceCents ?? item.unitPriceCents) * item.quantity;
      brandRevenueCents[item.brand] = (brandRevenueCents[item.brand] ?? 0) + amount;
    }

    const brands = Object.entries(brandRevenueCents).map(([brand, revenueCents]) => ({
      brand,
      revenueCents,
    }));
    const totalRevenueCents = brands.reduce((sum, brand) => sum + brand.revenueCents, 0);

    return {
      totalRevenueCents,
      brands,
    };
  }),
});

/**
 * Backfill orgId for invoices, invoiceLineItems, and services.
 * Assigns the caller's active org to all documents that are missing orgId.
 */
export const backfillAllOrgIds = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => withOrg(ctx, async (orgId) => {
    const limit = Math.min(Math.max(args.limit ?? 2000, 1), 5000);
    return await backfillOrgIdsImpl(ctx, orgId, limit, false);
  }),
});

/**
 * CLI-safe version of backfillAllOrgIds. Pass orgId explicitly.
 * Usage: bunx convex run invoiceActions:backfillAllOrgIdsCli '{"orgId":"org_xxx"}'
 */
export const backfillAllOrgIdsCli = internalMutation({
  args: {
    orgId: v.string(),
    force: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 2000, 1), 5000);
    return await backfillOrgIdsImpl(ctx, args.orgId, limit, args.force ?? false);
  },
});

async function backfillOrgIdsImpl(
  ctx: { db: any },
  orgId: string,
  limit: number,
  force: boolean,
) {
  const tables = ["invoices", "invoiceLineItems", "services", "clients", "brandLedger"] as const;
  const results: Record<string, { scanned: number; patched: number; alreadyCorrect: number }> = {};

  for (const table of tables) {
    const docs = await ctx.db.query(table).take(limit);
    let patched = 0;
    let alreadyCorrect = 0;

    for (const doc of docs) {
      const d = doc as { _id: any; orgId?: string };
      if (d.orgId === orgId) {
        alreadyCorrect += 1;
        continue;
      }
      if (!d.orgId || force) {
        await ctx.db.patch(d._id, { orgId });
        patched += 1;
      }
    }

    results[table] = { scanned: docs.length, patched, alreadyCorrect };
  }

  return { success: true, orgId, results };
}

/**
 * Repointable org-scoped tables.
 */
const repointableTables = [
  "services",
  "invoices",
  "invoiceLineItems",
  "brandLedger",
  "clients",
  "orgBranding",
] as const;

const repointableTableValidator = v.union(
  v.literal("services"),
  v.literal("invoices"),
  v.literal("invoiceLineItems"),
  v.literal("brandLedger"),
  v.literal("clients"),
  v.literal("orgBranding"),
);

type RepointableTable = (typeof repointableTables)[number];

/**
 * One page of orgId repointing for a single table.
 */
export const repointAllDataToOrgPageCli = internalMutation({
  args: {
    orgId: v.string(),
    table: repointableTableValidator,
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.min(Math.max(args.pageSize ?? 256, 1), 1000);
    const page = await ctx.db
      .query(args.table)
      .paginate({ cursor: args.cursor ?? null, numItems: pageSize });

    let patched = 0;
    let alreadyCorrect = 0;

    for (const doc of page.page as Array<{ _id: any; orgId?: string }>) {
      if (doc.orgId === args.orgId) {
        alreadyCorrect += 1;
        continue;
      }

      await ctx.db.patch(doc._id, { orgId: args.orgId });
      patched += 1;
    }

    return {
      table: args.table,
      scanned: page.page.length,
      patched,
      alreadyCorrect,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Reassign every org-scoped document in the database to a single Clerk orgId.
 * CLI usage:
 * bunx convex run invoiceActions:repointAllDataToOrgCli '{"orgId":"org_xxx"}'
 */
export const repointAllDataToOrgCli = internalAction({
  args: {
    orgId: v.string(),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.min(Math.max(args.pageSize ?? 256, 1), 1000);
    const results: Record<
      string,
      {
        scanned: number;
        patched: number;
        alreadyCorrect: number;
      }
    > = {};

    for (const table of repointableTables) {
      let cursor: string | undefined = undefined;
      let scanned = 0;
      let patched = 0;
      let alreadyCorrect = 0;

      while (true) {
        const pageResult: {
          scanned: number;
          patched: number;
          alreadyCorrect: number;
          continueCursor?: string;
          isDone: boolean;
        } = await ctx.runMutation(
          (internal as any).invoiceActions.repointAllDataToOrgPageCli,
          {
            orgId: args.orgId,
            table: table as RepointableTable,
            pageSize,
            cursor,
          },
        );

        scanned += pageResult.scanned;
        patched += pageResult.patched;
        alreadyCorrect += pageResult.alreadyCorrect;

        if (pageResult.isDone) {
          break;
        }

        cursor = pageResult.continueCursor;
      }

      results[table] = { scanned, patched, alreadyCorrect };
    }

    return {
      success: true,
      orgId: args.orgId,
      pageSize,
      results,
    };
  },
});
