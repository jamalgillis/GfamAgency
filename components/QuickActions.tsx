"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import {
  getBrandColor,
  getBrandDisplayName,
  type BrandType,
} from "./BrandBadge";

interface QuickAction {
  brand: BrandType;
  title: string;
  subtitle: string;
}

interface QuickActionsProps {
  brandSummaries?: Array<{
    brand: BrandType;
    serviceCount?: number;
  }>;
  onAction?: (brand: BrandType) => void;
}

export function QuickActions({ brandSummaries, onAction }: QuickActionsProps) {
  const quickActions = useMemo<QuickAction[]>(() => {
    if (!brandSummaries || brandSummaries.length === 0) {
      return [];
    }

    return brandSummaries.slice(0, 4).map(({ brand, serviceCount }) => ({
      brand,
      title: `${getBrandDisplayName(brand)} Invoice`,
      subtitle:
        typeof serviceCount === "number"
          ? `${serviceCount} ${serviceCount === 1 ? "service" : "services"}`
          : "Create invoice",
    }));
  }, [brandSummaries]);

  return (
    <div
      className="card p-4 sm:p-6 opacity-0 animate-fade-in-up"
      style={{ animationDelay: "200ms" }}
    >
      <h2 className="text-base sm:text-lg font-semibold text-content mb-3 sm:mb-4">
        Quick Actions
      </h2>
      {quickActions.length === 0 ? (
        <p className="text-sm text-content-muted">
          Add services to create brand-specific actions.
        </p>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {quickActions.map((action) => {
            const color = getBrandColor(action.brand);
            return (
              <button
                key={action.brand}
                onClick={() => onAction?.(action.brand)}
                className="quick-action-btn"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}1A` }}
                >
                  <Plus className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-content">{action.title}</p>
                  <p className="text-meta text-content-muted">{action.subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default QuickActions;
