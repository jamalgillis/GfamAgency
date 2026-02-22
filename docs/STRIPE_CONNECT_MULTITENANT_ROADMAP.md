# Stripe Connect Multitenant Roadmap (Future)

This document captures the planned migration path for supporting multi-tenant Stripe accounts later.

## Current State (Now)

- App runs in single-account Stripe mode (`STRIPE_SECRET_KEY=sk_test_*` / `sk_live_*`).
- Charges are collected on one Stripe account.
- Convex `brandLedger` tracks brand allocations and platform fees.
- Split payouts are disabled by default (ledger still records what should be transferred).

## Target State (Later)

- Use **Stripe Connect** (recommended: **Connect Standard**) for tenant-owned Stripe accounts.
- Keep one platform Stripe secret key in backend (`sk_*`).
- Each tenant/org connects their own Stripe account (`acct_...`).
- Stripe API calls route per tenant using Connect request context (`stripeAccount` / `Stripe-Account`).
- Convex ledger remains the internal source of truth for brand allocation and fee reporting.

## Why Connect (Not `sk_org_*`)

- `sk_org_*` keys are for operating within a Stripe Organization and require `Stripe-Context` on every call.
- Connect is the standard SaaS/platform model for tenants bringing their own Stripe accounts.
- Connect reduces auth-routing mistakes and scales better for tenant onboarding.

## Core Schema Changes

1. Add an org Stripe connection table (one row per Clerk org connection).
   - Fields: `orgId`, `stripeAccountId`, `status`, `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`, `livemode`, `connectedAt`.
2. Add webhook event dedupe table.
   - Fields: `stripeEventId`, `stripeAccountId`, `type`, `processedAt`.
3. Add `stripeAccountId` to invoices and subscriptions (or equivalent account-scoped linkage).
4. Replace single-account Stripe IDs with per-account mappings.
   - Customer mapping table: local client -> Stripe customer per connected account.
   - Service catalog mapping table: local service -> Stripe product/price per connected account.

## Backend Changes

1. Add a Stripe account resolver helper for org-scoped Stripe calls.
   - Example: `getStripeRequestOptionsForOrg(orgId)` returns `{ stripeAccount: "acct_..." }`.
2. Update Stripe calls in:
   - `convex/invoiceActions.ts`
   - `convex/stripeSync.ts`
   - `convex/http.ts`
3. Continue using Convex ledger logic for brand fee/allocation tracking regardless of Stripe charge path.

## Connect Standard Onboarding Flow

1. User clicks `Connect Stripe` in Settings.
2. Backend creates OAuth state and returns Stripe Connect authorization URL.
3. User completes Stripe onboarding/login in Stripe.
4. OAuth callback stores `acct_...` for the current Clerk org.
5. Mark connection ready only when `charges_enabled` and `details_submitted` are true.

## Checkout / Invoice Flow (Connect Version)

1. Resolve tenant connected account from active `orgId`.
2. Create Checkout Session or Stripe Invoice using platform key + Connect account context (`stripeAccount`).
3. Keep invoice metadata (`invoiceId`, `orgId`) for webhook reconciliation.
4. Keep Convex ledger attribution and platform fee math unchanged.
5. Optional later: enable actual transfers/payout automation (or keep ledger-only mode).

## Webhook Requirements (Critical)

1. Configure webhook endpoint to receive Connect events.
2. Read `event.account` to identify the connected Stripe account.
3. Map `event.account` back to local `orgId`.
4. Deduplicate events using `(event.id, event.account)`.
5. Process invoice/payment/subscription updates in the correct org context.

## Design Decision To Make Before Implementation

1. One connected Stripe account per tenant org (recommended first version).
   - Simplest and most reliable.
   - Mixed-brand invoices remain internal brand labels within one tenant account.
2. Multiple connected accounts per tenant (harder).
   - Requires a charge-routing strategy and more complex payout logic.
   - One checkout flow cannot natively split charges across multiple connected accounts.

## Suggested Migration Phases

1. Add Connect schema tables/fields while keeping current single-account mode.
2. Implement Connect Standard onboarding + Settings UI.
3. Route Stripe calls through org -> `acct_...` resolver for a pilot org.
4. Update webhooks for Connect `event.account` + event dedupe.
5. Migrate customer/product/price IDs to per-account mappings.
6. Roll out tenant-by-tenant.
7. Revisit automated payouts/transfers later (optional).

## Notes For Future Work

- Keep `brandLedger` as the source of truth for internal allocation and reporting.
- Ledger-only mode should remain supported even if payout transfers are disabled.
- Prefer incremental rollout over full cutover to avoid webhook and ID-mapping regressions.
