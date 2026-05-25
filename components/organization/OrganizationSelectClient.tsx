"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Building2, CheckCircle2, Loader2, Mail, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { buildOrgSlugCandidate, getInitialOrgSlugSeed } from "@/lib/org-slug";

interface OrganizationSelectClientProps {
  nextPath: string;
}

type ClerkLikeError = {
  errors?: Array<{
    code?: string;
    longMessage?: string;
    message?: string;
  }>;
  message?: string;
};

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const maybeError = error as ClerkLikeError;
    const detailedMessage = maybeError.errors?.[0]?.longMessage || maybeError.errors?.[0]?.message;
    if (detailedMessage) {
      return detailedMessage;
    }

    if (typeof maybeError.message === "string" && maybeError.message.length > 0) {
      return maybeError.message;
    }
  }

  return "Something went wrong while creating the organization.";
}

function isSlugConflict(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes("slug") && (
    message.includes("taken") ||
    message.includes("exists") ||
    message.includes("already")
  );
}

export function OrganizationSelectClient({ nextPath }: OrganizationSelectClientProps) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);
  const { isLoaded, createOrganization, setActive, userMemberships, userInvitations } = useOrganizationList({
    userMemberships: true,
    userInvitations: true,
  });
  const bootstrapCurrent = useMutation(api.orgBranding.bootstrapCurrent);
  const trimmedBusinessName = businessName.trim();
  const slugSuggestion = useQuery(
    api.orgBranding.suggestCreationSlug,
    trimmedBusinessName ? { name: trimmedBusinessName } : "skip",
  );
  const memberships = userMemberships.data ?? [];
  const invitations = userInvitations.data ?? [];
  const tenantBaseDomain =
    process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_CANONICAL_PRODUCTION_DOMAIN?.trim() ||
    "";
  const slugPreview = slugSuggestion?.slug || getInitialOrgSlugSeed(trimmedBusinessName || "team");
  const hostPreview = tenantBaseDomain ? `${slugPreview}.${tenantBaseDomain}` : slugPreview;
  const helperText = useMemo(() => {
    if (!trimmedBusinessName) {
      return "We will use the first word of the business name as the starting slug.";
    }

    if (!slugSuggestion) {
      return `Checking availability for ${hostPreview}...`;
    }

    if (slugSuggestion.adjusted) {
      return `That base slug was already taken, so we adjusted it to ${hostPreview}.`;
    }

    return `${hostPreview} is available.`;
  }, [hostPreview, slugSuggestion, trimmedBusinessName]);

  const handleSelectOrganization = async (organizationId: string) => {
    if (!isLoaded || !setActive) {
      return;
    }

    setCreateError(null);
    setSwitchingOrgId(organizationId);

    try {
      await setActive({ organization: organizationId });
      router.push(nextPath);
      router.refresh();
    } catch (error) {
      setCreateError(extractErrorMessage(error));
    } finally {
      setSwitchingOrgId(null);
    }
  };

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!trimmedBusinessName) {
      setCreateError("Business name is required.");
      return;
    }

    if (!isLoaded || !createOrganization || !setActive) {
      setCreateError("Organization tools are still loading. Try again in a moment.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    const baseSlug = slugSuggestion?.baseSlug || getInitialOrgSlugSeed(trimmedBusinessName);

    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidateSlug =
          attempt === 0 && slugSuggestion?.slug
            ? slugSuggestion.slug
            : buildOrgSlugCandidate(baseSlug, attempt);

        try {
          const organization = await createOrganization({
            name: trimmedBusinessName,
            slug: candidateSlug,
          });

          if (!organization?.id) {
            throw new Error("Clerk did not return a new organization.");
          }

          await setActive({ organization: organization.id });

          try {
            await bootstrapCurrent({
              displayName: trimmedBusinessName,
            });
          } catch {
            // The dashboard bootstraps branding again after navigation, so this
            // best-effort write does not need to block org creation.
          }

          router.push(nextPath);
          router.refresh();
          return;
        } catch (error) {
          if (isSlugConflict(error) && attempt < 11) {
            continue;
          }

          throw error;
        }
      }

      throw new Error("Unable to find an available organization slug.");
    } catch (error) {
      setCreateError(extractErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    const invitation = invitations.find((item) => item.id === invitationId);

    if (!isLoaded || !invitation || !setActive) {
      return;
    }

    setCreateError(null);
    setAcceptingInvitationId(invitationId);

    try {
      const acceptedInvitation = await invitation.accept();
      const organizationId = acceptedInvitation.publicOrganizationData.id;

      await setActive({ organization: organizationId });
      router.push(nextPath);
      router.refresh();
    } catch (error) {
      setCreateError(extractErrorMessage(error));
    } finally {
      setAcceptingInvitationId(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="card card-no-hover p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-surface-tertiary border border-border flex items-center justify-center">
            <Plus className="w-5 h-5 text-content" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-content">Create a new organization</h2>
            <p className="text-sm text-content-muted mt-1">
              We will generate the tenant slug from the business name and reserve it before the
              account starts using it.
            </p>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleCreateOrganization}>
          <div className="form-group">
            <label htmlFor="business-name" className="form-label">
              Business name
            </label>
            <input
              id="business-name"
              className="input-field w-full"
              placeholder="Acme Agency"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              disabled={isCreating}
            />
            <p className="form-hint">{helperText}</p>
          </div>

          <div className="rounded-xl border border-border bg-surface-tertiary/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-content-muted">
              Tenant URL preview
            </p>
            <p className="mt-2 text-base font-semibold text-content break-all">{hostPreview}</p>
          </div>

          {createError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {createError}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-primary w-full justify-center"
            disabled={isCreating || !trimmedBusinessName}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{isCreating ? "Creating organization..." : "Create organization"}</span>
          </button>
        </form>
      </section>

      <section className="card card-no-hover p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-surface-tertiary border border-border flex items-center justify-center">
            <Building2 className="w-5 h-5 text-content" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-content">Existing organizations</h2>
            <p className="text-sm text-content-muted mt-1">
              Switch into an organization you already belong to.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {!isLoaded ? (
            <div className="rounded-xl border border-border bg-surface-tertiary/60 px-4 py-5 text-sm text-content-muted">
              Loading organizations...
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-content">Your organizations</p>
                  <p className="text-xs text-content-muted mt-1">
                    Organizations you can open right now.
                  </p>
                </div>

                {memberships.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface-tertiary/60 px-4 py-5 text-sm text-content-muted">
                    No organizations yet. Create the first one from the form on the left.
                  </div>
                ) : (
                  memberships.map((membership) => {
                    const isSwitching = switchingOrgId === membership.organization.id;

                    return (
                      <div
                        key={membership.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-tertiary/60 px-4 py-4"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-content truncate">{membership.organization.name}</p>
                          <p className="text-sm text-content-muted truncate">
                            {membership.organization.slug || membership.organization.id}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="btn-secondary shrink-0"
                          onClick={() => handleSelectOrganization(membership.organization.id)}
                          disabled={isSwitching}
                        >
                          {isSwitching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                          <span>{isSwitching ? "Opening..." : "Open"}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-content">Pending invitations</p>
                  <p className="text-xs text-content-muted mt-1">
                    Invitations that have been sent to your account but are not active memberships yet.
                  </p>
                </div>

                {invitations.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface-tertiary/60 px-4 py-5 text-sm text-content-muted">
                    No pending invitations.
                  </div>
                ) : (
                  invitations.map((invitation) => {
                    const isAccepting = acceptingInvitationId === invitation.id;

                    return (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-tertiary/60 px-4 py-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl border border-border bg-surface-secondary flex items-center justify-center shrink-0">
                            <Mail className="w-4 h-4 text-content-muted" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-content truncate">
                              {invitation.publicOrganizationData?.name || "Organization invitation"}
                            </p>
                            <p className="text-sm text-content-muted truncate">{invitation.emailAddress}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-secondary shrink-0"
                          onClick={() => handleAcceptInvitation(invitation.id)}
                          disabled={isAccepting}
                        >
                          {isAccepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          <span>{isAccepting ? "Accepting..." : "Accept"}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
