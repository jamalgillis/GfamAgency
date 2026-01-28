"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Send,
  MoreHorizontal,
  Printer,
  Edit2,
  Trash2,
  CheckCircle,
  Circle,
  ChevronDown,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { allInvoices, type InvoiceData } from "@/data/invoices-sample";
import type { BrandType, StatusType } from "@/components/BrandBadge";

// Sample line items for demo
interface LineItem {
  id: string;
  name: string;
  description: string;
  brand: BrandType;
  qty: number;
  rate: number;
}

const sampleLineItems: Record<string, LineItem[]> = {
  "inv-1042": [
    {
      id: "1",
      name: "Website Design",
      description: "Custom responsive design with brand guidelines",
      brand: "Sankofa",
      qty: 1,
      rate: 1500,
    },
    {
      id: "2",
      name: "Development",
      description: "Next.js implementation with CMS integration",
      brand: "Sankofa",
      qty: 1,
      rate: 900,
    },
  ],
  "inv-1041": [
    {
      id: "1",
      name: "Video Editing",
      description: "Full color grading and sound mixing",
      brand: "Lighthouse",
      qty: 3,
      rate: 450,
    },
    {
      id: "2",
      name: "Motion Graphics",
      description: "Intro/outro animations",
      brand: "Lighthouse",
      qty: 1,
      rate: 500,
    },
  ],
  "inv-1040": [
    {
      id: "1",
      name: "Live Stream Production",
      description: "Full production team for 4-hour event",
      brand: "Centex",
      qty: 1,
      rate: 3200,
    },
  ],
  "inv-1039": [
    {
      id: "1",
      name: "Studio Rental",
      description: "8-hour podcast studio session",
      brand: "GFAM Media Studios",
      qty: 8,
      rate: 111.25,
    },
  ],
};

const brandClasses: Record<BrandType, string> = {
  Sankofa: "invoice-brand-sankofa",
  Lighthouse: "invoice-brand-lighthouse",
  Centex: "invoice-brand-centex",
  "GFAM Media Studios": "invoice-brand-gfam",
};

const statusColors: Record<StatusType, string> = {
  paid: "paid",
  pending: "draft",
  overdue: "overdue",
  draft: "draft",
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  // Find the invoice
  const invoice = allInvoices.find((inv) => inv.id === invoiceId);

  // Get line items or create default
  const initialItems = sampleLineItems[invoiceId] || [
    {
      id: "1",
      name: "Service",
      description: "Service description",
      brand: invoice?.brand || "Sankofa",
      qty: 1,
      rate: invoice?.amount || 0,
    },
  ];

  const [lineItems, setLineItems] = useState<LineItem[]>(initialItems);
  const [notes, setNotes] = useState(
    "Payment is due within 14 days. Please include the invoice number in your payment reference."
  );
  const [actionsOpen, setActionsOpen] = useState(false);

  // Calculate totals
  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.qty * item.rate, 0),
    [lineItems]
  );
  const tax = subtotal * 0.0; // No tax for now
  const total = subtotal + tax;

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-xl font-semibold text-content mb-2">Invoice Not Found</h2>
        <p className="text-content-muted mb-6">
          The invoice you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/dashboard/invoices"
          className="btn-primary"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Invoices
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Back & Title */}
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/invoices"
              className="p-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-content-muted" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-content">
                {invoice.invoiceNumber}
              </h1>
              <p className="text-content-muted text-sm mt-0.5">
                {invoice.client.name} &middot; {invoice.date}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ThemeSwitch />

            <button className="btn-secondary">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button className="btn-secondary">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {invoice.status !== "paid" && (
              <button className="btn-primary">
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send Invoice</span>
              </button>
            )}

            {/* More Actions Dropdown */}
            <div className="dropdown relative">
              <button
                className="btn-secondary !px-2.5"
                onClick={() => setActionsOpen(!actionsOpen)}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {actionsOpen && (
                <div className="dropdown-menu right-0 left-auto">
                  <button className="dropdown-item">
                    <Edit2 className="w-4 h-4" />
                    Edit Invoice
                  </button>
                  <button className="dropdown-item">
                    <CheckCircle className="w-4 h-4" />
                    Mark as Paid
                  </button>
                  <button className="dropdown-item text-error">
                    <Trash2 className="w-4 h-4" />
                    Delete Invoice
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Invoice Document */}
      <div className="invoice-document-wrapper !bg-transparent !p-0">
        <div className="invoice-sheet !max-w-none">
          {/* Invoice Header */}
          <div className="invoice-header">
            <div>
              <h2 className="invoice-company-name">GFAM Agency</h2>
              <p className="invoice-client-detail mt-2">
                123 Creative Street<br />
                Austin, TX 78701
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="invoice-label">Invoice</p>
              <p className="invoice-number">{invoice.invoiceNumber}</p>
              <div className="mt-3">
                <span className={`invoice-status-badge ${statusColors[invoice.status]}`}>
                  <Circle className="w-2 h-2 fill-current" />
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Bill To / Dates Grid */}
          <div className="invoice-grid">
            <div>
              <p className="invoice-section-label">Bill To</p>
              <p className="invoice-client-name">{invoice.client.name}</p>
              <p className="invoice-client-detail">{invoice.client.email}</p>
            </div>
            <div>
              <p className="invoice-section-label">Details</p>
              <div className="space-y-1">
                <div className="invoice-date-row">
                  <span className="invoice-date-label">Issue Date</span>
                  <span className="invoice-date-value">{invoice.date}</span>
                </div>
                <div className="invoice-date-row">
                  <span className="invoice-date-label">Due Date</span>
                  <span className={`invoice-date-value ${invoice.status === "overdue" ? "text-red-400" : ""}`}>
                    {invoice.dueDate}
                  </span>
                </div>
                <div className="invoice-date-row">
                  <span className="invoice-date-label">Brand</span>
                  <span className="invoice-date-value">{invoice.brand}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="invoice-table-wrapper">
            <table className="invoice-table">
              <thead>
                <tr className="invoice-table-header">
                  <th>Item</th>
                  <th className="text-center">Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id} className="invoice-table-row">
                    <td>
                      <div className="invoice-item-name">{item.name}</div>
                      <div className="invoice-item-description">{item.description}</div>
                      <span className={`invoice-item-brand ${brandClasses[item.brand]}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {item.brand === "GFAM Media Studios" ? "GFAM Media" : item.brand}
                      </span>
                    </td>
                    <td className="text-center">{item.qty}</td>
                    <td className="text-right">{formatCurrency(item.rate)}</td>
                    <td className="text-right font-semibold">
                      {formatCurrency(item.qty * item.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="invoice-totals">
            <div className="invoice-totals-box">
              <div className="invoice-total-row">
                <span className="invoice-total-label">Subtotal</span>
                <span className="invoice-total-value">{formatCurrency(subtotal)}</span>
              </div>
              {tax > 0 && (
                <div className="invoice-total-row">
                  <span className="invoice-total-label">Tax</span>
                  <span className="invoice-total-value">{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="invoice-total-row grand-total">
                <span className="invoice-total-label">Total</span>
                <span className="invoice-total-value">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="invoice-notes">
            <p className="invoice-notes-title">Notes</p>
            <p className="invoice-notes-content">{notes}</p>
          </div>

          {/* Footer */}
          <div className="invoice-footer">
            <p className="invoice-footer-text">Thank you for your business!</p>
            <p className="invoice-footer-brand">GFAM Agency</p>
          </div>
        </div>
      </div>
    </>
  );
}
