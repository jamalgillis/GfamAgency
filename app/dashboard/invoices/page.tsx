"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Calendar,
  Download,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Receipt,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  MoreHorizontal,
  Mail,
  X,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandBadge, StatusBadge, type BrandType, type StatusType } from "@/components/BrandBadge";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/useAuthQuery";

type InvoiceLifecycleStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
type InvoiceDisplayStatus = "paid" | "pending" | "overdue" | "draft" | "void";
type StatusFilter = "all" | InvoiceDisplayStatus;
type SummaryFilter = StatusFilter | "invoiced";
type DateRangeKey = "week" | "month" | "quarter" | "year" | "custom";

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  client: {
    name: string;
    email: string;
    initials: string;
  };
  service: string;
  brand: string;
  amount: number;
  date: string;
  dueDate: string;
  issuedAt: number;
  dueAt: number;
  status: InvoiceDisplayStatus;
}

const knownBrands: BrandType[] = ["Sankofa", "Lighthouse", "Centex", "GFAM Media Studios"];
const knownBadgeStatuses: StatusType[] = ["paid", "pending", "overdue", "draft"];

const brandColorMap: Record<string, string> = {
  Sankofa: "#10B981",
  Lighthouse: "#8B5CF6",
  Centex: "#F59E0B",
  "GFAM Media Studios": "#3B82F6",
  "GFAM Agency": "#64748B",
};

const statusFilters: { key: StatusFilter; label: string; color?: string }[] = [
  { key: "all", label: "All Statuses" },
  { key: "paid", label: "Paid", color: "#10B981" },
  { key: "pending", label: "Pending", color: "#F59E0B" },
  { key: "overdue", label: "Overdue", color: "#EF4444" },
  { key: "draft", label: "Draft", color: "#94A3B8" },
  { key: "void", label: "Void", color: "#64748B" },
];

const dateRanges: { key: DateRangeKey; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
];

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const endOfDayTimestamp = (timestampMs: number) => {
  const date = new Date(timestampMs);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const resolveInvoiceDueAt = (invoice: {
  createdAt: number;
  billingPeriodEnd?: number;
  sourceType?: "one_time" | "subscription";
  subscriptionId?: string;
  stripeSubscriptionId?: string;
}) => {
  const isSubscriptionInvoice =
    invoice.sourceType === "subscription" ||
    !!invoice.subscriptionId ||
    !!invoice.stripeSubscriptionId;

  if (
    !isSubscriptionInvoice &&
    typeof invoice.billingPeriodEnd === "number" &&
    Number.isFinite(invoice.billingPeriodEnd)
  ) {
    return Math.max(invoice.billingPeriodEnd, invoice.createdAt);
  }

  if (isSubscriptionInvoice) {
    return endOfDayTimestamp(invoice.createdAt + 30 * DAY_IN_MS);
  }

  return endOfDayTimestamp(invoice.createdAt);
};

const formatShortDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);

const formatFullDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "UC";

const isKnownBrand = (brand: string): brand is BrandType =>
  knownBrands.includes(brand as BrandType);

const isKnownBadgeStatus = (status: string): status is StatusType =>
  knownBadgeStatuses.includes(status as StatusType);

const getDisplayStatus = (
  status: InvoiceLifecycleStatus,
  dueAt: number,
  now: number,
): InvoiceDisplayStatus => {
  if (status === "paid") return "paid";
  if (status === "draft") return "draft";
  if (status === "void") return "void";
  if (status === "uncollectible") return "overdue";
  return now > dueAt ? "overdue" : "pending";
};

const getServiceSummary = (brands: string[]) => {
  if (brands.length <= 1) return "Service invoice";
  return `Multi-brand (${brands.length})`;
};

const getPresetDateRange = (range: Exclude<DateRangeKey, "custom">, now: Date) => {
  const end = endOfDay(now);

  if (range === "week") {
    const start = startOfDay(now);
    start.setDate(start.getDate() - start.getDay());
    return { start, end };
  }

  if (range === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end,
    };
  }

  if (range === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return {
      start: new Date(now.getFullYear(), quarterStartMonth, 1),
      end,
    };
  }

  return {
    start: new Date(now.getFullYear(), 0, 1),
    end,
  };
};

export default function InvoicesPage() {
  const router = useRouter();
  const invoicesFromDb = useAuthQuery(api.invoiceActions.listInvoices, { limit: 500 });
  const clientsFromDb = useAuthQuery(api.clients.list, { limit: 500 });

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeKey>("month");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [activeSummaryCard, setActiveSummaryCard] = useState<SummaryFilter>("invoiced");

  // Dropdown states
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  // Selection states
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const isLoadingInvoices = invoicesFromDb === undefined || clientsFromDb === undefined;

  const allInvoices = useMemo<InvoiceData[]>(() => {
    if (!invoicesFromDb || !clientsFromDb) return [];

    const now = Date.now();
    const clientsById = new Map(clientsFromDb.map((client) => [client._id, client]));

    return invoicesFromDb.map((invoice) => {
      const client = clientsById.get(invoice.clientId);
      const clientName = client?.name || "Unknown Client";
      const issuedAt = invoice.createdAt;
      const dueAt = resolveInvoiceDueAt({
        createdAt: issuedAt,
        billingPeriodEnd: invoice.billingPeriodEnd,
        sourceType: invoice.sourceType,
        subscriptionId: invoice.subscriptionId,
        stripeSubscriptionId: invoice.stripeSubscriptionId,
      });
      const displayStatus = getDisplayStatus(invoice.status as InvoiceLifecycleStatus, dueAt, now);

      return {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        client: {
          name: clientName,
          email: client?.email || "No email",
          initials: getInitials(clientName),
        },
        service: getServiceSummary(invoice.participatingBrands),
        brand: invoice.primaryBrand,
        amount: invoice.totalCents / 100,
        date: formatFullDate(new Date(issuedAt)),
        dueDate: formatShortDate(new Date(dueAt)),
        issuedAt,
        dueAt,
        status: displayStatus,
      };
    });
  }, [invoicesFromDb, clientsFromDb]);

  const invoiceSummary = useMemo(() => {
    const summary = {
      totalInvoiced: { amount: 0, count: 0 },
      paid: { amount: 0, count: 0 },
      pending: { amount: 0, count: 0 },
      overdue: { amount: 0, count: 0 },
    };

    for (const invoice of allInvoices) {
      if (
        invoice.status === "paid" ||
        invoice.status === "pending" ||
        invoice.status === "overdue"
      ) {
        summary.totalInvoiced.amount += invoice.amount;
        summary.totalInvoiced.count += 1;
      }

      if (invoice.status === "paid") {
        summary.paid.amount += invoice.amount;
        summary.paid.count += 1;
      } else if (invoice.status === "pending") {
        summary.pending.amount += invoice.amount;
        summary.pending.count += 1;
      } else if (invoice.status === "overdue") {
        summary.overdue.amount += invoice.amount;
        summary.overdue.count += 1;
      }
    }

    return summary;
  }, [allInvoices]);

  const brandFilters = useMemo<Array<{ key: string; label: string; color?: string }>>(() => {
    const brands = Array.from(new Set(allInvoices.map((invoice) => invoice.brand)));
    brands.sort((a, b) => a.localeCompare(b));

    return [
      { key: "all", label: "All", color: undefined },
      ...brands.map((brand) => ({
        key: brand,
        label: brand === "GFAM Media Studios" ? "GFAM Media" : brand,
        color: brandColorMap[brand],
      })),
    ];
  }, [allInvoices]);

  // Filter invoices
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const presetRange =
      selectedDateRange === "custom"
        ? null
        : getPresetDateRange(selectedDateRange, now);
    const customStart = customDateFrom ? startOfDay(new Date(customDateFrom)) : null;
    const customEnd = customDateTo ? endOfDay(new Date(customDateTo)) : null;

    return allInvoices.filter((invoice) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.brand.toLowerCase().includes(searchQuery.toLowerCase());

      // Brand filter
      const matchesBrand = selectedBrand === "all" || invoice.brand === selectedBrand;

      // Status filter (from cards or dropdown)
      const activeStatus = activeSummaryCard !== "all" ? activeSummaryCard : selectedStatus;
      const matchesStatus =
        activeStatus === "all"
          ? true
          : activeStatus === "invoiced"
            ? invoice.status === "paid" || invoice.status === "pending" || invoice.status === "overdue"
            : invoice.status === activeStatus;

      // Date filter
      const invoiceDate = new Date(invoice.issuedAt);

      let matchesDate = true;
      if (selectedDateRange === "custom") {
        if (customStart && invoiceDate < customStart) matchesDate = false;
        if (customEnd && invoiceDate > customEnd) matchesDate = false;
      } else if (presetRange) {
        matchesDate = invoiceDate >= presetRange.start && invoiceDate <= presetRange.end;
      }

      return matchesSearch && matchesBrand && matchesStatus && matchesDate;
    });
  }, [
    allInvoices,
    searchQuery,
    selectedBrand,
    selectedStatus,
    activeSummaryCard,
    selectedDateRange,
    customDateFrom,
    customDateTo,
  ]);

  // Paginated invoices
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(start, start + itemsPerPage);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const noInvoices = filteredInvoices.length === 0;
  const showingFrom = filteredInvoices.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo =
    filteredInvoices.length === 0 ? 0 : Math.min(currentPage * itemsPerPage, filteredInvoices.length);

  useEffect(() => {
    if (totalPages === 0) {
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }

    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const selectedDateLabel = useMemo(() => {
    if (selectedDateRange === "custom") {
      if (!customDateFrom && !customDateTo) return "Custom Range";

      const fromLabel = customDateFrom ? formatShortDate(new Date(customDateFrom)) : "Start";
      const toLabel = customDateTo ? formatShortDate(new Date(customDateTo)) : "Now";
      return `${fromLabel} - ${toLabel}`;
    }

    const { start, end } = getPresetDateRange(selectedDateRange, new Date());
    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
  }, [selectedDateRange, customDateFrom, customDateTo]);

  // Selection handlers
  const toggleRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  const toggleAll = () => {
    if (selectedRows.size === paginatedInvoices.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedInvoices.map((inv) => inv.id)));
    }
  };

  const clearSelection = () => {
    setSelectedRows(new Set());
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Handle summary card click
  const handleSummaryClick = (filter: SummaryFilter) => {
    setActiveSummaryCard(filter);
    setSelectedStatus("all");
    setCurrentPage(1);
  };

  const handleNewInvoice = () => {
    router.push("/dashboard/invoices/new");
  };

  const renderStatusBadge = (status: InvoiceDisplayStatus) => {
    if (isKnownBadgeStatus(status)) {
      return <StatusBadge status={status} />;
    }
    return (
      <span className="status-badge bg-surface-tertiary text-content-muted">
        Void
      </span>
    );
  };

  const renderBrandPill = (brand: string) => {
    if (isKnownBrand(brand)) {
      return <BrandBadge brand={brand} variant="pill" />;
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-tertiary text-content-secondary">
        {brand}
      </span>
    );
  };

  const renderBrandDot = (brand: string) => {
    if (isKnownBrand(brand)) {
      return <BrandBadge brand={brand} variant="dot" showLabel={false} />;
    }
    return <span className="text-xs text-content-muted">{brand}</span>;
  };

  return (
    <>
      {/* Custom Header for Invoices */}
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title Section */}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-content">Invoices</h1>
            <p className="text-content-muted text-sm mt-1">
              Track and manage invoices across all brands
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Theme Toggle */}
            <ThemeSwitch />

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="input-field pl-10 pr-4 py-2.5 w-48 sm:w-64"
              />
            </div>

            {/* Date Range Button */}
            <button className="btn-secondary hidden sm:flex">
              <Calendar className="w-4 h-4" />
              {selectedDateLabel}
            </button>

            {/* New Invoice Button */}
            <button onClick={handleNewInvoice} className="btn-primary whitespace-nowrap">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Invoice</span>
            </button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
        {/* Total Invoiced */}
        <button
          onClick={() => handleSummaryClick("invoiced")}
          className={`summary-card opacity-0 animate-fade-in-up ${activeSummaryCard === "invoiced" ? "active" : ""}`}
          style={{ animationDelay: "50ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon bg-surface-tertiary">
              <Receipt className="w-5 h-5 text-content" />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value">{formatCurrency(invoiceSummary.totalInvoiced.amount)}</div>
            <div className="summary-label">Total Invoiced</div>
            <div className="summary-count">{invoiceSummary.totalInvoiced.count} invoices</div>
          </div>
        </button>

        {/* Paid */}
        <button
          onClick={() => handleSummaryClick("paid")}
          className={`summary-card opacity-0 animate-fade-in-up ${activeSummaryCard === "paid" ? "active" : ""}`}
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon summary-icon-paid">
              <CheckCircle className="w-5 h-5" style={{ color: "var(--brand-sankofa)" }} />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value text-success">{formatCurrency(invoiceSummary.paid.amount)}</div>
            <div className="summary-label">Paid</div>
            <div className="summary-count">{invoiceSummary.paid.count} invoices</div>
          </div>
        </button>

        {/* Pending */}
        <button
          onClick={() => handleSummaryClick("pending")}
          className={`summary-card opacity-0 animate-fade-in-up ${activeSummaryCard === "pending" ? "active" : ""}`}
          style={{ animationDelay: "150ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon summary-icon-pending">
              <Clock className="w-5 h-5" style={{ color: "var(--brand-centex)" }} />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value text-warning">{formatCurrency(invoiceSummary.pending.amount)}</div>
            <div className="summary-label">Pending</div>
            <div className="summary-count">{invoiceSummary.pending.count} invoices</div>
          </div>
        </button>

        {/* Overdue */}
        <button
          onClick={() => handleSummaryClick("overdue")}
          className={`summary-card opacity-0 animate-fade-in-up ${activeSummaryCard === "overdue" ? "active" : ""}`}
          style={{ animationDelay: "200ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon summary-icon-overdue">
              <AlertCircle className="w-5 h-5" style={{ color: "#EF4444" }} />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value text-error">{formatCurrency(invoiceSummary.overdue.amount)}</div>
            <div className="summary-label">Overdue</div>
            <div className="summary-count">{invoiceSummary.overdue.count} invoices</div>
          </div>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar mb-6 opacity-0 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Brand Tabs */}
          <div className="tab-container overflow-x-auto scrollbar-hide">
            {brandFilters.map((brand) => (
              <button
                key={brand.key}
                onClick={() => {
                  setSelectedBrand(brand.key);
                  setCurrentPage(1);
                }}
                className={`tab whitespace-nowrap ${selectedBrand === brand.key ? "active" : ""}`}
              >
                {brand.color && (
                  <span
                    className="tab-dot"
                    style={{ background: brand.color }}
                  />
                )}
                {brand.label}
              </button>
            ))}
          </div>

          {/* Right side filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Dropdown */}
            <div className="dropdown relative">
              <button
                className="dropdown-trigger"
                onClick={() => {
                  setStatusDropdownOpen(!statusDropdownOpen);
                  setDateDropdownOpen(false);
                }}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Status:</span>
                <span>{statusFilters.find((s) => s.key === selectedStatus)?.label || "All"}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {statusDropdownOpen && (
                <div className="dropdown-menu">
                  {statusFilters.map((status) => (
                    <button
                      key={status.key}
                      className={`dropdown-item ${selectedStatus === status.key ? "active" : ""}`}
                      onClick={() => {
                        setSelectedStatus(status.key);
                        setActiveSummaryCard("all");
                        setStatusDropdownOpen(false);
                        setCurrentPage(1);
                      }}
                    >
                      {status.color && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: status.color }}
                        />
                      )}
                      <span>{status.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Dropdown */}
            <div className="dropdown relative">
              <button
                className="dropdown-trigger"
                onClick={() => {
                  setDateDropdownOpen(!dateDropdownOpen);
                  setStatusDropdownOpen(false);
                }}
              >
                <Calendar className="w-4 h-4" />
                <span>{dateRanges.find((d) => d.key === selectedDateRange)?.label}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {dateDropdownOpen && (
                <div className="dropdown-menu">
                  {dateRanges.map((range) => (
                    <button
                      key={range.key}
                      className={`dropdown-item ${selectedDateRange === range.key ? "active" : ""}`}
                      onClick={() => {
                        setSelectedDateRange(range.key as DateRangeKey);
                        setDateDropdownOpen(false);
                        setCurrentPage(1);
                      }}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedDateRange === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customDateFrom}
                  max={customDateTo || undefined}
                  onChange={(e) => {
                    setCustomDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="input-field py-2 px-3 text-sm w-[140px]"
                  aria-label="Custom date from"
                />
                <span className="text-content-muted text-sm hidden sm:inline">to</span>
                <input
                  type="date"
                  value={customDateTo}
                  min={customDateFrom || undefined}
                  onChange={(e) => {
                    setCustomDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="input-field py-2 px-3 text-sm w-[140px]"
                  aria-label="Custom date to"
                />
              </div>
            )}

            {/* Export Button */}
            <button className="btn-secondary hidden sm:flex">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Table */}
      {isLoadingInvoices ? (
        <div className="invoices-table-card opacity-0 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
          <div className="p-8 text-center text-content-muted">Loading invoices...</div>
        </div>
      ) : (
      <div className="invoices-table-card opacity-0 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <div className="invoices-table-header">
            <div className="flex items-center">
              <button
                onClick={toggleAll}
                className={`checkbox ${selectedRows.size === paginatedInvoices.length && paginatedInvoices.length > 0 ? "checked" : ""}`}
              >
                {selectedRows.size === paginatedInvoices.length && paginatedInvoices.length > 0 && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
            <div>Invoice</div>
            <div>Client</div>
            <div>Brand</div>
            <div>Amount</div>
            <div className="hidden xl:block">Date</div>
            <div>Status</div>
            <div></div>
          </div>

          {paginatedInvoices.length === 0 ? (
            <div className="p-8 text-center text-content-muted">No invoices found.</div>
          ) : (
            paginatedInvoices.map((invoice, index) => (
              <div
                key={invoice.id}
                className={`invoices-table-row opacity-0 animate-slide-in-left ${selectedRows.has(invoice.id) ? "selected" : ""}`}
                style={{ animationDelay: `${350 + index * 50}ms` }}
              >
                <div className="flex items-center">
                  <button
                    onClick={() => toggleRow(invoice.id)}
                    className={`checkbox ${selectedRows.has(invoice.id) ? "checked" : ""}`}
                  >
                    {selectedRows.has(invoice.id) && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
                <div>
                  <div className="invoice-num">{invoice.invoiceNumber}</div>
                  <div className="invoice-service">{invoice.service}</div>
                </div>
                <div>
                  <div className="client-name">{invoice.client.name}</div>
                  <div className="client-email">{invoice.client.email}</div>
                </div>
                <div>
                  {renderBrandPill(invoice.brand)}
                </div>
                <div>
                  <div className="amount">{formatCurrency(invoice.amount)}</div>
                </div>
                <div className="hidden xl:block">
                  <div className="date-value">{invoice.date}</div>
                  <div className={`due-date ${invoice.status === "overdue" ? "overdue" : ""}`}>
                    Due: {invoice.dueDate}
                  </div>
                </div>
                <div>
                  {renderStatusBadge(invoice.status)}
                </div>
                <div className="row-actions">
                  <Link href={`/dashboard/invoices/${invoice.id}`} className="action-btn" title="View">
                    <Eye className="w-4 h-4" />
                  </Link>
                  <button className="action-btn" title="More">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y divide-border">
          {paginatedInvoices.length === 0 ? (
            <div className="p-8 text-center text-content-muted">No invoices found.</div>
          ) : (
            paginatedInvoices.map((invoice, index) => (
              <div
                key={invoice.id}
                className={`p-4 opacity-0 animate-slide-in-left ${selectedRows.has(invoice.id) ? "bg-surface-tertiary" : ""}`}
                style={{ animationDelay: `${350 + index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => toggleRow(invoice.id)}
                      className={`checkbox flex-shrink-0 mt-1 ${selectedRows.has(invoice.id) ? "checked" : ""}`}
                    >
                      {selectedRows.has(invoice.id) && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-content">{invoice.invoiceNumber}</span>
                        {renderBrandDot(invoice.brand)}
                      </div>
                      <p className="text-sm text-content-secondary truncate">{invoice.client.name}</p>
                      <p className="text-xs text-content-muted truncate">{invoice.service}</p>
                    </div>
                  </div>
                  <Link href={`/dashboard/invoices/${invoice.id}`} className="action-btn flex-shrink-0">
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
                <div className="flex items-center justify-between mt-3 pl-9">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-content-muted">{invoice.date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-content">{formatCurrency(invoice.amount)}</span>
                    {renderStatusBadge(invoice.status)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        <div className="pagination">
          <div className="pagination-info">
            Showing <strong>{showingFrom}-{showingTo}</strong> of <strong>{filteredInvoices.length}</strong>{" "}
            invoices
          </div>
          <div className="pagination-controls">
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                className={`page-btn ${currentPage === page ? "active" : ""}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            {totalPages > 3 && (
              <>
                <span className="text-content-muted">...</span>
                <button
                  className={`page-btn ${currentPage === totalPages ? "active" : ""}`}
                  onClick={() => setCurrentPage(totalPages)}
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              className="page-btn"
              disabled={noInvoices || currentPage >= totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Bulk Actions Bar */}
      <div className={`bulk-actions-bar ${selectedRows.size > 0 ? "visible" : ""}`}>
        <span className="bulk-count">{selectedRows.size} selected</span>
        <div className="h-4 w-px bg-white/20" />
        <button className="bulk-btn">
          <Mail className="w-4 h-4" />
          <span className="hidden sm:inline">Send Reminder</span>
        </button>
        <button className="bulk-btn">
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Download PDFs</span>
        </button>
        <button className="bulk-btn" onClick={clearSelection}>
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>
    </>
  );
}
