"use client";

import { Header } from "@/components/Header";
import { WizardContainer } from "@/components/invoice-wizard";

export default function NewSubscriptionPage() {
  return (
    <>
      <Header
        title="Create Subscription"
        subtitle="Build a recurring billing plan"
      />
      <WizardContainer initialBillingMode="subscription" />
    </>
  );
}
