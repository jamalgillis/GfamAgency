import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Resend } from "resend";
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
  context: any,
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
        metadata: {
          invoiceId: invoice._id,
        },
      },
    },
    context,
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

async function ensureStripeCustomer(
  ctx: any,
  stripe: any,
  client: any,
  context: any,
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
}): string {
  const lineItemRows = params.lineItems
    .map((item) => {
      const rateCents = item.customPriceCents ?? item.unitPriceCents;
      const amountCents = rateCents * item.quantity;
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">
            <div style="font-weight:600;color:#111827;">${escapeHtml(item.name)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(
              item.description || ""
            )}</div>
            <div style="display:inline-block;margin-top:6px;padding:3px 8px;border-radius:999px;background:#f3f4f6;font-size:11px;color:#374151;">${escapeHtml(
              item.brand
            )}</div>
          </td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrencyFromCents(
            rateCents
          )}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrencyFromCents(
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

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
        <div style="padding:24px 24px 10px 24px;border-bottom:1px solid #e5e7eb;">
          <h1 style="margin:0;font-size:28px;color:#111827;">${escapeHtml(params.displayBrand)}</h1>
          <p style="margin:6px 0 0 0;color:#6b7280;font-size:13px;">Invoice ${escapeHtml(
            params.invoiceNumber
          )}</p>
        </div>

        <div style="padding:22px 24px;">
          <div style="display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;">
            <div>
              <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Bill To</div>
              <div style="margin-top:6px;font-weight:600;color:#111827;">${escapeHtml(
                params.clientCompany
              )}</div>
              <div style="color:#4b5563;">${escapeHtml(params.clientName)}</div>
              <div style="color:#4b5563;">${escapeHtml(params.clientEmail)}</div>
            </div>
            <div>
              <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Details</div>
              <div style="margin-top:6px;color:#4b5563;">Issue Date: ${escapeHtml(
                params.issueDate
              )}</div>
              <div style="color:#4b5563;">Due Date: ${escapeHtml(params.dueDate)}</div>
              <div style="color:#4b5563;">Payment Terms: Net 30</div>
            </div>
          </div>

          <div style="margin-top:18px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;">
            <a href="${escapeHtml(
              params.checkoutUrl
            )}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Pay Invoice</a>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-top:18px;">
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

          <div style="margin-top:16px;display:flex;justify-content:flex-end;">
            <div style="min-width:240px;">
              <div style="display:flex;justify-content:space-between;padding:6px 0;color:#4b5563;">
                <span>Subtotal</span>
                <span>${formatCurrencyFromCents(params.subtotalCents)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:18px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;">
                <span>Total</span>
                <span>${formatCurrencyFromCents(params.totalCents)}</span>
              </div>
            </div>
          </div>

          <div style="margin-top:18px;">
            <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Notes</div>
            <div style="margin-top:6px;color:#374151;font-size:14px;">${escapeHtml(
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
        </div>

        <div style="padding:18px 24px;border-top:1px solid #e5e7eb;background:#fafafa;text-align:center;">
          <div style="font-size:14px;color:#111827;">Thank you for your business Sankfoa Marketing Group</div>
        </div>
      </div>
    </div>
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
  checkoutUrl?: string;
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

  const issueDateRaw = new Date();
  const dueDateRaw = new Date(issueDateRaw);
  dueDateRaw.setDate(dueDateRaw.getDate() + 30);

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
    issueDate: formatDateValue(issueDateRaw),
    dueDate: formatDateValue(dueDateRaw),
    lineItems: params.lineItems,
    subtotalCents,
    totalCents: subtotalCents,
    checkoutUrl: params.checkoutUrl,
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
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientId);
  },
});

/**
 * Internal mutation to update client's Stripe customer ID
 * Single Stripe account means single customer ID per client
 */
export const updateClientStripeId = internalMutation({
  args: {
    clientId: v.id("clients"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.clientId, {
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

/**
 * Internal mutation to create invoice record in Convex
 */
export const createInvoiceRecord = internalMutation({
  args: {
    invoiceNumber: v.string(),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    clientId: v.id("clients"),
    stripeInvoiceId: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    revisesInvoiceId: v.optional(v.id("invoices")),
    revisesStripeInvoiceId: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
    totalCents: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("invoices", {
      invoiceNumber: args.invoiceNumber,
      primaryBrand: args.primaryBrand,
      participatingBrands: args.participatingBrands,
      clientId: args.clientId,
      stripeInvoiceId: args.stripeInvoiceId,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      revisesInvoiceId: args.revisesInvoiceId,
      revisesStripeInvoiceId: args.revisesStripeInvoiceId,
      status: args.status,
      totalCents: args.totalCents,
      notes: args.notes,
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal mutation to update invoice with Stripe ID
 */
export const updateInvoiceStripeId = internalMutation({
  args: {
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
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
  },
  handler: async (ctx, args) => {
    const ids: Id<"invoiceLineItems">[] = [];
    for (const item of args.lineItems) {
      const id = await ctx.db.insert("invoiceLineItems", {
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
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    for (const item of existing) {
      await ctx.db.delete(item._id);
    }

    const ids: Id<"invoiceLineItems">[] = [];
    for (const item of args.lineItems) {
      const id = await ctx.db.insert("invoiceLineItems", {
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
    invoiceId: v.id("invoices"),
    primaryBrand: v.string(),
    participatingBrands: v.array(v.string()),
    totalCents: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, {
      primaryBrand: args.primaryBrand,
      participatingBrands: args.participatingBrands,
      totalCents: args.totalCents,
      notes: args.notes,
    });
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
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => {
    try {
      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
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
        invoiceNumber,
        primaryBrand,
        participatingBrands,
        clientId: args.clientId,
        status: "draft",
        totalCents,
        notes: args.notes,
      });

      await ctx.runMutation(internal.invoiceActions.createLineItemRecords, {
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
  },
});

/**
 * Update a local draft invoice in Convex only (no Stripe Invoice object).
 */
export const updateLedgerDraftInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
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
        invoiceId: args.invoiceId,
        primaryBrand,
        participatingBrands,
        totalCents,
        notes: args.notes,
      });

      await ctx.runMutation(internal.invoiceActions.replaceLineItemRecords, {
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
  },
});

/**
 * Create a local draft revision for an existing invoice (no Stripe Invoice object).
 */
export const reviseLedgerInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
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
          invoiceNumber,
          primaryBrand,
          participatingBrands,
          clientId: invoice.clientId,
          status: "draft",
          totalCents,
          notes: args.notes,
          revisesInvoiceId: invoice._id,
          revisesStripeInvoiceId: invoice.stripeInvoiceId,
        },
      );

      await ctx.runMutation(internal.invoiceActions.createLineItemRecords, {
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
  }> => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
        invoiceId: args.invoiceId,
      });

      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status === "paid" || invoice.status === "void") {
        return { success: false, error: "Only draft/open/uncollectible invoices can be sent" };
      }

      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
        clientId: invoice.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      const lineItems = await ctx.runQuery(
        internal.invoiceActions.getInvoiceLineItemsByInvoiceId,
        {
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
      const context = getStripeContext(PARENT_ORGANIZATION as StripeBrand);

      const checkoutSession = await createCheckoutSessionForInvoiceRecord(
        stripe,
        context,
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
        invoiceId: args.invoiceId,
        stripeCheckoutSessionId: checkoutSession.id,
        status: "open",
      });

      if (invoice.revisesInvoiceId) {
        await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
          invoiceId: invoice.revisesInvoiceId,
          status: "void",
        });
      }

      let emailSent = false;
      let emailSkipped: string | undefined;
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
          checkoutUrl: checkoutSession.url ?? undefined,
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
  },
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
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    stripeInvoiceId?: string;
    invoiceNumber?: string;
    status?: "draft" | "open";
    totalCents?: number;
    error?: string;
  }> => {
    try {
      // 1. Get client info
      const client = await ctx.runQuery(internal.invoiceActions.getClientById, {
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
      const stripeCustomerId = await ensureStripeCustomer(ctx, stripe, client, context);

      // 6. Generate invoice number
      const invoiceNumber = generateInvoiceNumber();

      // 7. Create Convex invoice record first (as draft)
      const invoiceId = await ctx.runMutation(
        internal.invoiceActions.createInvoiceRecord,
        {
          invoiceNumber,
          primaryBrand,
          participatingBrands,
          clientId: args.clientId,
          status: "draft",
          totalCents,
          notes: args.notes,
        }
      );

      // 8. Create Stripe invoice with brand metadata
      const stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        collection_method: "send_invoice",
        days_until_due: 30,
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
  },
});

/**
 * Update an existing draft invoice (Stripe + Convex)
 */
export const updateDraftInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    stripeInvoiceId?: string;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
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
      const stripeCustomerId = await ensureStripeCustomer(ctx, stripe, client, context);

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
        invoiceId: args.invoiceId,
        primaryBrand,
        participatingBrands,
        totalCents,
        notes: args.notes,
      });

      await ctx.runMutation(internal.invoiceActions.replaceLineItemRecords, {
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
  },
});

/**
 * Revise a finalized invoice by creating a draft revision (Stripe rules enforced)
 */
export const reviseInvoice = action({
  args: {
    invoiceId: v.id("invoices"),
    lineItems: v.array(lineItemValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    invoiceId?: Id<"invoices">;
    stripeInvoiceId?: string;
    invoiceNumber?: string;
    status?: "draft";
    totalCents?: number;
    error?: string;
  }> => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
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
        clientId: invoice.clientId,
      });

      if (!client) {
        return { success: false, error: "Client not found" };
      }

      const stripeCustomerId = await ensureStripeCustomer(ctx, stripe, client, context);

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

      const revisionInvoiceId = await ctx.runMutation(
        internal.invoiceActions.createInvoiceRecord,
        {
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
  },
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
  }> => {
    try {
      // Get the invoice from Convex
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
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
          clientId: invoice.clientId,
        });

        if (!client) {
          return { success: false, error: "Client not found" };
        }

        const lineItems = await ctx.runQuery(
          internal.invoiceActions.getInvoiceLineItemsByInvoiceId,
          { invoiceId: args.invoiceId },
        );

        if (lineItems.length === 0) {
          return { success: false, error: "Invoice has no line items" };
        }

        const { totalCents } = calculateInvoiceTotals(lineItems);
        if (totalCents <= 0) {
          return { success: false, error: "Invoice total must be greater than 0" };
        }

        const stripe = getStripeClient();
        const context = getStripeContext(PARENT_ORGANIZATION as StripeBrand);

        const checkoutSession = await createCheckoutSessionForInvoiceRecord(
          stripe,
          context,
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
          invoiceId: args.invoiceId,
          stripeCheckoutSessionId: checkoutSession.id,
          status: "open",
        });

        if (invoice.revisesInvoiceId) {
          await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
            invoiceId: invoice.revisesInvoiceId,
            status: "void",
          });
        }

        let emailSent = false;
        let emailSkipped: string | undefined;
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
            checkoutUrl: checkoutSession.url ?? undefined,
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
        invoiceId: args.invoiceId,
        status: "open",
      });

      if (invoice.revisesInvoiceId) {
        await ctx.runMutation(internal.invoiceActions.updateInvoiceStatus, {
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
  },
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
  }> => {
    try {
      const invoice = await ctx.runQuery(internal.invoiceActions.getInvoiceById, {
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
  },
});

/**
 * Internal query to get invoice by ID
 */
export const getInvoiceById = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.invoiceId);
  },
});

/**
 * Internal query to fetch all line items for one invoice.
 */
export const getInvoiceLineItemsByInvoiceId = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();
  },
});

/**
 * Internal mutation to update invoice status
 */
export const updateInvoiceStatus = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("void"),
      v.literal("uncollectible")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, { status: args.status });
  },
});

/**
 * Amount owed for a brand from the internal ledger.
 */
export const getBrandBalance = query({
  args: {
    brand: brandUnion,
  },
  handler: async (ctx, args) => {
    const ledgerEntries = await ctx.db
      .query("brandLedger")
      .withIndex("by_brand", (q) => q.eq("brand", args.brand))
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
  },
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
  handler: async (ctx, args) => {
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
      .withIndex("by_created_at", (q) =>
        q.gte("createdAt", periodStart).lt("createdAt", periodEnd)
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
  },
});

/**
 * Mark specific credited ledger entries as paid out after manual bank transfer.
 */
export const processManualPayout = mutation({
  args: {
    brand: brandUnion,
    ledgerEntryIds: v.array(v.id("brandLedger")),
  },
  handler: async (ctx, args) => {
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
  },
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
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const invoices = args.status
      ? await ctx.db
          .query("invoices")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db.query("invoices").order("desc").take(limit);

    // Filter by brand if specified
    if (args.brand) {
      return invoices.filter((inv) =>
        inv.participatingBrands.includes(args.brand!)
      );
    }

    return invoices;
  },
});

/**
 * Public query to get invoice with line items
 */
export const getInvoiceWithLineItems = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const client = await ctx.db.get(invoice.clientId);

    return {
      ...invoice,
      lineItems,
      client,
    };
  },
});

/**
 * Get invoice revenue breakdown by brand
 */
export const getRevenueByBrand = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoices = await ctx.db.query("invoices").collect();

    // Filter by status if provided
    const filteredInvoices = args.status
      ? invoices.filter((inv) => inv.status === args.status)
      : invoices;

    // Get all line items for these invoices
    const revenueByBrand: Record<string, number> = {};

    for (const invoice of filteredInvoices) {
      const lineItems = await ctx.db
        .query("invoiceLineItems")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
        .collect();

      for (const item of lineItems) {
        const amount =
          (item.customPriceCents ?? item.unitPriceCents) * item.quantity;
        revenueByBrand[item.brand] = (revenueByBrand[item.brand] ?? 0) + amount;
      }
    }

    return revenueByBrand;
  },
});
