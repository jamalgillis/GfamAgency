"use client";

import { FileText, Tag } from "lucide-react";
import { BrandBadge } from "@/components/BrandBadge";
import type { WizardClient, SelectedServiceItem } from "@/data/wizard-sample";

interface InvoicePreviewProps {
  client: WizardClient;
  selectedServices: Map<string, SelectedServiceItem>;
  notes: string;
  onNotesChange: (notes: string) => void;
}

export function InvoicePreview({
  client,
  selectedServices,
  notes,
  onNotesChange,
}: InvoicePreviewProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const items = Array.from(selectedServices.values());

  // Use custom rate if set, otherwise use base rate
  const getEffectiveRate = (item: SelectedServiceItem) =>
    item.customRate ?? item.service.baseRate;

  const total = items.reduce(
    (sum, item) => sum + getEffectiveRate(item) * item.quantity,
    0
  );

  // Check if any items have custom pricing
  const hasCustomPricing = items.some(
    (item) => item.customRate !== undefined || item.service.isCustom
  );

  // Determine participating brands
  const brands = [...new Set(items.map((item) => item.service.brand))];
  const primaryBrand = brands.length === 1 ? brands[0] : null;

  return (
    <div className="space-y-6">
      {/* Invoice header card */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-brand-sankofa to-brand-gfam flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-content">New Invoice</h3>
              <p className="text-sm text-content-muted">
                {primaryBrand ? `${primaryBrand} Invoice` : "GFAM Agency Invoice"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-content">{formatCurrency(total)}</p>
            <p className="text-sm text-content-muted">{items.length} item(s)</p>
          </div>
        </div>

        {/* Client info */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-tertiary">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-medium"
            style={{
              background: client.avatarBg || "var(--avatar-bg)",
              color: client.avatarBg ? "white" : "var(--color-text-secondary)",
            }}
          >
            {client.initials}
          </div>
          <div>
            <p className="font-medium text-content">{client.company}</p>
            <p className="text-sm text-content-secondary">{client.name}</p>
            <p className="text-sm text-content-muted">{client.email}</p>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h4 className="font-medium text-content">Line Items</h4>
          {hasCustomPricing && (
            <span className="text-meta text-brand-sankofa flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Includes custom pricing
            </span>
          )}
        </div>
        <div className="divide-y divide-border">
          {items.map((item) => {
            const { service, quantity, customRate } = item;
            const effectiveRate = getEffectiveRate(item);
            const hasCustomRate = customRate !== undefined && customRate !== service.baseRate;
            const isCustomItem = service.isCustom;

            return (
              <div key={service.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BrandBadge brand={service.brand} variant="dot" showLabel={false} />
                  <div>
                    <p className="font-medium text-content flex items-center gap-2">
                      {service.name}
                      {isCustomItem && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-sankofa/10 text-brand-sankofa">
                          <Tag className="w-2.5 h-2.5" />
                          Custom
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-content-muted">
                      <span className={hasCustomRate ? "text-brand-sankofa" : ""}>
                        {formatCurrency(effectiveRate)}
                      </span>
                      <span>/ea x {quantity}</span>
                      {hasCustomRate && (
                        <span className="ml-2 text-content-muted opacity-70">
                          (was {formatCurrency(service.baseRate)}/ea)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <span className={`font-semibold ${hasCustomRate || isCustomItem ? "text-brand-sankofa" : "text-content"}`}>
                  {formatCurrency(effectiveRate * quantity)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t border-border flex justify-between items-center bg-surface-tertiary">
          <span className="font-medium text-content">Total</span>
          <span className="text-xl font-semibold text-content">{formatCurrency(total)}</span>
        </div>
      </div>

      {/* Participating brands */}
      <div className="card p-4">
        <p className="text-sm text-content-muted mb-3">Participating Brands</p>
        <div className="flex flex-wrap gap-2">
          {brands.map((brand) => (
            <BrandBadge key={brand} brand={brand} variant="pill" />
          ))}
        </div>
        {brands.length > 1 && (
          <p className="text-meta text-content-muted mt-3">
            Multi-brand invoice will be attributed to GFAM Agency
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-content mb-2">
          Invoice Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add any notes or special instructions for this invoice..."
          rows={3}
          className="input-field w-full resize-none"
        />
      </div>
    </div>
  );
}

export default InvoicePreview;
