"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  BRAND_THEMES,
  AGENCY_THEME,
  getBrandTheme,
  getBrandCSSVariables,
  type BrandType,
  type BrandTheme,
} from "@/lib/brand-theme";

interface BrandThemeContextValue {
  // Current active theme
  activeTheme: BrandTheme | typeof AGENCY_THEME;

  // Active brands from selected services
  activeBrands: BrandType[];

  // Set active brands (from invoice line items)
  setActiveBrands: (brands: BrandType[]) => void;

  // Get theme for specific brand
  getTheme: (brand: BrandType | string) => BrandTheme;

  // Check if multi-brand (uses agency theme)
  isMultiBrand: boolean;

  // CSS variables for current theme
  cssVariables: Record<string, string>;

  // Primary brand name
  primaryBrand: string;
}

const BrandThemeContext = createContext<BrandThemeContextValue | null>(null);

interface BrandThemeProviderProps {
  children: ReactNode;
  initialBrands?: BrandType[];
}

export function BrandThemeProvider({
  children,
  initialBrands = [],
}: BrandThemeProviderProps) {
  const [activeBrands, setActiveBrandsState] = useState<BrandType[]>(initialBrands);

  const setActiveBrands = useCallback((brands: BrandType[]) => {
    // Filter to unique valid brands
    const uniqueBrands = [...new Set(brands)].filter(
      (brand) => brand in BRAND_THEMES
    );
    setActiveBrandsState(uniqueBrands);
  }, []);

  const isMultiBrand = activeBrands.length > 1;

  const activeTheme = useMemo(() => {
    if (activeBrands.length === 0) {
      return AGENCY_THEME;
    }
    if (activeBrands.length === 1) {
      return BRAND_THEMES[activeBrands[0]];
    }
    // Multiple brands - use agency theme
    return AGENCY_THEME;
  }, [activeBrands]);

  const cssVariables = useMemo(
    () => getBrandCSSVariables(activeTheme),
    [activeTheme]
  );

  const primaryBrand = useMemo(() => {
    if (activeBrands.length === 1) {
      return activeBrands[0];
    }
    return "GFAM Agency";
  }, [activeBrands]);

  const value: BrandThemeContextValue = useMemo(
    () => ({
      activeTheme,
      activeBrands,
      setActiveBrands,
      getTheme: getBrandTheme,
      isMultiBrand,
      cssVariables,
      primaryBrand,
    }),
    [activeTheme, activeBrands, setActiveBrands, isMultiBrand, cssVariables, primaryBrand]
  );

  return (
    <BrandThemeContext.Provider value={value}>
      {children}
    </BrandThemeContext.Provider>
  );
}

/**
 * Hook to access brand theme context
 */
export function useBrandTheme() {
  const context = useContext(BrandThemeContext);
  if (!context) {
    throw new Error("useBrandTheme must be used within a BrandThemeProvider");
  }
  return context;
}

/**
 * Hook to get brand-specific styles
 */
export function useBrandStyles(brand?: BrandType | string) {
  const { getTheme, activeTheme } = useBrandTheme();

  const theme = brand ? getTheme(brand) : activeTheme;

  return useMemo(
    () => ({
      theme,
      colors: theme.colors,
      tailwind: theme.colors.tailwind,
      gradient: theme.gradient,
      icon: theme.icon,
      cssVariables: getBrandCSSVariables(theme),
    }),
    [theme]
  );
}

export default BrandThemeProvider;
