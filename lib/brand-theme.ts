/**
 * Brand Theme Configuration
 * Includes optional curated themes and deterministic dynamic fallbacks
 * so tenant-defined brands render safely without hardcoded assumptions.
 */

export type BrandType = string;

export interface BrandTheme {
  name: BrandType;
  shortName: string;
  tagline: string;
  services: string[];
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    muted: string;
    // Tailwind class names
    tailwind: {
      bg: string;
      bgLight: string;
      text: string;
      border: string;
      pill: string;
      dot: string;
    };
  };
  logo: string;
  icon: string;
  gradient: string;
}

const FALLBACK_PALETTE = [
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

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function adjustHexColor(hex: string, ratio: number): string {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return hex;
  }
  const base = parseInt(normalized, 16);
  const r = (base >> 16) & 0xff;
  const g = (base >> 8) & 0xff;
  const b = base & 0xff;
  const to = ratio >= 0 ? 255 : 0;
  const mix = Math.abs(ratio);

  const nr = clampChannel(r + (to - r) * mix);
  const ng = clampChannel(g + (to - g) * mix);
  const nb = clampChannel(b + (to - b) * mix);

  return `#${[nr, ng, nb].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function shortenBrandName(brand: string): string {
  if (brand.length <= 14) {
    return brand;
  }
  return `${brand.slice(0, 13).trim()}…`;
}

function brandMonogram(brand: string): string {
  const parts = brand
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "B";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "B";
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function createDynamicBrandTheme(input: string): BrandTheme {
  const brand = input.trim() || "Brand";
  const hash = hashBrand(brand);
  const primary = FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
  const secondary = FALLBACK_PALETTE[(hash + 3) % FALLBACK_PALETTE.length];
  const accent = FALLBACK_PALETTE[(hash + 5) % FALLBACK_PALETTE.length];

  return {
    name: brand,
    shortName: shortenBrandName(brand),
    tagline: "Service Brand",
    services: [],
    colors: {
      primary,
      primaryHover: adjustHexColor(primary, -0.15),
      secondary,
      accent,
      background: adjustHexColor(primary, 0.9),
      text: "#0F172A",
      muted: "#64748B",
      tailwind: {
        bg: "bg-slate-700",
        bgLight: "bg-slate-50",
        text: "text-slate-700",
        border: "border-slate-200",
        pill: "bg-slate-100 text-slate-800",
        dot: "bg-slate-600",
      },
    },
    logo: "",
    icon: brandMonogram(brand),
    gradient: "from-slate-900 via-slate-700 to-slate-500",
  };
}

/**
 * Brand theme configurations
 */
export const BRAND_THEMES: Record<BrandType, BrandTheme> = {
  Sankofa: {
    name: "Sankofa",
    shortName: "Sankofa",
    tagline: "Marketing & Web Development",
    services: ["Website Development", "Social Media Management", "Digital Marketing"],
    colors: {
      primary: "#8B4513",
      primaryHover: "#A0522D",
      secondary: "#D2691E",
      accent: "#FFD700",
      background: "#FDF5E6",
      text: "#2C1810",
      muted: "#8B7355",
      tailwind: {
        bg: "bg-amber-600",
        bgLight: "bg-amber-50",
        text: "text-amber-600",
        border: "border-amber-200",
        pill: "brand-pill-sankofa",
        dot: "bg-brand-sankofa",
      },
    },
    logo: "/logos/sankofa.svg",
    icon: "🦅",
    gradient: "from-amber-700 via-orange-600 to-yellow-500",
  },
  Lighthouse: {
    name: "Lighthouse",
    shortName: "Lighthouse",
    tagline: "Post-Production & Visual Media",
    services: ["Video Editing", "Color Grading", "Motion Graphics", "Photography"],
    colors: {
      primary: "#1E3A5F",
      primaryHover: "#2C5282",
      secondary: "#4299E1",
      accent: "#F6E05E",
      background: "#EBF8FF",
      text: "#1A202C",
      muted: "#718096",
      tailwind: {
        bg: "bg-blue-600",
        bgLight: "bg-blue-50",
        text: "text-blue-600",
        border: "border-blue-200",
        pill: "brand-pill-lighthouse",
        dot: "bg-brand-lighthouse",
      },
    },
    logo: "/logos/lighthouse.svg",
    icon: "🏠",
    gradient: "from-blue-900 via-blue-600 to-yellow-400",
  },
  Centex: {
    name: "Centex",
    shortName: "Centex",
    tagline: "Sports Podcasts & Live Production",
    services: ["Sports Podcasts", "Live Event Streaming", "Sports Commentary"],
    colors: {
      primary: "#DC2626",
      primaryHover: "#EF4444",
      secondary: "#1F2937",
      accent: "#FBBF24",
      background: "#FEF2F2",
      text: "#111827",
      muted: "#6B7280",
      tailwind: {
        bg: "bg-red-600",
        bgLight: "bg-red-50",
        text: "text-red-600",
        border: "border-red-200",
        pill: "brand-pill-centex",
        dot: "bg-brand-centex",
      },
    },
    logo: "/logos/centex.svg",
    icon: "🏆",
    gradient: "from-red-600 via-red-500 to-amber-500",
  },
  "GFAM Media Studios": {
    name: "GFAM Media Studios",
    shortName: "GFAM Media",
    tagline: "Podcasts, Photography & Studio Rentals",
    services: ["Podcast Production", "Studio Photography", "Studio Rentals"],
    colors: {
      primary: "#7C3AED",
      primaryHover: "#8B5CF6",
      secondary: "#EC4899",
      accent: "#10B981",
      background: "#FAF5FF",
      text: "#1F2937",
      muted: "#9CA3AF",
      tailwind: {
        bg: "bg-purple-600",
        bgLight: "bg-purple-50",
        text: "text-purple-600",
        border: "border-purple-200",
        pill: "brand-pill-gfam",
        dot: "bg-brand-gfam",
      },
    },
    logo: "/logos/gfam-studios.svg",
    icon: "🎙️",
    gradient: "from-purple-600 via-pink-500 to-emerald-400",
  },
};

/**
 * Parent organization name
 */
export const PARENT_ORGANIZATION =
  process.env.NEXT_PUBLIC_PARENT_ORGANIZATION?.trim() || "Agency";

/**
 * Parent theme used for multi-brand contexts.
 */
export const AGENCY_THEME: Omit<BrandTheme, "name"> & { name: string } = {
  name: PARENT_ORGANIZATION,
  shortName: "AGENCY",
  tagline: "Multi-Brand Services",
  services: ["All Services"],
  colors: {
    primary: "#0F172A",
    primaryHover: "#1E293B",
    secondary: "#3B82F6",
    accent: "#F59E0B",
    background: "#F8FAFC",
    text: "#0F172A",
    muted: "#64748B",
    tailwind: {
      bg: "bg-slate-800",
      bgLight: "bg-slate-50",
      text: "text-slate-800",
      border: "border-slate-200",
      pill: "bg-slate-100 text-slate-800",
      dot: "bg-slate-600",
    },
  },
  logo: "/logos/gfam-agency.svg",
  icon: "🏢",
  gradient: "from-slate-900 via-blue-600 to-amber-500",
};

/**
 * Get the theme for a specific brand
 */
export function getBrandTheme(brand: BrandType | string): BrandTheme {
  const normalized = brand.trim();
  if (!normalized) {
    return AGENCY_THEME as BrandTheme;
  }

  return BRAND_THEMES[normalized as BrandType] ?? createDynamicBrandTheme(normalized);
}

/**
 * Get theme for primary brand from an invoice
 * If multiple brands, returns the agency theme
 */
export function getInvoiceTheme(
  participatingBrands: string[]
): BrandTheme | typeof AGENCY_THEME {
  if (participatingBrands.length === 1) {
    return getBrandTheme(participatingBrands[0]);
  }
  return AGENCY_THEME;
}

/**
 * Generate CSS custom properties for a brand theme
 */
export function getBrandCSSVariables(
  theme: BrandTheme | typeof AGENCY_THEME
): Record<string, string> {
  return {
    "--brand-primary": theme.colors.primary,
    "--brand-primary-hover": theme.colors.primaryHover,
    "--brand-secondary": theme.colors.secondary,
    "--brand-accent": theme.colors.accent,
    "--brand-background": theme.colors.background,
    "--brand-text": theme.colors.text,
    "--brand-muted": theme.colors.muted,
  };
}

/**
 * Get all brand names
 */
export function getAllBrands(): BrandType[] {
  return Object.keys(BRAND_THEMES) as BrandType[];
}

/**
 * Check if a string is a valid brand
 */
export function isValidBrand(brand: string): brand is BrandType {
  return brand in BRAND_THEMES;
}

/**
 * Get brand icon for display
 */
export function getBrandIcon(brand: BrandType | string): string {
  const theme = getBrandTheme(brand);
  return theme.icon;
}

/**
 * Format cents to dollar string
 */
export function formatCentsToDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Convert dollars to cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}
