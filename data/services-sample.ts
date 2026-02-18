import type { BrandType } from "@/components/BrandBadge";
import {
  proposalServiceCatalog,
  type ServiceCatalogItem,
} from "./proposal-service-catalog";

export interface ServiceData extends Omit<ServiceCatalogItem, "brand"> {
  brand: BrandType;
}

const toBrandType = (brand: ServiceCatalogItem["brand"]): BrandType =>
  brand as BrandType;

export const allServices: ServiceData[] = proposalServiceCatalog.map((service) => ({
  ...service,
  brand: toBrandType(service.brand),
}));

const activeCount = allServices.filter((service) => service.status === "active").length;

// Service stats (calculated from catalog)
export const serviceStats = {
  total: allServices.length,
  active: activeCount,
  inactive: allServices.length - activeCount,
};

const brandMeta: Partial<Record<BrandType, { label: string; color: string }>> = {
  Sankofa: { label: "Sankofa", color: "#10B981" },
  Lighthouse: { label: "Lighthouse", color: "#8B5CF6" },
  Centex: { label: "Centex", color: "#F59E0B" },
  "GFAM Media Studios": { label: "GFAM Media", color: "#3B82F6" },
};

const preferredBrandOrder: BrandType[] = [
  "Sankofa",
  "Lighthouse",
  "Centex",
  "GFAM Media Studios",
];

const brandsInCatalog = new Set(allServices.map((service) => service.brand));

export interface ServiceBrandFilter {
  key: "all" | BrandType;
  label: string;
  color?: string;
}

// Brand filter options for services
export const serviceBrandFilters: ServiceBrandFilter[] = [
  { key: "all", label: "All Services" },
  ...preferredBrandOrder
    .filter((brand) => brandsInCatalog.has(brand))
    .map((brand) => ({
      key: brand,
      label: brandMeta[brand]?.label ?? brand,
      color: brandMeta[brand]?.color,
    })),
];

// Get brand key for CSS classes
export const getBrandKey = (brand: BrandType): string => {
  switch (brand) {
    case "GFAM Media Studios":
      return "gfam-media";
    default:
      return brand.toLowerCase();
  }
};

const categoryLabelMap: Record<string, string> = {
  website: "Website",
  "social-media": "Social Media",
  marketing: "Marketing",
  video: "Video",
  photography: "Photography",
  bundle: "Bundles",
  podcast: "Podcast",
  "studio-rental": "Studio Rental",
  streaming: "Live Streaming",
};

const categoriesInCatalog = Array.from(
  new Set(allServices.map((service) => service.category)),
).sort((a, b) => {
  const aLabel = categoryLabelMap[a] ?? a;
  const bLabel = categoryLabelMap[b] ?? b;
  return aLabel.localeCompare(bLabel);
});

// Category options for filtering
export const serviceCategoryFilters = [
  { key: "all", label: "All Categories" },
  ...categoriesInCatalog.map((category) => ({
    key: category,
    label: categoryLabelMap[category] ?? category,
  })),
];
