"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { DollarSign, Clock, Briefcase, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Header } from "@/components/Header";
import { KpiCard } from "@/components/KpiCard";
import { RevenueChart } from "@/components/RevenueChart";
import { QuickActions } from "@/components/QuickActions";
import { InvoiceTable, type Invoice } from "@/components/InvoiceTable";
import { kpiData, revenueByBrand } from "@/data/dashboard-sample";

const formatInvoiceDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export default function DashboardPage() {
  const router = useRouter();
  const invoices = useQuery(api.invoiceActions.listInvoices, { limit: 8 });
  const clients = useQuery(api.clients.list, { limit: 200 });

  const recentInvoices = useMemo<Invoice[]>(() => {
    if (!invoices || !clients) return [];

    const clientsById = new Map(clients.map((client) => [client._id, client]));

    return invoices.map((invoice) => {
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
  }, [invoices, clients]);

  const isLoadingRecentInvoices = invoices === undefined || clients === undefined;

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
          value={kpiData.totalRevenue.value}
          icon={DollarSign}
          trend={kpiData.totalRevenue.trend}
          variant={1}
          delay={50}
        />
        <KpiCard
          title="Pending Invoices"
          value={kpiData.pendingInvoices.count}
          icon={Clock}
          trend={{ value: kpiData.pendingInvoices.amount }}
          variant={2}
          delay={100}
        />
        <KpiCard
          title="Active Services"
          value={kpiData.activeServices.count}
          icon={Briefcase}
          trend={{ value: kpiData.activeServices.trend }}
          variant={3}
          delay={150}
        />
        <KpiCard
          title="Total Clients"
          value={kpiData.totalClients.count}
          icon={Users}
          trend={{ value: kpiData.totalClients.trend }}
          variant={4}
          delay={200}
        />
      </div>

      {/* Charts and Quick Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="lg:col-span-2">
          <RevenueChart data={revenueByBrand} />
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
