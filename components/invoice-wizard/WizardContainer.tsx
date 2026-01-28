"use client";

import { useState, useMemo } from "react";
import { useAction, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Send, Save, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WizardProgress } from "./WizardProgress";
import { ClientSelector } from "./ClientSelector";
import { ServicePicker } from "./ServicePicker";
import { InvoicePreview } from "./InvoicePreview";
import { LivePreviewSidebar } from "./LivePreviewSidebar";
import { InvoiceDocument } from "./InvoiceDocument";
import { sampleServices } from "@/data/wizard-sample";
import type { WizardClient, WizardService, SelectedServiceItem } from "@/data/wizard-sample";
import type { BrandType, InvoiceLineItem } from "@/types/invoice";
import { dollarsToCents } from "@/types/invoice";

type Step = 1 | 2 | 3;
type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export function WizardContainer() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedClient, setSelectedClient] = useState<WizardClient | null>(null);
  const [selectedServices, setSelectedServices] = useState<Map<string, SelectedServiceItem>>(
    new Map()
  );
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInvoiceDocument, setShowInvoiceDocument] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>("draft");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Convex queries
  const convexClients = useQuery(api.clients.list, { limit: 100 });

  // Convex action for creating invoices
  const createInvoice = useAction(api.invoiceActions.createInvoice);

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

  const canProceedToStep2 = selectedClient !== null;
  const canProceedToStep3 = selectedServices.size > 0;

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
    setSelectedServices((prev) => {
      const next = new Map(prev);
      next.set(service.id, { service, quantity: 1 });
      return next;
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
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  // Check if an ID looks like a valid Convex ID (not a sample ID like "s1", "s2")
  const isValidConvexId = (id: string): boolean => {
    // Sample IDs are short like "s1", "s2", "custom-xxx"
    // Convex IDs are longer strings (typically 20+ chars)
    return id.length > 10 && !id.startsWith("s") && !id.startsWith("custom-");
  };

  // Convert selected services to InvoiceLineItem format for Convex
  const buildLineItems = (): InvoiceLineItem[] => {
    return Array.from(selectedServices.values()).map((item) => {
      const { service, quantity, customRate } = item;
      // Treat as custom item if explicitly marked OR if using sample data
      const isSampleService = !isValidConvexId(service.id);
      const isCustomItem = service.isCustom ?? isSampleService;
      const unitPriceCents = dollarsToCents(service.baseRate);
      const customPriceCents = customRate ? dollarsToCents(customRate) : undefined;

      return {
        // Only include serviceId if it's a valid Convex ID (not sample data)
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
  };

  const handleCreateDraft = async () => {
    if (!selectedClient) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const lineItems = buildLineItems();

      const result = await createInvoice({
        clientId: selectedClient.id as Id<"clients">,
        lineItems,
        notes: notes || undefined,
        sendImmediately: false,
      });

      if (result.success && result.invoiceNumber) {
        setInvoiceNumber(result.invoiceNumber);
        setInvoiceStatus("draft");
        setShowInvoiceDocument(true);
      } else {
        setError(result.error || "Failed to create draft invoice");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendInvoice = async () => {
    if (!selectedClient) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const lineItems = buildLineItems();

      const result = await createInvoice({
        clientId: selectedClient.id as Id<"clients">,
        lineItems,
        notes: notes || undefined,
        sendImmediately: true,
      });

      if (result.success && result.invoiceNumber) {
        setInvoiceNumber(result.invoiceNumber);
        setInvoiceStatus("sent");
        setShowInvoiceDocument(true);
      } else {
        setError(result.error || "Failed to send invoice");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToWizard = () => {
    setShowInvoiceDocument(false);
    setError(null);
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
            ) : clients.length === 0 ? (
              <div className="text-center py-12 text-content-muted">
                <p>No clients found. Create a client first.</p>
              </div>
            ) : (
              <ClientSelector
                clients={clients}
                selectedClient={selectedClient}
                onSelect={setSelectedClient}
              />
            )}
          </div>
        );
      case 2:
        return (
          <div className="animate-fade-in-up">
            <h2 className="text-xl font-semibold text-content mb-2">Select Services</h2>
            <p className="text-content-muted mb-6">
              Add services from any brand to the invoice
            </p>
            <ServicePicker
              services={sampleServices}
              selectedServices={selectedServices}
              onToggleService={handleToggleService}
              onQuantityChange={handleQuantityChange}
              onAddCustomService={handleAddCustomService}
              onCustomRateChange={handleCustomRateChange}
            />
          </div>
        );
      case 3:
        return (
          <div className="animate-fade-in-up">
            <h2 className="text-xl font-semibold text-content mb-2">Review Invoice</h2>
            <p className="text-content-muted mb-6">
              Confirm the details before creating the invoice
            </p>
            {selectedClient && (
              <InvoicePreview
                client={selectedClient}
                selectedServices={selectedServices}
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
        notes={notes}
        invoiceNumber={invoiceNumber}
        status={invoiceStatus}
        onBack={handleBackToWizard}
        onUpdateServices={setSelectedServices}
        onUpdateNotes={setNotes}
        editable={invoiceStatus === "draft"}
      />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Main wizard area */}
      <div className="flex-1 min-w-0">
        <WizardProgress
          currentStep={currentStep}
          clientSelected={canProceedToStep2}
          servicesSelected={canProceedToStep3}
        />

        <div className="card p-4 sm:p-6">
          {renderStepContent()}
          {renderActions()}
        </div>
      </div>

      {/* Live preview sidebar */}
      <div className="lg:block">
        <LivePreviewSidebar
          client={selectedClient}
          selectedServices={selectedServices}
          onRemoveService={handleRemoveService}
        />
      </div>
    </div>
  );
}

export default WizardContainer;
