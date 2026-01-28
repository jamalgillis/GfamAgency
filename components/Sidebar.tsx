"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Users,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { BrandFilter } from "./BrandFilter";

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
}

export function Sidebar({ isOpen = false, onToggle }: SidebarProps) {
  const pathname = usePathname();

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
          w-[280px] md:w-sidebar lg:w-sidebar-collapsed xl:w-sidebar
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-sankofa to-brand-gfam flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg">G</span>
            </div>
            <div className="lg:hidden xl:block">
              <h1 className="text-white font-semibold text-lg">GFAM</h1>
              <p className="text-meta text-sidebar-text">Agency</p>
            </div>
          </div>
          {/* Close button - mobile only */}
          <button
            onClick={onToggle}
            className="p-2 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover md:hidden transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="py-4 flex-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="lg:hidden xl:inline">{item.label}</span>
              </Link>
            );
          })}

          {/* Brand Filter Section */}
          <div className="mt-6 px-5 lg:hidden xl:block">
            <BrandFilter />
          </div>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-medium">JG</span>
            </div>
            <div className="lg:hidden xl:block">
              <p className="text-white text-sm font-medium">J. Gillis</p>
              <p className="text-meta text-sidebar-text">Admin</p>
            </div>
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
