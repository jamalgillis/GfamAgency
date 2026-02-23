"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { ArrowLeft, ArrowRight, Send, Save, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { WizardProgress } from "./WizardProgress";
import { ClientSelector } from "./ClientSelector";
import { ServicePicker } from "./ServicePicker";
import { InvoicePreview } from "./InvoicePreview";
import { LivePreviewSidebar } from "./LivePreviewSidebar";
import { InvoiceDocument } from "./InvoiceDocument";
import type { WizardClient, WizardService, SelectedServiceItem } from "@/data/wizard-sample";
import type { BrandType, InvoiceLineItem } from "@/types/invoice";
import { dollarsToCents } from "@/types/invoice";

type Step = 1 | 2 | 3;
type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";
type BillingMode = "one_time" | "subscription";
type DraftSaveMode = "ledger" | "stripe";

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const endOfDayTimestamp = (timestampMs: number) => {
  const date = new Date(timestampMs);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

const calculateDueAt = (issueAtMs: number, extraDays: number) =>
  endOfDayTimestamp(issueAtMs) + Math.max(0, Math.floor(extraDays)) * DAY_IN_MS;

const inferExtraDueDays = (issueAtMs: number, dueAtMs?: number) => {
  if (typeof dueAtMs !== "number" || !Number.isFinite(dueAtMs)) {
    return 0;
  }

  const baseline = endOfDayTimestamp(issueAtMs);
  if (dueAtMs <= baseline) {
    return 0;
  }

  return Math.max(0, Math.round((dueAtMs - baseline) / DAY_IN_MS));
};

interface WizardContainerProps {
  initialBillingMode?: BillingMode;
  editingInvoiceId?: string;
  allowSubscriptionDraftAdjustment?: boolean;
}

export function WizardContainer({
  initialBillingMode = "one_time",
  editingInvoiceId,
  allowSubscriptionDraftAdjustment = false,
}: WizardContainerProps) {
  const router = useRouter();
  const normalizedEditingInvoiceId =
    typeof editingInvoiceId === "string" && editingInvoiceId.length > 10
      ? (editingInvoiceId as Id<"invoices">)
      : undefined;
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [billingMode, setBillingMode] = useState<BillingMode>(initialBillingMode);
  const [selectedClient, setSelectedClient] = useState<WizardClient | null>(null);
  const [selectedServices, setSelectedServices] = useState<Map<string, SelectedServiceItem>>(
    new Map()
  );
  const [notes, setNotes] = useState("");
  const [extraDueDays, setExtraDueDays] = useState(0);
  const [issueAtMs, setIssueAtMs] = useState(() => Date.now());
  const [discountPercent, setDiscountPercent] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInvoiceDocument, setShowInvoiceDocument] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>("draft");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [draftInvoiceId, setDraftInvoiceId] = useState<Id<"invoices"> | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftSaveMode, setDraftSaveMode] = useState<DraftSaveMode>("ledger");
  const [hasHydratedEditInvoice, setHasHydratedEditInvoice] = useState(false);

  // Convex queries
  const convexClients = useAuthQuery(api.clients.list, { limit: 100 });
  const convexServices = useAuthQuery(api.services.list, { limit: 5000 });
  const editingInvoice = useAuthQuery(
    api.invoiceActions.getInvoiceWithLineItems,
    normalizedEditingInvoiceId
      ? { invoiceId: normalizedEditingInvoiceId }
      : "skip",
  );
  const createClient = useMutation(api.clients.create);

  // Convex action for creating invoices
  const createLedgerDraftInvoice = useAction(api.invoiceActions.createLedgerDraftInvoice);
  const updateLedgerDraftInvoice = useAction(api.invoiceActions.updateLedgerDraftInvoice);
  const reviseLedgerInvoice = useAction(api.invoiceActions.reviseLedgerInvoice);
  const updateDraftInvoice = useAction(api.invoiceActions.updateDraftInvoice);
  const reviseInvoice = useAction(api.invoiceActions.reviseInvoice);
  const createCheckoutSessionForInvoice = useAction(
    api.invoiceActions.createCheckoutSessionForInvoice
  );
  const createSubscription = useAction(api.invoiceActions.createSubscription);

  // Transform Convex clients to WizardClient format
  const clients: WizardClient[] = useMemo(() => {
    if (!convexClients) return [];
    return convexClients.map((client) => ({
      id: client._id,
      name: client.name,
      company: client.company,
      email: client.email,
      initials: client.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2),
    }));
  }, [convexClients]);

  const wizardServices: WizardService[] = useMemo(() => {
    if (!convexServices) return [];

    return convexServices.map((service) => ({
      id: service._id,
      brand: service.brand,
      name: service.name,
      description: service.description,
      baseRate: service.priceValue,
      category: service.category,
      tags: service.tags,
      billingType: service.billingType ?? "one_time",
    }));
  }, [convexServices]);

  const selectedItems = useMemo(() => Array.from(selectedServices.values()), [selectedServices]);
  const computedDueAt = useMemo(
    () => calculateDueAt(issueAtMs, extraDueDays),
    [issueAtMs, extraDueDays],
  );
  const dueDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(computedDueAt)),
    [computedDueAt],
  );
  const isEditingSubscriptionLinkedInvoice =
    !!editingInvoice &&
    (
      editingInvoice.sourceType === "subscription" ||
      !!editingInvoice.subscriptionId ||
      !!editingInvoice.stripeSubscriptionId ||
      editingInvoice.invoiceNumber.startsWith("INV-SUB-")
    );
  const selectedBrands = useMemo(
    () => [...new Set(selectedItems.map((item) => item.service.brand))],
    [selectedItems]
  );
  const hasCustomItems = useMemo(
    () => selectedItems.some((item) => item.service.isCustom),
    [selectedItems]
  );
  const hasCustomRates = useMemo(
    () =>
      selectedItems.some(
        (item) => item.customRate !== undefined && item.customRate !== item.service.baseRate
      ),
    [selectedItems]
  );

  const subscriptionValidationError = useMemo(() => {
    if (billingMode !== "subscription") {
      return null;
    }
    if (selectedBrands.length > 1) {
      return "Phase 1 supports single-brand subscriptions. Keep items under one brand.";
    }
    if (hasCustomItems) {
      return "Custom line items are not supported for subscriptions yet.";
    }
    if (hasCustomRates) {
      return "Custom rate overrides are not supported for subscriptions yet.";
    }
    return null;
  }, [billingMode, selectedBrands.length, hasCustomItems, hasCustomRates]);

  const canProceedToStep2 = selectedClient !== null;
  const canProceedToStep3 =
    selectedServices.size > 0 &&
    (billingMode === "one_time" || subscriptionValidationError === null);

  useEffect(() => {
    if (billingMode !== "subscription") {
      return;
    }

    setSelectedServices((prev) => {
      let changed = false;
      const next = new Map<string, SelectedServiceItem>();

      prev.forEach((item, key) => {
        if (item.service.isCustom) {
          changed = true;
          return;
        }

        if (item.customRate !== undefined) {
          changed = true;
          next.set(key, { ...item, customRate: undefined });
          return;
        }

        next.set(key, item);
      });

      return changed ? next : prev;
    });

    setDiscountPercent(0);
  }, [billingMode]);

  useEffect(() => {
    if (!normalizedEditingInvoiceId || hasHydratedEditInvoice) {
      return;
    }

    if (
      editingInvoice === undefined ||
      convexClients === undefined ||
      convexServices === undefined
    ) {
      return;
    }

    if (!editingInvoice) {
      setError("Invoice not found.");
      setHasHydratedEditInvoice(true);
      return;
    }

    const isSubscriptionLinkedInvoice =
      editingInvoice.sourceType === "subscription" ||
      !!editingInvoice.subscriptionId ||
      !!editingInvoice.stripeSubscriptionId ||
      editingInvoice.invoiceNumber.startsWith("INV-SUB-");

    const canAdjustSubscriptionDraftHere =
      isSubscriptionLinkedInvoice &&
      allowSubscriptionDraftAdjustment &&
      editingInvoice.status === "draft" &&
      !!editingInvoice.stripeInvoiceId;

    if (isSubscriptionLinkedInvoice && !canAdjustSubscriptionDraftHere) {
      if (editingInvoice.subscriptionId) {
        void router.replace(`/dashboard/subscriptions/${editingInvoice.subscriptionId}`);
      } else {
        setError("Subscription invoices can’t be edited here. Update the subscription instead.");
      }
      setHasHydratedEditInvoice(true);
      return;
    }

    const matchingClient = convexClients.find(
      (client) => client._id === editingInvoice.clientId,
    );
    const fallbackClientName = editingInvoice.client?.name ?? "Unknown Client";
    const hydratedClient: WizardClient = matchingClient
      ? {
          id: matchingClient._id,
          name: matchingClient.name,
          company: matchingClient.company,
          email: matchingClient.email,
          initials: getInitials(matchingClient.name),
        }
      : {
          id: editingInvoice.clientId,
          name: fallbackClientName,
          company: editingInvoice.client?.company ?? "",
          email: editingInvoice.client?.email ?? "",
          initials: getInitials(fallbackClientName),
        };

    const servicesById = new Map(
      convexServices.map((service) => [service._id, service] as const),
    );
    const servicesByStripePriceId = new Map<string, (typeof convexServices)[number]>();
    for (const service of convexServices) {
      if (service.stripePriceId) {
        servicesByStripePriceId.set(service.stripePriceId, service);
      }
      if (service.stripeRecurringPriceId) {
        servicesByStripePriceId.set(service.stripeRecurringPriceId, service);
      }
    }
    const hydratedServices = new Map<string, SelectedServiceItem>();
    let subtotalBeforeDiscountCents = 0;
    let discountCentsTotal = 0;

    for (const item of editingInvoice.lineItems) {
      const quantity = Math.max(1, item.quantity);
      const effectivePriceCents = item.customPriceCents ?? item.unitPriceCents;
      const lineAmountCents = effectivePriceCents * quantity;
      const isDiscountLine =
        !item.serviceId &&
        item.category === "discount" &&
        lineAmountCents < 0;

      if (isDiscountLine) {
        discountCentsTotal += Math.abs(lineAmountCents);
        continue;
      }

      const catalogService = item.serviceId
        ? servicesById.get(item.serviceId)
        : item.stripePriceId
          ? servicesByStripePriceId.get(item.stripePriceId)
          : undefined;
      const fallbackBaseRate = (item.unitPriceCents ?? 0) / 100;
      const requestedCustomRate =
        typeof item.customPriceCents === "number"
          ? item.customPriceCents / 100
          : undefined;

      const service: WizardService = catalogService
        ? {
            id: catalogService._id,
            brand: catalogService.brand,
            name: catalogService.name,
            description: catalogService.description,
            baseRate: catalogService.priceValue,
            category: catalogService.category,
            tags: catalogService.tags,
            billingType: catalogService.billingType ?? "one_time",
          }
        : {
            id: `custom-${item._id}`,
            brand: item.brand as BrandType,
            name: item.name,
            description: item.description ?? "",
            baseRate: fallbackBaseRate,
            category: item.category,
            isCustom: true,
          };

      const serviceKey = catalogService ? catalogService._id : service.id;
      const customRate =
        requestedCustomRate !== undefined && requestedCustomRate !== service.baseRate
          ? requestedCustomRate
          : undefined;

      if (lineAmountCents > 0) {
        subtotalBeforeDiscountCents += lineAmountCents;
      }

      const existing = hydratedServices.get(serviceKey);
      if (existing) {
        hydratedServices.set(serviceKey, {
          ...existing,
          quantity: existing.quantity + quantity,
          customRate: existing.customRate ?? customRate,
        });
      } else {
        hydratedServices.set(serviceKey, {
          service,
          quantity,
          customRate,
        });
      }
    }

    setBillingMode("one_time");
    setCurrentStep(allowSubscriptionDraftAdjustment ? 2 : 3);
    setSelectedClient(hydratedClient);
    setSelectedServices(hydratedServices);
    const inferredDiscountPercent =
      subtotalBeforeDiscountCents > 0 && discountCentsTotal > 0
        ? Math.min(
            100,
            Number(((discountCentsTotal / subtotalBeforeDiscountCents) * 100).toFixed(2)),
          )
        : 0;
    const inferredExtraDueDays = isSubscriptionLinkedInvoice
      ? 0
      : inferExtraDueDays(
          editingInvoice.createdAt,
          typeof editingInvoice.billingPeriodEnd === "number"
            ? editingInvoice.billingPeriodEnd
            : undefined,
        );
    setDiscountPercent(inferredDiscountPercent);
    setNotes(editingInvoice.notes ?? "");
    setIssueAtMs(editingInvoice.createdAt);
    setExtraDueDays(inferredExtraDueDays);
    setDraftInvoiceId(editingInvoice._id);
    setInvoiceNumber(editingInvoice.invoiceNumber ?? "");
    setInvoiceStatus(
      editingInvoice.status === "draft"
        ? "draft"
        : editingInvoice.status === "paid"
          ? "paid"
          : "sent",
    );
    setDraftSaveMode(editingInvoice.stripeInvoiceId ? "stripe" : "ledger");
    setShowInvoiceDocument(false);
    setCheckoutUrl(null);
    setEmailStatusMessage(null);
    setError(null);
    setHasHydratedEditInvoice(true);
  }, [
    convexClients,
    convexServices,
    editingInvoice,
    hasHydratedEditInvoice,
    allowSubscriptionDraftAdjustment,
    normalizedEditingInvoiceId,
    router,
  ]);

  const handleToggleService = (service: WizardService) => {
    setSelectedServices((prev) => {
      const next = new Map(prev);
      if (next.has(service.id)) {
        next.delete(service.id);
      } else {
        next.set(service.id, { service, quantity: 1 });
      }
      return next;
    });
  };

  const handleQuantityChange = (serviceId: string, quantity: number) => {
    setSelectedServices((prev) => {
      const next = new Map(prev);
      const existing = next.get(serviceId);
      if (existing) {
        next.set(serviceId, { ...existing, quantity });
      }
      return next;
    });
  };

  const handleCustomRateChange = (serviceId: string, customRate: number) => {
    if (billingMode === "subscription") {
      return;
    }

    setSelectedServices((prev) => {
      const next = new Map(prev);
      const existing = next.get(serviceId);
      if (existing) {
        next.set(serviceId, { ...existing, customRate });
      }
      return next;
    });
  };

  const handleAddCustomService = (service: WizardService) => {
    if (billingMode === "subscription") {
      return;
    }

    setSelectedServices((prev) => {
      const next = new Map(prev);
      next.set(service.id, { service, quantity: 1 });
      return next;
    });
  };

  const handleCreateClient = async (client: {
    name: string;
    company: string;
    email: string;
  }) => {
    const clientId = await createClient(client);
    setSelectedClient({
      id: clientId,
      name: client.name,
      company: client.company,
      email: client.email,
      initials: getInitials(client.name),
    });
  };

  const handleRemoveService = (serviceId: string) => {
    setSelectedServices((prev) => {
      const next = new Map(prev);
      next.delete(serviceId);
      return next;
    });
  };

  const handleNext = () => {
    if (currentStep === 1 && canProceedToStep2) {
      setCurrentStep(2);
    } else if (currentStep === 2 && canProceedToStep3) {
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setError(null);
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  // Catalog services come from Convex; ad-hoc items use the custom-* prefix.
  const isValidConvexId = (id: string): boolean => {
    return !id.startsWith("custom-");
  };

  // Convert selected services to InvoiceLineItem format for Convex
  const buildLineItems = (options?: { allowCustomPricing?: boolean }): InvoiceLineItem[] => {
    const allowCustomPricing = options?.allowCustomPricing ?? true;
    const serviceLineItems = Array.from(selectedServices.values()).map((item) => {
      const { service, quantity, customRate } = item;
      const isAdHocService = !isValidConvexId(service.id);
      const isCustomItem = service.isCustom ?? isAdHocService;
      const unitPriceCents = dollarsToCents(service.baseRate);
      const customPriceCents =
        allowCustomPricing && customRate ? dollarsToCents(customRate) : undefined;

      return {
        // Only include serviceId for catalog services from Convex.
        serviceId: isValidConvexId(service.id) ? (service.id as Id<"services">) : undefined,
        brand: service.brand as BrandType,
        category: service.category,
        name: service.name,
        description: service.description,
        quantity,
        stripePriceId: undefined, // Will be looked up from service if needed
        unitPriceCents,
        customPriceCents,
        isCustomItem,
      };
    });

    if (billingMode !== "one_time") {
      return serviceLineItems;
    }

    const normalizedDiscountPercent = Math.max(
      0,
      Math.min(100, Number.isFinite(discountPercent) ? discountPercent : 0),
    );

    if (normalizedDiscountPercent <= 0) {
      return serviceLineItems;
    }

    const subtotalByBrand = new Map<BrandType, number>();
    let subtotalCents = 0;
    for (const item of serviceLineItems) {
      const lineTotalCents = (item.customPriceCents ?? item.unitPriceCents) * item.quantity;
      if (lineTotalCents <= 0) {
        continue;
      }

      subtotalCents += lineTotalCents;
      subtotalByBrand.set(
        item.brand,
        (subtotalByBrand.get(item.brand) ?? 0) + lineTotalCents,
      );
    }

    if (subtotalCents <= 0) {
      return serviceLineItems;
    }

    const totalDiscountCents = Math.round(
      (subtotalCents * normalizedDiscountPercent) / 100,
    );

    if (totalDiscountCents <= 0) {
      return serviceLineItems;
    }

    const discountLabel = normalizedDiscountPercent
      .toFixed(2)
      .replace(/\.00$/, "");

    const brandEntries = Array.from(subtotalByBrand.entries());
    let allocatedDiscountCents = 0;
    const discountLineItems: InvoiceLineItem[] = [];

    for (let index = 0; index < brandEntries.length; index += 1) {
      const [brand, brandSubtotalCents] = brandEntries[index];
      const isLast = index === brandEntries.length - 1;
      const brandDiscountCents = isLast
        ? totalDiscountCents - allocatedDiscountCents
        : Math.round((brandSubtotalCents / subtotalCents) * totalDiscountCents);

      allocatedDiscountCents += brandDiscountCents;
      if (brandDiscountCents <= 0) {
        continue;
      }

      discountLineItems.push({
        brand,
        category: "discount",
        name: `Discount (${discountLabel}%)`,
        description: "One-time percentage discount",
        quantity: 1,
        unitPriceCents: -brandDiscountCents,
        customPriceCents: -brandDiscountCents,
        isCustomItem: true,
      });
    }

    return [...serviceLineItems, ...discountLineItems];
  };

  const handleCreateDraft = async () => {
    if (!selectedClient) return;

    setIsSubmitting(true);
    setError(null);
    setEmailStatusMessage(null);

    try {
      const lineItems = buildLineItems();
      const isCreatingRevision = !!draftInvoiceId && invoiceStatus !== "draft";
      const issueAtForSave =
        isCreatingRevision || !draftInvoiceId ? Date.now() : issueAtMs;
      const dueAtForSave = calculateDueAt(issueAtForSave, extraDueDays);
      if (draftInvoiceId && invoiceStatus !== "draft") {
        const result =
          draftSaveMode === "stripe"
            ? await reviseInvoice({
                invoiceId: draftInvoiceId,
                lineItems,
                notes: notes || undefined,
                dueAt: dueAtForSave,
              })
            : await reviseLedgerInvoice({
                invoiceId: draftInvoiceId,
                lineItems,
                notes: notes || undefined,
                dueAt: dueAtForSave,
              });

        if (result.success && result.invoiceNumber && result.invoiceId) {
          setInvoiceNumber(result.invoiceNumber);
          setInvoiceStatus("draft");
          setDraftInvoiceId(result.invoiceId);
          setIssueAtMs(issueAtForSave);
          setCheckoutUrl(null);
          setShowInvoiceDocument(true);
        } else {
          setError(result.error || "Failed to create invoice revision");
        }
      } else if (draftInvoiceId) {
        const result =
          draftSaveMode === "stripe"
            ? await updateDraftInvoice({
                invoiceId: draftInvoiceId,
                lineItems,
                notes: notes || undefined,
                dueAt: dueAtForSave,
              })
            : await updateLedgerDraftInvoice({
                invoiceId: draftInvoiceId,
                lineItems,
                notes: notes || undefined,
                dueAt: dueAtForSave,
              });

        if (result.success && result.invoiceNumber) {
          setInvoiceNumber(result.invoiceNumber);
          setInvoiceStatus("draft");
          setCheckoutUrl(null);
          setShowInvoiceDocument(true);
        } else {
          setError(result.error || "Failed to update draft invoice");
        }
      } else {
        const result = await createLedgerDraftInvoice({
          clientId: selectedClient.id as Id<"clients">,
          lineItems,
          notes: notes || undefined,
          dueAt: dueAtForSave,
        });

        if (result.success && result.invoiceNumber && result.invoiceId) {
          setInvoiceNumber(result.invoiceNumber);
          setInvoiceStatus("draft");
          setDraftInvoiceId(result.invoiceId);
          setIssueAtMs(issueAtForSave);
          setDraftSaveMode("ledger");
          setCheckoutUrl(null);
          setShowInvoiceDocument(true);
        } else {
          setError(result.error || "Failed to create draft invoice");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSubscription = async () => {
    if (!selectedClient) return;

    setIsSubmitting(true);
    setError(null);
    setEmailStatusMessage(null);

    try {
      if (subscriptionValidationError) {
        setError(subscriptionValidationError);
        return;
      }

      const lineItems = buildLineItems({ allowCustomPricing: false });
      const result = await createSubscription({
        clientId: selectedClient.id as Id<"clients">,
        lineItems,
        notes: notes || undefined,
      });

      if (!result.success || !result.subscriptionId) {
        setError(result.error || "Failed to create subscription");
        return;
      }

      router.push(`/dashboard/subscriptions/${result.subscriptionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendInvoice = async () => {
    if (!selectedClient) return;

    if (billingMode === "subscription") {
      await handleCreateSubscription();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setEmailStatusMessage(null);

    try {
      const lineItems = buildLineItems();
      const getEmailStatusMessage = (emailSent?: boolean, emailSkipped?: string) => {
        if (emailSent) {
          return "Invoice sent and email delivered via Resend.";
        }
        if (!emailSkipped) {
          return "Invoice sent, but email status is unknown.";
        }
        if (emailSkipped === "missing_resend_config") {
          return "Invoice sent, but email was skipped: Convex is missing RESEND_API_KEY or RESEND_FROM_EMAIL.";
        }
        if (emailSkipped === "missing_checkout_url") {
          return "Invoice sent, but email was skipped: checkout URL was missing.";
        }
        if (emailSkipped.startsWith("send_failed:")) {
          return `Invoice sent, but email failed: ${emailSkipped.replace("send_failed:", "")}`;
        }
        return `Invoice sent, but email was skipped: ${emailSkipped}`;
      };

      const buildCheckoutUrls = (invoiceId: Id<"invoices">) => {
        const origin = window.location.origin;
        return {
          successUrl: `${origin}/payment/success?invoiceId=${invoiceId}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/payment/cancelled?invoiceId=${invoiceId}`,
        };
      };

      if (draftInvoiceId) {
        let invoiceIdToSend = draftInvoiceId;
        let invoiceNumberForSend = invoiceNumber;
        let issueAtForSend = issueAtMs;

        if (invoiceStatus !== "draft") {
          const revisionIssueAt = Date.now();
          const dueAtForSave = calculateDueAt(revisionIssueAt, extraDueDays);
          const revisionResult =
            draftSaveMode === "stripe"
              ? await reviseInvoice({
                  invoiceId: draftInvoiceId,
                  lineItems,
                  notes: notes || undefined,
                  dueAt: dueAtForSave,
                })
              : await reviseLedgerInvoice({
                  invoiceId: draftInvoiceId,
                  lineItems,
                  notes: notes || undefined,
                  dueAt: dueAtForSave,
                });

          if (!revisionResult.success || !revisionResult.invoiceId) {
            setError(revisionResult.error || "Failed to create invoice revision");
            return;
          }

          invoiceIdToSend = revisionResult.invoiceId;
          invoiceNumberForSend = revisionResult.invoiceNumber || invoiceNumberForSend;
          issueAtForSend = revisionIssueAt;
        } else {
          const dueAtForSave = calculateDueAt(issueAtMs, extraDueDays);
          const updateResult =
            draftSaveMode === "stripe"
              ? await updateDraftInvoice({
                  invoiceId: draftInvoiceId,
                  lineItems,
                  notes: notes || undefined,
                  dueAt: dueAtForSave,
                })
              : await updateLedgerDraftInvoice({
                  invoiceId: draftInvoiceId,
                  lineItems,
                  notes: notes || undefined,
                  dueAt: dueAtForSave,
                });

          if (!updateResult.success) {
            setError(updateResult.error || "Failed to update draft invoice");
            return;
          }

          invoiceNumberForSend = updateResult.invoiceNumber || invoiceNumberForSend;
        }

        const { successUrl, cancelUrl } = buildCheckoutUrls(invoiceIdToSend);
        const sendResult = await createCheckoutSessionForInvoice({
          invoiceId: invoiceIdToSend,
          successUrl,
          cancelUrl,
        });

        if (sendResult.success) {
          setInvoiceNumber(sendResult.invoiceNumber || invoiceNumberForSend);
          setInvoiceStatus("sent");
          setDraftInvoiceId(invoiceIdToSend);
          setIssueAtMs(issueAtForSend);
          setCheckoutUrl(sendResult.checkoutUrl || null);
          setEmailStatusMessage(
            getEmailStatusMessage(sendResult.emailSent, sendResult.emailSkipped)
          );
          setShowInvoiceDocument(true);
        } else {
          setEmailStatusMessage(null);
          setError(sendResult.error || "Failed to send invoice");
        }
      } else {
        const issueAtForSave = Date.now();
        const dueAtForSave = calculateDueAt(issueAtForSave, extraDueDays);
        const draftResult = await createLedgerDraftInvoice({
          clientId: selectedClient.id as Id<"clients">,
          lineItems,
          notes: notes || undefined,
          dueAt: dueAtForSave,
        });

        if (!draftResult.success || !draftResult.invoiceId) {
          setError(draftResult.error || "Failed to create draft invoice");
          return;
        }

        const { successUrl, cancelUrl } = buildCheckoutUrls(draftResult.invoiceId);
        const sendResult = await createCheckoutSessionForInvoice({
          invoiceId: draftResult.invoiceId,
          successUrl,
          cancelUrl,
        });

        if (!sendResult.success) {
          setError(sendResult.error || "Failed to send invoice");
          return;
        }

        setInvoiceNumber(sendResult.invoiceNumber || draftResult.invoiceNumber || "");
        setInvoiceStatus("sent");
        setDraftInvoiceId(draftResult.invoiceId);
        setIssueAtMs(issueAtForSave);
        setDraftSaveMode("ledger");
        setCheckoutUrl(sendResult.checkoutUrl || null);
        setEmailStatusMessage(
          getEmailStatusMessage(sendResult.emailSent, sendResult.emailSkipped)
        );
        setShowInvoiceDocument(true);
      }
    } catch (err) {
      setEmailStatusMessage(null);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToWizard = () => {
    setShowInvoiceDocument(false);
    setError(null);
    setEmailStatusMessage(null);
  };

  const handleReviseInvoice = async () => {
    if (!draftInvoiceId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const lineItems = buildLineItems();
      const revisionIssueAt = Date.now();
      const dueAtForSave = calculateDueAt(revisionIssueAt, extraDueDays);
      const result =
        draftSaveMode === "stripe"
          ? await reviseInvoice({
              invoiceId: draftInvoiceId,
              lineItems,
              notes: notes || undefined,
              dueAt: dueAtForSave,
            })
          : await reviseLedgerInvoice({
              invoiceId: draftInvoiceId,
              lineItems,
              notes: notes || undefined,
              dueAt: dueAtForSave,
            });

      if (result.success && result.invoiceNumber && result.invoiceId) {
        setInvoiceNumber(result.invoiceNumber);
        setInvoiceStatus("draft");
        setDraftInvoiceId(result.invoiceId);
        setIssueAtMs(revisionIssueAt);
        setCheckoutUrl(null);
        setEmailStatusMessage(null);
        setShowInvoiceDocument(true);
      } else {
        setError(result.error || "Failed to create invoice revision");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="animate-fade-in-up">
            <h2 className="text-xl font-semibold text-content mb-2">Select Client</h2>
            <p className="text-content-muted mb-6">
              Choose the client for this invoice
            </p>
            {convexClients === undefined ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-content-muted" />
                <span className="ml-2 text-content-muted">Loading clients...</span>
              </div>
            ) : (
              <ClientSelector
                clients={clients}
                selectedClient={selectedClient}
                onSelect={setSelectedClient}
                onCreateClient={handleCreateClient}
              />
            )}
          </div>
        );
      case 2:
        return (
          <div className="animate-fade-in-up">
            <h2 className="text-xl font-semibold text-content mb-2">
              {billingMode === "subscription" ? "Select Subscription Services" : "Select Services"}
            </h2>
            <p className="text-content-muted mb-6">
              {billingMode === "subscription"
                ? "Choose recurring services for one brand. Custom items and custom rates are disabled in Phase 1."
                : "Add services from any brand to the invoice"}
            </p>
            {billingMode === "subscription" && subscriptionValidationError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{subscriptionValidationError}</span>
              </div>
            )}
            {convexServices === undefined ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-content-muted" />
                <span className="ml-2 text-content-muted">Loading services...</span>
              </div>
            ) : wizardServices.length === 0 ? (
              <div className="text-center py-12 text-content-muted">
                <p>No services found. Add services in the Services tab first.</p>
              </div>
            ) : (
              <ServicePicker
                services={wizardServices}
                selectedServices={selectedServices}
                onToggleService={handleToggleService}
                onQuantityChange={handleQuantityChange}
                onAddCustomService={handleAddCustomService}
                onCustomRateChange={handleCustomRateChange}
                allowCustomItems={billingMode === "one_time"}
                allowCustomRateOverrides={billingMode === "one_time"}
              />
            )}
          </div>
        );
      case 3:
        return (
          <div className="animate-fade-in-up">
            <h2 className="text-xl font-semibold text-content mb-2">
              {billingMode === "subscription" ? "Review Subscription" : "Review Invoice"}
            </h2>
            <p className="text-content-muted mb-6">
              {billingMode === "subscription"
                ? "Confirm details before creating the subscription."
                : "Confirm the details before creating the invoice"}
            </p>
            {allowSubscriptionDraftAdjustment &&
              isEditingSubscriptionLinkedInvoice && (
                <div className="mb-4 rounded-lg border border-border bg-surface-tertiary px-3 py-2 text-sm text-content-secondary">
                  One-time draft adjustment mode: this updates only this draft invoice. Future
                  subscription cycles stay on the subscription plan price.
                  <div className="mt-3">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-3 py-1.5 rounded-lg border border-border hover:bg-surface-hover transition-colors text-xs font-medium"
                    >
                      Go To Price Editor
                    </button>
                  </div>
                </div>
              )}
            {billingMode === "one_time" && (
              <div className="mb-4 rounded-lg border border-border bg-surface-tertiary px-3 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-content mb-2">
                      Discount Percentage
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={Number(discountPercent.toFixed(2))}
                        onChange={(event) => {
                          const parsed = Number.parseFloat(event.target.value);
                          if (!Number.isFinite(parsed)) {
                            setDiscountPercent(0);
                            return;
                          }
                          setDiscountPercent(Math.min(100, Math.max(0, parsed)));
                        }}
                        className="input-field w-28 text-right"
                      />
                      <span className="text-content-muted text-sm">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-content mb-2">
                      Additional Days Until Due
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        value={extraDueDays}
                        onChange={(event) => {
                          const parsed = Number.parseInt(event.target.value, 10);
                          if (!Number.isFinite(parsed)) {
                            setExtraDueDays(0);
                            return;
                          }

                          setExtraDueDays(Math.min(365, Math.max(0, parsed)));
                        }}
                        className="input-field w-28 text-right"
                      />
                      <span className="text-content-muted text-sm">days</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-content-muted mt-2">
                  Due date defaults to the issue date. Current due date: {dueDateLabel}.
                </p>
              </div>
            )}
            {selectedClient && (
              <InvoicePreview
                client={selectedClient}
                selectedServices={selectedServices}
                discountPercent={discountPercent}
                notes={notes}
                onNotesChange={setNotes}
              />
            )}
          </div>
        );
    }
  };

  const renderActions = () => {
    const canGoNext =
      (currentStep === 1 && canProceedToStep2) ||
      (currentStep === 2 && canProceedToStep3);

    return (
      <div className="space-y-4">
        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-6 border-t border-border">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentStep === 1
                ? "text-content-muted cursor-not-allowed"
                : "text-content hover:bg-surface-hover"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {currentStep === 3 ? (
              <>
                {billingMode === "one_time" ? (
                  <>
                    <button
                      onClick={handleCreateDraft}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-surface-hover transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Draft
                    </button>
                    <button
                      onClick={handleSendInvoice}
                      disabled={isSubmitting}
                      className="btn-primary disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {isSubmitting ? "Processing..." : "Send Invoice"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleCreateSubscription}
                    disabled={isSubmitting || !!subscriptionValidationError}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isSubmitting ? "Creating..." : "Create Subscription"}
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canGoNext}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Show invoice document after creation
  if (showInvoiceDocument && selectedClient) {
    return (
      <InvoiceDocument
        client={selectedClient}
        selectedServices={selectedServices}
        discountPercent={discountPercent}
        notes={notes}
        invoiceNumber={invoiceNumber}
        status={invoiceStatus}
        issueAt={issueAtMs}
        dueAt={computedDueAt}
        checkoutUrl={checkoutUrl}
        emailStatusMessage={emailStatusMessage}
        onBack={handleBackToWizard}
        onUpdateServices={setSelectedServices}
        onUpdateNotes={setNotes}
        onSaveDraft={handleCreateDraft}
        isSavingDraft={isSubmitting}
        onCreateRevision={invoiceStatus === "sent" ? handleReviseInvoice : undefined}
        isRevising={isSubmitting}
        editable={invoiceStatus === "draft"}
      />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Main wizard area */}
      <div className="flex-1 min-w-0">
        <div className="card card-no-hover p-2 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setBillingMode("one_time");
                setError(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                billingMode === "one_time"
                  ? "bg-surface-tertiary text-content"
                  : "text-content-secondary hover:bg-surface-hover"
              }`}
            >
              One-Time Invoice
            </button>
            <button
              onClick={() => {
                setBillingMode("subscription");
                setError(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                billingMode === "subscription"
                  ? "bg-surface-tertiary text-content"
                  : "text-content-secondary hover:bg-surface-hover"
              }`}
            >
              Subscription
            </button>
          </div>
        </div>

        <WizardProgress
          currentStep={currentStep}
          clientSelected={canProceedToStep2}
          servicesSelected={canProceedToStep3}
        />

        <div className="card card-no-hover p-4 sm:p-6">
          {renderStepContent()}
          {renderActions()}
        </div>
      </div>

      {/* Live preview sidebar */}
      <div className="lg:block">
        <LivePreviewSidebar
          client={selectedClient}
          selectedServices={selectedServices}
          discountPercent={discountPercent}
          onRemoveService={handleRemoveService}
        />
      </div>
    </div>
  );
}

export default WizardContainer;
