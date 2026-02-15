"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { Sidebar, MobileMenuButton } from "./Sidebar";
import { api } from "@/convex/_generated/api";
import { getTenantSlugFromPath } from "@/lib/tenant-routing";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { orgRole } = useAuth();
  const orgBranding = useQuery((api as any).orgBranding?.getCurrent ?? "skip");

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const tenantSlug = getTenantSlugFromPath(pathname ?? "");
  const canSwitchOrganizations = typeof orgRole === "string" &&
    (orgRole.includes("admin") || orgRole.includes("owner"));

  const branding = useMemo(() => ({
    displayName: orgBranding?.displayName ?? "GFAM Agency",
    shortName: orgBranding?.shortName ?? "GFAM",
    logoMark: orgBranding?.logoMark ?? "G",
    logoUrl: orgBranding?.logoUrl as string | undefined,
    primaryColor: orgBranding?.primaryColor ?? "#10B981",
    secondaryColor: orgBranding?.secondaryColor ?? "#3B82F6",
  }), [orgBranding]);

  const logoGradient = `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`;
  const switcherRedirect = tenantSlug ? `/${tenantSlug}` : "/dashboard";
  const tenantCssVars = useMemo(() => ({
    "--brand-sankofa": branding.primaryColor,
    "--brand-gfam": branding.secondaryColor,
    "--tenant-primary": branding.primaryColor,
    "--tenant-secondary": branding.secondaryColor,
  } as CSSProperties), [branding.primaryColor, branding.secondaryColor]);

  return (
    <div className="min-h-screen bg-surface" style={tenantCssVars}>
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} branding={branding} />

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
      <main className="min-h-screen p-4 pt-20 md:pt-6 md:p-6 lg:p-8 ml-0 md:ml-sidebar lg:ml-sidebar-collapsed xl:ml-sidebar transition-all duration-300">
        <div className="max-w-7xl mx-auto">
          {canSwitchOrganizations && (
            <div className="mb-4 md:mb-6 flex justify-end">
              <OrganizationSwitcher
                hidePersonal
                afterSelectOrganizationUrl={switcherRedirect}
                afterCreateOrganizationUrl={switcherRedirect}
              />
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

export default DashboardShell;
