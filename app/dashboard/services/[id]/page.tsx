"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  MoreHorizontal,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Zap,
  ExternalLink,
  Tag,
  X,
  Plus,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandBadge, type BrandType } from "@/components/BrandBadge";
import { allServices, serviceBrandFilters, type ServiceData } from "@/data/services-sample";

const brandOptions: { value: BrandType; label: string; color: string }[] = [
  { value: "Sankofa", label: "Sankofa", color: "#10B981" },
  { value: "Lighthouse", label: "Lighthouse", color: "#8B5CF6" },
  { value: "Centex", label: "Centex", color: "#F59E0B" },
  { value: "GFAM Media Studios", label: "GFAM Media Studios", color: "#3B82F6" },
];

const categoryOptions = [
  { value: "website", label: "Website" },
  { value: "social-media", label: "Social Media" },
  { value: "branding", label: "Branding" },
  { value: "marketing", label: "Marketing" },
  { value: "video", label: "Video" },
  { value: "photography", label: "Photography" },
  { value: "streaming", label: "Streaming" },
  { value: "podcast", label: "Podcast" },
  { value: "studio-rental", label: "Studio Rental" },
];

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;

  // Find the service
  const originalService = allServices.find((s) => s.id === serviceId);

  // Form state
  const [name, setName] = useState(originalService?.name || "");
  const [description, setDescription] = useState(originalService?.description || "");
  const [brand, setBrand] = useState<BrandType>(originalService?.brand || "Sankofa");
  const [category, setCategory] = useState(originalService?.category || "website");
  const [price, setPrice] = useState(originalService?.price || "");
  const [priceValue, setPriceValue] = useState(originalService?.priceValue || 0);
  const [priceSuffix, setPriceSuffix] = useState(originalService?.priceSuffix || "");
  const [status, setStatus] = useState<"active" | "inactive">(originalService?.status || "active");
  const [stripeSynced, setStripeSynced] = useState(originalService?.stripeSynced || false);
  const [tags, setTags] = useState<string[]>(originalService?.tags || []);
  const [newTag, setNewTag] = useState("");

  const [actionsOpen, setActionsOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track changes
  useEffect(() => {
    if (!originalService) return;
    const changed =
      name !== originalService.name ||
      description !== originalService.description ||
      brand !== originalService.brand ||
      category !== originalService.category ||
      price !== originalService.price ||
      priceValue !== originalService.priceValue ||
      priceSuffix !== (originalService.priceSuffix || "") ||
      status !== originalService.status ||
      stripeSynced !== originalService.stripeSynced ||
      JSON.stringify(tags) !== JSON.stringify(originalService.tags);
    setHasChanges(changed);
  }, [name, description, brand, category, price, priceValue, priceSuffix, status, stripeSynced, tags, originalService]);

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setHasChanges(false);
    // In real app, would save to Convex here
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this service? This action cannot be undone.")) {
      // In real app, would delete from Convex here
      router.push("/dashboard/services");
    }
  };

  if (!originalService) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-xl font-semibold text-content mb-2">Service Not Found</h2>
        <p className="text-content-muted mb-6">
          The service you&apos;re looking for doesn&apos;t exist.
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
      {/* Header */}
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Back & Title */}
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/services"
              className="p-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-content-muted" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-content">
                Edit Service
              </h1>
              <p className="text-content-muted text-sm mt-0.5">
                {originalService.name}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ThemeSwitch />

            {hasChanges && (
              <span className="text-sm text-warning">Unsaved changes</span>
            )}

            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving..." : "Save Changes"}</span>
            </button>

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
                    <Copy className="w-4 h-4" />
                    Duplicate Service
                  </button>
                  <button className="dropdown-item">
                    <ExternalLink className="w-4 h-4" />
                    View in Stripe
                  </button>
                  <button className="dropdown-item text-error" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4" />
                    Delete Service
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Form Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info Card */}
          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "50ms" }}>
            <h2 className="text-lg font-semibold text-content mb-6">Basic Information</h2>

            <div className="space-y-5">
              {/* Service Name */}
              <div className="form-group">
                <label className="form-label">Service Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Enter service name"
                />
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field min-h-[100px] resize-y"
                  placeholder="Describe this service..."
                  rows={3}
                />
              </div>

              {/* Brand & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value as BrandType)}
                    className="input-field"
                  >
                    {brandOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="input-field"
                  >
                    {categoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div className="form-group">
                <label className="form-label">Tags</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map((tag) => (
                    <span key={tag} className="service-tag-editable">
                      <Tag className="w-3 h-3" />
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="tag-remove-btn"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    className="input-field flex-1"
                    placeholder="Add a tag..."
                  />
                  <button
                    onClick={handleAddTag}
                    className="btn-secondary"
                    disabled={!newTag.trim()}
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Card */}
          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            <h2 className="text-lg font-semibold text-content mb-6">Pricing</h2>

            <div className="space-y-5">
              {/* Display Price */}
              <div className="form-group">
                <label className="form-label">Display Price</label>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="input-field"
                  placeholder="e.g., $500 - $1,000 or $150"
                />
                <p className="form-hint">This is what clients see (can be a range)</p>
              </div>

              {/* Base Price Value & Suffix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Base Price (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted">$</span>
                    <input
                      type="number"
                      value={priceValue}
                      onChange={(e) => setPriceValue(Number(e.target.value))}
                      className="input-field pl-8"
                      placeholder="0.00"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <p className="form-hint">Used for invoicing & Stripe</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Price Suffix</label>
                  <select
                    value={priceSuffix}
                    onChange={(e) => setPriceSuffix(e.target.value)}
                    className="input-field"
                  >
                    <option value="">One-time (no suffix)</option>
                    <option value="/hour">/hour</option>
                    <option value="/day">/day</option>
                    <option value="/month">/month</option>
                    <option value="/episode">/episode</option>
                    <option value="/event">/event</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            <h2 className="text-lg font-semibold text-content mb-6">Status</h2>

            <div className="space-y-4">
              {/* Active/Inactive Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {status === "active" ? (
                    <Eye className="w-5 h-5 text-success" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-content-muted" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-content">
                      {status === "active" ? "Active" : "Inactive"}
                    </p>
                    <p className="text-meta text-content-muted">
                      {status === "active" ? "Visible to clients" : "Hidden from clients"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setStatus(status === "active" ? "inactive" : "active")}
                  className={`toggle-switch ${status === "active" ? "active" : ""}`}
                >
                  <span className="toggle-knob" />
                </button>
              </div>

              <div className="border-t border-border pt-4">
                {/* Stripe Sync Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className={`w-5 h-5 ${stripeSynced ? "text-[#635bff]" : "text-content-muted"}`} />
                    <div>
                      <p className="text-sm font-medium text-content">Stripe Sync</p>
                      <p className="text-meta text-content-muted">
                        {stripeSynced ? "Synced with Stripe" : "Not synced"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStripeSynced(!stripeSynced)}
                    className={`toggle-switch ${stripeSynced ? "active stripe" : ""}`}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Card */}
          <div className="card p-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <h2 className="text-lg font-semibold text-content mb-4">Preview</h2>

            <div className="service-preview-card">
              <div className="flex items-start justify-between mb-3">
                <BrandBadge brand={brand} variant="pill" />
                {stripeSynced && (
                  <span className="stripe-synced">
                    <Zap className="w-3 h-3" />
                    Stripe
                  </span>
                )}
              </div>

              <h3 className="text-base font-semibold text-content mb-1">
                {name || "Service Name"}
              </h3>
              <p className="text-sm text-content-muted mb-3 line-clamp-2">
                {description || "Service description will appear here..."}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="service-tag text-[11px] px-2 py-0.5">
                    {tag}
                  </span>
                ))}
                {tags.length > 3 && (
                  <span className="text-meta text-content-muted">+{tags.length - 3}</span>
                )}
              </div>

              <div className="service-price text-base">
                {price || "$0"}
                {priceSuffix && (
                  <span className="service-price-suffix">{priceSuffix}</span>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-border">
                <div className={`status-indicator ${status === "active" ? "status-active" : "status-inactive"}`}>
                  <span className="status-dot" />
                  <span className={status === "active" ? "text-success" : "text-content-muted"}>
                    {status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
