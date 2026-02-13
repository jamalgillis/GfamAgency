import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { getWebhookSecret, PARENT_ORGANIZATION } from "./lib/stripe";

const http = httpRouter();

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

/**
 * Handle invoice.paid event
 */
async function handleInvoicePaid(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = invoice.metadata?.convexInvoiceId;
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;

  if (!convexInvoiceId) {
    console.log(`[${brand}] Invoice ${invoice.id} has no convexInvoiceId metadata`);
    return;
  }

  console.log(`[${brand}] Invoice ${invoice.id} paid - updating Convex record`);

  await ctx.runMutation(internal.webhooks.updateInvoiceFromWebhook, {
    convexInvoiceId,
    status: "paid",
    stripeInvoiceId: invoice.id,
    paidAt: invoice.status_transitions?.paid_at
      ? invoice.status_transitions.paid_at * 1000
      : Date.now(),
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
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = invoice.metadata?.convexInvoiceId;
  const brand = invoice.metadata?.primaryBrand ?? PARENT_ORGANIZATION;

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
}

/**
 * Handle invoice.voided event
 */
async function handleInvoiceVoided(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = invoice.metadata?.convexInvoiceId;
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
  const convexInvoiceId = invoice.metadata?.convexInvoiceId;
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
  const convexInvoiceId = invoice.metadata?.convexInvoiceId;
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
  });
}

/**
 * Handle invoice.sent event
 */
async function handleInvoiceSent(ctx: any, invoice: Stripe.Invoice) {
  const convexInvoiceId = invoice.metadata?.convexInvoiceId;
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
