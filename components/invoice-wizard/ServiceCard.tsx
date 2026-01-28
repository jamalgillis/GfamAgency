"use client";

import { useState } from "react";
import { Check, Minus, Plus, Tag, Edit2 } from "lucide-react";
import type { WizardService } from "@/data/wizard-sample";

interface ServiceCardProps {
  service: WizardService;
  selected: boolean;
  quantity: number;
  customRate?: number;
  onToggle: () => void;
  onQuantityChange: (qty: number) => void;
  onCustomRateChange?: (rate: number) => void;
}

// Map brand to CSS color class
const brandColorMap: Record<string, string> = {
  Sankofa: "brand-sankofa",
  Lighthouse: "brand-lighthouse",
  Centex: "brand-centex",
  "GFAM Media Studios": "brand-gfam",
};

export function ServiceCard({
  service,
  selected,
  quantity,
  customRate,
  onToggle,
  onQuantityChange,
  onCustomRateChange,
}: ServiceCardProps) {
  const [showRateEditor, setShowRateEditor] = useState(false);
  const [editingRate, setEditingRate] = useState("");

  const brandClass = brandColorMap[service.brand] || "brand-gfam";

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Use custom rate if set, otherwise use base rate
  const effectiveRate = customRate ?? service.baseRate;
  const hasCustomRate = customRate !== undefined && customRate !== service.baseRate;

  const handleRateEdit = () => {
    setEditingRate(effectiveRate.toString());
    setShowRateEditor(true);
  };

  const handleRateSave = () => {
    const newRate = parseFloat(editingRate);
    if (!isNaN(newRate) && newRate >= 0 && onCustomRateChange) {
      onCustomRateChange(newRate);
    }
    setShowRateEditor(false);
  };

  const handleRateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRateSave();
    } else if (e.key === "Escape") {
      setShowRateEditor(false);
    }
  };

  return (
    <div
      className={`service-card transition-all duration-200 ${
        selected ? "selected ring-2 ring-current" : ""
      } ${service.isCustom ? "custom-item" : ""}`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <div
          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200 border-2 ${
            selected
              ? "bg-brand-primary border-brand-primary"
              : "bg-transparent border-border"
          }`}
        >
          {selected && <Check className="w-3.5 h-3.5 text-white" />}
        </div>

        {/* Service info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-content">{service.name}</h4>
                {service.isCustom && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-primary/10 text-brand-primary">
                    <Tag className="w-2.5 h-2.5" />
                    Custom
                  </span>
                )}
              </div>
              <p className="text-sm text-content-muted mt-0.5">
                {service.description}
              </p>
              {/* Brand label */}
              <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${brandClass}-pill`}>
                {service.brand}
              </span>
            </div>
            <div className="text-right flex-shrink-0">
              {showRateEditor && selected ? (
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-content-muted">$</span>
                  <input
                    type="number"
                    value={editingRate}
                    onChange={(e) => setEditingRate(e.target.value)}
                    onBlur={handleRateSave}
                    onKeyDown={handleRateKeyDown}
                    className="w-20 px-2 py-1 text-right font-semibold rounded border border-brand-primary bg-surface text-content focus:outline-none focus:ring-2 focus:ring-brand-primary transition-colors"
                    autoFocus
                    min="0"
                    step="0.01"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className={`font-semibold ${hasCustomRate ? "text-brand-primary" : ""}`}>
                    {formatCurrency(effectiveRate)}
                    <span className="text-content-muted font-normal text-sm">/ea</span>
                  </span>
                  {selected && onCustomRateChange && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRateEdit();
                      }}
                      className="p-1 rounded hover:bg-surface-hover text-content-muted hover:text-content transition-colors"
                      title="Edit rate"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              {hasCustomRate && !showRateEditor && (
                <span className="text-meta text-content-muted">
                  was <span className="line-through">{formatCurrency(service.baseRate)}</span>/ea
                </span>
              )}
            </div>
          </div>

          {/* Quantity stepper (only show when selected) */}
          {selected && (
            <div
              className="flex items-center gap-3 mt-3 pt-3 border-t border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm text-content-muted">Qty:</span>
              <div className="quantity-stepper">
                <button
                  className="quantity-btn"
                  onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-medium">
                  {quantity}
                </span>
                <button
                  className="quantity-btn"
                  onClick={() => onQuantityChange(quantity + 1)}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm text-content-muted ml-auto">
                Subtotal:{" "}
                <span className={`font-medium ${hasCustomRate ? "text-brand-primary" : ""}`}>
                  {formatCurrency(effectiveRate * quantity)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ServiceCard;
