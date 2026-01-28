"use client";

import { useState, useMemo } from "react";
import { X, ChevronUp, ChevronDown, ShoppingCart, Tag } from "lucide-react";
import type { WizardClient, SelectedServiceItem } from "@/data/wizard-sample";

interface LivePreviewSidebarProps {
  client: WizardClient | null;
  selectedServices: Map<string, SelectedServiceItem>;
  onRemoveService: (serviceId: string) => void;
}

// Brand color mapping
const brandColors: Record<string, string> = {
  Sankofa: "#10B981",
  Lighthouse: "#8B5CF6",
  Centex: "#F59E0B",
  "GFAM Media Studios": "#3B82F6",
};

export function LivePreviewSidebar({
  client,
  selectedServices,
  onRemoveService,
}: LivePreviewSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate totals (using custom rate if set, otherwise base rate)
  const items = Array.from(selectedServices.values());
  const getEffectiveRate = (item: SelectedServiceItem) =>
    item.customRate ?? item.service.baseRate;

  const total = items.reduce(
    (sum, item) => sum + getEffectiveRate(item) * item.quantity,
    0
  );

  // Get unique brands and calculate breakdown
  const { brandTotals, participatingBrands } = useMemo(() => {
    const totals: Record<string, number> = {};
    const brands = new Set<string>();

    items.forEach((item) => {
      const brand = item.service.brand;
      brands.add(brand);
      totals[brand] = (totals[brand] || 0) + getEffectiveRate(item) * item.quantity;
    });

    return {
      brandTotals: totals,
      participatingBrands: [...brands],
    };
  }, [items]);

  // Check if any items have custom pricing
  const hasCustomPricing = items.some(
    (item) => item.customRate !== undefined || item.service.isCustom
  );

  const previewContent = (
    <>
      {/* Client */}
      <div>
        <p className="text-meta text-content-muted uppercase tracking-wider mb-2">
          Client
        </p>
        {client ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-sm font-medium text-white flex-shrink-0">
              {client.initials}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-content text-sm truncate">{client.company}</p>
              <p className="text-meta text-content-muted truncate">{client.name}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-content-muted italic">No client selected</p>
        )}
      </div>

      {/* Line items */}
      <div>
        <p className="text-meta text-content-muted uppercase tracking-wider mb-2">
          Services ({items.length})
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-content-muted italic">No services selected</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {items.map((item) => {
              const { service, quantity, customRate } = item;
              const effectiveRate = getEffectiveRate(item);
              const hasCustomRate = customRate !== undefined && customRate !== service.baseRate;
              const isCustomItem = service.isCustom;
              const brandColor = brandColors[service.brand] || brandColors["GFAM Media Studios"];

              return (
                <div
                  key={service.id}
                  className="flex items-center justify-between gap-2 text-sm group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: brandColor }}
                    />
                    <span className="truncate text-content-secondary">
                      {isCustomItem && (
                        <Tag className="w-2.5 h-2.5 inline mr-1 opacity-60" />
                      )}
                      {service.name}
                      {quantity > 1 && ` (x${quantity})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className="font-medium"
                      style={{
                        color: hasCustomRate || isCustomItem ? brandColor : undefined,
                      }}
                    >
                      {formatCurrency(effectiveRate * quantity)}
                    </span>
                    <button
                      onClick={() => onRemoveService(service.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-hover rounded transition-all"
                    >
                      <X className="w-3 h-3 text-content-muted" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Brand breakdown */}
      {Object.keys(brandTotals).length > 0 && (
        <div>
          <p className="text-meta text-content-muted uppercase tracking-wider mb-2">
            By Brand
          </p>
          <div className="space-y-2">
            {Object.entries(brandTotals).map(([brand, amount]) => {
              const percentage = total > 0 ? (amount / total) * 100 : 0;
              const brandColor = brandColors[brand] || brandColors["GFAM Media Studios"];

              return (
                <div key={brand} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: brandColor }}
                    />
                    <span className="text-content-secondary">{brand}</span>
                    <span className="text-content-muted text-xs">
                      ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <span className="font-medium" style={{ color: brandColor }}>
                    {formatCurrency(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="pt-4 border-t border-border">
        <div className="flex justify-between items-center">
          <span className="font-medium text-content">Total</span>
          <span className="text-xl font-semibold text-brand-primary">
            {formatCurrency(total)}
          </span>
        </div>

        {/* Custom pricing indicator */}
        {hasCustomPricing && (
          <p className="text-xs text-content-muted mt-2 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            Includes custom pricing
          </p>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-80 flex-shrink-0">
        <div className="sticky top-8">
          <div className="card p-6 space-y-6">
            <h3 className="font-semibold text-content">Invoice Preview</h3>
            {previewContent}
          </div>
        </div>
      </aside>

      {/* Mobile/Tablet - Collapsible Card */}
      <div className="lg:hidden">
        <div className="card overflow-hidden">
          {/* Collapsed Header - Always visible */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <p className="font-medium text-content">Invoice Preview</p>
                <p className="text-sm text-content-muted">
                  {items.length} service{items.length !== 1 ? "s" : ""} •{" "}
                  <span className="text-brand-primary">
                    {formatCurrency(total)}
                  </span>
                </p>
              </div>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-content-muted" />
            ) : (
              <ChevronUp className="w-5 h-5 text-content-muted" />
            )}
          </button>

          {/* Expandable Content */}
          <div
            className={`transition-all duration-300 overflow-hidden ${
              isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
              {previewContent}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default LivePreviewSidebar;
