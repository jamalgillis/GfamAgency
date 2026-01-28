"use client";

import { Header } from "@/components/Header";
import { WizardContainer } from "@/components/invoice-wizard";

export default function NewInvoicePage() {
  return (
    <>
      <Header
        title="Create Invoice"
        subtitle="Step-by-step invoice builder"
      />
      <WizardContainer />
    </>
  );
}
