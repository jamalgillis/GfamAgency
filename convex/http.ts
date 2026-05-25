import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import {
  getWebhookSecret,
  getStripeClient,
  getStripeContext,
  PARENT_ORGANIZATION,
  type StripeBrand,
} from "./lib/stripe";
import { buildInvoicePdfDocument } from "./lib/invoicePdf";

const http = httpRouter();

function safePdfFileName(invoiceNumber: string): string {
  return `Invoice-${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
}

function endOfDayTimestamp(timestampMs: number): number {
  const date = new Date(timestampMs);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isValidEmailAddress(value?: string): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function extractSenderEmail(fromAddress?: string): string | undefined {
  const trimmed = fromAddress?.trim();
  if (!trimmed) return undefined;

  const bracketMatch = trimmed.match(/<([^>]+)>/);
  const extracted = bracketMatch?.[1]?.trim() || trimmed;
  return isValidEmailAddress(extracted) ? extracted.toLowerCase() : undefined;
}

http.route({
  path: "/invoice-pdf",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const invoiceId = url.searchParams.get("invoiceId");
    const token = url.searchParams.get("token");

    if (!invoiceId || !token) {
      return new Response("Missing invoiceId or token", { status: 400 });
    }

    let data:
      | {
          invoice: {
            _id: string;
            invoiceNumber: string;
            status: string;
            participatingBrands: string[];
            createdAt: number;
            sourceType?: "one_time" | "subscription";
            subscriptionId?: string;
            stripeSubscriptionId?: string;
            stripeCheckoutSessionId?: string;
            billingPeriodEnd?: number;
            notes?: string;
          };
          client: {
            name: string;
            company: string;
            email: string;
          };
          lineItems: Array<{
            brand: string;
            category: string;
            name: string;
            description?: string;
            quantity: number;
            unitPriceCents: number;
            customPriceCents?: number;
            isCustomItem: boolean;
          }>;
          orgBranding?: {
            displayName: string;
            shortName?: string;
            emailMode?: "platform" | "org_sender";
            senderName?: string;
            senderEmail?: string;
            senderReplyTo?: string;
          } | null;
        }
      | null = null;

    try {
      data = await ctx.runQuery("invoiceActions:getInvoiceForPdfDownload" as any, {
        invoiceId,
        accessToken: token,
      });
    } catch {
      return new Response("Invalid invoice id", { status: 400 });
    }

    if (!data) {
      return new Response("Invoice not found", { status: 404 });
    }

    const isSubscriptionInvoice =
      data.invoice.sourceType === "subscription" ||
      !!data.invoice.subscriptionId ||
      !!data.invoice.stripeSubscriptionId;
    const orgDisplayName =
      data.orgBranding?.displayName?.trim() ||
      data.orgBranding?.shortName?.trim() ||
      "Agency";
    const orgShortName =
      data.orgBranding?.shortName?.trim() ||
      data.orgBranding?.displayName?.trim() ||
      orgDisplayName;
    const platformSenderEmail =
      extractSenderEmail(process.env.RESEND_FROM_EMAIL) || "billing@example.com";
    const orgSenderEmail = data.orgBranding?.senderEmail?.trim().toLowerCase();
    const useOrgSenderForPdf =
      data.orgBranding?.emailMode === "org_sender" && isValidEmailAddress(orgSenderEmail);
    const senderDisplayName = useOrgSenderForPdf
      ? data.orgBranding?.senderName?.trim() || orgDisplayName
      : orgDisplayName;
    const senderEmail = useOrgSenderForPdf && orgSenderEmail
      ? orgSenderEmail
      : platformSenderEmail;
    const senderAddress = [
      process.env.BILLING_ADDRESS_LINE1?.trim(),
      process.env.BILLING_ADDRESS_LINE2?.trim(),
      process.env.BILLING_ADDRESS_LINE3?.trim(),
    ].filter((line): line is string => !!line);
    const dueAt =
      !isSubscriptionInvoice &&
      typeof data.invoice.billingPeriodEnd === "number" &&
      Number.isFinite(data.invoice.billingPeriodEnd)
        ? Math.max(data.invoice.billingPeriodEnd, data.invoice.createdAt)
        : isSubscriptionInvoice
          ? endOfDayTimestamp(data.invoice.createdAt + 30 * DAY_IN_MS)
          : endOfDayTimestamp(data.invoice.createdAt);

    let checkoutUrl: string | undefined;
    if (data.invoice.stripeCheckoutSessionId) {
      try {
        const stripe = getStripeClient();
        const context = getStripeContext(PARENT_ORGANIZATION as StripeBrand);
        const checkoutSession = await stripe.checkout.sessions.retrieve(
          data.invoice.stripeCheckoutSessionId,
          {},
          context,
        );
        checkoutUrl = checkoutSession.url ?? undefined;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.warn(
          `[invoice-pdf] Unable to load checkout session URL for ${data.invoice.invoiceNumber}: ${message}`,
        );
      }
    }

    const pdf = buildInvoicePdfDocument({
      invoiceNumber: data.invoice.invoiceNumber,
      status: data.invoice.status,
      issueDate: data.invoice.createdAt,
      dueDate: dueAt,
      participatingBrands: data.invoice.participatingBrands,
      client: {
        name: data.client.name,
        company: data.client.company,
        email: data.client.email,
      },
      sender: {
        displayName: senderDisplayName,
        shortName: orgShortName,
        email: senderEmail,
        addressLines: senderAddress,
      },
      notes: data.invoice.notes,
      checkoutUrl,
      lineItems: data.lineItems.map((item) => ({
        brand: item.brand,
        category: item.category,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        customPriceCents: item.customPriceCents,
        isCustomItem: item.isCustomItem,
      })),
    });
    const pdfBody = new Uint8Array(pdf.length);
    pdfBody.set(pdf);

    return new Response(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safePdfFileName(
          data.invoice.invoiceNumber
        )}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }),
});

/**
 * Single webhook endpoint for the configured Stripe account.
 * All brands use metadata for tracking, but payments flow through one account.
 */
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      console.error(`[${PARENT_ORGANIZATION}] Missing Stripe signature`);
      return new Response("Missing signature", { status: 400 });
    }

    let event: Stripe.Event;

    try {
      const webhookSecret = getWebhookSecret();
      event = await Stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[${PARENT_ORGANIZATION}] Webhook signature verification failed:`, message);
      return new Response(`Webhook Error: ${message}`, { status: 400 });
    }

    console.log(`[${PARENT_ORGANIZATION}] Received event: ${event.type}`);

    // Handle the event
    try {
      switch (event.type) {
        case "invoice.created":
          await handleInvoiceCreated(ctx, event.data.object as Stripe.Invoice);
          break;

        case "invoice.paid":
          await handleInvoicePaid(ctx, event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(ctx, event.data.object as Stripe.Invoice);
          break;

        case "invoice.voided":
          await handleInvoiceVoided(ctx, event.data.object as Stripe.Invoice);
          break;

        case "invoice.marked_uncollectible":
          await handleInvoiceUncollectible(ctx, event.data.object as Stripe.Invoice);
          break;

        case "invoice.finalized":
          await handleInvoiceFinalized(ctx, event.data.object as Stripe.Invoice);
          break;

        case "invoice.sent":
          await handleInvoiceSent(ctx, event.data.object as Stripe.Invoice);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(ctx, event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(ctx, event.data.object as Stripe.Subscription);
          break;

        case "payment_intent.succeeded":
          await handlePaymentIntentSucceeded(ctx, event.data.object as Stripe.PaymentIntent);
          break;

        case "checkout.session.completed":
          await handleCheckoutSessionSuccess(
            ctx,
            event.data.object as Stripe.Checkout.Session,
            "checkout.session.completed"
          );
          break;

        case "checkout.session.async_payment_succeeded":
          await handleCheckoutSessionSuccess(
            ctx,
            event.data.object as Stripe.Checkout.Session,
            "checkout.session.async_payment_succeeded"
          );
          break;

        default:
          console.log(`[${PARENT_ORGANIZATION}] Unhandled event type: ${event.type}`);
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[${PARENT_ORGANIZATION}] Error processing webhook:`, message);
      return new Response(`Processing Error: ${message}`, { status: 500 });
    }
  }),
});

function toMillis(timestampSeconds?: number | null): number | undefined {
  if (!timestampSeconds || timestampSeconds <= 0) {
    return undefined;
  }
  return timestampSeconds * 1000;
}

function mapStripeSubscriptionStatus(
  status: string | null | undefined
):
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid" {
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

function getStripeSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice,
): string | undefined {
  return typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription && typeof invoice.subscription === "object" && "id" in invoice.subscription
      ? invoice.subscription.id
      : undefined;
}

async function resolveConvexInvoiceIdForWebhook(
  ctx: any,
  invoice: Stripe.Invoice,
): Promise<string | undefined> {
  const stripeSubscriptionId = getStripeSubscriptionIdFromInvoice(invoice);

  if (stripeSubscriptionId) {
    const syncResult = await ctx.runAction(
      internal.invoiceActions.syncSubscriptionInvoiceFromStripe,
      {
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId,
      },
    );

    if (syncResult.success && syncResult.invoiceId) {
      return syncResult.invoiceId;
    }
  }

  return invoice.metadata?.convexInvoiceId;
}

/**
 * Handle invoice.created event.
 * Subscription invoices are synced into local invoice records immediately.
 */
async function handleInvoiceCreated(ctx: any, invoice: Stripe.Invoice) {
  if (!invoice.subscription) {
    return;
  }

  const syncedInvoiceId = await resolveConvexInvoiceIdForWebhook(ctx, invoice);
  if (!syncedInvoiceId) {
    console.log(
      `[${PARENT_ORGANIZATION}] Subscription invoice ${invoice.id} is not tracked locally`
    );
    return;
  }

  console.log(
    `[${PARENT_ORGANIZATION}] Synced subscription invoice ${invoice.id} -> ${syncedInvoiceId}`
  );
}

/**
 * Handle invoice.paid event
 */
async function handleInvoicePaid(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = await resolveConvexInvoiceIdForWebhook(ctx, invoice);
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;
  const stripeSubscriptionId = getStripeSubscriptionIdFromInvoice(invoice);

  if (!convexInvoiceId) {
    console.log(`[${brand}] Invoice ${invoice.id} has no convexInvoiceId metadata`);
    return;
  }

  console.log(`[${brand}] Invoice ${invoice.id} paid - updating Convex record`);

  await ctx.runMutation(internal.webhooks.updateInvoiceFromWebhook, {
    convexInvoiceId,
    status: "paid",
    stripeInvoiceId: invoice.id,
    paidAt: toMillis(invoice.status_transitions?.paid_at) ?? Date.now(),
  });

  const paymentIntent = invoice.payment_intent;
  const stripePaymentIntentId =
    typeof paymentIntent === "string"
      ? paymentIntent
      : paymentIntent && typeof paymentIntent === "object" && "id" in paymentIntent
        ? paymentIntent.id
        : undefined;

  if (!stripePaymentIntentId) {
    console.warn(
      `[${brand}] Invoice ${invoice.id} paid but missing payment_intent; using invoice fallback for attribution`
    );
  }

  await ctx.runAction("webhooks:processCheckoutSessionTransferPayout" as any, {
    invoiceId: convexInvoiceId as any,
    settlementSource: "invoice.paid",
    settlementId: invoice.id,
    stripePaymentIntentId: stripePaymentIntentId ?? `invoice:${invoice.id}`,
  });

  if (stripeSubscriptionId) {
    await ctx.runMutation(internal.invoiceActions.resetSubscriptionDunningFailureState, {
      stripeSubscriptionId,
    });

    await transitionSubscriptionToAutomaticCollection(ctx, {
      stripeSubscriptionId,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId,
      brand,
    });
  }
}

async function transitionSubscriptionToAutomaticCollection(
  ctx: any,
  params: {
    stripeSubscriptionId: string;
    stripeInvoiceId: string;
    stripePaymentIntentId?: string;
    brand: string;
  },
) {
  try {
    const localSubscription = await ctx.runQuery(
      internal.invoiceActions.getSubscriptionByStripeId,
      {
        stripeSubscriptionId: params.stripeSubscriptionId,
      },
    );

    if (!localSubscription) {
      return;
    }

    const stripe = getStripeClient();
    const context = getStripeContext(localSubscription.primaryBrand as StripeBrand);
    const stripeSubscription = await stripe.subscriptions.retrieve(
      params.stripeSubscriptionId,
      {},
      context,
    );

    if (stripeSubscription.collection_method !== "send_invoice") {
      return;
    }

    let paymentMethodId =
      typeof stripeSubscription.default_payment_method === "string"
        ? stripeSubscription.default_payment_method
        : stripeSubscription.default_payment_method &&
            typeof stripeSubscription.default_payment_method === "object" &&
            "id" in stripeSubscription.default_payment_method
          ? stripeSubscription.default_payment_method.id
          : undefined;

    if (!paymentMethodId && params.stripePaymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        params.stripePaymentIntentId,
        { expand: ["payment_method"] },
        context,
      );
      paymentMethodId =
        typeof paymentIntent.payment_method === "string"
          ? paymentIntent.payment_method
          : paymentIntent.payment_method?.id;
    }

    if (!paymentMethodId) {
      console.log(
        `[${params.brand}] Subscription ${params.stripeSubscriptionId} remains send_invoice after ${params.stripeInvoiceId}: no reusable payment method found`
      );
      return;
    }

    const stripeCustomerId =
      typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : stripeSubscription.customer?.id ?? localSubscription.stripeCustomerId;

    await stripe.customers.update(
      stripeCustomerId,
      {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      },
      context,
    );

    await stripe.subscriptions.update(
      params.stripeSubscriptionId,
      {
        collection_method: "charge_automatically",
        default_payment_method: paymentMethodId,
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
      },
      context,
    );

    const syncResult = await ctx.runAction(internal.invoiceActions.syncSubscriptionFromStripe, {
      stripeSubscriptionId: params.stripeSubscriptionId,
    });

    if (!syncResult.success && syncResult.skipped !== "subscription_not_tracked") {
      console.warn(
        `[${params.brand}] Subscription ${params.stripeSubscriptionId} switched to charge_automatically, but local sync failed: ${syncResult.error ?? "unknown error"}`
      );
      return;
    }

    console.log(
      `[${params.brand}] Subscription ${params.stripeSubscriptionId} switched to charge_automatically after paid invoice ${params.stripeInvoiceId}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(
      `[${params.brand}] Failed to transition subscription ${params.stripeSubscriptionId} to charge_automatically: ${message}`
    );
  }
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = await resolveConvexInvoiceIdForWebhook(ctx, invoice);
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;
  const stripeSubscriptionId = getStripeSubscriptionIdFromInvoice(invoice);

  if (!convexInvoiceId) {
    console.log(`[${brand}] Invoice ${invoice.id} has no convexInvoiceId metadata`);
    return;
  }

  console.log(`[${brand}] Invoice ${invoice.id} payment failed`);

  await ctx.runMutation(internal.webhooks.recordPaymentFailure, {
    convexInvoiceId,
    stripeInvoiceId: invoice.id,
    failureMessage: invoice.last_finalization_error?.message || "Payment failed",
  });

  if (stripeSubscriptionId) {
    const dunningResult = await ctx.runAction(
      internal.invoiceActions.applySubscriptionDunningPolicyFromPaymentFailure,
      {
        stripeSubscriptionId,
        stripeInvoiceId: invoice.id,
      },
    );

    if (!dunningResult.success) {
      console.warn(
        `[${brand}] Failed to apply dunning policy for ${stripeSubscriptionId}: ${dunningResult.error ?? "unknown error"}`
      );
    }
  }
}

/**
 * Handle invoice.voided event
 */
async function handleInvoiceVoided(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = await resolveConvexInvoiceIdForWebhook(ctx, invoice);
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;

  if (!convexInvoiceId) {
    console.log(`[${brand}] Invoice ${invoice.id} has no convexInvoiceId metadata`);
    return;
  }

  console.log(`[${brand}] Invoice ${invoice.id} voided`);

  await ctx.runMutation(internal.webhooks.updateInvoiceFromWebhook, {
    convexInvoiceId,
    status: "void",
    stripeInvoiceId: invoice.id,
  });
}

/**
 * Handle invoice.marked_uncollectible event
 */
async function handleInvoiceUncollectible(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = await resolveConvexInvoiceIdForWebhook(ctx, invoice);
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;

  if (!convexInvoiceId) {
    console.log(`[${brand}] Invoice ${invoice.id} has no convexInvoiceId metadata`);
    return;
  }

  console.log(`[${brand}] Invoice ${invoice.id} marked uncollectible`);

  await ctx.runMutation(internal.webhooks.updateInvoiceFromWebhook, {
    convexInvoiceId,
    status: "uncollectible",
    stripeInvoiceId: invoice.id,
  });
}

/**
 * Handle invoice.finalized event
 */
async function handleInvoiceFinalized(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = await resolveConvexInvoiceIdForWebhook(ctx, invoice);
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;

  if (!convexInvoiceId) {
    console.log(`[${brand}] Invoice ${invoice.id} has no convexInvoiceId metadata`);
    return;
  }

  console.log(`[${brand}] Invoice ${invoice.id} finalized`);

  // Finalized invoices are "open" (ready to be paid)
  await ctx.runMutation(internal.webhooks.updateInvoiceFromWebhook, {
    convexInvoiceId,
    status: "open",
    stripeInvoiceId: invoice.id,
    sentAt: toMillis(invoice.status_transitions?.finalized_at),
  });
}

/**
 * Handle invoice.sent event
 */
async function handleInvoiceSent(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = await resolveConvexInvoiceIdForWebhook(ctx, invoice);
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;

  if (!convexInvoiceId) {
    console.log(`[${brand}] Invoice ${invoice.id} has no convexInvoiceId metadata`);
    return;
  }

  console.log(`[${brand}] Invoice ${invoice.id} sent to customer`);

  // Invoice sent - ensure it's marked as open
  await ctx.runMutation(internal.webhooks.updateInvoiceFromWebhook, {
    convexInvoiceId,
    status: "open",
    stripeInvoiceId: invoice.id,
    sentAt: Date.now(),
  });
}

/**
 * Handle customer.subscription.* create/update events.
 */
async function handleSubscriptionUpdated(ctx: any, subscription: Stripe.Subscription) {
  const syncResult = await ctx.runAction(internal.invoiceActions.syncSubscriptionFromStripe, {
    stripeSubscriptionId: subscription.id,
  });

  if (!syncResult.success && syncResult.skipped !== "subscription_not_tracked") {
    console.warn(
      `[${PARENT_ORGANIZATION}] Failed to sync subscription ${subscription.id}: ${syncResult.error ?? "unknown error"}`
    );
  }
}

/**
 * Handle customer.subscription.deleted events.
 */
async function handleSubscriptionDeleted(ctx: any, subscription: Stripe.Subscription) {
  const result = await ctx.runMutation(internal.invoiceActions.updateSubscriptionFromWebhook, {
    stripeSubscriptionId: subscription.id,
    status: mapStripeSubscriptionStatus(subscription.status),
    currentPeriodStart: toMillis(subscription.current_period_start),
    currentPeriodEnd: toMillis(subscription.current_period_end),
    cancelAt: toMillis(subscription.cancel_at),
    canceledAt: toMillis(subscription.canceled_at),
    endedAt: toMillis(subscription.ended_at),
  });

  if (!result.success) {
    console.log(
      `[${PARENT_ORGANIZATION}] Subscription ${subscription.id} delete webhook skipped (${result.error})`
    );
  }
}

/**
 * Handle payment_intent.succeeded for ledger-only attribution.
 */
async function handlePaymentIntentSucceeded(ctx: any, paymentIntent: Stripe.PaymentIntent) {
  const invoiceId = paymentIntent.metadata?.invoiceId;

  if (!invoiceId) {
    console.log(
      `[${PARENT_ORGANIZATION}] PaymentIntent ${paymentIntent.id} has no invoiceId metadata`
    );
    return;
  }

  console.log(
    `[${PARENT_ORGANIZATION}] PaymentIntent ${paymentIntent.id} succeeded for invoice ${invoiceId}`
  );

  await ctx.runMutation(internal.webhooks.processPaidInvoiceLedgerAttribution, {
    invoiceId: invoiceId as any,
    settlementSource: "payment_intent.succeeded",
    settlementId: paymentIntent.id,
    stripePaymentIntentId: paymentIntent.id,
  });
}

/**
 * Handle checkout.session.* success events as a fallback path for status updates.
 * Some integrations rely on Checkout events rather than payment_intent.succeeded.
 */
async function handleCheckoutSessionSuccess(
  ctx: any,
  session: Stripe.Checkout.Session,
  settlementSource:
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded"
) {
  const invoiceId = session.metadata?.invoiceId || session.client_reference_id;

  if (!invoiceId) {
    console.log(
      `[${PARENT_ORGANIZATION}] Checkout Session ${session.id} missing invoiceId/client_reference_id`
    );
    return;
  }

  if (session.payment_status !== "paid") {
    console.log(
      `[${PARENT_ORGANIZATION}] Checkout Session ${session.id} for invoice ${invoiceId} not paid yet (status=${session.payment_status})`
    );
    return;
  }

  const stripePaymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent && typeof session.payment_intent === "object" && "id" in session.payment_intent
        ? session.payment_intent.id
        : session.id;

  console.log(
    `[${PARENT_ORGANIZATION}] Checkout Session ${session.id} paid for invoice ${invoiceId}`
  );

  await ctx.runAction("webhooks:processCheckoutSessionTransferPayout" as any, {
    invoiceId: invoiceId as any,
    settlementSource,
    settlementId: session.id,
    stripePaymentIntentId,
  });
}

export default http;
