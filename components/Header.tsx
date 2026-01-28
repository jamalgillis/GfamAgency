"use client";

import { useState } from "react";
import { Search, Bell, Plus, X } from "lucide-react";
import { ThemeSwitch } from "./ThemeSwitch";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onNewInvoice?: () => void;
}

export function Header({ title, subtitle, onNewInvoice }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="mb-6 md:mb-8 animate-fade-in-up">
      {/* Mobile Search Overlay */}
      {searchOpen && (
        <div className="fixed inset-0 bg-surface z-50 p-4 md:hidden">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Search..."
                className="input-field pl-10 pr-4 py-3 w-full text-base"
                autoFocus
              />
            </div>
            <button
              onClick={() => setSearchOpen(false)}
              className="p-3 rounded-lg bg-surface-tertiary hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5 text-content-muted" />
            </button>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Title Section */}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-content truncate">{title}</h1>
          {subtitle && (
            <p className="text-content-muted text-sm mt-1 truncate">{subtitle}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* Theme Toggle */}
          <ThemeSwitch />

          {/* Search - Icon on mobile, full on desktop */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover transition-colors md:hidden"
          >
            <Search className="w-5 h-5 text-content-muted" />
          </button>
          <div className="relative hidden md:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="Search..."
              className="input-field pl-10 pr-4 py-2 w-48 lg:w-64"
            />
          </div>

          {/* New Invoice Button */}
          <button onClick={onNewInvoice} className="btn-primary whitespace-nowrap">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Invoice</span>
          </button>

          {/* Notifications */}
          <button className="relative p-2.5 rounded-lg bg-surface-tertiary hover:bg-surface-hover transition-colors">
            <Bell className="w-5 h-5 text-content-muted" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-error text-white text-meta rounded-full flex items-center justify-center animate-notif-pulse">
              3
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
