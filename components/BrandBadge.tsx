"use client";

export type BrandType = string;

interface BrandBadgeProps {
  brand: string;
  variant?: "pill" | "dot";
  showLabel?: boolean;
  className?: string;
}

const fallbackPalette = [
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#8B5CF6",
] as const;

function hashBrand(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getBrandDisplayName(brand: string): string {
  const trimmed = brand.trim();
  if (!trimmed) {
    return "Brand";
  }

  return trimmed;
}

export function getBrandColor(brand: string): string {
  const trimmed = brand.trim();
  if (!trimmed) {
    return "#64748B";
  }

  const index = hashBrand(trimmed) % fallbackPalette.length;
  return fallbackPalette[index];
}

export function BrandBadge({
  brand,
  variant = "dot",
  showLabel = true,
  className = "",
}: BrandBadgeProps) {
  const normalizedBrand = brand.trim();
  const label = getBrandDisplayName(normalizedBrand);
  const color = getBrandColor(normalizedBrand);

  if (variant === "pill") {
    return (
      <span
        className={`brand-pill ${className}`}
        style={{
          background: `${color}1A`,
          borderColor: `${color}40`,
          color,
        }}
      >
        {label}
      </span>
    );
  }

  // Dot variant
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      {showLabel && (
        <span className="text-content-secondary text-sm">{label}</span>
      )}
    </div>
  );
}

// Status badge component
export type StatusType = "paid" | "pending" | "overdue" | "draft";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const statusClasses: Record<StatusType, string> = {
    paid: "status-paid",
    pending: "status-pending",
    overdue: "bg-error/15 text-error",
    draft: "bg-primary-400/15 text-content-muted",
  };

  const statusLabels: Record<StatusType, string> = {
    paid: "Paid",
    pending: "Pending",
    overdue: "Overdue",
    draft: "Draft",
  };

  return (
    <span className={`status-badge ${statusClasses[status]} ${className}`}>
      {statusLabels[status]}
    </span>
  );
}

export default BrandBadge;
