"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandBadge, type BrandType } from "@/components/BrandBadge";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/useAuthQuery";

const fallbackCategoryOptions = [
  "website",
  "social-media",
  "branding",
  "marketing",
  "seo",
  "video",
  "photography",
  "streaming",
  "podcast",
  "studio-rental",
  "membership",
  "membership-upgrade",
  "photo-room",
  "fees",
  "custom",
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  const uncaughtPrefix = "Uncaught Error:";
  const uncaughtIndex = message.lastIndexOf(uncaughtPrefix);

  if (uncaughtIndex >= 0) {
    const extracted = message.slice(uncaughtIndex + uncaughtPrefix.length).trim();
    return extracted || fallback;
  }

  return message || fallback;
}

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serviceIdParam = params.id;
  const serviceId = Array.isArray(serviceIdParam) ? serviceIdParam[0] : serviceIdParam;
  const hasValidServiceId = typeof serviceId === "string" && serviceId.length > 10;
  const updateService = useMutation(api.services.update);
  const removeService = useMutation(api.services.remove);

  const service = useAuthQuery(
    api.services.get,
    hasValidServiceId ? { serviceId: serviceId as Id<"services"> } : "skip",
  );
  const allServices = useAuthQuery(api.services.list, {
    includeInactive: true,
    limit: 5000,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState<BrandType>("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [priceValue, setPriceValue] = useState(0);
  const [priceSuffix, setPriceSuffix] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [stripeSynced, setStripeSynced] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (!service) {
      return;
    }

    setName(service.name);
    setDescription(service.description);
    setBrand(service.brand);
    setCategory(service.category);
    setPrice(service.price);
    setPriceValue(service.priceValue);
    setPriceSuffix(service.priceSuffix ?? "");
    setStatus(service.status);
    setStripeSynced(Boolean(service.stripeSynced));
    setTags(Array.isArray(service.tags) ? service.tags : []);
  }, [service]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();

    for (const row of allServices ?? []) {
      if (row.brand) {
        brands.add(row.brand);
      }
    }

    if (service?.brand) {
      brands.add(service.brand);
    }

    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [allServices, service?.brand]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();

    for (const row of allServices ?? []) {
      if (row.category) {
        categories.add(row.category);
      }
    }

    for (const categoryName of fallbackCategoryOptions) {
      categories.add(categoryName);
    }

    if (service?.category) {
      categories.add(service.category);
    }

    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [allServices, service?.category]);

  const hasChanges = useMemo(() => {
    if (!service) {
      return false;
    }

    return (
      name !== service.name ||
      description !== service.description ||
      brand !== service.brand ||
      category !== service.category ||
      price !== service.price ||
      priceValue !== service.priceValue ||
      priceSuffix !== (service.priceSuffix ?? "") ||
      status !== service.status ||
      stripeSynced !== Boolean(service.stripeSynced) ||
      JSON.stringify(tags) !== JSON.stringify(service.tags ?? [])
    );
  }, [
    brand,
    category,
    description,
    name,
    price,
    priceSuffix,
    priceValue,
    service,
    status,
    stripeSynced,
    tags,
  ]);

  useEffect(() => {
    if (hasChanges) {
      setActionSuccess(null);
    }
  }, [hasChanges]);

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) {
      return;
    }
    setTags([...tags, trimmed]);
    setNewTag("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = async () => {
    setActionError(null);
    setActionSuccess(null);

    if (!service) {
      setActionError("Service not found.");
      return;
    }

    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    const normalizedBrand = brand.trim();
    const normalizedCategory = category.trim();
    const normalizedPrice = price.trim();
    const normalizedPriceSuffix = priceSuffix.trim();
    const normalizedTags = tags.map((tag) => tag.trim()).filter(Boolean);

    if (
      !normalizedName ||
      !normalizedDescription ||
      !normalizedBrand ||
      !normalizedCategory ||
      !normalizedPrice
    ) {
      setActionError("Name, description, brand, category, and display price are required.");
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setActionError("Base price must be a non-negative number.");
      return;
    }

    setIsSaving(true);
    try {
      await updateService({
        serviceId: service._id,
        name: normalizedName,
        description: normalizedDescription,
        brand: normalizedBrand,
        category: normalizedCategory,
        price: normalizedPrice,
        priceValue: Math.round(priceValue * 100) / 100,
        priceSuffix: normalizedPriceSuffix,
        status,
        stripeSynced,
        tags: normalizedTags,
      });
      setActionSuccess("Service updated.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to update service."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setActionError(null);
    setActionSuccess(null);

    if (!service) {
      setActionError("Service not found.");
      return;
    }

    const confirmed = window.confirm(
      `Remove "${service.name}" from active catalogs? This sets the service status to inactive.`,
    );

    if (!confirmed) {
      return;
    }

    setIsRemoving(true);
    try {
      await removeService({ serviceId: service._id });
      router.push("/dashboard/services");
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to remove service."));
    } finally {
      setIsRemoving(false);
    }
  };

  if (!hasValidServiceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-xl font-semibold text-content mb-2">Invalid service ID</h2>
        <p className="text-content-muted mb-6">
          The selected service ID is not valid.
        </p>
        <Link href="/dashboard/services" className="btn-primary">
          <ArrowLeft className="w-4 h-4" />
          Back to Services
        </Link>
      </div>
    );
  }

  if (service === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-xl font-semibold text-content mb-2">Loading service…</h2>
        <p className="text-content-muted">Fetching latest service details for this org.</p>
      </div>
    );
  }

  if (service === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-xl font-semibold text-content mb-2">Service Not Found</h2>
        <p className="text-content-muted mb-6">
          This service does not exist in your active organization.
        </p>
        <Link href="/dashboard/services" className="btn-primary">
          <ArrowLeft className="w-4 h-4" />
          Back to Services
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/services"
              className="p-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-content-muted" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-content">Service Details</h1>
              <p className="text-content-muted text-sm mt-0.5">{service.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeSwitch />
            {hasChanges && <span className="text-sm text-warning">Unsaved local edits</span>}
          </div>
        </div>
      </header>

      {actionError && (
        <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-content flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-error" />
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-content flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-success" />
          {actionSuccess}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "50ms" }}>
            <h2 className="text-lg font-semibold text-content mb-6">Basic Information</h2>
            <div className="space-y-5">
              <div className="form-group">
                <label className="form-label">Service Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="input-field min-h-[100px] resize-y"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <select
                    value={brand}
                    onChange={(event) => setBrand(event.target.value as BrandType)}
                    className="input-field"
                  >
                    {brandOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="input-field"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tags</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map((tag) => (
                    <span key={tag} className="service-tag-editable">
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="tag-remove-btn"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    onKeyDown={(event) =>
                      event.key === "Enter" && (event.preventDefault(), handleAddTag())
                    }
                    className="input-field flex-1"
                    placeholder="Add a tag..."
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="btn-secondary"
                    disabled={!newTag.trim()}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            <h2 className="text-lg font-semibold text-content mb-6">Pricing</h2>
            <div className="space-y-5">
              <div className="form-group">
                <label className="form-label">Display Price</label>
                <input
                  type="text"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Base Price (USD)</label>
                  <input
                    type="number"
                    value={priceValue}
                    onChange={(event) => setPriceValue(Number(event.target.value))}
                    className="input-field"
                    min={0}
                    step={0.01}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Price Suffix</label>
                  <input
                    type="text"
                    value={priceSuffix}
                    onChange={(event) => setPriceSuffix(event.target.value)}
                    className="input-field"
                    placeholder="/month"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            <h2 className="text-lg font-semibold text-content mb-6">Status</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-content-secondary">Service Status</p>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
                  className="input-field !py-1.5 !px-2 text-sm"
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-content-secondary">Stripe Sync</p>
                <button
                  onClick={() => setStripeSynced((value) => !value)}
                  className={`toggle-switch ${stripeSynced ? "active stripe" : ""}`}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            </div>
          </div>

          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "175ms" }}>
            <h2 className="text-lg font-semibold text-content mb-4">Actions</h2>
            <p className="text-sm text-content-muted mb-4">
              Save edits or remove this service from active catalogs.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || isSaving || isRemoving}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? "Saving..." : "Save changes"}
              </button>

              <button
                type="button"
                onClick={handleRemove}
                disabled={isSaving || isRemoving}
                className="btn-secondary w-full justify-center border-red-500/40 text-error hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isRemoving ? "Removing..." : "Remove service"}
              </button>
            </div>
          </div>

          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <h2 className="text-lg font-semibold text-content mb-4">Preview</h2>
            <div className="service-preview-card">
              <div className="flex items-start justify-between mb-3">
                <BrandBadge brand={brand || service.brand} variant="pill" />
                {stripeSynced && (
                  <span className="stripe-synced">
                    <Zap className="w-3 h-3" />
                    Stripe
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold text-content mb-1">{name || service.name}</h3>
              <p className="text-sm text-content-muted mb-3 line-clamp-2">
                {description || service.description}
              </p>
              <div className="service-price text-base">
                {price || service.price}
                {priceSuffix && <span className="service-price-suffix">{priceSuffix}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
