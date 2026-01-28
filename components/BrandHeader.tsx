"use client";

import { useMemo } from "react";
import {
  BRAND_THEMES,
  AGENCY_THEME,
  PARENT_ORGANIZATION,
  type BrandType,
} from "@/lib/brand-theme";

interface BrandHeaderProps {
  participatingBrands: BrandType[];
  variant?: "default" | "compact" | "invoice";
  showTagline?: boolean;
  className?: string;
}

/**
 * Dynamic brand header that changes based on selected services
 * - Single brand: Shows that brand's logo, colors, and tagline
 * - Multiple brands: Shows GFAM Agency with all participating brand icons
 */
export function BrandHeader({
  participatingBrands,
  variant = "default",
  showTagline = true,
  className = "",
}: BrandHeaderProps) {
  const isMultiBrand = participatingBrands.length > 1;

  const { theme, primaryBrand } = useMemo(() => {
    if (participatingBrands.length === 0) {
      return { theme: AGENCY_THEME, primaryBrand: PARENT_ORGANIZATION };
    }
    if (participatingBrands.length === 1) {
      const brand = participatingBrands[0];
      return { theme: BRAND_THEMES[brand], primaryBrand: brand };
    }
    return { theme: AGENCY_THEME, primaryBrand: PARENT_ORGANIZATION };
  }, [participatingBrands]);

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: theme.colors.primary }}
        >
          <span className="filter drop-shadow-sm">{theme.icon}</span>
        </div>
        <div>
          <h3 className="font-semibold text-content">{primaryBrand}</h3>
          {showTagline && (
            <p className="text-sm text-content-muted">{theme.tagline}</p>
          )}
        </div>
      </div>
    );
  }

  if (variant === "invoice") {
    return (
      <div
        className={`relative overflow-hidden rounded-xl ${className}`}
        style={{ background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primaryHover})` }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(
                45deg,
                transparent,
                transparent 10px,
                rgba(255,255,255,0.1) 10px,
                rgba(255,255,255,0.1) 20px
              )`,
            }}
          />
        </div>

        <div className="relative p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl filter drop-shadow-md">{theme.icon}</span>
                <h1 className="text-2xl font-bold">{primaryBrand}</h1>
              </div>
              {showTagline && (
                <p className="text-white/80 text-sm">{theme.tagline}</p>
              )}
            </div>

            {/* Multi-brand indicator */}
            {isMultiBrand && (
              <div className="text-right">
                <p className="text-white/60 text-xs uppercase tracking-wider mb-2">
                  Services by
                </p>
                <div className="flex flex-wrap gap-1 justify-end">
                  {participatingBrands.map((brand) => (
                    <span
                      key={brand}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-white/20 backdrop-blur-sm"
                    >
                      <span>{BRAND_THEMES[brand].icon}</span>
                      <span>{BRAND_THEMES[brand].shortName}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`,
      }}
    >
      <div className="p-6 text-white">
        <div className="flex items-center gap-4">
          {/* Logo/Icon */}
          <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <span className="text-4xl filter drop-shadow-md">{theme.icon}</span>
          </div>

          {/* Brand info */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{primaryBrand}</h2>
            {showTagline && (
              <p className="text-white/80 mt-1">{theme.tagline}</p>
            )}
          </div>

          {/* Multi-brand badges */}
          {isMultiBrand && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-white/60 text-xs uppercase tracking-wider">
                Featuring
              </span>
              <div className="flex gap-1">
                {participatingBrands.map((brand) => (
                  <span
                    key={brand}
                    className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
                    title={brand}
                  >
                    {BRAND_THEMES[brand].icon}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Brand logo/icon component for inline use
 */
interface BrandIconProps {
  brand: BrandType;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function BrandIcon({
  brand,
  size = "md",
  showLabel = false,
  className = "",
}: BrandIconProps) {
  const theme = BRAND_THEMES[brand];

  const sizeClasses = {
    sm: "w-6 h-6 text-sm",
    md: "w-8 h-8 text-lg",
    lg: "w-12 h-12 text-2xl",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-lg flex items-center justify-center`}
        style={{ background: theme.colors.primary }}
      >
        <span className="filter drop-shadow-sm text-white">{theme.icon}</span>
      </div>
      {showLabel && (
        <span className="font-medium text-content">{theme.shortName}</span>
      )}
    </div>
  );
}

/**
 * Brand color bar - shows proportion of each brand in an invoice
 */
interface BrandColorBarProps {
  brandAmounts: Record<BrandType, number>;
  height?: number;
  className?: string;
}

export function BrandColorBar({
  brandAmounts,
  height = 4,
  className = "",
}: BrandColorBarProps) {
  const total = Object.values(brandAmounts).reduce((sum, amt) => sum + amt, 0);

  if (total === 0) return null;

  const segments = Object.entries(brandAmounts)
    .filter(([, amount]) => amount > 0)
    .map(([brand, amount]) => ({
      brand: brand as BrandType,
      percentage: (amount / total) * 100,
      color: BRAND_THEMES[brand as BrandType].colors.primary,
    }));

  return (
    <div
      className={`rounded-full overflow-hidden flex ${className}`}
      style={{ height: `${height}px` }}
    >
      {segments.map(({ brand, percentage, color }) => (
        <div
          key={brand}
          className="transition-all duration-300"
          style={{
            width: `${percentage}%`,
            background: color,
          }}
          title={`${brand}: ${percentage.toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

export default BrandHeader;
