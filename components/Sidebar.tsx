"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Users,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BrandFilter } from "./BrandFilter";
import {
  dashboardPathToTenantPath,
  getTenantSlugFromPath,
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
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
  collapsed?: boolean;
  onCollapseToggle?: () => void;
}

export function Sidebar({ isOpen = false, onToggle, collapsed = false, onCollapseToggle }: SidebarProps) {
  const pathname = usePathname();
  const tenantSlug = getTenantSlugFromPath(pathname ?? "");
  const pathnameForMatching = tenantSlug
    ? tenantPathToDashboardPath(pathname ?? "") ?? pathname ?? ""
    : pathname ?? "";

  const switcherRedirect = tenantSlug ? `/${tenantSlug}` : "/dashboard";

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
        <div className="p-6 border-b border-sidebar-border flex items-center justify-between">
          {collapsed ? (
            <OrganizationSwitcher
              hidePersonal
              afterSelectOrganizationUrl={switcherRedirect}
              afterCreateOrganizationUrl={switcherRedirect}
              appearance={{
                elements: {
                  rootBox: "w-full",
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
              appearance={{
                elements: {
                  rootBox: "w-full",
                  organizationSwitcherTrigger:
                    "w-full justify-start gap-3 px-0 py-0 border-none shadow-none bg-transparent hover:bg-transparent focus:shadow-none",
                  organizationPreviewAvatarBox: "w-10 h-10 rounded-lg flex-shrink-0",
                  organizationPreviewMainIdentifier: "text-white font-semibold text-lg",
                  organizationPreviewSecondaryIdentifier: "text-sidebar-text text-xs",
                  organizationSwitcherTriggerIcon: "text-sidebar-text",
                },
              }}
            />
          )}
          {/* Close button - mobile only */}
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover md:hidden transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="py-4 flex-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const href = tenantSlug ? dashboardPathToTenantPath(item.href, tenantSlug) : item.href;
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
