"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Bell, Plus, X } from "lucide-react";
import { ThemeSwitch } from "./ThemeSwitch";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onNewInvoice?: () => void;
}

interface HeaderNotification {
  id: string;
  title: string;
  message: string;
  timeLabel: string;
  unread: boolean;
}

const defaultNotifications: HeaderNotification[] = [
  {
    id: "invoice-paid",
    title: "Invoice paid",
    message: "INV-1024 was marked paid and applied to the ledger.",
    timeLabel: "2h ago",
    unread: true,
  },
  {
    id: "subscription-renewal",
    title: "Subscription renewal",
    message: "A recurring invoice was generated for GFAM Media Studios.",
    timeLabel: "5h ago",
    unread: true,
  },
  {
    id: "client-added",
    title: "Client added",
    message: "A new client record was created and is ready for invoicing.",
    timeLabel: "1d ago",
    unread: true,
  },
];

export function Header({ title, subtitle, onNewInvoice }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<HeaderNotification[]>(defaultNotifications);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications]
  );

  useEffect(() => {
    if (!notificationsOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (notificationsRef.current?.contains(target)) return;
      setNotificationsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [notificationsOpen]);

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
          {onNewInvoice && (
            <button onClick={onNewInvoice} className="btn-primary whitespace-nowrap">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Invoice</span>
            </button>
          )}

          {/* Notifications */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              aria-label="Notifications"
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              className={`relative p-2.5 rounded-lg transition-colors ${
                notificationsOpen
                  ? "bg-surface-hover"
                  : "bg-surface-tertiary hover:bg-surface-hover"
              }`}
            >
              <Bell className="w-5 h-5 text-content-muted" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-error text-white text-meta rounded-full flex items-center justify-center animate-notif-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-full mt-2 w-[320px] sm:w-[360px] rounded-xl border border-border bg-surface-secondary shadow-[var(--shadow-card-hover)] z-40 overflow-hidden animate-fade-in-up">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-tertiary/60">
                  <div>
                    <p className="text-sm font-semibold text-content">Notifications</p>
                    <p className="text-meta text-content-muted">
                      {notifications.length > 0
                        ? `${unreadCount} unread`
                        : "No recent activity"}
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((notification) => ({
                            ...notification,
                            unread: false,
                          }))
                        )
                      }
                      className="text-xs font-medium text-content-secondary hover:text-content"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-content-muted text-sm">
                    No notifications yet.
                  </div>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.map((notification, index) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() =>
                          setNotifications((prev) =>
                            prev.map((item) =>
                              item.id === notification.id
                                ? { ...item, unread: false }
                                : item
                            )
                          )
                        }
                        className={`w-full text-left px-4 py-3 transition-colors hover:bg-surface-hover ${
                          index < notifications.length - 1 ? "border-b border-border/60" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                              notification.unread ? "bg-brand-sankofa" : "bg-border"
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={`text-sm ${
                                  notification.unread
                                    ? "font-semibold text-content"
                                    : "font-medium text-content-secondary"
                                }`}
                              >
                                {notification.title}
                              </p>
                              <span className="text-meta text-content-muted whitespace-nowrap">
                                {notification.timeLabel}
                              </span>
                            </div>
                            <p className="text-xs text-content-muted mt-1">
                              {notification.message}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
