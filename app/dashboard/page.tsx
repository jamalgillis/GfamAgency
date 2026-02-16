"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Clock, Briefcase, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { Header } from "@/components/Header";
import { KpiCard } from "@/components/KpiCard";
import { RevenueChart } from "@/components/RevenueChart";
import { QuickActions } from "@/components/QuickActions";
import { InvoiceTable, type Invoice } from "@/components/InvoiceTable";

const formatInvoiceDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export default function DashboardPage() {
  const router = useRouter();

  const recentInvoicesFromDb = useAuthQuery(api.invoiceActions.listInvoices, { limit: 8 });
  const invoicesForKpi = useAuthQuery(api.invoiceActions.listInvoices, { limit: 5000 });
  const clients = useAuthQuery(api.clients.list, { limit: 5000 });
  const activeServices = useAuthQuery(api.services.list, { limit: 5000 });

  const dashboardKpis = useMemo(() => {
    if (!invoicesForKpi || !clients || !activeServices) {
      return null;
    }

    let paidRevenueCents = 0;
    let paidInvoiceCount = 0;
    let pendingAmountCents = 0;
    let pendingInvoiceCount = 0;

    for (const invoice of invoicesForKpi) {
      if (invoice.status === "paid") {
        paidRevenueCents += invoice.totalCents;
        paidInvoiceCount += 1;
      } else if (invoice.status === "open") {
        pendingAmountCents += invoice.totalCents;
        pendingInvoiceCount += 1;
      }
    }

    return {
      totalRevenue: formatCurrency(paidRevenueCents / 100),
      paidInvoiceCount,
      pendingInvoiceCount,
      pendingAmount: formatCurrency(pendingAmountCents / 100),
      activeServicesCount: activeServices.length,
      totalClientsCount: clients.length,
    };
  }, [invoicesForKpi, clients, activeServices]);

  const recentInvoices = useMemo<Invoice[]>(() => {
    if (!recentInvoicesFromDb || !clients) return [];

    const clientsById = new Map(clients.map((client) => [client._id, client]));

    return recentInvoicesFromDb.map((invoice) => {
      const client = clientsById.get(invoice.clientId);
      const clientName = client?.name ?? "Unknown Client";

      return {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        client: {
          name: clientName,
          initials: getInitials(clientName) || "UC",
        },
        brand: invoice.primaryBrand,
        amount: invoice.totalCents / 100,
        date: formatInvoiceDate(invoice.createdAt),
        status: invoice.status,
      };
    });
  }, [recentInvoicesFromDb, clients]);

  const isLoadingRecentInvoices = recentInvoicesFromDb === undefined || clients === undefined;

  const handleNewInvoice = () => {
    router.push("/dashboard/invoices/new");
  };

  const handleQuickAction = (brand: string) => {
    // TODO: Create invoice for specific brand
    console.log("Quick action for brand:", brand);
  };

  const handleViewAllInvoices = () => {
    router.push("/dashboard/invoices");
  };

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Welcome back, manage your agency services"
        onNewInvoice={handleNewInvoice}
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        <KpiCard
          title="Total Revenue"
          value={dashboardKpis?.totalRevenue ?? "$0"}
          icon={DollarSign}
          trend={dashboardKpis ? { value: `${dashboardKpis.paidInvoiceCount} paid` } : undefined}
          variant={1}
          delay={50}
        />
        <KpiCard
          title="Pending Invoices"
          value={dashboardKpis?.pendingInvoiceCount ?? 0}
          icon={Clock}
          trend={{ value: dashboardKpis?.pendingAmount ?? "$0" }}
          variant={2}
          delay={100}
        />
        <KpiCard
          title="Active Services"
          value={dashboardKpis?.activeServicesCount ?? 0}
          icon={Briefcase}
          variant={3}
          delay={150}
        />
        <KpiCard
          title="Total Clients"
          value={dashboardKpis?.totalClientsCount ?? 0}
          icon={Users}
          variant={4}
          delay={200}
        />
      </div>

      {/* Charts and Quick Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <QuickActions onAction={handleQuickAction} />
      </div>

      {/* Recent Invoices Table */}
      {isLoadingRecentInvoices ? (
        <div className="card p-6 text-content-muted">Loading recent invoices...</div>
      ) : (
        <InvoiceTable invoices={recentInvoices} onViewAll={handleViewAllInvoices} />
      )}
    </>
  );
}
