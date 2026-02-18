"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Search,
  Plus,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Eye,
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

export default function SubscriptionsPage() {
  const subscriptionsFromDb = useQuery(api.invoiceActions.listSubscriptions, {
    limit: 500,
  });
  const clientsFromDb = useQuery(api.clients.list, { limit: 500 });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SubscriptionStatus>("all");
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

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesSearch =
        query === "" ||
        row.clientName.toLowerCase().includes(query) ||
        row.clientEmail.toLowerCase().includes(query) ||
        row.primaryBrand.toLowerCase().includes(query) ||
        row.stripeSubscriptionId.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

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

      <section className="card p-4 sm:p-5 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by client, brand, or Stripe subscription ID..."
              className="input-field pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | SubscriptionStatus)
            }
            className="input-field"
          >
            {statusOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
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
                  <td colSpan={6} className="px-4 py-10 text-center text-content-muted">
                    Loading subscriptions...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-content-muted">
                    No subscriptions found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
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
                ))
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
        <section className="card p-8 mt-4 text-center">
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
