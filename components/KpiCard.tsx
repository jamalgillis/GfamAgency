"use client";

import { LucideIcon, TrendingUp } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    direction?: "up" | "down" | "neutral";
  };
  variant: 1 | 2 | 3 | 4;
  delay?: number;
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  variant,
  delay = 0,
}: KpiCardProps) {
  // CSS variable names for each variant
  const iconBgVar = `var(--kpi-icon-bg-${variant})`;
  const iconColorVar = `var(--kpi-icon-color-${variant})`;

  return (
    <div
      className="card p-4 sm:p-6 opacity-0 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center"
          style={{ background: iconBgVar }}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: iconColorVar }} />
        </div>
        {trend && (
          <span
            className="text-xs sm:text-sm font-medium flex items-center gap-1"
            style={{ color: iconColorVar }}
          >
            {trend.direction === "up" && <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-content-muted text-xs sm:text-sm">{title}</p>
      <p className="text-lg sm:text-2xl font-semibold text-content mt-1">{value}</p>
    </div>
  );
}

export default KpiCard;
