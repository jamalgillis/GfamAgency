"use client";

export type BrandType = "Sankofa" | "Lighthouse" | "Centex" | "GFAM Media Studios";

interface BrandBadgeProps {
  brand: BrandType;
  variant?: "pill" | "dot";
  showLabel?: boolean;
  className?: string;
}

const brandConfig: Record<BrandType, { color: string; dotColor: string }> = {
  Sankofa: {
    color: "brand-pill-sankofa",
    dotColor: "bg-brand-sankofa",
  },
  Lighthouse: {
    color: "brand-pill-lighthouse",
    dotColor: "bg-brand-lighthouse",
  },
  Centex: {
    color: "brand-pill-centex",
    dotColor: "bg-brand-centex",
  },
  "GFAM Media Studios": {
    color: "brand-pill-gfam",
    dotColor: "bg-brand-gfam",
  },
};

// Short labels for display
const brandLabels: Record<BrandType, string> = {
  Sankofa: "Sankofa",
  Lighthouse: "Lighthouse",
  Centex: "Centex",
  "GFAM Media Studios": "GFAM Media",
};

export function BrandBadge({
  brand,
  variant = "dot",
  showLabel = true,
  className = "",
}: BrandBadgeProps) {
  const config = brandConfig[brand];
  const label = brandLabels[brand];

  if (variant === "pill") {
    return (
      <span className={`brand-pill ${config.color} ${className}`}>
        {label}
      </span>
    );
  }

  // Dot variant
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
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
