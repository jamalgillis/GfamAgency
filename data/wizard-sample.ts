import type { BrandType } from "@/components/BrandBadge";

// Re-export BrandType for convenience
export type { BrandType };

export interface WizardClient {
  id: string;
  name: string;
  company: string;
  email: string;
  initials: string;
  avatarBg?: string;
}

export interface WizardService {
  id: string;
  brand: BrandType;
  name: string;
  description: string;
  baseRate: number;
  category: string;
  isCustom?: boolean; // True for ad-hoc line items
}

// Type for selected services with optional custom rate override
export interface SelectedServiceItem {
  service: WizardService;
  quantity: number;
  customRate?: number; // Override rate for legacy/custom pricing
  customName?: string; // Override name for ad-hoc items
}

export const sampleClients: WizardClient[] = [
  {
    id: "c1",
    name: "John Smith",
    company: "Acme Corp",
    email: "john@acme.com",
    initials: "JS",
  },
  {
    id: "c2",
    name: "Sarah Johnson",
    company: "TechStart Inc",
    email: "sarah@techstart.io",
    initials: "SJ",
    avatarBg: "rgba(139, 92, 246, 0.15)",
  },
  {
    id: "c3",
    name: "Mike Chen",
    company: "MediaCo",
    email: "mike@mediaco.tv",
    initials: "MC",
    avatarBg: "rgba(245, 158, 11, 0.15)",
  },
  {
    id: "c4",
    name: "Emily Davis",
    company: "StartupXYZ",
    email: "emily@startupxyz.com",
    initials: "ED",
    avatarBg: "rgba(59, 130, 246, 0.15)",
  },
  {
    id: "c5",
    name: "Robert Wilson",
    company: "Wilson & Associates",
    email: "robert@wilsonassoc.com",
    initials: "RW",
  },
];

export const sampleServices: WizardService[] = [
  // Sankofa - Marketing & Web
  {
    id: "s1",
    brand: "Sankofa",
    name: "Starter Website Package",
    description: "5-page responsive website with contact form",
    baseRate: 1500,
    category: "website",
  },
  {
    id: "s2",
    brand: "Sankofa",
    name: "Professional Website Package",
    description: "10-page custom website with CMS integration",
    baseRate: 3500,
    category: "website",
  },
  {
    id: "s3",
    brand: "Sankofa",
    name: "E-commerce Add-on",
    description: "Shopping cart, payment integration, product management",
    baseRate: 2000,
    category: "website",
  },
  {
    id: "s4",
    brand: "Sankofa",
    name: "Social Media Management (Monthly)",
    description: "Content creation, scheduling, and engagement",
    baseRate: 800,
    category: "social-media",
  },
  {
    id: "s5",
    brand: "Sankofa",
    name: "Brand Identity Package",
    description: "Logo design, color palette, brand guidelines",
    baseRate: 1200,
    category: "website",
  },

  // Lighthouse - Video & Photo
  {
    id: "s6",
    brand: "Lighthouse",
    name: "Video Editing (Per Hour)",
    description: "Professional video editing and color grading",
    baseRate: 75,
    category: "video",
  },
  {
    id: "s7",
    brand: "Lighthouse",
    name: "Promotional Video Package",
    description: "60-second promo video with scripting and editing",
    baseRate: 1500,
    category: "video",
  },
  {
    id: "s8",
    brand: "Lighthouse",
    name: "Photography Session (Half Day)",
    description: "4-hour shoot with 20 edited photos",
    baseRate: 600,
    category: "photography",
  },
  {
    id: "s9",
    brand: "Lighthouse",
    name: "Photography Session (Full Day)",
    description: "8-hour shoot with 50 edited photos",
    baseRate: 1100,
    category: "photography",
  },
  {
    id: "s10",
    brand: "Lighthouse",
    name: "Website + Video Bundle",
    description: "Professional website + promotional video package",
    baseRate: 4500,
    category: "bundle",
  },

  // Centex - Sports & Live
  {
    id: "s11",
    brand: "Centex",
    name: "Live Event Streaming (Per Event)",
    description: "Multi-camera live stream setup and production",
    baseRate: 2500,
    category: "streaming",
  },
  {
    id: "s12",
    brand: "Centex",
    name: "Sports Podcast Production (Per Episode)",
    description: "Recording, editing, and distribution",
    baseRate: 350,
    category: "podcast",
  },
  {
    id: "s13",
    brand: "Centex",
    name: "Sports Highlight Reel",
    description: "Custom highlight video with graphics and music",
    baseRate: 800,
    category: "video",
  },

  // GFAM Media Studios - Podcasts & Studio
  {
    id: "s14",
    brand: "GFAM Media Studios",
    name: "Studio Rental (Per Hour)",
    description: "Professional studio space with basic equipment",
    baseRate: 75,
    category: "studio-rental",
  },
  {
    id: "s15",
    brand: "GFAM Media Studios",
    name: "Studio Rental (Half Day)",
    description: "4-hour studio rental with full equipment access",
    baseRate: 250,
    category: "studio-rental",
  },
  {
    id: "s16",
    brand: "GFAM Media Studios",
    name: "Podcast Production (Per Episode)",
    description: "Recording, editing, mixing, and mastering",
    baseRate: 250,
    category: "podcast",
  },
  {
    id: "s17",
    brand: "GFAM Media Studios",
    name: "Podcast Launch Package",
    description: "First 4 episodes + cover art + distribution setup",
    baseRate: 1200,
    category: "podcast",
  },
];

// Helper to filter services by brand
export const getServicesByBrand = (brand: BrandType): WizardService[] => {
  return sampleServices.filter((s) => s.brand === brand);
};

// Brand metadata for tabs
export const brandTabs = [
  { id: "Sankofa" as BrandType, label: "Sankofa", subtitle: "Marketing & Web", color: "sankofa" },
  { id: "Lighthouse" as BrandType, label: "Lighthouse", subtitle: "Video & Photo", color: "lighthouse" },
  { id: "Centex" as BrandType, label: "Centex", subtitle: "Sports & Live", color: "centex" },
  { id: "GFAM Media Studios" as BrandType, label: "GFAM Media", subtitle: "Podcasts & Studio", color: "gfam" },
];
