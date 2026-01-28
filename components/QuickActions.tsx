"use client";

import { Plus } from "lucide-react";
import type { BrandType } from "./BrandBadge";

interface QuickAction {
  brand: BrandType;
  title: string;
  subtitle: string;
  onClick?: () => void;
}

const quickActions: QuickAction[] = [
  {
    brand: "Sankofa",
    title: "Sankofa Invoice",
    subtitle: "Marketing & Web",
  },
  {
    brand: "Lighthouse",
    title: "Lighthouse Invoice",
    subtitle: "Video & Photo",
  },
  {
    brand: "Centex",
    title: "Centex Invoice",
    subtitle: "Sports & Live",
  },
  {
    brand: "GFAM Media Studios",
    title: "GFAM Media Invoice",
    subtitle: "Studio & Podcasts",
  },
];

const brandStyles: Record<BrandType, { bg: string; color: string }> = {
  Sankofa: {
    bg: "rgba(16, 185, 129, 0.15)",
    color: "var(--brand-sankofa)",
  },
  Lighthouse: {
    bg: "rgba(139, 92, 246, 0.15)",
    color: "var(--brand-lighthouse)",
  },
  Centex: {
    bg: "rgba(245, 158, 11, 0.15)",
    color: "var(--brand-centex)",
  },
  "GFAM Media Studios": {
    bg: "rgba(59, 130, 246, 0.15)",
    color: "var(--brand-gfam)",
  },
};

interface QuickActionsProps {
  onAction?: (brand: BrandType) => void;
}

export function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="card p-4 sm:p-6 opacity-0 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
      <h2 className="text-base sm:text-lg font-semibold text-content mb-3 sm:mb-4">Quick Actions</h2>
      <div className="space-y-2 sm:space-y-3">
        {quickActions.map((action) => {
          const style = brandStyles[action.brand];
          return (
            <button
              key={action.brand}
              onClick={() => onAction?.(action.brand)}
              className="quick-action-btn"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: style.bg }}
              >
                <Plus className="w-4 h-4" style={{ color: style.color }} />
              </div>
              <div>
                <p className="text-sm font-medium text-content">{action.title}</p>
                <p className="text-meta text-content-muted">{action.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default QuickActions;
