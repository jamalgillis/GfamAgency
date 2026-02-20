"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import {
  ArrowLeft,
  Download,
  Send,
  MoreHorizontal,
  Printer,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Circle,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BrandType } from "@/components/BrandBadge";

type InvoiceStatus = "paid" | "pending" | "overdue" | "draft" | "void";

interface LineItem {
  id: string;
  name: string;
  description: string;
  brand: BrandType;
  qty: number;
  rate: number;
}

const brandClasses: Record<BrandType, string> = {
  Sankofa: "invoice-brand-sankofa",
  Lighthouse: "invoice-brand-lighthouse",
  Centex: "invoice-brand-centex",
  "GFAM Media Studios": "invoice-brand-gfam",
};

const statusColors: Record<InvoiceStatus, string> = {
  paid: "paid",
  pending: "draft",
  overdue: "overdue",
  draft: "draft",
  void: "draft",
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

const getInvoiceStatus = (status: string, dueAt: number, now: number): InvoiceStatus => {
  if (status === "paid") return "paid";
  if (status === "draft") return "draft";
  if (status === "void") return "void";
  if (status === "uncollectible") return "overdue";
  return now > dueAt ? "overdue" : "pending";
};

const formatStatusLabel = (status: InvoiceStatus) =>
  status.charAt(0).toUpperCase() + status.slice(1);

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceIdParam = params.id;
  const invoiceId = Array.isArray(invoiceIdParam) ? invoiceIdParam[0] : invoiceIdParam;
  const hasValidInvoiceId = typeof invoiceId === "string" && invoiceId.length > 10;
  const invoiceWithDetails = useQuery(
    api.invoiceActions.getInvoiceWithLineItems,
    hasValidInvoiceId ? { invoiceId: invoiceId as Id<"invoices"> } : "skip"
  );
  const createCheckoutSessionForInvoice = useAction(
    api.invoiceActions.createCheckoutSessionForInvoice
  );
  const markInvoiceAsPaid = useAction(api.invoiceActions.markInvoiceAsPaid);
  const deleteInvoice = useAction(api.invoiceActions.deleteInvoice);
  const cancelSubscriptionInvoiceCycle = useAction(
    api.invoiceActions.cancelSubscriptionInvoiceCycle
  );
  const voidInvoiceAction = useAction(api.invoiceActions.voidInvoice);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [isCancelingCycle, setIsCancelingCycle] = useState(false);
  const [isVoidingInvoice, setIsVoidingInvoice] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendStatusMessage, setSendStatusMessage] = useState<string | null>(null);
  const actionsDropdownRef = useRef<HTMLDivElement | null>(null);

  const notes =
    invoiceWithDetails?.notes ||
    "Payment is due within 14 days. Please include the invoice number in your payment reference.";

  const lineItems = useMemo<LineItem[]>(() => {
    if (!invoiceWithDetails) return [];

    return invoiceWithDetails.lineItems.map((item) => {
      const rateCents = item.customPriceCents ?? item.unitPriceCents;
      return {
        id: item._id,
        name: item.name,
        description: item.description ?? "",
        brand: item.brand as BrandType,
        qty: item.quantity,
        rate: rateCents / 100,
      };
    });
  }, [invoiceWithDetails]);

  const invoice = useMemo(() => {
    if (!invoiceWithDetails) return null;

    const createdAt = invoiceWithDetails.createdAt;
    const dueAt = createdAt + 14 * 24 * 60 * 60 * 1000;
    const status = getInvoiceStatus(invoiceWithDetails.status, dueAt, Date.now());

    return {
      invoiceNumber: invoiceWithDetails.invoiceNumber,
      client: {
        name: invoiceWithDetails.client?.name || "Unknown Client",
        email: invoiceWithDetails.client?.email || "No email",
      },
      date: formatFullDate(new Date(createdAt)),
      dueDate: formatShortDate(new Date(dueAt)),
      brand: invoiceWithDetails.primaryBrand,
      status,
    };
  }, [invoiceWithDetails]);

  const canSendInvoice =
    invoiceWithDetails?.status === "draft" ||
    invoiceWithDetails?.status === "open" ||
    invoiceWithDetails?.status === "uncollectible";
  const isSubscriptionInvoice =
    !!invoiceWithDetails &&
    (
      invoiceWithDetails.sourceType === "subscription" ||
      !!invoiceWithDetails.subscriptionId ||
      !!invoiceWithDetails.stripeSubscriptionId ||
      invoiceWithDetails.invoiceNumber.startsWith("INV-SUB-")
    );
  const canAdjustSubscriptionDraft =
    isSubscriptionInvoice && invoiceWithDetails?.status === "draft";
  const canMarkAsPaid =
    !!invoiceWithDetails &&
    invoiceWithDetails.status !== "paid" &&
    invoiceWithDetails.status !== "void";
  const canDeleteInvoice =
    !!invoiceWithDetails &&
    invoiceWithDetails.status === "draft" &&
    !isSubscriptionInvoice;
  const canCancelSubscriptionCycle =
    isSubscriptionInvoice && invoiceWithDetails?.status === "draft";
  const canVoidInvoice =
    !!invoiceWithDetails &&
    (invoiceWithDetails.status === "open" ||
      invoiceWithDetails.status === "uncollectible");

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

  const getEmailStatusMessage = (emailSent?: boolean, emailSkipped?: string) => {
    if (emailSent) {
      return "Invoice sent and email delivered via Resend.";
    }
    if (!emailSkipped) {
      return "Invoice sent, but email status is unknown.";
    }
    if (emailSkipped === "missing_resend_config") {
      return "Invoice sent, but email was skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL.";
    }
    if (emailSkipped === "missing_checkout_url") {
      return "Invoice sent, but email was skipped: checkout URL was missing.";
    }
    if (emailSkipped.startsWith("send_failed:")) {
      return `Invoice sent, but email failed: ${emailSkipped.replace("send_failed:", "")}`;
    }
    return `Invoice sent, but email was skipped: ${emailSkipped}`;
  };

  const handleSendInvoice = async () => {
    if (!canSendInvoice || !hasValidInvoiceId) return;

    setIsSending(true);
    setSendError(null);
    setSendStatusMessage(null);

    try {
      const origin = window.location.origin;
      const result = await createCheckoutSessionForInvoice({
        invoiceId: invoiceId as Id<"invoices">,
        successUrl: `${origin}/payment/success?invoiceId=${invoiceId}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/payment/cancelled?invoiceId=${invoiceId}`,
      });

      if (!result.success) {
        setSendError(result.error || "Failed to send invoice");
        return;
      }

      setSendStatusMessage(
        getEmailStatusMessage(result.emailSent, result.emailSkipped)
      );
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setIsSending(false);
    }
  };

  const handleChangeSubscriptionPrice = () => {
    if (!invoiceWithDetails || !hasValidInvoiceId) return;
    setActionsOpen(false);

    if (invoiceWithDetails.subscriptionId) {
      void router.push(`/dashboard/subscriptions/${invoiceWithDetails.subscriptionId}`);
      return;
    }

    setSendError("Subscription not found for this invoice.");
  };

  const handleOneTimeDraftAdjustment = () => {
    if (!invoiceWithDetails || !hasValidInvoiceId) return;
    setActionsOpen(false);
    void router.push(`/dashboard/invoices/${invoiceId}/adjust`);
  };

  const handleEditInvoice = () => {
    if (!invoiceWithDetails || !hasValidInvoiceId) return;
    setActionsOpen(false);
    void router.push(`/dashboard/invoices/${invoiceId}/edit`);
  };

  const handleMarkAsPaid = async () => {
    if (!invoiceWithDetails || !hasValidInvoiceId || !canMarkAsPaid) return;

    setActionsOpen(false);
    setIsMarkingPaid(true);
    setSendError(null);
    setSendStatusMessage(null);

    try {
      const result = await markInvoiceAsPaid({
        invoiceId: invoiceId as Id<"invoices">,
      });

      if (!result.success) {
        setSendError(result.error || "Failed to mark invoice as paid");
        return;
      }

      setSendStatusMessage("Invoice marked as paid.");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to mark invoice as paid");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceWithDetails || !hasValidInvoiceId || !canDeleteInvoice) return;

    setActionsOpen(false);
    const confirmed = window.confirm(
      "Delete this draft invoice? This permanently removes the invoice and its line items.",
    );
    if (!confirmed) return;

    setIsDeletingInvoice(true);
    setSendError(null);
    setSendStatusMessage(null);

    try {
      const result = await deleteInvoice({
        invoiceId: invoiceId as Id<"invoices">,
      });

      if (!result.success) {
        setSendError(result.error || "Failed to delete invoice");
        return;
      }

      void router.push("/dashboard/invoices");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setIsDeletingInvoice(false);
    }
  };

  const handleCancelSubscriptionCycle = async () => {
    if (!invoiceWithDetails || !hasValidInvoiceId || !canCancelSubscriptionCycle) return;

    setActionsOpen(false);
    const confirmed = window.confirm(
      "Cancel this cycle's draft invoice? Future subscription cycles are not changed.",
    );
    if (!confirmed) return;

    setIsCancelingCycle(true);
    setSendError(null);
    setSendStatusMessage(null);

    try {
      const result = await cancelSubscriptionInvoiceCycle({
        invoiceId: invoiceId as Id<"invoices">,
      });

      if (!result.success) {
        setSendError(result.error || "Failed to cancel subscription invoice cycle");
        return;
      }

      setSendStatusMessage("Subscription cycle invoice cancelled.");
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : "Failed to cancel subscription invoice cycle",
      );
    } finally {
      setIsCancelingCycle(false);
    }
  };

  const handleVoidInvoice = async () => {
    if (!invoiceWithDetails || !hasValidInvoiceId || !canVoidInvoice) return;

    setActionsOpen(false);
    const confirmed = window.confirm(
      "Void this invoice? The client will no longer be able to pay it.",
    );
    if (!confirmed) return;

    setIsVoidingInvoice(true);
    setSendError(null);
    setSendStatusMessage(null);

    try {
      const result = await voidInvoiceAction({
        invoiceId: invoiceId as Id<"invoices">,
      });

      if (!result.success) {
        setSendError(result.error || "Failed to void invoice");
        return;
      }

      setSendStatusMessage("Invoice voided.");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to void invoice");
    } finally {
      setIsVoidingInvoice(false);
    }
  };

  useEffect(() => {
    if (!actionsOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsDropdownRef.current?.contains(target)) return;
      setActionsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsOpen]);

  if (!hasValidInvoiceId) {
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

  if (invoiceWithDetails === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-xl font-semibold text-content mb-2">Loading Invoice...</h2>
        <p className="text-content-muted mb-6">Fetching invoice details from the database.</p>
      </div>
    );
  }

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
      <header className="relative z-40 mb-6 md:mb-8 animate-fade-in-up">
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

            <button className="btn-secondary h-12">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button className="btn-secondary h-12">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {canSendInvoice && (
              <button className="btn-primary h-12" onClick={handleSendInvoice} disabled={isSending}>
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isSending ? "Sending..." : "Send Invoice"}
                </span>
              </button>
            )}

            {/* More Actions Dropdown */}
            <div ref={actionsDropdownRef} className="dropdown relative z-50">
              <button
                className="btn-secondary !px-2.5"
                onClick={() => setActionsOpen((prev) => !prev)}
                aria-expanded={actionsOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {actionsOpen && (
                <div className="dropdown-menu right-0 left-auto">
                  {canAdjustSubscriptionDraft ? (
                    <>
                      <button className="dropdown-item" onClick={handleChangeSubscriptionPrice}>
                        <Edit2 className="w-4 h-4" />
                        Change Subscription Price
                      </button>
                      <button className="dropdown-item" onClick={handleOneTimeDraftAdjustment}>
                        <Edit2 className="w-4 h-4" />
                        One-Time Draft Adjustment
                      </button>
                      <button
                        className="dropdown-item text-error disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleCancelSubscriptionCycle}
                        disabled={
                          !canCancelSubscriptionCycle ||
                          isCancelingCycle ||
                          isMarkingPaid ||
                          isDeletingInvoice ||
                          isVoidingInvoice
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                        {isCancelingCycle ? "Cancelling..." : "Cancel This Cycle Invoice"}
                      </button>
                    </>
                  ) : (
                    <button
                      className="dropdown-item"
                      onClick={isSubscriptionInvoice ? handleChangeSubscriptionPrice : handleEditInvoice}
                    >
                      <Edit2 className="w-4 h-4" />
                      {isSubscriptionInvoice ? "Edit Subscription" : "Edit Invoice"}
                    </button>
                  )}
                  <button
                    className="dropdown-item disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleMarkAsPaid}
                    disabled={
                      !canMarkAsPaid ||
                      isMarkingPaid ||
                      isDeletingInvoice ||
                      isCancelingCycle ||
                      isVoidingInvoice
                    }
                  >
                    <CheckCircle className="w-4 h-4" />
                    {isMarkingPaid ? "Marking..." : "Mark as Paid"}
                  </button>
                  {canVoidInvoice && (
                    <button
                      className="dropdown-item text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleVoidInvoice}
                      disabled={
                        !canVoidInvoice ||
                        isVoidingInvoice ||
                        isMarkingPaid ||
                        isDeletingInvoice ||
                        isCancelingCycle
                      }
                    >
                      <XCircle className="w-4 h-4" />
                      {isVoidingInvoice ? "Voiding..." : "Void Invoice"}
                    </button>
                  )}
                  {canDeleteInvoice && (
                  <button
                    className="dropdown-item text-error disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleDeleteInvoice}
                    disabled={
                      !canDeleteInvoice ||
                      isMarkingPaid ||
                      isDeletingInvoice ||
                      isCancelingCycle ||
                      isVoidingInvoice
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeletingInvoice ? "Deleting..." : "Delete Invoice"}
                  </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {sendError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {sendError}
        </div>
      )}

      {sendStatusMessage && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {sendStatusMessage}
        </div>
      )}

      {/* Invoice Document */}
      <div className="invoice-document-wrapper !bg-transparent !p-0">
        <div className="invoice-sheet !max-w-none">
          {/* Invoice Header */}
          <div className="invoice-header">
            <div>
              <h2 className="invoice-company-name">Sankofa Marketing Group</h2>
              <p className="invoice-client-detail mt-2">
                813 Lake Air Dr Suite B<br />
                Waco, TX 76710
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="invoice-label">Invoice</p>
              <p className="invoice-number">{invoice.invoiceNumber}</p>
              <div className="mt-3">
                <span className={`invoice-status-badge ${statusColors[invoice.status]}`}>
                  <Circle className="w-2 h-2 fill-current" />
                  {formatStatusLabel(invoice.status)}
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
            <p className="invoice-footer-brand">Sankofa Marketing Group</p>
          </div>
        </div>
      </div>
    </>
  );
}
