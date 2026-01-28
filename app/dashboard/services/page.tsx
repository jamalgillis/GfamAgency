"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  MoreVertical,
  Pencil,
  Zap,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandBadge, type BrandType } from "@/components/BrandBadge";
import {
  allServices,
  serviceStats,
  serviceBrandFilters,
  getBrandKey,
  type ServiceData,
} from "@/data/services-sample";

export default function ServicesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");

  // Filter services
  const filteredServices = useMemo(() => {
    return allServices.filter((service) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        );

      // Brand filter
      const matchesBrand =
        selectedBrand === "all" || service.brand === selectedBrand;

      return matchesSearch && matchesBrand;
    });
  }, [searchQuery, selectedBrand]);

  // Calculate filtered stats
  const filteredStats = useMemo(() => {
    const active = filteredServices.filter((s) => s.status === "active").length;
    const inactive = filteredServices.filter((s) => s.status === "inactive").length;
    return {
      total: filteredServices.length,
      active,
      inactive,
    };
  }, [filteredServices]);

  return (
    <>
      {/* Header */}
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title Section */}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-content">Services</h1>
            <p className="text-content-muted text-sm mt-1">
              Manage your service catalog across all brands
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <ThemeSwitch />

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10 pr-4 py-2.5 w-48 sm:w-64 transition-all focus:w-64 sm:focus:w-80"
              />
            </div>

            {/* Add Service Button */}
            <button className="btn-primary whitespace-nowrap">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Service</span>
            </button>
          </div>
        </div>
      </header>

      {/* Brand Filter Tabs */}
      <div className="animate-fade-in-up mb-6" style={{ animationDelay: "50ms" }}>
        <div className="tab-container inline-flex overflow-x-auto scrollbar-hide">
          {serviceBrandFilters.map((brand) => (
            <button
              key={brand.key}
              onClick={() => setSelectedBrand(brand.key)}
              className={`tab whitespace-nowrap ${selectedBrand === brand.key ? "active" : ""}`}
            >
              {brand.color && (
                <span
                  className="tab-dot"
                  style={{ background: brand.color }}
                />
              )}
              {brand.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <div className="stat-item">
          <span className="stat-value">{filteredStats.total}</span>
          <span className="stat-label">Services</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value text-success">{filteredStats.active}</span>
          <span className="stat-label">Active</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value text-content-muted">{filteredStats.inactive}</span>
          <span className="stat-label">Inactive</span>
        </div>
      </div>

      {/* Services Grid */}
      <div className="services-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredServices.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            delay={150 + index * 60}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredServices.length === 0 && (
        <div className="text-center py-16">
          <p className="text-content-muted text-lg">No services found</p>
          <p className="text-content-muted text-sm mt-2">
            Try adjusting your search or filter
          </p>
        </div>
      )}
    </>
  );
}

// Service Card Component
function ServiceCard({
  service,
  delay,
}: {
  service: ServiceData;
  delay: number;
}) {
  const brandKey = getBrandKey(service.brand);

  return (
    <div
      className="service-card card p-6 opacity-0 animate-card-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <BrandBadge brand={service.brand} variant="pill" />
        <button className="btn-icon">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <h3 className="text-lg font-semibold text-content mb-2">{service.name}</h3>
      <p className="text-sm text-content-muted mb-4 line-clamp-2">
        {service.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {service.tags.map((tag) => (
          <span key={tag} className="service-tag">
            {tag}
          </span>
        ))}
      </div>

      {/* Price */}
      <div className="service-price mb-4">
        {service.price}
        {service.priceSuffix && (
          <span className="service-price-suffix">{service.priceSuffix}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-4">
          {/* Status */}
          <div className={`status-indicator ${service.status === "active" ? "status-active" : "status-inactive"}`}>
            <span className="status-dot" />
            <span className={service.status === "active" ? "text-success" : "text-content-muted"}>
              {service.status === "active" ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Stripe Synced */}
          {service.stripeSynced && (
            <span className="stripe-synced">
              <Zap className="w-3 h-3" />
              Stripe
            </span>
          )}
        </div>

        {/* Edit Button */}
        <button className="btn-secondary">
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>
    </div>
  );
}
