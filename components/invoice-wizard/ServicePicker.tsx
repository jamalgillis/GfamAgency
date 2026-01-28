"use client";

import { useState } from "react";
import { Search, Plus, X, DollarSign, Tag, FileText } from "lucide-react";
import { ServiceCard } from "./ServiceCard";
import type { WizardService, SelectedServiceItem } from "@/data/wizard-sample";
import { brandTabs, getServicesByBrand } from "@/data/wizard-sample";
import type { BrandType } from "@/lib/brand-theme";

interface ServicePickerProps {
  services: WizardService[];
  selectedServices: Map<string, SelectedServiceItem>;
  onToggleService: (service: WizardService) => void;
  onQuantityChange: (serviceId: string, quantity: number) => void;
  onAddCustomService: (service: WizardService) => void;
  onCustomRateChange?: (serviceId: string, customRate: number) => void;
}

export function ServicePicker({
  services,
  selectedServices,
  onToggleService,
  onQuantityChange,
  onAddCustomService,
  onCustomRateChange,
}: ServicePickerProps) {
  const [activeBrand, setActiveBrand] = useState<BrandType>("Sankofa");
  const [search, setSearch] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);

  // Custom service form state
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customBrand, setCustomBrand] = useState<BrandType>("Sankofa");
  const [customCategory, setCustomCategory] = useState("custom");

  // Count selected services per brand
  const getSelectedCount = (brand: BrandType) => {
    return Array.from(selectedServices.values()).filter(
      (s) => s.service.brand === brand
    ).length;
  };

  // Filter services by active brand and search
  const filteredServices = getServicesByBrand(activeBrand).filter(
    (service) =>
      service.name.toLowerCase().includes(search.toLowerCase()) ||
      service.description.toLowerCase().includes(search.toLowerCase())
  );

  // Handle adding custom service
  const handleAddCustomService = () => {
    if (!customName.trim() || !customRate) return;

    const customService: WizardService = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      brand: customBrand,
      name: customName.trim(),
      description: customDescription.trim() || "Custom service",
      baseRate: parseFloat(customRate) || 0,
      category: customCategory,
      isCustom: true,
    };

    onAddCustomService(customService);

    // Reset form
    setCustomName("");
    setCustomDescription("");
    setCustomRate("");
    setShowCustomForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Custom Service Toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowCustomForm(!showCustomForm)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
            showCustomForm
              ? "border-brand-sankofa bg-brand-sankofa/10 text-brand-sankofa"
              : "border-border hover:border-content-muted text-content-secondary hover:text-content"
          }`}
        >
          {showCustomForm ? (
            <X className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {showCustomForm ? "Cancel" : "Add Custom Item"}
          </span>
        </button>

        <p className="text-meta text-content-muted">
          For ad-hoc pricing or legacy client discounts
        </p>
      </div>

      {/* Custom Service Form */}
      {showCustomForm && (
        <div className="card p-5 border-2 border-dashed border-brand-sankofa/30 bg-brand-sankofa/5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-4 h-4 text-brand-sankofa" />
            <h4 className="font-medium text-content">Custom Line Item</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Service Name */}
            <div className="form-group md:col-span-2">
              <label className="form-label">Service Name *</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., Custom Content Creation - 3 Platforms"
                className="input-field"
              />
            </div>

            {/* Description */}
            <div className="form-group md:col-span-2">
              <label className="form-label">Description</label>
              <input
                type="text"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="e.g., Legacy client pricing for social media management"
                className="input-field"
              />
            </div>

            {/* Brand Selection */}
            <div className="form-group">
              <label className="form-label">Assign to Brand *</label>
              <select
                value={customBrand}
                onChange={(e) => setCustomBrand(e.target.value as BrandType)}
                className="input-field"
              >
                {brandTabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label} - {tab.subtitle}
                  </option>
                ))}
              </select>
            </div>

            {/* Rate */}
            <div className="form-group">
              <label className="form-label">Rate (USD) *</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                <input
                  type="number"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="input-field pl-9"
                />
              </div>
            </div>

            {/* Category */}
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="input-field"
              >
                <option value="custom">Custom</option>
                <option value="social-media">Social Media</option>
                <option value="website">Website</option>
                <option value="video">Video</option>
                <option value="podcast">Podcast</option>
                <option value="bundle">Bundle</option>
                <option value="retainer">Retainer</option>
              </select>
            </div>

            {/* Add Button */}
            <div className="form-group flex items-end">
              <button
                onClick={handleAddCustomService}
                disabled={!customName.trim() || !customRate}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add to Invoice
              </button>
            </div>
          </div>

          {/* Stripe Note */}
          <div className="mt-4 p-3 rounded-lg bg-surface-tertiary border border-border">
            <p className="text-meta text-content-muted flex items-start gap-2">
              <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Custom items use Stripe's <code className="px-1 py-0.5 rounded bg-surface-hover text-content-secondary">price_data</code> for
                one-time pricing instead of pre-defined price IDs.
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Brand tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {brandTabs.map((tab) => {
          const count = getSelectedCount(tab.id);
          const isActive = activeBrand === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveBrand(tab.id)}
              className={`brand-tab brand-tab-${tab.color} ${isActive ? "active" : ""} flex-shrink-0`}
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-meta rounded-full bg-current/20">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search within brand */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
        <input
          type="text"
          placeholder={`Search ${activeBrand} services...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field w-full pl-10 py-2 text-sm"
        />
      </div>

      {/* Services list */}
      <div className="space-y-3">
        {filteredServices.length === 0 ? (
          <div className="text-center py-8 text-content-muted">
            <p>No services found</p>
          </div>
        ) : (
          filteredServices.map((service) => {
            const selected = selectedServices.get(service.id);
            return (
              <ServiceCard
                key={service.id}
                service={service}
                selected={!!selected}
                quantity={selected?.quantity || 1}
                customRate={selected?.customRate}
                onToggle={() => onToggleService(service)}
                onQuantityChange={(qty) => onQuantityChange(service.id, qty)}
                onCustomRateChange={
                  onCustomRateChange
                    ? (rate) => onCustomRateChange(service.id, rate)
                    : undefined
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export default ServicePicker;
