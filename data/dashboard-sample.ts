import type { Invoice } from "@/components/InvoiceTable";
import type { BrandType } from "@/components/BrandBadge";

// KPI Data
export const kpiData = {
  totalRevenue: {
    value: "$24,580",
    trend: { value: "12%", direction: "up" as const },
  },
  pendingInvoices: {
    count: 12,
    amount: "$8,420",
  },
  activeServices: {
    count: 48,
    trend: "+4 new",
  },
  totalClients: {
    count: 86,
    trend: "+3",
  },
};

// Revenue by Brand data
export const revenueByBrand = [
  { brand: "Sankofa", revenue: 9200, color: "#10B981" },
  { brand: "Lighthouse", revenue: 6800, color: "#8B5CF6" },
  { brand: "Centex", revenue: 4200, color: "#F59E0B" },
  { brand: "GFAM Media", revenue: 4400, color: "#3B82F6" },
];

// Sample invoices
export const recentInvoices: Invoice[] = [
  {
    id: "inv-1042",
    invoiceNumber: "#INV-1042",
    client: {
      name: "Acme Corp",
      initials: "AC",
    },
    brand: "Sankofa" as BrandType,
    amount: 2400.0,
    date: "Jan 15, 2026",
    status: "paid",
  },
  {
    id: "inv-1041",
    invoiceNumber: "#INV-1041",
    client: {
      name: "TechStart Inc",
      initials: "TS",
      avatarBg: "rgba(139, 92, 246, 0.15)",
    },
    brand: "Lighthouse" as BrandType,
    amount: 1850.0,
    date: "Jan 14, 2026",
    status: "pending",
  },
  {
    id: "inv-1040",
    invoiceNumber: "#INV-1040",
    client: {
      name: "MediaCo",
      initials: "MC",
      avatarBg: "rgba(245, 158, 11, 0.15)",
    },
    brand: "Centex" as BrandType,
    amount: 3200.0,
    date: "Jan 12, 2026",
    status: "paid",
  },
  {
    id: "inv-1039",
    invoiceNumber: "#INV-1039",
    client: {
      name: "StartupXYZ",
      initials: "SX",
      avatarBg: "rgba(59, 130, 246, 0.15)",
    },
    brand: "GFAM Media Studios" as BrandType,
    amount: 890.0,
    date: "Jan 10, 2026",
    status: "pending",
  },
];
