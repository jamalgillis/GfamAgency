import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { getWebhookSecret, PARENT_ORGANIZATION } from "./lib/stripe";
import { buildInvoicePdfDocument } from "./lib/invoicePdf";

const http = httpRouter();

function safePdfFileName(invoiceNumber: string): string {
  return `Invoice-${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
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

    const dueDate = new Date(data.invoice.createdAt);
    dueDate.setDate(dueDate.getDate() + 30);

    const pdf = buildInvoicePdfDocument({
      invoiceNumber: data.invoice.invoiceNumber,
      status: data.invoice.status,
      issueDate: data.invoice.createdAt,
      dueDate: dueDate.getTime(),
      participatingBrands: data.invoice.participatingBrands,
      client: {
        name: data.client.name,
        company: data.client.company,
        email: data.client.email,
      },
      notes: data.invoice.notes,
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
 * Single webhook endpoint for GFAM Agency Stripe account
 * All brands use metadata for tracking, but payments flow through one account
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
      `[${brand}] Invoice ${invoice.id} paid but missing payment_intent; skipping brandLedger attribution`
    );
    return;
  }

  await ctx.runMutation(internal.webhooks.processPaidInvoiceLedgerAttribution, {
    invoiceId: convexInvoiceId as any,
    settlementSource: "invoice.paid",
    settlementId: invoice.id,
    stripePaymentIntentId,
  });

  if (stripeSubscriptionId) {
    await ctx.runMutation(internal.invoiceActions.resetSubscriptionDunningFailureState, {
      stripeSubscriptionId,
    });
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

  await ctx.runMutation(internal.webhooks.processPaidInvoiceLedgerAttribution, {
    invoiceId: invoiceId as any,
    settlementSource,
    settlementId: session.id,
    stripePaymentIntentId,
  });
}

export default http;
