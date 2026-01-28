"use client";

import { useState } from "react";
import { MoreHorizontal, ArrowRight, Trash2, Download, Send } from "lucide-react";
import { BrandBadge, StatusBadge, type BrandType, type StatusType } from "./BrandBadge";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  client: {
    name: string;
    initials: string;
    avatarBg?: string;
  };
  brand: BrandType;
  amount: number;
  date: string;
  status: StatusType;
}

interface InvoiceTableProps {
  invoices: Invoice[];
  onViewAll?: () => void;
}

export function InvoiceTable({ invoices, onViewAll }: InvoiceTableProps) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

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
    if (selectedRows.size === invoices.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="card">
      <div className="p-4 sm:p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-content">Recent Invoices</h2>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="text-sm text-content-muted hover:text-content transition-colors flex items-center gap-1"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-content-muted text-sm border-b border-border">
              <th className="px-4 lg:px-6 py-4 font-medium">
                <input
                  type="checkbox"
                  checked={selectedRows.size === invoices.length && invoices.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-border accent-brand-sankofa"
                />
              </th>
              <th className="px-4 lg:px-6 py-4 font-medium">Invoice</th>
              <th className="px-4 lg:px-6 py-4 font-medium">Client</th>
              <th className="px-4 lg:px-6 py-4 font-medium hidden lg:table-cell">Brand</th>
              <th className="px-4 lg:px-6 py-4 font-medium">Amount</th>
              <th className="px-4 lg:px-6 py-4 font-medium hidden xl:table-cell">Date</th>
              <th className="px-4 lg:px-6 py-4 font-medium">Status</th>
              <th className="px-4 lg:px-6 py-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice, index) => (
              <tr
                key={invoice.id}
                className="table-row opacity-0 animate-slide-in-left"
                style={{ animationDelay: `${300 + index * 50}ms` }}
              >
                <td className="px-4 lg:px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(invoice.id)}
                    onChange={() => toggleRow(invoice.id)}
                    className="w-4 h-4 rounded border-border accent-brand-sankofa"
                  />
                </td>
                <td className="px-4 lg:px-6 py-4">
                  <span className="font-medium text-content">
                    {invoice.invoiceNumber}
                  </span>
                </td>
                <td className="px-4 lg:px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-meta font-medium flex-shrink-0"
                      style={{
                        background: invoice.client.avatarBg || "var(--avatar-bg)",
                        color: invoice.client.avatarBg
                          ? "white"
                          : "var(--color-text-secondary)",
                      }}
                    >
                      {invoice.client.initials}
                    </div>
                    <span className="text-content-secondary truncate max-w-[120px] lg:max-w-none">
                      {invoice.client.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 lg:px-6 py-4 hidden lg:table-cell">
                  <BrandBadge brand={invoice.brand} variant="dot" />
                </td>
                <td className="px-4 lg:px-6 py-4 font-medium text-content">
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="px-4 lg:px-6 py-4 text-content-muted text-sm hidden xl:table-cell">
                  {invoice.date}
                </td>
                <td className="px-4 lg:px-6 py-4">
                  <StatusBadge status={invoice.status} />
                </td>
                <td className="px-4 lg:px-6 py-4">
                  <button className="p-2 rounded-lg hover:bg-surface-tertiary transition-colors">
                    <MoreHorizontal className="w-4 h-4 text-content-muted" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-border">
        {invoices.map((invoice, index) => (
          <div
            key={invoice.id}
            className="p-4 opacity-0 animate-slide-in-left"
            style={{ animationDelay: `${300 + index * 50}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedRows.has(invoice.id)}
                  onChange={() => toggleRow(invoice.id)}
                  className="w-4 h-4 rounded border-border accent-brand-sankofa flex-shrink-0 mt-1"
                />
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                  style={{
                    background: invoice.client.avatarBg || "var(--avatar-bg)",
                    color: invoice.client.avatarBg
                      ? "white"
                      : "var(--color-text-secondary)",
                  }}
                >
                  {invoice.client.initials}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-content truncate">
                    {invoice.client.name}
                  </p>
                  <p className="text-sm text-content-muted">
                    {invoice.invoiceNumber}
                  </p>
                </div>
              </div>
              <button className="p-2 rounded-lg hover:bg-surface-tertiary transition-colors flex-shrink-0">
                <MoreHorizontal className="w-4 h-4 text-content-muted" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-3 pl-7">
              <div className="flex items-center gap-3">
                <BrandBadge brand={invoice.brand} variant="dot" showLabel={false} />
                <span className="text-sm text-content-muted">{invoice.date}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-content">
                  {formatCurrency(invoice.amount)}
                </span>
                <StatusBadge status={invoice.status} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bulk Actions Bar */}
      <div
        className={`bulk-actions-bar ${
          selectedRows.size > 0 ? "visible" : ""
        }`}
      >
        <span className="text-sm font-medium">
          {selectedRows.size} selected
        </span>
        <div className="h-4 w-px bg-white/20" />
        <button className="flex items-center gap-2 text-sm hover:text-white/80 transition-colors">
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
        <button className="flex items-center gap-2 text-sm hover:text-white/80 transition-colors">
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Download</span>
        </button>
        <button className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors">
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </div>
    </div>
  );
}

export default InvoiceTable;
