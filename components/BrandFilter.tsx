"use client";

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { getBrandColor, getBrandDisplayName } from "@/components/BrandBadge";

export function BrandFilter() {
  const services = useAuthQuery(api.services.list, { limit: 5000 });
  const [activeBrand, setActiveBrand] = useState("all");
  const brands = useMemo(() => {
    const brandSet = new Set<string>();
    for (const service of services ?? []) {
      brandSet.add(service.brand);
    }

    return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
  }, [services]);

  return (
    <div>
      <p className="text-meta font-medium uppercase tracking-wider mb-3 text-sidebar-text">
        Brands
      </p>
      <div className="space-y-2">
        {brands.map((brand) => {
          const isActive = activeBrand === brand;
          return (
            <button
              key={brand}
              onClick={() => setActiveBrand(isActive ? "all" : brand)}
              className={`brand-item flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer w-full text-left transition-all ${
                isActive
                  ? "bg-sidebar-active"
                  : "hover:opacity-80"
              }`}
            >
              <div className="brand-dot" style={{ background: getBrandColor(brand) }} />
              <span
                className={`text-sm ${
                  isActive ? "text-sidebar-text-active" : "text-sidebar-text"
                }`}
              >
                {getBrandDisplayName(brand)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BrandFilter;
