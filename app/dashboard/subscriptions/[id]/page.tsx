"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Save,
  XCircle,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandBadge, type BrandType } from "@/components/BrandBadge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

type DunningAction = "none" | "pause" | "cancel";
type ProrationBehavior = "always_invoice" | "create_prorations" | "none";

const knownBrands: BrandType[] = [
  "Sankofa",
  "Lighthouse",
  "Centex",
  "GFAM Media Studios",
];

const isBrandType = (brand: string): brand is BrandType =>
  knownBrands.includes(brand as BrandType);

const statusClassMap: Record<SubscriptionStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  trialing: "bg-sky-500/15 text-sky-300",
  past_due: "bg-amber-500/15 text-amber-300",
  paused: "bg-slate-500/15 text-slate-300",
  canceled: "bg-zinc-500/15 text-zinc-300",
  incomplete: "bg-orange-500/15 text-orange-300",
  incomplete_expired: "bg-red-500/15 text-red-300",
  unpaid: "bg-red-500/15 text-red-300",
};

const formatStatusLabel = (status: SubscriptionStatus) =>
  status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

const formatDate = (timestamp?: number) => {
  if (!timestamp) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
};

export default function SubscriptionDetailPage() {
  const params = useParams();
  const subscriptionIdParam = params.id;
  const subscriptionId = Array.isArray(subscriptionIdParam)
    ? subscriptionIdParam[0]
    : subscriptionIdParam;
  const isValidId = typeof subscriptionId === "string" && subscriptionId.length > 10;

  const subscription = useQuery(
    api.invoiceActions.getSubscriptionWithInvoices,
    isValidId
      ? {
          subscriptionId: subscriptionId as Id<"subscriptions">,
          invoiceLimit: 100,
        }
      : "skip",
  );
  const pauseSubscription = useAction(api.invoiceActions.pauseSubscription);
  const resumeSubscription = useAction(api.invoiceActions.resumeSubscription);
  const cancelSubscription = useAction(api.invoiceActions.cancelSubscription);
  const updateSubscriptionPlan = useAction(api.invoiceActions.updateSubscriptionPlan);
  const updateSubscriptionDunningPolicy = useAction(
    api.invoiceActions.updateSubscriptionDunningPolicy,
  );
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [planQuantities, setPlanQuantities] = useState<Record<string, number>>({});
  const [prorationBehavior, setProrationBehavior] =
    useState<ProrationBehavior>("create_prorations");
  const [dunningEnabled, setDunningEnabled] = useState(true);
  const [dunningMaxAttempts, setDunningMaxAttempts] = useState(3);
  const [dunningRetryIntervalDays, setDunningRetryIntervalDays] = useState(3);
  const [dunningAction, setDunningAction] = useState<DunningAction>("pause");

  const planTotalCents = useMemo(() => {
    if (!subscription) return 0;
    return subscription.items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );
  }, [subscription]);

  useEffect(() => {
    if (!subscription) return;

    const nextPlanQuantities: Record<string, number> = {};
    for (const item of subscription.items) {
      if (!item.stripePriceId) continue;
      nextPlanQuantities[item.stripePriceId] = item.quantity;
    }

    setPlanQuantities(nextPlanQuantities);
    setProrationBehavior("create_prorations");
    setDunningEnabled(subscription.dunningEnabled ?? true);
    setDunningMaxAttempts(subscription.dunningMaxAttempts ?? 3);
    setDunningRetryIntervalDays(subscription.dunningRetryIntervalDays ?? 3);
    setDunningAction((subscription.dunningAction as DunningAction | undefined) ?? "pause");
  }, [
    subscription?._id,
    subscription?.updatedAt,
    subscription?.dunningEnabled,
    subscription?.dunningMaxAttempts,
    subscription?.dunningRetryIntervalDays,
    subscription?.dunningAction,
  ]);

  const planUpdateItems = useMemo(() => {
    if (!subscription) return [];
    return subscription.items
      .filter((item) => !!item.stripePriceId)
      .map((item) => ({
        stripePriceId: item.stripePriceId as string,
        quantity: Math.max(
          1,
          Math.round(planQuantities[item.stripePriceId as string] ?? item.quantity),
        ),
      }));
  }, [planQuantities, subscription]);

  const hasPlanChanges = useMemo(() => {
    if (!subscription) return false;
    return subscription.items.some((item) => {
      if (!item.stripePriceId) return false;
      const nextQuantity = Math.max(
        1,
        Math.round(planQuantities[item.stripePriceId] ?? item.quantity),
      );
      return nextQuantity !== item.quantity;
    });
  }, [planQuantities, subscription]);

  const hasDunningChanges = useMemo(() => {
    if (!subscription) return false;
    return (
      dunningEnabled !== (subscription.dunningEnabled ?? true) ||
      dunningMaxAttempts !== (subscription.dunningMaxAttempts ?? 3) ||
      dunningRetryIntervalDays !== (subscription.dunningRetryIntervalDays ?? 3) ||
      dunningAction !== ((subscription.dunningAction as DunningAction | undefined) ?? "pause")
    );
  }, [
    dunningAction,
    dunningEnabled,
    dunningMaxAttempts,
    dunningRetryIntervalDays,
    subscription,
  ]);

  const status = subscription?.status as SubscriptionStatus | undefined;
  const isTerminalStatus =
    status === "canceled" || status === "incomplete_expired";
  const isPaused = status === "paused";
  const hasScheduledCancel = !!subscription?.cancelAt;

  const handlePause = async () => {
    if (!isValidId || !subscription || isMutating) return;

    setIsMutating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await pauseSubscription({
        subscriptionId: subscriptionId as Id<"subscriptions">,
      });

      if (!result.success) {
        setActionError(result.error || "Failed to pause subscription");
        return;
      }

      setActionSuccess("Subscription billing paused.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to pause subscription");
    } finally {
      setIsMutating(false);
    }
  };

  const handleResume = async () => {
    if (!isValidId || !subscription || isMutating) return;

    setIsMutating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await resumeSubscription({
        subscriptionId: subscriptionId as Id<"subscriptions">,
      });

      if (!result.success) {
        setActionError(result.error || "Failed to resume subscription");
        return;
      }

      setActionSuccess("Subscription billing resumed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to resume subscription");
    } finally {
      setIsMutating(false);
    }
  };

  const handleCancelNow = async () => {
    if (!isValidId || !subscription || isMutating) return;

    const confirmed = window.confirm(
      "Cancel this subscription now? This cannot be undone.",
    );
    if (!confirmed) return;

    setIsMutating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await cancelSubscription({
        subscriptionId: subscriptionId as Id<"subscriptions">,
        atPeriodEnd: false,
      });

      if (!result.success) {
        setActionError(result.error || "Failed to cancel subscription");
        return;
      }

      setActionSuccess("Subscription canceled.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to cancel subscription");
    } finally {
      setIsMutating(false);
    }
  };

  const handleCancelAtPeriodEnd = async () => {
    if (!isValidId || !subscription || isMutating) return;

    const confirmed = window.confirm(
      "Schedule cancellation at period end? You can resume before it takes effect.",
    );
    if (!confirmed) return;

    setIsMutating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await cancelSubscription({
        subscriptionId: subscriptionId as Id<"subscriptions">,
        atPeriodEnd: true,
      });

      if (!result.success) {
        setActionError(result.error || "Failed to schedule cancellation");
        return;
      }

      setActionSuccess("Cancellation scheduled for period end.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to schedule cancellation",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleApplyPlanUpdate = async () => {
    if (!isValidId || !subscription || isMutating) return;
    if (!hasPlanChanges) {
      setActionSuccess("No plan changes to apply.");
      return;
    }

    setIsMutating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await updateSubscriptionPlan({
        subscriptionId: subscriptionId as Id<"subscriptions">,
        items: planUpdateItems,
        prorationBehavior,
      });

      if (!result.success) {
        setActionError(result.error || "Failed to update subscription plan");
        return;
      }

      setActionSuccess("Subscription plan updated.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to update subscription plan",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleSaveDunningPolicy = async () => {
    if (!isValidId || !subscription || isMutating) return;

    setIsMutating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await updateSubscriptionDunningPolicy({
        subscriptionId: subscriptionId as Id<"subscriptions">,
        dunningEnabled,
        dunningMaxAttempts: Math.max(1, Math.round(dunningMaxAttempts)),
        dunningRetryIntervalDays: Math.max(1, Math.round(dunningRetryIntervalDays)),
        dunningAction,
      });

      if (!result.success) {
        setActionError(result.error || "Failed to save dunning policy");
        return;
      }

      setActionSuccess("Dunning policy saved.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save dunning policy");
    } finally {
      setIsMutating(false);
    }
  };

  if (!isValidId) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold text-content mb-2">Subscription not found</h2>
        <Link href="/dashboard/subscriptions" className="btn-primary inline-flex">
          <ArrowLeft className="w-4 h-4" />
          Back to Subscriptions
        </Link>
      </div>
    );
  }

  if (subscription === undefined) {
    return (
      <div className="card p-8 text-center text-content-muted">Loading subscription...</div>
    );
  }

  if (!subscription) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold text-content mb-2">Subscription not found</h2>
        <Link href="/dashboard/subscriptions" className="btn-primary inline-flex">
          <ArrowLeft className="w-4 h-4" />
          Back to Subscriptions
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/subscriptions"
              className="p-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-content-muted" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-content">
                Subscription
              </h1>
              <p className="text-content-muted text-sm mt-0.5">
                {subscription.stripeSubscriptionId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitch />

            {!isTerminalStatus && !isPaused && (
              <button
                onClick={handlePause}
                disabled={isMutating}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                Pause
              </button>
            )}

            {!isTerminalStatus && !hasScheduledCancel && (
              <button
                onClick={handleCancelAtPeriodEnd}
                disabled={isMutating}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Cancel End of Period
              </button>
            )}

            {!isTerminalStatus && (isPaused || hasScheduledCancel) && (
              <button
                onClick={handleResume}
                disabled={isMutating}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Resume
              </button>
            )}

            {!isTerminalStatus && (
              <button
                onClick={handleCancelNow}
                disabled={isMutating}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Cancel Now
              </button>
            )}
          </div>
        </div>
      </header>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {actionSuccess}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="card p-5">
          <p className="text-content-muted text-sm">Client</p>
          <p className="text-content font-semibold mt-2">
            {subscription.client?.name || "Unknown Client"}
          </p>
          <p className="text-content-muted text-sm mt-1">
            {subscription.client?.company || "N/A"}
          </p>
          <p className="text-content-muted text-sm">{subscription.client?.email || "No email"}</p>
        </div>

        <div className="card p-5">
          <p className="text-content-muted text-sm">Status</p>
          <div className="mt-2">
            <span
              className={`status-badge ${statusClassMap[subscription.status as SubscriptionStatus]}`}
            >
              {formatStatusLabel(subscription.status as SubscriptionStatus)}
            </span>
          </div>
          <p className="text-content-muted text-sm mt-3">
            Next billing: {formatDate(subscription.currentPeriodEnd)}
          </p>
          {subscription.cancelAt && (
            <p className="text-content-muted text-sm mt-1">
              Cancellation scheduled: {formatDate(subscription.cancelAt)}
            </p>
          )}
        </div>

        <div className="card p-5">
          <p className="text-content-muted text-sm">Plan Value</p>
          <p className="text-content font-semibold text-2xl mt-2">
            {formatCurrency(planTotalCents)}
          </p>
          <p className="text-content-muted text-sm mt-3">
            Created: {formatDate(subscription.createdAt)}
          </p>
        </div>
      </section>

      <section className="card p-5 mb-6">
        <h2 className="text-lg font-semibold text-content mb-3">Brands</h2>
        <div className="flex flex-wrap gap-2">
          {subscription.participatingBrands.map((brand) => (
            isBrandType(brand) ? (
              <BrandBadge key={brand} brand={brand} variant="pill" />
            ) : (
              <span
                key={brand}
                className="px-2.5 py-1 rounded-full bg-surface-tertiary text-content-muted text-sm"
              >
                {brand}
              </span>
            )
          ))}
        </div>
      </section>

      <section className="card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-content">Subscription Items</h2>
        </div>
        <div className="divide-y divide-border">
          {subscription.items.length === 0 ? (
            <div className="px-5 py-8 text-center text-content-muted">No items found.</div>
          ) : (
            subscription.items.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div>
                  <p className="font-medium text-content">{item.name}</p>
                  <p className="text-sm text-content-muted">
                    {item.description || item.category} • Qty {item.quantity}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-content">
                    {formatCurrency(item.unitPriceCents * item.quantity)}
                  </p>
                  <p className="text-sm text-content-muted">
                    {formatCurrency(item.unitPriceCents)} each
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h2 className="text-lg font-semibold text-content mb-4">Plan Updates</h2>
          <p className="text-sm text-content-muted mb-4">
            Update quantities and choose how Stripe handles proration.
          </p>

          <div className="space-y-3 mb-4">
            {subscription.items.length === 0 ? (
              <p className="text-sm text-content-muted">No subscription items available.</p>
            ) : (
              subscription.items.map((item, index) => {
                const priceId = item.stripePriceId;
                const currentQuantity = priceId
                  ? planQuantities[priceId] ?? item.quantity
                  : item.quantity;

                return (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content truncate">{item.name}</p>
                      <p className="text-xs text-content-muted">
                        {formatCurrency(item.unitPriceCents)} each
                      </p>
                    </div>
                    {priceId ? (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={currentQuantity}
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value, 10);
                          setPlanQuantities((prev) => ({
                            ...prev,
                            [priceId]: Number.isFinite(value) && value > 0 ? value : 1,
                          }));
                        }}
                        className="input-field w-20 text-right"
                      />
                    ) : (
                      <span className="text-xs text-content-muted">Fixed</span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-content">
              Proration Behavior
            </label>
            <select
              value={prorationBehavior}
              onChange={(event) =>
                setProrationBehavior(event.target.value as ProrationBehavior)
              }
              className="input-field w-full"
            >
              <option value="create_prorations">Create prorations (default)</option>
              <option value="always_invoice">Invoice prorations immediately</option>
              <option value="none">No proration adjustments</option>
            </select>
          </div>

          <button
            onClick={handleApplyPlanUpdate}
            disabled={isMutating || !hasPlanChanges || isTerminalStatus}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Apply Plan Update
          </button>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-semibold text-content mb-4">Dunning Policy</h2>
          <p className="text-sm text-content-muted mb-4">
            Configure automatic handling for repeated payment failures.
          </p>

          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-content">
              <input
                type="checkbox"
                checked={dunningEnabled}
                onChange={(event) => setDunningEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface"
              />
              Enable automated dunning actions
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Max Attempts
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={dunningMaxAttempts}
                  onChange={(event) =>
                    setDunningMaxAttempts(
                      Math.max(1, Number.parseInt(event.target.value || "1", 10)),
                    )
                  }
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Retry Interval (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={dunningRetryIntervalDays}
                  onChange={(event) =>
                    setDunningRetryIntervalDays(
                      Math.max(1, Number.parseInt(event.target.value || "1", 10)),
                    )
                  }
                  className="input-field w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Action After Max Attempts
              </label>
              <select
                value={dunningAction}
                onChange={(event) => setDunningAction(event.target.value as DunningAction)}
                className="input-field w-full"
              >
                <option value="pause">Pause billing</option>
                <option value="cancel">Cancel subscription</option>
                <option value="none">Do nothing</option>
              </select>
            </div>

            <div className="rounded-lg border border-border bg-surface-tertiary px-3 py-2 text-sm text-content-muted">
              <p>Failure count: {subscription.dunningFailureCount ?? 0}</p>
              <p>Last failed payment: {formatDate(subscription.dunningLastFailureAt)}</p>
              <p>Last dunning action: {formatDate(subscription.dunningLastActionAt)}</p>
            </div>
          </div>

          <button
            onClick={handleSaveDunningPolicy}
            disabled={isMutating || !hasDunningChanges}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isMutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Dunning Policy
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-content">Invoices</h2>
        </div>
        <div className="divide-y divide-border">
          {subscription.invoices.length === 0 ? (
            <div className="px-5 py-8 text-center text-content-muted">
              No invoices have been generated yet.
            </div>
          ) : (
            subscription.invoices.map((invoice) => (
              <div
                key={invoice._id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-content">{invoice.invoiceNumber}</p>
                  <p className="text-sm text-content-muted">
                    {formatDate(invoice.createdAt)} • {invoice.status}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-content">
                    {formatCurrency(invoice.totalCents)}
                  </p>
                  <Link
                    href={`/dashboard/invoices/${invoice._id}`}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-hover text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View Invoice
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
