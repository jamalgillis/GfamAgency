"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAction, useMutation } from "convex/react";
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
import {
  BrandBadge,
  getBrandColor,
  getBrandDisplayName,
} from "@/components/BrandBadge";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/useAuthQuery";

type Theme = "light" | "dark" | "system";

const themeOptions: { key: Theme; label: string; icon: typeof Sun; description: string }[] = [
  { key: "light", label: "Light", icon: Sun, description: "Clean and bright interface" },
  { key: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes" },
  { key: "system", label: "System", icon: Monitor, description: "Match your OS preference" },
];

type BrandingFormState = {
  slug: string;
  displayName: string;
  shortName: string;
  logoMark: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  emailMode: "platform" | "org_sender";
  senderName: string;
  senderEmail: string;
  senderReplyTo: string;
};

function toBrandingFormState(
  branding?: {
    slug?: string;
    displayName?: string;
    shortName?: string;
    logoMark?: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    emailMode?: "platform" | "org_sender";
    senderName?: string;
    senderEmail?: string;
    senderReplyTo?: string;
  }
): BrandingFormState {
  return {
    slug: branding?.slug ?? "",
    displayName: branding?.displayName ?? "",
    shortName: branding?.shortName ?? "",
    logoMark: branding?.logoMark ?? "",
    logoUrl: branding?.logoUrl ?? "",
    primaryColor: branding?.primaryColor ?? "#10B981",
    secondaryColor: branding?.secondaryColor ?? "#3B82F6",
    emailMode: branding?.emailMode ?? "platform",
    senderName: branding?.senderName ?? "",
    senderEmail: branding?.senderEmail ?? "",
    senderReplyTo: branding?.senderReplyTo ?? "",
  };
}

function isValidHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value.trim());
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function extractClerkErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeError = error as {
      errors?: Array<{
        longMessage?: string;
        message?: string;
      }>;
      message?: string;
    };

    const detailedMessage = maybeError.errors?.[0]?.longMessage || maybeError.errors?.[0]?.message;
    if (detailedMessage) {
      return detailedMessage;
    }

    if (typeof maybeError.message === "string" && maybeError.message.length > 0) {
      return maybeError.message;
    }
  }

  return fallback;
}

function formatRelativeDate(value: Date | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, isLoaded: userLoaded } = useUser();
  const { organization, invitations, isLoaded: orgLoaded } = useOrganization({
    invitations: true,
  });
  const { signOut, openUserProfile, openOrganizationProfile } = useClerk();

  // Data queries
  const orgBranding = useAuthQuery(api.orgBranding.getCurrent, {});
  const syncStatus = useAuthQuery(api.stripeSync.checkSyncStatus, {});
  const clientsData = useAuthQuery(api.clients.list, { limit: 500 });
  const invoicesData = useAuthQuery(api.invoiceActions.listInvoices, { limit: 500 });

  // Stripe actions
  const checkStripeAccount = useAction(api.stripeSync.checkStripeAccount);
  const pingStripe = useAction(api.stripeSync.pingStripe);
  const upsertOrgBranding = useMutation(api.orgBranding.upsertCurrent);

  const [brandingForm, setBrandingForm] = useState<BrandingFormState>(
    toBrandingFormState()
  );
  const [brandingDirty, setBrandingDirty] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [inviteForm, setInviteForm] = useState({
    emailAddress: "",
    role: "org:member",
  });
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

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
  const pendingOrgInvitations = invitations?.data ?? [];

  useEffect(() => {
    if (!orgBranding || brandingDirty) {
      return;
    }

    setBrandingForm(toBrandingFormState(orgBranding));
  }, [orgBranding, brandingDirty]);

  const handleBrandingFieldChange = useCallback(
    (field: keyof BrandingFormState, value: string) => {
      setBrandingDirty(true);
      setBrandingMessage(null);
      setBrandingForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const handleResetBranding = useCallback(() => {
    setBrandingForm(toBrandingFormState(orgBranding));
    setBrandingDirty(false);
    setBrandingMessage(null);
  }, [orgBranding]);

  const handleSaveBranding = useCallback(async () => {
    setBrandingMessage(null);
    setBrandingSaving(true);

    try {
      const slug = brandingForm.slug.trim();
      const displayName = brandingForm.displayName.trim();

      if (!slug || !displayName) {
        throw new Error("Display name and slug are required.");
      }

      await upsertOrgBranding({
        slug,
        displayName,
        shortName: brandingForm.shortName.trim() || undefined,
        logoMark: brandingForm.logoMark.trim() || undefined,
        logoUrl: brandingForm.logoUrl.trim() || undefined,
        primaryColor: brandingForm.primaryColor.trim() || undefined,
        secondaryColor: brandingForm.secondaryColor.trim() || undefined,
        emailMode: brandingForm.emailMode,
        senderName: brandingForm.senderName.trim() || undefined,
        senderEmail: brandingForm.senderEmail.trim() || undefined,
        senderReplyTo: brandingForm.senderReplyTo.trim() || undefined,
      });

      setBrandingDirty(false);
      setBrandingMessage({
        type: "success",
        text: "Branding updated.",
      });
    } catch (error) {
      setBrandingMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update branding.",
      });
    } finally {
      setBrandingSaving(false);
    }
  }, [brandingForm, upsertOrgBranding]);

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

  const handleInviteFieldChange = useCallback((field: "emailAddress" | "role", value: string) => {
    setInviteMessage(null);
    setInviteForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSendInvite = useCallback(async () => {
    if (!organization) {
      setInviteMessage({
        type: "error",
        text: "No active organization is selected.",
      });
      return;
    }

    const emailAddress = inviteForm.emailAddress.trim();

    if (!isValidEmailAddress(emailAddress)) {
      setInviteMessage({
        type: "error",
        text: "Enter a valid email address.",
      });
      return;
    }

    setInviteSending(true);
    setInviteMessage(null);

    try {
      await organization.inviteMember({
        emailAddress,
        role: inviteForm.role,
      });
      await invitations?.revalidate?.();
      setInviteForm({
        emailAddress: "",
        role: "org:member",
      });
      setInviteMessage({
        type: "success",
        text: `Invitation sent to ${emailAddress}.`,
      });
    } catch (error) {
      setInviteMessage({
        type: "error",
        text: extractClerkErrorMessage(error, "Failed to send invitation."),
      });
    } finally {
      setInviteSending(false);
    }
  }, [inviteForm.emailAddress, inviteForm.role, invitations, organization]);

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    const invitation = pendingOrgInvitations.find((item) => item.id === inviteId);

    if (!invitation) {
      return;
    }

    setRevokingInviteId(inviteId);
    setInviteMessage(null);

    try {
      await invitation.revoke();
      await invitations?.revalidate?.();
      setInviteMessage({
        type: "success",
        text: `Revoked invitation for ${invitation.emailAddress}.`,
      });
    } catch (error) {
      setInviteMessage({
        type: "error",
        text: extractClerkErrorMessage(error, "Failed to revoke invitation."),
      });
    } finally {
      setRevokingInviteId(null);
    }
  }, [invitations, pendingOrgInvitations]);

  // Compute data stats
  const totalServices = syncStatus?.totalCount ?? 0;
  const syncedServices = syncStatus?.syncedCount ?? 0;
  const unsyncedServices = syncStatus?.unsyncedCount ?? 0;
  const totalClients = clientsData?.length ?? 0;
  const totalInvoices = invoicesData?.length ?? 0;
  const dynamicBrands = useMemo(() => {
    const brandSet = new Set<string>();

    if (syncStatus?.byBrand) {
      for (const brand of Object.keys(syncStatus.byBrand)) {
        brandSet.add(brand);
      }
    }

    for (const invoice of invoicesData ?? []) {
      for (const brand of invoice.participatingBrands ?? []) {
        brandSet.add(brand);
      }
    }

    return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
  }, [syncStatus, invoicesData]);
  const activeOrgSlug = organization?.slug?.trim().toLowerCase() ?? "";
  const brandingSlug = brandingForm.slug.trim().toLowerCase();
  const whiteLabelReadiness = useMemo(() => {
    const checks = [
      {
        id: "display",
        label: "Display name is set",
        required: true,
        ok: brandingForm.displayName.trim().length > 0,
      },
      {
        id: "slug",
        label: "Branding slug is set",
        required: true,
        ok: brandingSlug.length > 0,
      },
      {
        id: "colors",
        label: "Primary and secondary colors are valid hex values",
        required: true,
        ok:
          isValidHexColor(brandingForm.primaryColor) &&
          isValidHexColor(brandingForm.secondaryColor),
      },
      {
        id: "sender",
        label:
          brandingForm.emailMode === "platform"
            ? "Platform sender mode is configured"
            : "Org sender email is valid",
        required: true,
        ok:
          brandingForm.emailMode === "platform" ||
          isValidEmailAddress(brandingForm.senderEmail),
      },
      {
        id: "logo",
        label: "Logo URL set (recommended)",
        required: false,
        ok: brandingForm.logoUrl.trim().length > 0,
      },
    ] as const;

    const warnings: string[] = [];
    if (
      activeOrgSlug &&
      brandingSlug &&
      activeOrgSlug !== brandingSlug
    ) {
      warnings.push(
        `Clerk slug is "${activeOrgSlug}", while branding slug is "${brandingSlug}". URL routing uses Clerk slug.`
      );
    }

    if (
      brandingForm.emailMode === "org_sender" &&
      !isValidEmailAddress(brandingForm.senderEmail)
    ) {
      warnings.push(
        "Org sender mode is selected but Sender Email is missing/invalid, so sends will fall back to the platform sender."
      );
    }

    const requiredChecks = checks.filter((check) => check.required);
    const readyCount = requiredChecks.filter((check) => check.ok).length;
    const ready = readyCount === requiredChecks.length;

    return {
      checks,
      warnings,
      ready,
      readyCount,
      requiredCount: requiredChecks.length,
    };
  }, [activeOrgSlug, brandingForm, brandingSlug]);

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
                        <Building2 className="w-5 h-5 text-content-muted" />
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
                    <Building2 className="w-5 h-5 text-content-muted" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-content">
                      {brandingForm.displayName || "Organization"}
                    </div>
                    <div className="text-meta text-content-muted">Team workspace</div>
                  </div>
                </div>
              </div>
            )}

            <div className="settings-org-card mb-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-content">Invite Teammates</h3>
                  <p className="text-meta text-content-muted mt-0.5">
                    Send Clerk organization invitations and manage anything still pending.
                  </p>
                </div>
                {organization ? (
                  <div className="text-meta text-content-muted">
                    {organization.pendingInvitationsCount} pending
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                <label className="text-meta text-content-secondary">
                  Email Address
                  <input
                    className="input-field w-full mt-1"
                    value={inviteForm.emailAddress}
                    onChange={(event) => handleInviteFieldChange("emailAddress", event.target.value)}
                    placeholder="teammate@client.com"
                    type="email"
                  />
                </label>

                <label className="text-meta text-content-secondary">
                  Role
                  <select
                    className="input-field w-full mt-1"
                    value={inviteForm.role}
                    onChange={(event) => handleInviteFieldChange("role", event.target.value)}
                  >
                    <option value="org:member">Member</option>
                    <option value="org:admin">Admin</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <button
                  className="btn-primary text-sm"
                  onClick={handleSendInvite}
                  disabled={inviteSending || !organization}
                >
                  {inviteSending ? "Sending..." : "Send Invite"}
                </button>
              </div>

              {inviteMessage && (
                <div
                  className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                    inviteMessage.type === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {inviteMessage.text}
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-content">Pending Org Invites</h4>
                  <p className="text-meta text-content-muted mt-0.5">
                    These invitations have been sent from the active organization and are still awaiting acceptance.
                  </p>
                </div>

                {!orgLoaded || !invitations ? (
                  <div className="rounded-xl border border-border bg-surface-tertiary/60 px-4 py-5 text-sm text-content-muted">
                    Loading invitations...
                  </div>
                ) : pendingOrgInvitations.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface-tertiary/60 px-4 py-5 text-sm text-content-muted">
                    No pending invitations.
                  </div>
                ) : (
                  pendingOrgInvitations.map((invitation) => {
                    const isRevoking = revokingInviteId === invitation.id;

                    return (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-tertiary/60 px-4 py-4"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-content truncate">{invitation.emailAddress}</p>
                          <p className="text-sm text-content-muted">
                            {invitation.roleName} • sent {formatRelativeDate(invitation.createdAt)}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="btn-secondary text-sm shrink-0"
                          onClick={() => handleRevokeInvite(invitation.id)}
                          disabled={isRevoking}
                        >
                          {isRevoking ? "Revoking..." : "Revoke"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="settings-org-card mb-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-content">White-Label Branding</h3>
                  <p className="text-meta text-content-muted mt-0.5">
                    Customize tenant name, URL slug, logo, and theme colors.
                  </p>
                </div>
                <div
                  className="w-10 h-10 rounded-lg border border-border"
                  style={{
                    background: `linear-gradient(135deg, ${brandingForm.primaryColor || "#10B981"}, ${brandingForm.secondaryColor || "#3B82F6"})`,
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-meta text-content-secondary">
                  Display Name
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.displayName}
                    onChange={(event) =>
                      handleBrandingFieldChange("displayName", event.target.value)
                    }
                    placeholder="Acme Agency"
                  />
                </label>

                <label className="text-meta text-content-secondary">
                  Short Name
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.shortName}
                    onChange={(event) =>
                      handleBrandingFieldChange("shortName", event.target.value)
                    }
                    placeholder="Acme"
                  />
                </label>

                <label className="text-meta text-content-secondary">
                  Branding Slug
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.slug}
                    onChange={(event) =>
                      handleBrandingFieldChange("slug", event.target.value)
                    }
                    placeholder="acme-brand"
                  />
                </label>

                <label className="text-meta text-content-secondary">
                  Logo Mark
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.logoMark}
                    onChange={(event) =>
                      handleBrandingFieldChange("logoMark", event.target.value)
                    }
                    maxLength={3}
                    placeholder="A"
                  />
                </label>

                <p className="text-meta text-content-muted sm:col-span-2 -mt-1">
                  URL routing is driven by your Clerk organization slug. This branding slug is for tenant identity metadata.
                </p>

                <label className="text-meta text-content-secondary sm:col-span-2">
                  Logo URL
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.logoUrl}
                    onChange={(event) =>
                      handleBrandingFieldChange("logoUrl", event.target.value)
                    }
                    placeholder="https://cdn.example.com/logo.png"
                  />
                </label>

                <label className="text-meta text-content-secondary">
                  Primary Color
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.primaryColor}
                    onChange={(event) =>
                      handleBrandingFieldChange("primaryColor", event.target.value)
                    }
                    placeholder="#10B981"
                  />
                </label>

                <label className="text-meta text-content-secondary">
                  Secondary Color
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.secondaryColor}
                    onChange={(event) =>
                      handleBrandingFieldChange("secondaryColor", event.target.value)
                    }
                    placeholder="#3B82F6"
                  />
                </label>

                <label className="text-meta text-content-secondary sm:col-span-2">
                  Invoice Sender Mode
                  <select
                    className="input-field w-full mt-1"
                    value={brandingForm.emailMode}
                    onChange={(event) =>
                      handleBrandingFieldChange("emailMode", event.target.value)
                    }
                  >
                    <option value="platform">Use platform sender (recommended)</option>
                    <option value="org_sender">Use my org sender email</option>
                  </select>
                </label>

                <label className="text-meta text-content-secondary">
                  Sender Name
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.senderName}
                    onChange={(event) =>
                      handleBrandingFieldChange("senderName", event.target.value)
                    }
                    placeholder="Acme Billing"
                  />
                </label>

                <label className="text-meta text-content-secondary">
                  Sender Email
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.senderEmail}
                    onChange={(event) =>
                      handleBrandingFieldChange("senderEmail", event.target.value)
                    }
                    placeholder="billing@yourdomain.com"
                  />
                </label>

                <label className="text-meta text-content-secondary sm:col-span-2">
                  Reply-To Email (optional)
                  <input
                    className="input-field w-full mt-1"
                    value={brandingForm.senderReplyTo}
                    onChange={(event) =>
                      handleBrandingFieldChange("senderReplyTo", event.target.value)
                    }
                    placeholder="accounts@yourdomain.com"
                  />
                </label>

                <p className="text-meta text-content-muted sm:col-span-2 -mt-1">
                  Org sender mode uses your saved sender email through this platform&apos;s Resend account. If delivery fails, the app automatically falls back to the platform sender.
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-content">White-Label Readiness</h4>
                  <span
                    className={`text-meta-lg font-medium ${
                      whiteLabelReadiness.ready ? "text-success" : "text-warning"
                    }`}
                  >
                    {whiteLabelReadiness.readyCount}/{whiteLabelReadiness.requiredCount} required
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {whiteLabelReadiness.checks.map((check) => (
                    <div key={check.id} className="flex items-center gap-2 text-sm">
                      {check.ok ? (
                        <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-error flex-shrink-0" />
                      )}
                      <span className={check.ok ? "text-content" : "text-content-secondary"}>
                        {check.label}
                        {!check.required ? " (optional)" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                {whiteLabelReadiness.warnings.length > 0 && (
                  <div className="mt-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        {whiteLabelReadiness.warnings.map((warning) => (
                          <p key={warning} className="text-meta text-content-secondary">
                            {warning}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {brandingMessage && (
                <div
                  className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                    brandingMessage.type === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {brandingMessage.text}
                </div>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button
                  className="btn-primary text-sm"
                  onClick={handleSaveBranding}
                  disabled={brandingSaving || !brandingDirty}
                >
                  {brandingSaving ? "Saving..." : "Save Branding"}
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={handleResetBranding}
                  disabled={brandingSaving || !brandingDirty}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Sub-brands */}
            <div className="space-y-2">
              {dynamicBrands.map((brandName) => {
                const syncInfo = syncStatus?.byBrand?.[brandName];
                return (
                  <div key={brandName} className="settings-brand-row">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                        style={{ background: `${getBrandColor(brandName)}15` }}
                      >
                        <Building2 className="w-4 h-4 text-content-muted" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <BrandBadge brand={brandName} variant="pill" />
                        </div>
                        <div className="text-meta text-content-muted mt-0.5">
                          {syncInfo
                            ? `${syncInfo.synced + syncInfo.unsynced} services`
                            : "Brand"}
                        </div>
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
                          style={{ background: getBrandColor(brand) }}
                        />
                        <span className="text-content-secondary">
                          {getBrandDisplayName(brand)}
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
