"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get("invoiceId");

  return (
    <main className="min-h-screen px-4 py-12 sm:py-16 bg-surface text-content">
      <div className="mx-auto max-w-xl card card-no-hover p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-300 mx-auto mb-4 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-semibold text-content">Payment Confirmed</h1>
        <p className="text-content-muted mt-2">
          Thank you. Your payment was successfully processed.
        </p>
        {invoiceId && (
          <p className="text-sm text-content-muted mt-3">
            Reference: <span className="font-mono">{invoiceId}</span>
          </p>
        )}
        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover transition-colors"
          >
            Return to Home
          </Link>
        </div>
        <p className="text-xs text-content-muted mt-4">
          You can close this window.
        </p>
      </div>
    </main>
  );
}
