"use client";

import { useParams } from "next/navigation";
import { Header } from "@/components/Header";
import { WizardContainer } from "@/components/invoice-wizard";

export default function AdjustDraftInvoicePage() {
  const params = useParams();
  const invoiceIdParam = params.id;
  const invoiceId = Array.isArray(invoiceIdParam) ? invoiceIdParam[0] : invoiceIdParam;

  return (
    <>
      <Header
        title="Adjust Draft Invoice"
        subtitle="Apply a one-time change without changing future subscription pricing"
      />
      <WizardContainer
        editingInvoiceId={invoiceId}
        allowSubscriptionDraftAdjustment
      />
    </>
  );
}
