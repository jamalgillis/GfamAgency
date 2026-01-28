/**
 * Brand Theme Configuration
 * Defines colors, logos, and styling for each GFAM Agency sub-brand
 * Single Stripe account with metadata-based revenue tracking
 */

export type BrandType = "Sankofa" | "Lighthouse" | "Centex" | "GFAM Media Studios";

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
export const PARENT_ORGANIZATION = "GFAM Agency";

/**
 * GFAM Agency parent theme (used for multi-brand contexts)
 */
export const AGENCY_THEME: Omit<BrandTheme, "name"> & { name: string } = {
  name: PARENT_ORGANIZATION,
  shortName: "GFAM",
  tagline: "Full-Service Media Agency",
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
  return BRAND_THEMES[brand as BrandType] ?? (AGENCY_THEME as BrandTheme);
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
