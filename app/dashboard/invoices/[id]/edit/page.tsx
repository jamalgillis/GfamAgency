"use client";

import { useParams } from "next/navigation";
import { Header } from "@/components/Header";
import { WizardContainer } from "@/components/invoice-wizard";

export default function EditInvoicePage() {
  const params = useParams();
  const invoiceIdParam = params.id;
  const invoiceId = Array.isArray(invoiceIdParam) ? invoiceIdParam[0] : invoiceIdParam;

  return (
    <>
      <Header
        title="Edit Invoice"
        subtitle="Update line items and draft details"
      />
      <WizardContainer editingInvoiceId={invoiceId} />
    </>
  );
}
