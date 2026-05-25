"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, DollarSign, Tag, FileText } from "lucide-react";
import { ServiceCard } from "./ServiceCard";
import type { WizardService, SelectedServiceItem } from "@/data/wizard-sample";
import { getBrandColor, getBrandDisplayName, type BrandType } from "@/components/BrandBadge";

interface ServicePickerProps {
  services: WizardService[];
  selectedServices: Map<string, SelectedServiceItem>;
  onToggleService: (service: WizardService) => void;
  onQuantityChange: (serviceId: string, quantity: number) => void;
  onAddCustomService: (service: WizardService) => void;
  onCustomRateChange?: (serviceId: string, customRate: number) => void;
  allowCustomItems?: boolean;
  allowCustomRateOverrides?: boolean;
}

type ServiceGroupKey = "regular" | "addOns" | "packages";

const serviceGroupSections: Array<{
  key: ServiceGroupKey;
  label: string;
  description: string;
}> = [
  {
    key: "regular",
    label: "Regular Products",
    description: "Core standalone services",
  },
  {
    key: "addOns",
    label: "Add-Ons",
    description: "Optional enhancements",
  },
  {
    key: "packages",
    label: "Packages",
    description: "Bundled or tiered offers",
  },
];

const addOnKeywords = ["add-on", "add on", "addon", "addons"];
const packageKeywords = ["package", "bundle", "package deal"];
const packageTagKeywords = ["starter", "professional", "enterprise"];

const normalize = (value: string | undefined): string =>
  value?.trim().toLowerCase() ?? "";

const containsKeyword = (value: string, keywords: string[]): boolean =>
  keywords.some((keyword) => value.includes(keyword));

const getServiceGroup = (service: WizardService): ServiceGroupKey => {
  const normalizedTags = (service.tags ?? []).map((tag) => normalize(tag));
  const searchableFields = [
    service.name,
    service.description,
    service.category,
    service.id,
  ].map((field) => normalize(field));

  const hasAddOnTag = normalizedTags.some((tag) =>
    containsKeyword(tag, addOnKeywords)
  );
  const hasAddOnText = searchableFields.some((field) =>
    containsKeyword(field, addOnKeywords)
  );

  if (hasAddOnTag || hasAddOnText) {
    return "addOns";
  }

  const hasPackageTag = normalizedTags.some(
    (tag) =>
      containsKeyword(tag, packageKeywords) ||
      containsKeyword(tag, packageTagKeywords)
  );
  const hasPackageText = searchableFields.some((field) =>
    containsKeyword(field, packageKeywords)
  );

  if (normalize(service.category) === "bundle" || hasPackageTag || hasPackageText) {
    return "packages";
  }

  return "regular";
};

export function ServicePicker({
  services,
  selectedServices,
  onToggleService,
  onQuantityChange,
  onAddCustomService,
  onCustomRateChange,
  allowCustomItems = true,
  allowCustomRateOverrides = true,
}: ServicePickerProps) {
  const tenantPrimaryColor = "var(--tenant-primary, #10B981)";
  const [activeBrand, setActiveBrand] = useState<BrandType>("");
  const [search, setSearch] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const hasInitializedBrandFromSelection = useRef(false);

  // Custom service form state
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customBrand, setCustomBrand] = useState<BrandType>("");
  const [customCategory, setCustomCategory] = useState("custom");

  const availableBrandTabs = useMemo(() => {
    const brandCounts = new Map<string, number>();

    for (const service of services) {
      brandCounts.set(service.brand, (brandCounts.get(service.brand) ?? 0) + 1);
    }

    return Array.from(brandCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([brand, count]) => ({
        id: brand,
        label: getBrandDisplayName(brand),
        subtitle: `${count} ${count === 1 ? "service" : "services"}`,
        color: getBrandColor(brand),
      }));
  }, [services]);

  useEffect(() => {
    if (availableBrandTabs.length === 0) {
      if (activeBrand !== "") {
        setActiveBrand("");
      }
      return;
    }

    if (!availableBrandTabs.some((tab) => tab.id === activeBrand)) {
      setActiveBrand(availableBrandTabs[0].id);
    }
  }, [activeBrand, availableBrandTabs]);

  useEffect(() => {
    if (availableBrandTabs.length === 0) {
      if (customBrand !== "") {
        setCustomBrand("");
      }
      return;
    }

    if (!availableBrandTabs.some((tab) => tab.id === customBrand)) {
      setCustomBrand(availableBrandTabs[0].id);
    }
  }, [availableBrandTabs, customBrand]);

  useEffect(() => {
    if (hasInitializedBrandFromSelection.current) {
      return;
    }

    if (selectedServices.size === 0 || availableBrandTabs.length === 0) {
      return;
    }

    const firstSelected = Array.from(selectedServices.values())[0];
    const selectedBrand = firstSelected?.service.brand;
    if (!selectedBrand) {
      return;
    }

    if (availableBrandTabs.some((tab) => tab.id === selectedBrand)) {
      setActiveBrand(selectedBrand);
      hasInitializedBrandFromSelection.current = true;
    }
  }, [availableBrandTabs, selectedServices]);

  // Count selected services per brand
  const getSelectedCount = (brand: BrandType) => {
    return Array.from(selectedServices.values()).filter(
      (s) => s.service.brand === brand
    ).length;
  };

  // Filter services by active brand and search
  const filteredServices = useMemo(() => {
    const query = search.toLowerCase().trim();

    return services.filter((service) => {
      if (service.brand !== activeBrand) return false;
      if (!query) return true;
      return (
        service.name.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query)
      );
    });
  }, [activeBrand, search, services]);

  const groupedServices = useMemo(() => {
    const grouped: Record<ServiceGroupKey, WizardService[]> = {
      regular: [],
      addOns: [],
      packages: [],
    };

    for (const service of filteredServices) {
      grouped[getServiceGroup(service)].push(service);
    }

    return grouped;
  }, [filteredServices]);

  // Handle adding custom service
  const handleAddCustomService = () => {
    if (!customName.trim() || !customRate) return;

    if (!customBrand) {
      return;
    }

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
      {allowCustomItems ? (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCustomForm(!showCustomForm)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
              showCustomForm
                ? ""
                : "border-border hover:border-content-muted text-content-secondary hover:text-content"
            }`}
            style={
              showCustomForm
                ? {
                    borderColor: tenantPrimaryColor,
                    color: tenantPrimaryColor,
                    background: `color-mix(in srgb, ${tenantPrimaryColor} 10%, transparent)`,
                  }
                : undefined
            }
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
      ) : (
        <div className="rounded-lg border border-border bg-surface-tertiary px-4 py-3">
          <p className="text-sm text-content-secondary">
            Custom line items are disabled in subscription mode.
          </p>
        </div>
      )}

      {/* Custom Service Form */}
      {allowCustomItems && showCustomForm && (
        <div
          className="card p-5 border-2 border-dashed animate-fade-in-up"
          style={{
            borderColor: `color-mix(in srgb, ${tenantPrimaryColor} 30%, transparent)`,
            background: `color-mix(in srgb, ${tenantPrimaryColor} 5%, transparent)`,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-4 h-4" style={{ color: tenantPrimaryColor }} />
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
                {availableBrandTabs.map((tab) => (
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
                <option value="marketing">Marketing</option>
                <option value="seo">SEO & AI Search</option>
                <option value="video">Video</option>
                <option value="podcast">Podcast</option>
                <option value="bundle">Bundle</option>
                <option value="membership">Membership</option>
                <option value="membership-upgrade">Membership Upgrade</option>
                <option value="photo-room">Photo Room</option>
                <option value="fees">Policies & Fees</option>
              </select>
            </div>

            {/* Add Button */}
            <div className="form-group flex items-end">
              <button
                onClick={handleAddCustomService}
                disabled={!customName.trim() || !customRate || !customBrand}
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
        {availableBrandTabs.map((tab) => {
          const count = getSelectedCount(tab.id);
          const isActive = activeBrand === tab.id;
          const activeStyle = isActive
            ? {
                borderColor: tab.color,
                color: tab.color,
                backgroundColor: `${tab.color}14`,
              }
            : undefined;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveBrand(tab.id)}
              className={`brand-tab ${isActive ? "active" : ""} flex-shrink-0`}
              style={activeStyle}
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
          placeholder={
            activeBrand
              ? `Search ${getBrandDisplayName(activeBrand)} services...`
              : "Search services..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field w-full pl-10 py-2 text-sm"
        />
      </div>

      {/* Services list */}
      <div className="space-y-6">
        {filteredServices.length === 0 ? (
          <div className="text-center py-8 text-content-muted">
            <p>No services found</p>
          </div>
        ) : (
          serviceGroupSections.map((groupSection) => {
            const items = groupedServices[groupSection.key];

            if (items.length === 0) {
              return null;
            }

            return (
              <section key={groupSection.key} className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-content">
                      {groupSection.label}
                    </h4>
                    <p className="text-meta text-content-muted">
                      {groupSection.description}
                    </p>
                  </div>
                  <span className="text-meta text-content-muted whitespace-nowrap">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <div className="space-y-3">
                  {items.map((service) => {
                    const selected = selectedServices.get(service.id);
                    return (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        selected={!!selected}
                        quantity={selected?.quantity || 1}
                        customRate={selected?.customRate}
                        onToggle={() => onToggleService(service)}
                        onQuantityChange={(qty) =>
                          onQuantityChange(service.id, qty)
                        }
                        onCustomRateChange={
                          onCustomRateChange && allowCustomRateOverrides
                            ? (rate) => onCustomRateChange(service.id, rate)
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ServicePicker;
