import type { BrandType, StatusType } from "@/components/BrandBadge";

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  client: {
    name: string;
    email: string;
    initials: string;
    avatarBg?: string;
  };
  service: string;
  brand: BrandType;
  amount: number;
  date: string;
  dueDate: string;
  status: StatusType;
}

// Invoice Summary Stats
export const invoiceSummary = {
  totalRevenue: {
    amount: 42580,
    count: 86,
  },
  paid: {
    amount: 34160,
    count: 68,
  },
  pending: {
    amount: 6420,
    count: 14,
  },
  overdue: {
    amount: 2000,
    count: 4,
  },
};

// Extended invoice list
export const allInvoices: InvoiceData[] = [
  {
    id: "inv-1042",
    invoiceNumber: "#INV-1042",
    client: {
      name: "Acme Corp",
      email: "billing@acme.com",
      initials: "AC",
    },
    service: "Website Design & Dev",
    brand: "Sankofa",
    amount: 2400.0,
    date: "Jan 15, 2026",
    dueDate: "Jan 30",
    status: "paid",
  },
  {
    id: "inv-1041",
    invoiceNumber: "#INV-1041",
    client: {
      name: "TechStart Inc",
      email: "accounts@techstart.io",
      initials: "TS",
      avatarBg: "rgba(139, 92, 246, 0.15)",
    },
    service: "Video Editing Package",
    brand: "Lighthouse",
    amount: 1850.0,
    date: "Jan 14, 2026",
    dueDate: "Jan 28",
    status: "pending",
  },
  {
    id: "inv-1040",
    invoiceNumber: "#INV-1040",
    client: {
      name: "MediaCo",
      email: "finance@mediaco.com",
      initials: "MC",
      avatarBg: "rgba(245, 158, 11, 0.15)",
    },
    service: "Live Stream Production",
    brand: "Centex",
    amount: 3200.0,
    date: "Jan 12, 2026",
    dueDate: "Jan 26",
    status: "paid",
  },
  {
    id: "inv-1039",
    invoiceNumber: "#INV-1039",
    client: {
      name: "StartupXYZ",
      email: "pay@startupxyz.co",
      initials: "SX",
      avatarBg: "rgba(59, 130, 246, 0.15)",
    },
    service: "Studio Rental (8hrs)",
    brand: "GFAM Media Studios",
    amount: 890.0,
    date: "Jan 5, 2026",
    dueDate: "Jan 19",
    status: "overdue",
  },
  {
    id: "inv-1038",
    invoiceNumber: "#INV-1038",
    client: {
      name: "GrowthCo",
      email: "ap@growthco.io",
      initials: "GC",
    },
    service: "Social Media Management",
    brand: "Sankofa",
    amount: 800.0,
    date: "Jan 3, 2026",
    dueDate: "Feb 3",
    status: "pending",
  },
  {
    id: "inv-1037",
    invoiceNumber: "#INV-1037",
    client: {
      name: "EventPros",
      email: "billing@eventpros.com",
      initials: "EP",
      avatarBg: "rgba(139, 92, 246, 0.15)",
    },
    service: "Photography Package",
    brand: "Lighthouse",
    amount: 1500.0,
    date: "Jan 2, 2026",
    dueDate: "Jan 16",
    status: "paid",
  },
  {
    id: "inv-1036",
    invoiceNumber: "#INV-1036",
    client: {
      name: "SportsCentral",
      email: "accounts@sportscentral.tv",
      initials: "SC",
      avatarBg: "rgba(245, 158, 11, 0.15)",
    },
    service: "Game Day Broadcast",
    brand: "Centex",
    amount: 4500.0,
    date: "Dec 28, 2025",
    dueDate: "Jan 12",
    status: "paid",
  },
  {
    id: "inv-1035",
    invoiceNumber: "#INV-1035",
    client: {
      name: "PodcastNetwork",
      email: "finance@podnet.fm",
      initials: "PN",
      avatarBg: "rgba(59, 130, 246, 0.15)",
    },
    service: "Podcast Production (10 eps)",
    brand: "GFAM Media Studios",
    amount: 2200.0,
    date: "Dec 22, 2025",
    dueDate: "Jan 5",
    status: "overdue",
  },
  {
    id: "inv-1034",
    invoiceNumber: "#INV-1034",
    client: {
      name: "LocalBiz LLC",
      email: "owner@localbiz.com",
      initials: "LB",
    },
    service: "SEO & Web Maintenance",
    brand: "Sankofa",
    amount: 650.0,
    date: "Dec 20, 2025",
    dueDate: "Jan 3",
    status: "paid",
  },
  {
    id: "inv-1033",
    invoiceNumber: "#INV-1033",
    client: {
      name: "WeddingVibes",
      email: "inquiries@weddingvibes.co",
      initials: "WV",
      avatarBg: "rgba(139, 92, 246, 0.15)",
    },
    service: "Wedding Video Edit",
    brand: "Lighthouse",
    amount: 2800.0,
    date: "Dec 18, 2025",
    dueDate: "Jan 2",
    status: "paid",
  },
];

// Brand filter options
export const brandFilters = [
  { key: "all", label: "All" },
  { key: "Sankofa", label: "Sankofa", color: "#10B981" },
  { key: "Lighthouse", label: "Lighthouse", color: "#8B5CF6" },
  { key: "Centex", label: "Centex", color: "#F59E0B" },
  { key: "GFAM Media Studios", label: "GFAM Media", color: "#3B82F6" },
];

// Status filter options
export const statusFilters = [
  { key: "all", label: "All Statuses" },
  { key: "paid", label: "Paid", color: "#10B981" },
  { key: "pending", label: "Pending", color: "#F59E0B" },
  { key: "overdue", label: "Overdue", color: "#EF4444" },
];

// Date range presets
export const dateRanges = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
];
