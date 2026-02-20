"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import {
  Search,
  Plus,
  Repeat,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  Filter,
  CalendarDays,
  Download,
  CreditCard,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandBadge, type BrandType } from "@/components/BrandBadge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/useAuthQuery";

type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

type CollectionMethod = "send_invoice" | "charge_automatically";
type CollectionMethodWithUnknown = CollectionMethod | "unknown";
type CollectionFilter = "all" | CollectionMethod | "unknown";
type BrandFilter = "all" | string;
type NextBillingFilter =
  | "all"
  | "overdue"
  | "next_7_days"
  | "this_month"
  | "next_month"
  | "no_billing_date";

interface SubscriptionRow {
  id: Id<"subscriptions">;
  clientName: string;
  clientEmail: string;
  primaryBrand: string;
  participatingBrands: string[];
  status: SubscriptionStatus;
  amountCents: number;
  nextBillingAt?: number;
  stripeSubscriptionId: string;
}

const knownBrands: BrandType[] = [
  "Sankofa",
  "Lighthouse",
  "Centex",
  "GFAM Media Studios",
];

const isBrandType = (brand: string): brand is BrandType =>
  knownBrands.includes(brand as BrandType);

const statusOptions: Array<{ key: "all" | SubscriptionStatus; label: string }> = [
  { key: "all", label: "All statuses" },
  { key: "active", label: "Active" },
  { key: "trialing", label: "Trialing" },
  { key: "past_due", label: "Past due" },
  { key: "paused", label: "Paused" },
  { key: "canceled", label: "Canceled" },
  { key: "incomplete", label: "Incomplete" },
  { key: "incomplete_expired", label: "Incomplete expired" },
  { key: "unpaid", label: "Unpaid" },
];

const nextBillingOptions: Array<{ key: NextBillingFilter; label: string }> = [
  { key: "all", label: "All billing windows" },
  { key: "overdue", label: "Overdue" },
  { key: "next_7_days", label: "Next 7 days" },
  { key: "this_month", label: "This month" },
  { key: "next_month", label: "Next month" },
  { key: "no_billing_date", label: "No billing date" },
];

const collectionOptions: Array<{ key: CollectionFilter; label: string }> = [
  { key: "all", label: "All collections" },
  { key: "charge_automatically", label: "Autopay" },
  { key: "send_invoice", label: "Manual invoice" },
  { key: "unknown", label: "Unknown" },
];

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

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));

const formatStatusLabel = (status: SubscriptionStatus) =>
  status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatBrandFilterLabel = (brand: string) =>
  brand === "GFAM Media Studios" ? "GFAM Media" : brand;

const formatCollectionLabel = (value: CollectionMethodWithUnknown) => {
  switch (value) {
    case "charge_automatically":
      return "Autopay";
    case "send_invoice":
      return "Manual Invoice";
    default:
      return "Unknown";
  }
};

const collectionBadgeClassMap: Record<CollectionMethodWithUnknown, string> = {
  charge_automatically: "bg-emerald-500/15 text-emerald-300",
  send_invoice: "bg-amber-500/15 text-amber-300",
  unknown: "bg-surface-tertiary text-content-muted",
};

function getMonthWindow(offset: number): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1).getTime();
  return { start, end };
}

function matchesNextBillingFilter(
  nextBillingAt: number | undefined,
  filter: NextBillingFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (!nextBillingAt) {
    return filter === "no_billing_date";
  }

  if (filter === "no_billing_date") {
    return false;
  }

  const now = Date.now();
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const endOfNext7Days = startOfToday + 7 * 24 * 60 * 60 * 1000;
  const thisMonth = getMonthWindow(0);
  const nextMonth = getMonthWindow(1);

  switch (filter) {
    case "overdue":
      return nextBillingAt < startOfToday;
    case "next_7_days":
      return nextBillingAt >= now && nextBillingAt <= endOfNext7Days;
    case "this_month":
      return nextBillingAt >= thisMonth.start && nextBillingAt < thisMonth.end;
    case "next_month":
      return nextBillingAt >= nextMonth.start && nextBillingAt < nextMonth.end;
    default:
      return true;
  }
}

function escapeCsvValue(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function SubscriptionsPage() {
  const subscriptionsFromDb = useAuthQuery(api.invoiceActions.listSubscriptions, {
    limit: 500,
  });
  const clientsFromDb = useAuthQuery(api.clients.list, { limit: 500 });
  const getSubscriptionCollectionModes = useAction(
    api.invoiceActions.getSubscriptionCollectionModes,
  );

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | SubscriptionStatus>("all");
  const [nextBillingFilter, setNextBillingFilter] =
    useState<NextBillingFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("all");
  const [collectionMethodById, setCollectionMethodById] = useState<
    Record<string, CollectionMethodWithUnknown>
  >({});
  const [isCollectionModesLoading, setIsCollectionModesLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isLoading = subscriptionsFromDb === undefined || clientsFromDb === undefined;

  const rows = useMemo<SubscriptionRow[]>(() => {
    if (!subscriptionsFromDb || !clientsFromDb) {
      return [];
    }

    const clientsById = new Map(clientsFromDb.map((client) => [client._id, client]));

    return subscriptionsFromDb.map((subscription) => {
      const client = clientsById.get(subscription.clientId);
      const amountCents = subscription.items.reduce(
        (sum, item) => sum + item.unitPriceCents * item.quantity,
        0,
      );

      return {
        id: subscription._id,
        clientName: client?.name || "Unknown Client",
        clientEmail: client?.email || "No email",
        primaryBrand: subscription.primaryBrand,
        participatingBrands: subscription.participatingBrands,
        status: subscription.status as SubscriptionStatus,
        amountCents,
        nextBillingAt: subscription.currentPeriodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      };
    });
  }, [subscriptionsFromDb, clientsFromDb]);

  const brandOptions = useMemo(() => {
    const dynamic = new Set<string>();
    for (const row of rows) {
      dynamic.add(row.primaryBrand);
      for (const brand of row.participatingBrands) {
        dynamic.add(brand);
      }
    }

    const ordered: string[] = [...knownBrands.filter((brand) => dynamic.has(brand))];
    for (const brand of dynamic) {
      if (!ordered.includes(brand)) {
        ordered.push(brand);
      }
    }

    return ordered;
  }, [rows]);

  useEffect(() => {
    if (rows.length === 0) {
      setCollectionMethodById({});
      setIsCollectionModesLoading(false);
      return;
    }

    let cancelled = false;
    setCollectionMethodById({});
    setIsCollectionModesLoading(true);

    const subscriptionIds = rows.map((row) => row.id);
    const chunkSize = 20;

    const loadCollectionModes = async () => {
      for (let index = 0; index < subscriptionIds.length; index += chunkSize) {
        if (cancelled) {
          return;
        }

        const chunk = subscriptionIds.slice(index, index + chunkSize);
        const result = await getSubscriptionCollectionModes({
          subscriptionIds: chunk,
        });

        if (cancelled) {
          return;
        }

        if (!result.success) {
          continue;
        }

        setCollectionMethodById((previous) => {
          const next = { ...previous };
          for (const mode of result.modes) {
            next[mode.subscriptionId] = mode.collectionMethod;
          }
          return next;
        });
      }

      if (!cancelled) {
        setIsCollectionModesLoading(false);
      }
    };

    void loadCollectionModes().catch(() => {
      if (!cancelled) {
        setIsCollectionModesLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [getSubscriptionCollectionModes, rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const rowCollectionMethod = collectionMethodById[row.id] ?? "unknown";
      const matchesBrand =
        brandFilter === "all" ||
        row.primaryBrand === brandFilter ||
        row.participatingBrands.includes(brandFilter);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesNextBilling = matchesNextBillingFilter(
        row.nextBillingAt,
        nextBillingFilter,
      );
      const matchesCollection =
        collectionFilter === "all" || rowCollectionMethod === collectionFilter;
      const matchesSearch =
        query === "" ||
        row.clientName.toLowerCase().includes(query) ||
        row.clientEmail.toLowerCase().includes(query) ||
        row.primaryBrand.toLowerCase().includes(query) ||
        row.participatingBrands.join(" ").toLowerCase().includes(query) ||
        row.stripeSubscriptionId.toLowerCase().includes(query);

      return (
        matchesBrand &&
        matchesStatus &&
        matchesNextBilling &&
        matchesCollection &&
        matchesSearch
      );
    });
  }, [
    rows,
    search,
    brandFilter,
    statusFilter,
    nextBillingFilter,
    collectionFilter,
    collectionMethodById,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, brandFilter, statusFilter, nextBillingFilter, collectionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(start, start + itemsPerPage);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const totalValueCents = filteredRows.reduce((sum, row) => sum + row.amountCents, 0);

  const handleExport = () => {
    if (filteredRows.length === 0) {
      return;
    }

    const header = [
      "Client Name",
      "Client Email",
      "Subscription ID",
      "Primary Brand",
      "Participating Brands",
      "Collection Method",
      "Status",
      "Plan Value (USD)",
      "Next Billing Date",
    ];

    const lines = filteredRows.map((row) => {
      const collectionMethod = collectionMethodById[row.id] ?? "unknown";
      return [
        escapeCsvValue(row.clientName),
        escapeCsvValue(row.clientEmail),
        escapeCsvValue(row.stripeSubscriptionId),
        escapeCsvValue(row.primaryBrand),
        escapeCsvValue(row.participatingBrands.join(" | ")),
        escapeCsvValue(formatCollectionLabel(collectionMethod)),
        escapeCsvValue(formatStatusLabel(row.status)),
        escapeCsvValue((row.amountCents / 100).toFixed(2)),
        escapeCsvValue(row.nextBillingAt ? formatDate(row.nextBillingAt) : "N/A"),
      ].join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const objectUrl = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().slice(0, 10);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `subscriptions-export-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <>
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-content">Subscriptions</h1>
            <p className="text-content-muted text-sm mt-0.5">
              Track recurring client billing plans
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ThemeSwitch />
            <Link href="/dashboard/subscriptions/new" className="btn-primary">
              <Plus className="w-4 h-4" />
              New Subscription
            </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-content-muted text-sm">Total Subscriptions</p>
          <p className="text-2xl font-semibold text-content mt-2">{filteredRows.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-content-muted text-sm">Active Plans</p>
          <p className="text-2xl font-semibold text-content mt-2">
            {filteredRows.filter((row) => row.status === "active").length}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-content-muted text-sm">Plan Value</p>
          <p className="text-2xl font-semibold text-content mt-2">
            {formatCurrency(totalValueCents)}
          </p>
        </div>
      </section>

      <section className="card card-no-hover p-4 sm:p-5 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px]">
            <select
              value={brandFilter}
              onChange={(event) => setBrandFilter(event.target.value)}
              className="input-field appearance-none pr-10 w-full"
            >
              <option value="all">Brand: All</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  Brand: {formatBrandFilterLabel(brand)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          </div>

          <div className="relative min-w-[220px]">
            <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | SubscriptionStatus)
              }
              className="input-field appearance-none pl-10 pr-10 w-full"
            >
              {statusOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  Status: {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          </div>

          <div className="relative min-w-[220px]">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <select
              value={nextBillingFilter}
              onChange={(event) =>
                setNextBillingFilter(event.target.value as NextBillingFilter)
              }
              className="input-field appearance-none pl-10 pr-10 w-full"
            >
              {nextBillingOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  Billing: {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          </div>

          <div className="relative min-w-[220px]">
            <CreditCard className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <select
              value={collectionFilter}
              onChange={(event) =>
                setCollectionFilter(event.target.value as CollectionFilter)
              }
              className="input-field appearance-none pl-10 pr-10 w-full"
            >
              {collectionOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  Collection: {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          </div>

          <button
            onClick={handleExport}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-content disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by client, brand, or Stripe subscription ID..."
            className="input-field pl-10 w-full"
          />
        </div>

        {isCollectionModesLoading && (
          <p className="text-xs text-content-muted">
            Loading collection methods for filtering and export...
          </p>
        )}
      </section>

      <section className="card card-no-hover overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs text-content-muted uppercase tracking-wide">
                  Client
                </th>
                <th className="text-left px-4 py-3 text-xs text-content-muted uppercase tracking-wide">
                  Brand
                </th>
                <th className="text-left px-4 py-3 text-xs text-content-muted uppercase tracking-wide">
                  Plan Value
                </th>
                <th className="text-left px-4 py-3 text-xs text-content-muted uppercase tracking-wide">
                  Next Billing
                </th>
                <th className="text-left px-4 py-3 text-xs text-content-muted uppercase tracking-wide">
                  Collection
                </th>
                <th className="text-left px-4 py-3 text-xs text-content-muted uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs text-content-muted uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-content-muted">
                    Loading subscriptions...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-content-muted">
                    No subscriptions found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const rowCollectionMethod = collectionMethodById[row.id] ?? "unknown";

                  return (
                    <tr key={row.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-4">
                        <p className="font-medium text-content">{row.clientName}</p>
                        <p className="text-sm text-content-muted">{row.clientEmail}</p>
                      </td>
                      <td className="px-4 py-4">
                        {row.participatingBrands.length === 1 &&
                        isBrandType(row.participatingBrands[0]) ? (
                          <BrandBadge
                            brand={row.participatingBrands[0]}
                            variant="pill"
                          />
                        ) : (
                          <span className="text-sm text-content-muted">
                            Multi-brand ({row.participatingBrands.length})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-content">{formatCurrency(row.amountCents)}</td>
                      <td className="px-4 py-4 text-content-muted text-sm">
                        {row.nextBillingAt ? formatDate(row.nextBillingAt) : "N/A"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`status-badge ${
                            collectionBadgeClassMap[rowCollectionMethod]
                          }`}
                        >
                          {formatCollectionLabel(rowCollectionMethod)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`status-badge ${statusClassMap[row.status]}`}>
                          {formatStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/dashboard/subscriptions/${row.id}`}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-surface-hover text-sm"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-sm text-content-muted">
            Showing {paginatedRows.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
            {Math.min(currentPage * itemsPerPage, filteredRows.length)} of {filteredRows.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="p-2 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-content-muted">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="p-2 rounded-lg border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-hover"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {!isLoading && rows.length === 0 && (
        <section className="card card-no-hover p-8 mt-4 text-center">
          <div className="w-14 h-14 rounded-xl bg-brand-primary/10 text-brand-primary mx-auto mb-4 flex items-center justify-center">
            <Repeat className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-content mb-1">No subscriptions yet</h2>
          <p className="text-content-muted mb-4">
            Create your first recurring billing plan from the wizard.
          </p>
          <Link href="/dashboard/subscriptions/new" className="btn-primary inline-flex">
            <Plus className="w-4 h-4" />
            Create Subscription
          </Link>
        </section>
      )}
    </>
  );
}
