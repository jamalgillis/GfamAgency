"use client";

import { useOrganization } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar, MobileMenuButton } from "./Sidebar";
import { FeedbackWidget } from "./FeedbackWidget";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/useAuthQuery";

interface DashboardShellProps {
  children: React.ReactNode;
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() ?? "";
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function mixHexColor(a: string, b: string, weight = 0.5): string {
  const clampWeight = Math.min(1, Math.max(0, weight));
  const colorA = parseInt(a.replace("#", ""), 16);
  const colorB = parseInt(b.replace("#", ""), 16);
  const aR = (colorA >> 16) & 0xff;
  const aG = (colorA >> 8) & 0xff;
  const aB = colorA & 0xff;
  const bR = (colorB >> 16) & 0xff;
  const bG = (colorB >> 8) & 0xff;
  const bB = colorB & 0xff;

  const r = Math.round(aR * (1 - clampWeight) + bR * clampWeight);
  const g = Math.round(aG * (1 - clampWeight) + bG * clampWeight);
  const bChannel = Math.round(aB * (1 - clampWeight) + bB * clampWeight);

  return `#${[r, g, bChannel].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isLoaded: isOrganizationLoaded, organization } = useOrganization();
  const bootstrapCurrent = useMutation(api.orgBranding.bootstrapCurrent);
  const bootstrappedOrgIdsRef = useRef(new Set<string>());
  const orgBranding = useAuthQuery(api.orgBranding.getCurrent, {});

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const toggleCollapse = () => setSidebarCollapsed((prev) => !prev);
  const branding = useMemo(() => ({
    displayName: orgBranding?.displayName ?? "Agency",
    shortName: orgBranding?.shortName ?? "AGENCY",
    logoMark: orgBranding?.logoMark ?? "A",
    logoUrl: orgBranding?.logoUrl as string | undefined,
    primaryColor: orgBranding?.primaryColor ?? "#10B981",
    secondaryColor: orgBranding?.secondaryColor ?? "#3B82F6",
  }), [orgBranding]);

  const logoGradient = `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`;
  const tenantBrandVars = useMemo(() => {
    const primary = normalizeHexColor(branding.primaryColor, "#10B981");
    const secondary = normalizeHexColor(branding.secondaryColor, "#3B82F6");
    const tertiary = mixHexColor(primary, secondary, 0.35);
    const quaternary = mixHexColor(primary, secondary, 0.7);

    return {
      primary,
      secondary,
      tertiary,
      quaternary,
    };
  }, [branding.primaryColor, branding.secondaryColor]);

  const tenantCssVars = useMemo(() => ({
    "--brand-sankofa": tenantBrandVars.primary,
    "--brand-lighthouse": tenantBrandVars.secondary,
    "--brand-centex": tenantBrandVars.tertiary,
    "--brand-gfam": tenantBrandVars.quaternary,
    "--tenant-primary": tenantBrandVars.primary,
    "--tenant-secondary": tenantBrandVars.secondary,
  } as CSSProperties), [tenantBrandVars]);

  useEffect(() => {
    const orgId = organization?.id;

    if (!isOrganizationLoaded || !orgId || bootstrappedOrgIdsRef.current.has(orgId)) {
      return;
    }

    let cancelled = false;

    void bootstrapCurrent({
      displayName: organization.name || undefined,
    }).then(() => {
      if (!cancelled) {
        bootstrappedOrgIdsRef.current.add(orgId);
      }
    }).catch(() => {
      // Leave the org unmarked so the next render can retry.
    });

    return () => {
      cancelled = true;
    };
  }, [bootstrapCurrent, isOrganizationLoaded, organization]);

  return (
    <div className="min-h-dvh bg-surface" style={tenantCssVars}>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        collapsed={sidebarCollapsed}
        onCollapseToggle={toggleCollapse}
      />
      <FeedbackWidget organizationName={branding.displayName} />

      {/* Mobile Header Bar */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border flex items-center justify-between px-4 z-30 md:hidden">
        <MobileMenuButton onClick={toggleSidebar} />
        <div className="flex items-center gap-2">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${branding.displayName} logo`}
              className="w-8 h-8 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: logoGradient }}>
              <span className="text-white font-bold text-sm">{branding.logoMark}</span>
            </div>
          )}
          <span className="font-semibold text-content">{branding.displayName}</span>
        </div>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      {/* Main Content */}
      <main
        className={`min-h-dvh bg-surface p-4 pt-20 md:pt-6 md:p-6 lg:p-8 ml-0 transition-all duration-300 ${
          sidebarCollapsed ? "md:ml-sidebar-collapsed" : "md:ml-sidebar"
        }`}
      >
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default DashboardShell;
