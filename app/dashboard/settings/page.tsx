"use client";

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { useUser, useOrganization, useClerk } from "@clerk/nextjs";
import {
  Sun,
  Moon,
  Monitor,
  Zap,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  XCircle,
  Building2,
  Palette,
  Database,
  Shield,
  Users,
  FileText,
  Briefcase,
  ChevronRight,
  LogOut,
  User,
  Mail,
  KeyRound,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { useTheme } from "@/components/ThemeProvider";
import { BrandBadge, type BrandType } from "@/components/BrandBadge";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import {
  BRAND_THEMES,
  AGENCY_THEME,
} from "@/lib/brand-theme";

type Theme = "light" | "dark" | "system";

const themeOptions: { key: Theme; label: string; icon: typeof Sun; description: string }[] = [
  { key: "light", label: "Light", icon: Sun, description: "Clean and bright interface" },
  { key: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes" },
  { key: "system", label: "System", icon: Monitor, description: "Match your OS preference" },
];

const brandColorMap: Record<string, string> = {
  Sankofa: "#10B981",
  Lighthouse: "#8B5CF6",
  Centex: "#F59E0B",
  "GFAM Media Studios": "#3B82F6",
};

const knownBrands: BrandType[] = ["Sankofa", "Lighthouse", "Centex", "GFAM Media Studios"];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, isLoaded: userLoaded } = useUser();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { signOut, openUserProfile, openOrganizationProfile } = useClerk();

  // Data queries
  const syncStatus = useAuthQuery(api.stripeSync.checkSyncStatus, {});
  const clientsData = useAuthQuery(api.clients.list, { limit: 500 });
  const invoicesData = useAuthQuery(api.invoiceActions.listInvoices, { limit: 500 });

  // Stripe actions
  const checkStripeAccount = useAction(api.stripeSync.checkStripeAccount);
  const pingStripe = useAction(api.stripeSync.pingStripe);

  // Stripe check state
  const [stripeStatus, setStripeStatus] = useState<{
    checked: boolean;
    loading: boolean;
    ok: boolean;
    keyMode: string;
    isOrgKey: boolean;
    supportsSingleAccountMode: boolean;
    message: string;
    hasApiKey: boolean;
    hasWebhookSecret: boolean;
  } | null>(null);

  const [pingResult, setPingResult] = useState<{
    loading: boolean;
    ok: boolean;
    message: string;
  } | null>(null);

  const handleCheckStripe = useCallback(async () => {
    setStripeStatus({
      checked: false,
      loading: true,
      ok: false,
      keyMode: "",
      isOrgKey: false,
      supportsSingleAccountMode: false,
      message: "",
      hasApiKey: false,
      hasWebhookSecret: false,
    });
    try {
      const result = await checkStripeAccount();
      const ok = result.configured;
      const message = ok
        ? "Stripe is configured"
        : result.isOrgKey
          ? "Organization API key detected. Use sk_test_* or sk_live_* for STRIPE_SECRET_KEY."
          : "Stripe configuration incomplete";
      setStripeStatus({
        checked: true,
        loading: false,
        ok,
        keyMode: result.keyMode,
        isOrgKey: result.isOrgKey,
        supportsSingleAccountMode: result.supportsSingleAccountMode,
        message,
        hasApiKey: result.hasApiKey,
        hasWebhookSecret: result.hasWebhookSecret,
      });
    } catch (err) {
      setStripeStatus({
        checked: true,
        loading: false,
        ok: false,
        keyMode: "unknown",
        isOrgKey: false,
        supportsSingleAccountMode: false,
        message: err instanceof Error ? err.message : "Failed to check Stripe",
        hasApiKey: false,
        hasWebhookSecret: false,
      });
    }
  }, [checkStripeAccount]);

  const handlePingStripe = useCallback(async () => {
    setPingResult({ loading: true, ok: false, message: "" });
    try {
      const result = await pingStripe();
      setPingResult({
        loading: false,
        ok: result.ok,
        message: result.message,
      });
    } catch (err) {
      setPingResult({
        loading: false,
        ok: false,
        message: err instanceof Error ? err.message : "Connection failed",
      });
    }
  }, [pingStripe]);

  // Compute data stats
  const totalServices = syncStatus?.totalCount ?? 0;
  const syncedServices = syncStatus?.syncedCount ?? 0;
  const unsyncedServices = syncStatus?.unsyncedCount ?? 0;
  const totalClients = clientsData?.length ?? 0;
  const totalInvoices = invoicesData?.length ?? 0;

  return (
    <>
      {/* Header */}
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-content">Settings</h1>
            <p className="text-content-muted text-sm mt-1">
              Manage your account, preferences, and integrations
            </p>
          </div>
          <ThemeSwitch />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Settings */}
        <div className="lg:col-span-2 space-y-6">

          {/* Profile Section */}
          <section
            className="settings-section card p-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "50ms" }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="settings-section-icon" style={{ background: "rgba(16, 185, 129, 0.12)" }}>
                <User className="w-5 h-5" style={{ color: "#10B981" }} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-content">Profile</h2>
                <p className="text-sm text-content-muted">Your account details</p>
              </div>
            </div>

            {userLoaded && user ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName ?? "Profile"}
                      className="w-14 h-14 rounded-full border-2 border-border"
                    />
                  ) : (
                    <div className="client-avatar w-14 h-14 text-lg">
                      {user.fullName
                        ?.split(" ")
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join("") ?? "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-content">{user.fullName}</div>
                    <div className="text-sm text-content-muted">{user.primaryEmailAddress?.emailAddress}</div>
                  </div>
                </div>

                <div className="settings-status-row">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-content-muted" />
                    <div>
                      <div className="text-sm font-medium text-content">Email</div>
                      <div className="text-meta text-content-muted">{user.primaryEmailAddress?.emailAddress}</div>
                    </div>
                  </div>
                  <CheckCircle className="w-4 h-4 text-success" />
                </div>

                <div className="settings-status-row">
                  <div className="flex items-center gap-3">
                    <KeyRound className="w-4 h-4 text-content-muted" />
                    <div>
                      <div className="text-sm font-medium text-content">User ID</div>
                      <div className="text-meta text-content-muted font-mono">{user.id.slice(0, 20)}...</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => openUserProfile()}
                  >
                    <User className="w-3.5 h-3.5" />
                    Manage Profile
                  </button>
                  <button
                    className="btn-secondary text-sm text-error"
                    onClick={() => signOut({ redirectUrl: "/sign-in" })}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-content-muted">Loading profile...</div>
            )}
          </section>

          {/* Organization Section */}
          <section
            className="settings-section card p-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="settings-section-icon" style={{ background: "rgba(59, 130, 246, 0.12)" }}>
                <Building2 className="w-5 h-5" style={{ color: "#3B82F6" }} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-content">Organization</h2>
                <p className="text-sm text-content-muted">Team and brand management</p>
              </div>
            </div>

            {/* Active Clerk Organization */}
            {orgLoaded && organization ? (
              <div className="settings-org-card mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {organization.imageUrl ? (
                      <img
                        src={organization.imageUrl}
                        alt={organization.name}
                        className="w-10 h-10 rounded-lg border border-border"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-surface-tertiary text-lg">
                        {AGENCY_THEME.icon}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-content">{organization.name}</div>
                      <div className="text-meta text-content-muted">
                        {organization.membersCount} member{organization.membersCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn-secondary text-meta-lg"
                    onClick={() => openOrganizationProfile()}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Manage
                  </button>
                </div>
              </div>
            ) : (
              <div className="settings-org-card mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-surface-tertiary text-lg">
                    {AGENCY_THEME.icon}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-content">{AGENCY_THEME.name}</div>
                    <div className="text-meta text-content-muted">{AGENCY_THEME.tagline}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-brands */}
            <div className="space-y-2">
              {knownBrands.map((brandName) => {
                const brandTheme = BRAND_THEMES[brandName];
                const syncInfo = syncStatus?.byBrand?.[brandName];
                return (
                  <div key={brandName} className="settings-brand-row">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                        style={{ background: `${brandColorMap[brandName]}15` }}
                      >
                        {brandTheme.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <BrandBadge brand={brandName} variant="pill" />
                        </div>
                        <div className="text-meta text-content-muted mt-0.5">{brandTheme.tagline}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {syncInfo && (
                        <span className="text-meta text-content-muted">
                          {syncInfo.synced + syncInfo.unsynced} services
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-content-muted" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Appearance Section */}
          <section
            className="settings-section card p-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "150ms" }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="settings-section-icon" style={{ background: "rgba(139, 92, 246, 0.12)" }}>
                <Palette className="w-5 h-5" style={{ color: "#8B5CF6" }} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-content">Appearance</h2>
                <p className="text-sm text-content-muted">Customize how the dashboard looks</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isActive = theme === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => setTheme(option.key)}
                    className={`settings-theme-option ${isActive ? "active" : ""}`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-content" : "text-content-muted"}`} />
                    <span className={`text-sm font-medium ${isActive ? "text-content" : "text-content-secondary"}`}>
                      {option.label}
                    </span>
                    <span className="text-meta text-content-muted">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Stripe Integration Section */}
          <section
            className="settings-section card p-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="settings-section-icon" style={{ background: "rgba(99, 91, 255, 0.12)" }}>
                  <Zap className="w-5 h-5" style={{ color: "#635bff" }} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-content">Stripe Integration</h2>
                  <p className="text-sm text-content-muted">Payment processing and service sync</p>
                </div>
              </div>
            </div>

            {/* Stripe Status Cards */}
            <div className="space-y-3">
              {/* Connection Check */}
              <div className="settings-status-row">
                <div className="flex items-center gap-3 min-w-0">
                  <Shield className="w-4 h-4 text-content-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-content">API Configuration</div>
                    <div className="text-meta text-content-muted">
                      {stripeStatus?.checked
                        ? stripeStatus.ok
                          ? `${stripeStatus.keyMode === "test" ? "Test" : stripeStatus.keyMode === "live" ? "Live" : "Unknown"} mode${stripeStatus.isOrgKey ? " (Organization key)" : ""}`
                          : stripeStatus.message
                        : "Check if Stripe keys are configured"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {stripeStatus?.checked && (
                    stripeStatus.ok
                      ? <CheckCircle className="w-4 h-4 text-success" />
                      : <XCircle className="w-4 h-4 text-error" />
                  )}
                  <button
                    className="btn-secondary text-meta-lg"
                    onClick={handleCheckStripe}
                    disabled={stripeStatus?.loading}
                  >
                    {stripeStatus?.loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {stripeStatus?.checked ? "Recheck" : "Check"}
                  </button>
                </div>
              </div>

              {/* Stripe Config Details (shown after check) */}
              {stripeStatus?.checked && (
                <div className="ml-7 pl-3 border-l-2 border-border space-y-2">
                  <div className="flex items-center gap-2 text-meta-lg">
                    {stripeStatus.hasApiKey && stripeStatus.supportsSingleAccountMode
                      ? <CheckCircle className="w-3.5 h-3.5 text-success" />
                      : <XCircle className="w-3.5 h-3.5 text-error" />
                    }
                    <span
                      className={
                        stripeStatus.hasApiKey && stripeStatus.supportsSingleAccountMode
                          ? "text-content-secondary"
                          : "text-error"
                      }
                    >
                      Secret Key (single-account)
                    </span>
                  </div>
                  {stripeStatus.isOrgKey && (
                    <div className="flex items-center gap-2 text-meta-lg">
                      <AlertCircle className="w-3.5 h-3.5 text-warning" />
                      <span className="text-warning">
                        STRIPE_SECRET_KEY is an Organization key. Replace with sk_test_* or sk_live_*.
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-meta-lg">
                    {stripeStatus.hasWebhookSecret
                      ? <CheckCircle className="w-3.5 h-3.5 text-success" />
                      : <AlertCircle className="w-3.5 h-3.5 text-warning" />
                    }
                    <span className={stripeStatus.hasWebhookSecret ? "text-content-secondary" : "text-warning"}>
                      Webhook Secret
                    </span>
                  </div>
                </div>
              )}

              {/* Connection Test */}
              <div className="settings-status-row">
                <div className="flex items-center gap-3 min-w-0">
                  <Zap className="w-4 h-4 text-content-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-content">Connection Test</div>
                    <div className="text-meta text-content-muted">
                      {pingResult
                        ? pingResult.ok
                          ? "Connected successfully"
                          : pingResult.message
                        : "Verify live connection to Stripe API"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pingResult && !pingResult.loading && (
                    pingResult.ok
                      ? <CheckCircle className="w-4 h-4 text-success" />
                      : <XCircle className="w-4 h-4 text-error" />
                  )}
                  <button
                    className="btn-secondary text-meta-lg"
                    onClick={handlePingStripe}
                    disabled={pingResult?.loading}
                  >
                    {pingResult?.loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Ping
                  </button>
                </div>
              </div>

              {/* Service Sync Status */}
              <div className="settings-status-row">
                <div className="flex items-center gap-3 min-w-0">
                  <Database className="w-4 h-4 text-content-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-content">Service Sync</div>
                    <div className="text-meta text-content-muted">
                      {syncStatus
                        ? `${syncedServices}/${totalServices} services synced to Stripe`
                        : "Loading sync status..."}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {syncStatus && (
                    unsyncedServices === 0
                      ? <CheckCircle className="w-4 h-4 text-success" />
                      : <AlertCircle className="w-4 h-4 text-warning" />
                  )}
                </div>
              </div>

              {/* Per-Brand Sync Breakdown */}
              {syncStatus?.byBrand && (
                <div className="ml-7 pl-3 border-l-2 border-border space-y-2">
                  {Object.entries(syncStatus.byBrand).map(([brand, stats]) => (
                    <div key={brand} className="flex items-center justify-between text-meta-lg">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: brandColorMap[brand] ?? "#64748B" }}
                        />
                        <span className="text-content-secondary">
                          {brand === "GFAM Media Studios" ? "GFAM Media" : brand}
                        </span>
                      </div>
                      <span className="text-content-muted">
                        {stats.synced}/{stats.synced + stats.unsynced}
                        {stats.unsynced > 0 && (
                          <span className="text-warning ml-1">({stats.unsynced} pending)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column - Quick Info */}
        <div className="space-y-6">
          {/* Data Overview */}
          <div
            className="card p-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <h3 className="text-sm font-semibold text-content mb-4">Data Overview</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(16, 185, 129, 0.12)" }}>
                    <Briefcase className="w-4 h-4" style={{ color: "#10B981" }} />
                  </div>
                  <span className="text-sm text-content-secondary">Services</span>
                </div>
                <span className="text-sm font-semibold text-content">{totalServices}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(59, 130, 246, 0.12)" }}>
                    <Users className="w-4 h-4" style={{ color: "#3B82F6" }} />
                  </div>
                  <span className="text-sm text-content-secondary">Clients</span>
                </div>
                <span className="text-sm font-semibold text-content">{totalClients}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(139, 92, 246, 0.12)" }}>
                    <FileText className="w-4 h-4" style={{ color: "#8B5CF6" }} />
                  </div>
                  <span className="text-sm text-content-secondary">Invoices</span>
                </div>
                <span className="text-sm font-semibold text-content">{totalInvoices}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(99, 91, 255, 0.12)" }}>
                    <Zap className="w-4 h-4" style={{ color: "#635bff" }} />
                  </div>
                  <span className="text-sm text-content-secondary">Stripe Synced</span>
                </div>
                <span className="text-sm font-semibold text-content">
                  {syncedServices}/{totalServices}
                </span>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div
            className="card p-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "150ms" }}
          >
            <h3 className="text-sm font-semibold text-content mb-4">System</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-meta-lg text-content-muted">Framework</span>
                <span className="text-meta-lg font-medium text-content">Next.js</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-meta-lg text-content-muted">Database</span>
                <span className="text-meta-lg font-medium text-content">Convex</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-meta-lg text-content-muted">Payments</span>
                <span className="text-meta-lg font-medium text-content">Stripe</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-meta-lg text-content-muted">Auth</span>
                <span className="text-meta-lg font-medium text-content">Clerk</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div
            className="card p-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            <h3 className="text-sm font-semibold text-content mb-4">Quick Links</h3>
            <div className="space-y-2">
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-quick-link"
              >
                <Zap className="w-4 h-4" style={{ color: "#635bff" }} />
                <span>Stripe Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-content-muted" />
              </a>
              <a
                href="https://dashboard.convex.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-quick-link"
              >
                <Database className="w-4 h-4 text-warning" />
                <span>Convex Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-content-muted" />
              </a>
              <a
                href="https://dashboard.clerk.com"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-quick-link"
              >
                <Shield className="w-4 h-4" style={{ color: "#6C47FF" }} />
                <span>Clerk Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-content-muted" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
