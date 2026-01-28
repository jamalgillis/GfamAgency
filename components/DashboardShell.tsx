"use client";

import { useState } from "react";
import { Sidebar, MobileMenuButton } from "./Sidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />

      {/* Mobile Header Bar */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border flex items-center justify-between px-4 z-30 md:hidden">
        <MobileMenuButton onClick={toggleSidebar} />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-sankofa to-brand-gfam flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <span className="font-semibold text-content">GFAM Agency</span>
        </div>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>

      {/* Main Content */}
      <main className="min-h-screen p-4 pt-20 md:pt-6 md:p-6 lg:p-8 ml-0 md:ml-sidebar lg:ml-sidebar-collapsed xl:ml-sidebar transition-all duration-300">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default DashboardShell;
