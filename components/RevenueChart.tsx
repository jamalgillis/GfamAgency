"use client";

import { useState } from "react";

interface BrandRevenue {
  brand: string;
  revenue: number;
  color: string;
}

interface RevenueChartProps {
  data: BrandRevenue[];
}

const timeRanges = ["This Month", "Last Month", "This Quarter"] as const;
type TimeRange = (typeof timeRanges)[number];

export function RevenueChart({ data }: RevenueChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("This Month");

  // Find max revenue for scaling
  const maxRevenue = Math.max(...data.map((d) => d.revenue));

  const formatRevenue = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value}`;
  };

  return (
    <div className="card p-6 opacity-0 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-content">Revenue by Brand</h2>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="text-sm rounded-lg px-3 py-1.5 bg-surface-tertiary border border-border text-content cursor-pointer focus:outline-none focus:ring-2 focus:ring-content-muted/20"
        >
          {timeRanges.map((range) => (
            <option key={range} value={range}>
              {range}
            </option>
          ))}
        </select>
      </div>

      {/* Bar Chart */}
      <div className="flex items-end justify-around h-48 px-4">
        {data.map((item, index) => {
          const heightPercentage = (item.revenue / maxRevenue) * 100;
          const height = Math.max((heightPercentage / 100) * 160, 20); // Min height 20px

          return (
            <div key={item.brand} className="flex flex-col items-center gap-2">
              <div
                className="chart-bar w-16 opacity-0 animate-bar-grow"
                style={{
                  height: `${height}px`,
                  background: item.color,
                  animationDelay: `${100 + index * 100}ms`,
                }}
              />
              <span className="text-meta text-content-muted text-center">
                {item.brand}
              </span>
              <span className="text-sm font-medium text-content">
                {formatRevenue(item.revenue)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RevenueChart;
