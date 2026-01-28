"use client";

import { useState, useMemo } from "react";
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
  Bell,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandBadge, StatusBadge, type BrandType, type StatusType } from "@/components/BrandBadge";
import {
  allInvoices,
  invoiceSummary,
  brandFilters,
  statusFilters,
  dateRanges,
  type InvoiceData,
} from "@/data/invoices-sample";

type SummaryFilter = "all" | "paid" | "pending" | "overdue";

export default function InvoicesPage() {
  const router = useRouter();
  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<SummaryFilter>("all");
  const [selectedDateRange, setSelectedDateRange] = useState("month");
  const [activeSummaryCard, setActiveSummaryCard] = useState<SummaryFilter>("all");

  // Dropdown states
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  // Selection states
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Filter invoices
  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((invoice) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.service.toLowerCase().includes(searchQuery.toLowerCase());

      // Brand filter
      const matchesBrand = selectedBrand === "all" || invoice.brand === selectedBrand;

      // Status filter (from cards or dropdown)
      const activeStatus = activeSummaryCard !== "all" ? activeSummaryCard : selectedStatus;
      const matchesStatus = activeStatus === "all" || invoice.status === activeStatus;

      return matchesSearch && matchesBrand && matchesStatus;
    });
  }, [searchQuery, selectedBrand, selectedStatus, activeSummaryCard]);

  // Paginated invoices
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(start, start + itemsPerPage);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);

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

  // Get brand key for styling
  const getBrandKey = (brand: BrandType): string => {
    if (brand === "GFAM Media Studios") return "gfam-media";
    return brand.toLowerCase();
  };

  const handleNewInvoice = () => {
    router.push("/dashboard/invoices/new");
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
              Jan 1 - Jan 20
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
        {/* Total Revenue */}
        <button
          onClick={() => handleSummaryClick("all")}
          className={`summary-card opacity-0 animate-fade-in-up ${activeSummaryCard === "all" ? "active" : ""}`}
          style={{ animationDelay: "50ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon bg-surface-tertiary">
              <Receipt className="w-5 h-5 text-content" />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value">{formatCurrency(invoiceSummary.totalRevenue.amount)}</div>
            <div className="summary-label">Total Revenue</div>
            <div className="summary-count">{invoiceSummary.totalRevenue.count} invoices</div>
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
                        setSelectedStatus(status.key as SummaryFilter);
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
                        setSelectedDateRange(range.key);
                        setDateDropdownOpen(false);
                      }}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export Button */}
            <button className="btn-secondary hidden sm:flex">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Table */}
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

          {paginatedInvoices.map((invoice, index) => (
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
                <BrandBadge brand={invoice.brand} variant="pill" />
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
                <StatusBadge status={invoice.status} />
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
          ))}
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden divide-y divide-border">
          {paginatedInvoices.map((invoice, index) => (
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
                      <BrandBadge brand={invoice.brand} variant="dot" showLabel={false} />
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
                  <StatusBadge status={invoice.status} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="pagination">
          <div className="pagination-info">
            Showing <strong>{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredInvoices.length)}</strong> of <strong>{filteredInvoices.length}</strong> invoices
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
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

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
