"use client";

import { useState } from "react";
import { Download, ArrowLeft, Printer, Plus, Minus, Trash2, Edit2, Check, X } from "lucide-react";
import type { WizardClient, WizardService } from "@/data/wizard-sample";

interface SelectedService {
  service: WizardService;
  quantity: number;
  customRate?: number; // Allow custom rate override
}

type BrandType = "Sankofa" | "Lighthouse" | "Centex" | "GFAM Media Studios";

interface InvoiceDocumentProps {
  client: WizardClient;
  selectedServices: Map<string, SelectedService>;
  notes: string;
  invoiceNumber?: string;
  status?: "draft" | "sent" | "paid" | "overdue";
  onBack?: () => void;
  onUpdateServices?: (services: Map<string, SelectedService>) => void;
  onUpdateNotes?: (notes: string) => void;
  editable?: boolean;
}

export function InvoiceDocument({
  client,
  selectedServices,
  notes,
  invoiceNumber = "INV-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
  status = "draft",
  onBack,
  onUpdateServices,
  onUpdateNotes,
  editable = true,
}: InvoiceDocumentProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<number>(0);
  const [editingNotes, setEditingNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  const items = Array.from(selectedServices.values());
  const subtotal = items.reduce((sum, item) => {
    const rate = item.customRate ?? item.service.baseRate;
    return sum + rate * item.quantity;
  }, 0);
  const tax = 0;
  const discount = 0;
  const total = subtotal + tax - discount;

  const brands = [...new Set(items.map((item) => item.service.brand))];
  const primaryBrand = brands.length === 1 ? brands[0] : "GFAM Agency";

  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  const getBrandClass = (brand: BrandType) => {
    const brandClasses: Record<BrandType, string> = {
      Sankofa: "invoice-brand-sankofa",
      Lighthouse: "invoice-brand-lighthouse",
      Centex: "invoice-brand-centex",
      "GFAM Media Studios": "invoice-brand-gfam",
    };
    return brandClasses[brand] || "invoice-brand-gfam";
  };

  const handlePrint = () => {
    window.print();
  };

  const handleQuantityChange = (serviceId: string, delta: number) => {
    if (!onUpdateServices) return;
    const newServices = new Map(selectedServices);
    const item = newServices.get(serviceId);
    if (item) {
      const newQty = Math.max(1, item.quantity + delta);
      newServices.set(serviceId, { ...item, quantity: newQty });
      onUpdateServices(newServices);
    }
  };

  const handleRemoveItem = (serviceId: string) => {
    if (!onUpdateServices) return;
    const newServices = new Map(selectedServices);
    newServices.delete(serviceId);
    onUpdateServices(newServices);
  };

  const handleStartEditRate = (serviceId: string, currentRate: number) => {
    setEditingItemId(serviceId);
    setEditingRate(currentRate);
  };

  const handleSaveRate = (serviceId: string) => {
    if (!onUpdateServices) return;
    const newServices = new Map(selectedServices);
    const item = newServices.get(serviceId);
    if (item) {
      newServices.set(serviceId, { ...item, customRate: editingRate });
      onUpdateServices(newServices);
    }
    setEditingItemId(null);
  };

  const handleCancelEditRate = () => {
    setEditingItemId(null);
  };

  const handleSaveNotes = () => {
    if (onUpdateNotes) {
      onUpdateNotes(localNotes);
    }
    setEditingNotes(false);
  };

  const handleCancelNotes = () => {
    setLocalNotes(notes);
    setEditingNotes(false);
  };

  const getItemRate = (item: SelectedService) => {
    return item.customRate ?? item.service.baseRate;
  };

  return (
    <div className="invoice-document-wrapper">
      {/* Action Bar */}
      <div className="max-w-4xl mx-auto mb-4 sm:mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Wizard</span>
          </button>
        )}
        <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto">
          <button
            onClick={handlePrint}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="sm:inline">Print</span>
          </button>
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white text-gray-900 font-medium hover:bg-gray-100 transition-colors">
            <Download className="w-4 h-4" />
            <span className="sm:inline">Download</span>
          </button>
        </div>
      </div>

      {/* Invoice Sheet */}
      <main className="invoice-sheet">
        {/* Header */}
        <header className="invoice-header">
          <div>
            <h1 className="invoice-company-name">{primaryBrand}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {brands.length > 1 ? "A GFAM Agency Invoice" : `${primaryBrand} Services`}
            </p>
          </div>
          <div className="text-right">
            <p className="invoice-label">Invoice</p>
            <p className="invoice-number">{invoiceNumber}</p>
            <div className="mt-3">
              <span className={`invoice-status-badge ${status}`}>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: "currentColor" }}
                />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          </div>
        </header>

        {/* Bill To & Dates */}
        <div className="invoice-grid">
          <div>
            <p className="invoice-section-label">Bill To</p>
            <p className="invoice-client-name">{client.company}</p>
            <p className="invoice-client-detail">{client.name}</p>
            <p className="invoice-client-detail">{client.email}</p>
          </div>
          <div>
            <p className="invoice-section-label">Invoice Details</p>
            <div className="space-y-1">
              <div className="invoice-date-row">
                <span className="invoice-date-label">Issue Date</span>
                <span className="invoice-date-value">{formatDate(today)}</span>
              </div>
              <div className="invoice-date-row">
                <span className="invoice-date-label">Due Date</span>
                <span className="invoice-date-value">{formatDate(dueDate)}</span>
              </div>
              <div className="invoice-date-row">
                <span className="invoice-date-label">Payment Terms</span>
                <span className="invoice-date-value">Net 30</span>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="invoice-table-wrapper">
          <table className="invoice-table">
            <thead className="invoice-table-header">
              <tr>
                <th>Description</th>
                <th className="w-24 sm:w-32 text-center">Qty</th>
                <th className="w-24 sm:w-32 text-right">Rate</th>
                <th className="w-24 sm:w-28 text-right">Amount</th>
                {editable && <th className="w-10 sm:w-12 print:hidden"></th>}
              </tr>
            </thead>
          <tbody>
            {items.map(({ service, quantity, customRate }, index) => {
              const rate = customRate ?? service.baseRate;
              const isEditing = editingItemId === service.id;

              return (
                <tr
                  key={service.id}
                  className="invoice-table-row group"
                  style={{ animationDelay: `${0.1 + index * 0.05}s` }}
                >
                  <td>
                    <div className="invoice-item-name">{service.name}</div>
                    {service.description && (
                      <div className="invoice-item-description">{service.description}</div>
                    )}
                    <span className={`invoice-item-brand ${getBrandClass(service.brand as BrandType)}`}>
                      {service.brand}
                    </span>
                  </td>

                  {/* Editable Quantity */}
                  <td className="text-center">
                    {editable ? (
                      <div className="inline-flex items-center gap-1 print:hidden">
                        <button
                          onClick={() => handleQuantityChange(service.id, -1)}
                          disabled={quantity <= 1}
                          className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-medium">{quantity}</span>
                        <button
                          onClick={() => handleQuantityChange(service.id, 1)}
                          className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span>{quantity}</span>
                    )}
                    <span className="hidden print:inline">{quantity}</span>
                  </td>

                  {/* Editable Rate */}
                  <td className="text-right">
                    {isEditing ? (
                      <div className="inline-flex items-center gap-1 print:hidden">
                        <span className="text-gray-400">$</span>
                        <input
                          type="number"
                          value={editingRate}
                          onChange={(e) => setEditingRate(parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 rounded bg-gray-700 border border-gray-600 text-white text-right text-sm focus:outline-none focus:border-gray-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveRate(service.id)}
                          className="w-6 h-6 rounded flex items-center justify-center text-green-400 hover:bg-gray-700 transition-colors"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={handleCancelEditRate}
                          className="w-6 h-6 rounded flex items-center justify-center text-red-400 hover:bg-gray-700 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <span>{formatCurrency(rate)}</span>
                        {editable && (
                          <button
                            onClick={() => handleStartEditRate(service.id, rate)}
                            className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all print:hidden"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <span className="hidden print:inline">{formatCurrency(rate)}</span>
                  </td>

                  {/* Amount */}
                  <td className="text-right font-medium">
                    {formatCurrency(rate * quantity)}
                  </td>

                  {/* Remove Button */}
                  {editable && (
                    <td className="text-center print:hidden">
                      <button
                        onClick={() => handleRemoveItem(service.id)}
                        className="w-8 h-8 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>

        {/* Empty State */}
        {items.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-gray-500">No services added to this invoice</p>
            {onBack && (
              <button
                onClick={onBack}
                className="mt-4 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Go back to add services
              </button>
            )}
          </div>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <div className="invoice-totals">
            <div className="invoice-totals-box">
              <div className="invoice-total-row">
                <span className="invoice-total-label">Subtotal</span>
                <span className="invoice-total-value">{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="invoice-total-row">
                  <span className="invoice-total-label">Discount</span>
                  <span className="invoice-total-value text-green-400">
                    -{formatCurrency(discount)}
                  </span>
                </div>
              )}
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
        )}

        {/* Notes */}
        <div className="invoice-notes">
          <div className="flex items-center justify-between mb-2">
            <p className="invoice-notes-title">Notes</p>
            {editable && !editingNotes && (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-gray-500 hover:text-white transition-colors print:hidden"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-3 print:hidden">
              <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                placeholder="Add notes or special instructions..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm resize-none focus:outline-none focus:border-gray-600"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelNotes}
                  className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNotes}
                  className="px-3 py-1.5 rounded text-sm bg-white text-gray-900 font-medium hover:bg-gray-100 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="invoice-notes-content">
              {notes || <span className="text-gray-600 italic">No notes added</span>}
            </p>
          )}
        </div>

        {/* Participating Brands (if multi-brand) */}
        {brands.length > 1 && (
          <div className="mt-6 p-4 rounded-lg" style={{ background: "rgba(31, 41, 55, 0.3)" }}>
            <p className="text-xs font-medium tracking-wider uppercase text-gray-500 mb-3">
              Services Provided By
            </p>
            <div className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <span key={brand} className={`invoice-item-brand ${getBrandClass(brand as BrandType)}`}>
                  {brand}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="invoice-footer">
          <p className="invoice-footer-text">Thank you for your business</p>
          <p className="invoice-footer-brand">GFAM Agency</p>
          <p className="text-xs text-gray-600 mt-2">
            Sankofa • Lighthouse • Centex • GFAM Media Studios
          </p>
        </footer>
      </main>
    </div>
  );
}

export default InvoiceDocument;
