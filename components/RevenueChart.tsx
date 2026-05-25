"use client";

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { getBrandColor, getBrandDisplayName } from "@/components/BrandBadge";

const timeRanges = [
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "this_quarter", label: "This Quarter" },
] as const;

type TimeRangeKey = (typeof timeRanges)[number]["key"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatCompactCurrency = (value: number) => {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }

  return formatCurrency(value);
};

export function RevenueChart() {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("this_month");

  const revenueByBrand = useAuthQuery(api.invoiceActions.getRevenueByBrand, {
    status: "paid",
    timeRange,
  });

  const chartData = useMemo(
    () =>
      (revenueByBrand?.brands ?? [])
        .map((entry) => ({
          brand: entry.brand,
          label: getBrandDisplayName(entry.brand),
          color: getBrandColor(entry.brand),
          revenue: entry.revenueCents / 100,
        }))
        .sort((a, b) => b.revenue - a.revenue),
    [revenueByBrand],
  );

  const totalRevenue = (revenueByBrand?.totalRevenueCents ?? 0) / 100;
  const hasRevenue = chartData.some((item) => item.revenue > 0);
  const isLoading = revenueByBrand === undefined;
  const selectedRangeLabel = timeRanges.find((range) => range.key === timeRange)?.label ?? "This Month";
  const maxRevenue = Math.max(...chartData.map((item) => item.revenue), 1);

  const getBarHeight = (revenue: number) => {
    if (revenue <= 0) {
      return 6;
    }

    const heightPercentage = (revenue / maxRevenue) * 100;
    return Math.max((heightPercentage / 100) * 160, 20);
  };

  const renderSummaryText = () => {
    if (isLoading) {
      return "Loading paid revenue...";
    }

    if (!hasRevenue) {
      return `${selectedRangeLabel} · No paid revenue yet`;
    }

    return `${selectedRangeLabel} · ${formatCurrency(totalRevenue)} total`;
  };

  return (
    <div className="card p-6 opacity-0 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-content">Revenue by Brand</h2>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRangeKey)}
          className="text-sm rounded-lg px-3 py-1.5 bg-surface-tertiary border border-border text-content cursor-pointer focus:outline-none focus:ring-2 focus:ring-content-muted/20"
        >
          {timeRanges.map((range) => (
            <option key={range.key} value={range.key}>
              {range.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bar Chart */}
      {isLoading ? (
        <div className="h-48 mt-8 px-4 flex items-center justify-center text-sm text-content-muted">
          Loading chart data...
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-48 mt-8 px-4 flex items-center justify-center text-sm text-content-muted">
          No revenue recorded for this period.
        </div>
      ) : (
        <div className="flex items-end justify-around h-44 mt-8 px-4">
          {chartData.map((item, index) => (
            <div key={item.brand} className="flex flex-col items-center gap-2">
              <div
                className="chart-bar w-16 opacity-0 animate-bar-grow"
                style={{
                  height: `${getBarHeight(item.revenue)}px`,
                  background: item.color,
                  animationDelay: `${100 + index * 100}ms`,
                  opacity: item.revenue > 0 ? 1 : 0.25,
                }}
              />
              <span className="text-meta text-content-muted text-center">
                {item.label}
              </span>
              <span className="text-sm font-medium text-content">
                {item.revenue > 0 ? formatCompactCurrency(item.revenue) : "$0"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-content-muted mt-6 pt-4 border-t border-border">{renderSummaryText()}</p>
    </div>
  );
}

export default RevenueChart;
