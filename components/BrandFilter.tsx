"use client";

import { useState } from "react";

type Brand = "all" | "sankofa" | "lighthouse" | "centex" | "gfam";

interface BrandItem {
  id: Brand;
  name: string;
  color: string;
}

const brands: BrandItem[] = [
  { id: "sankofa", name: "Sankofa", color: "bg-brand-sankofa" },
  { id: "lighthouse", name: "Lighthouse", color: "bg-brand-lighthouse" },
  { id: "centex", name: "Centex", color: "bg-brand-centex" },
  { id: "gfam", name: "GFAM Media", color: "bg-brand-gfam" },
];

export function BrandFilter() {
  const [activeBrand, setActiveBrand] = useState<Brand>("all");

  return (
    <div>
      <p className="text-meta font-medium uppercase tracking-wider mb-3 text-sidebar-text">
        Brands
      </p>
      <div className="space-y-2">
        {brands.map((brand) => {
          const isActive = activeBrand === brand.id;
          return (
            <button
              key={brand.id}
              onClick={() => setActiveBrand(isActive ? "all" : brand.id)}
              className={`brand-item flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer w-full text-left transition-all ${
                isActive
                  ? "bg-sidebar-active"
                  : "hover:opacity-80"
              }`}
            >
              <div className={`brand-dot ${brand.color}`} />
              <span
                className={`text-sm ${
                  isActive ? "text-sidebar-text-active" : "text-sidebar-text"
                }`}
              >
                {brand.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BrandFilter;
