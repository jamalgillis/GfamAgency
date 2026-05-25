"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Repeat,
  Users,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BrandFilter } from "./BrandFilter";
import {
  dashboardPathToTenantHostPath,
  dashboardPathToTenantPath,
  getTenantSlugFromHost,
  getTenantSlugFromPath,
  tenantHostPathToDashboardPath,
  tenantPathToDashboardPath,
} from "@/lib/tenant-routing";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/services", label: "Services", icon: Briefcase },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const commonOrgSwitcherElements = {
  organizationSwitcherPopoverCard:
    "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-xl",
  organizationSwitcherPopoverMain: "bg-white dark:bg-zinc-900",
  organizationSwitcherPopoverActions:
    "bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700",
  organizationSwitcherPopoverActionButton:
    "text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800",
  organizationSwitcherPopoverActionButton__manageOrganization:
    "text-zinc-900 dark:text-zinc-100 font-semibold",
  organizationSwitcherPopoverActionButton__createOrganization:
    "text-zinc-900 dark:text-zinc-100 font-semibold",
  organizationSwitcherPreviewButton:
    "hover:bg-zinc-100 dark:hover:bg-zinc-800",
  organizationPreviewMainIdentifier__organizationSwitcherListedOrganization:
    "text-zinc-900 dark:text-zinc-100 font-semibold",
  organizationPreviewSecondaryIdentifier__organizationSwitcherListedOrganization:
    "text-zinc-700 dark:text-zinc-300",
  organizationPreviewMainIdentifier__organizationList:
    "text-zinc-900 dark:text-zinc-100 font-semibold",
  organizationPreviewSecondaryIdentifier__organizationList:
    "text-zinc-700 dark:text-zinc-300",
  organizationPreviewMainIdentifier__organizationSwitcherActiveOrganization:
    "text-zinc-900 dark:text-zinc-100 font-semibold",
  organizationPreviewSecondaryIdentifier__organizationSwitcherActiveOrganization:
    "text-zinc-700 dark:text-zinc-300",
} as const;

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
  collapsed?: boolean;
  onCollapseToggle?: () => void;
}

export function Sidebar({ isOpen = false, onToggle, collapsed = false, onCollapseToggle }: SidebarProps) {
  const pathname = usePathname();
  const resolvedPathname = pathname ?? "";
  const currentHostname =
    typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
  const canonicalHost =
    process.env.NEXT_PUBLIC_CANONICAL_PRODUCTION_DOMAIN?.trim().toLowerCase() || null;
  const tenantBaseDomain =
    process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE_DOMAIN?.trim().toLowerCase() ||
    canonicalHost;
  const hostTenantSlug = getTenantSlugFromHost(currentHostname, {
    baseDomain: tenantBaseDomain,
    canonicalHost,
  });
  const pathTenantSlug = hostTenantSlug
    ? (
        resolvedPathname === `/${hostTenantSlug}` ||
        resolvedPathname.startsWith(`/${hostTenantSlug}/`)
      )
        ? hostTenantSlug
        : null
    : getTenantSlugFromPath(resolvedPathname);
  const usesTenantHostPaths =
    !!hostTenantSlug &&
    !pathTenantSlug &&
    tenantHostPathToDashboardPath(resolvedPathname) !== null;
  const pathnameForMatching = pathTenantSlug
    ? tenantPathToDashboardPath(resolvedPathname) ?? resolvedPathname
    : usesTenantHostPaths
      ? tenantHostPathToDashboardPath(resolvedPathname) ?? resolvedPathname
      : resolvedPathname;
  const canonicalDashboardRedirect =
    canonicalHost && typeof window !== "undefined"
      ? `${window.location.protocol}//${canonicalHost}/dashboard`
      : "/dashboard";
  const switcherRedirect = hostTenantSlug
    ? canonicalDashboardRedirect
    : pathTenantSlug
      ? `/${pathTenantSlug}`
      : "/dashboard";
  const createOrganizationUrl = "/organization-select?next=/dashboard";

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (isOpen && onToggle) {
      onToggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-screen flex flex-col bg-sidebar z-50 transition-all duration-300
          ${collapsed ? "w-sidebar-collapsed" : "w-[280px] md:w-sidebar"}
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Organization Switcher */}
        <div className="sidebar-org-switcher p-6 border-b border-sidebar-border flex items-center gap-3">
          <div className={collapsed ? "w-full" : "flex-1 min-w-0"}>
            {collapsed ? (
              <OrganizationSwitcher
                hidePersonal
                afterSelectOrganizationUrl={switcherRedirect}
                afterCreateOrganizationUrl={switcherRedirect}
                createOrganizationMode="navigation"
                createOrganizationUrl={createOrganizationUrl}
                appearance={{
                  elements: {
                    ...commonOrgSwitcherElements,
                    rootBox: "w-full min-w-0",
                    organizationSwitcherTrigger:
                      "w-full justify-center px-0 py-0 border-none shadow-none bg-transparent hover:bg-transparent focus:shadow-none",
                    organizationPreviewAvatarBox: "w-10 h-10 rounded-lg flex-shrink-0",
                    organizationPreviewMainIdentifier: "hidden",
                    organizationPreviewSecondaryIdentifier: "hidden",
                    organizationSwitcherTriggerIcon: "hidden",
                  },
                }}
              />
            ) : (
              <OrganizationSwitcher
                hidePersonal
                afterSelectOrganizationUrl={switcherRedirect}
                afterCreateOrganizationUrl={switcherRedirect}
                createOrganizationMode="navigation"
                createOrganizationUrl={createOrganizationUrl}
                appearance={{
                  elements: {
                    ...commonOrgSwitcherElements,
                    rootBox: "w-full min-w-0",
                    organizationSwitcherTrigger:
                      "w-full min-w-0 max-w-none justify-start gap-3 px-0 py-0 border-none shadow-none bg-transparent hover:bg-transparent focus:shadow-none",
                    organizationPreviewAvatarBox: "w-10 h-10 rounded-lg flex-shrink-0",
                    organizationPreviewTextContainer: "min-w-0 max-w-none",
                    organizationPreviewMainIdentifier: "text-white font-semibold text-sm md:text-base",
                    organizationPreviewSecondaryIdentifier: "text-sidebar-text text-xs max-w-none",
                    organizationSwitcherTriggerIcon: "text-sidebar-text shrink-0 ml-2",
                  },
                }}
              />
            )}
          </div>
          {/* Close button - mobile only */}
          <button
            onClick={onToggle}
            className="p-2.5 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover md:hidden transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="py-4 flex-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const href = pathTenantSlug
              ? dashboardPathToTenantPath(item.href, pathTenantSlug)
              : usesTenantHostPaths
                ? dashboardPathToTenantHostPath(item.href)
                : item.href;
            const isActive = pathnameForMatching === item.href ||
              (item.href !== "/dashboard" && pathnameForMatching.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={href}
                className={`sidebar-link ${isActive ? "active" : ""} ${collapsed ? "justify-center px-0" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          {/* Brand Filter Section */}
          {!collapsed && (
            <div className="mt-6 px-5">
              <BrandFilter />
            </div>
          )}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-sidebar-border">
          {/* Collapse Toggle - desktop only */}
          <button
            onClick={onCollapseToggle}
            className="hidden md:flex items-center gap-3 w-full px-5 py-3 text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-5 h-5 flex-shrink-0 mx-auto" />
            ) : (
              <>
                <PanelLeftClose className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">Collapse</span>
              </>
            )}
          </button>

          {/* User Profile */}
          <div className={`p-4 border-t border-sidebar-border ${collapsed ? "flex justify-center" : ""}`}>
            {collapsed ? (
              <UserButton afterSignOutUrl="/sign-in" />
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-meta text-sidebar-text text-xs uppercase tracking-wide">
                  Account
                </p>
                <UserButton afterSignOutUrl="/sign-in" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// Mobile Menu Toggle Button - separate component for use in header
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-lg bg-surface-tertiary hover:bg-surface-hover text-content-muted md:hidden transition-colors"
      aria-label="Open menu"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}

export default Sidebar;
