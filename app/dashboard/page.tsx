"use client";

import { DollarSign, Clock, Briefcase, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { KpiCard } from "@/components/KpiCard";
import { RevenueChart } from "@/components/RevenueChart";
import { QuickActions } from "@/components/QuickActions";
import { InvoiceTable } from "@/components/InvoiceTable";
import { kpiData, revenueByBrand, recentInvoices } from "@/data/dashboard-sample";

export default function DashboardPage() {
  const handleNewInvoice = () => {
    // TODO: Open new invoice modal/page
    console.log("Create new invoice");
  };

  const handleQuickAction = (brand: string) => {
    // TODO: Create invoice for specific brand
    console.log("Quick action for brand:", brand);
  };

  const handleViewAllInvoices = () => {
    // TODO: Navigate to invoices page
    console.log("View all invoices");
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
      <InvoiceTable invoices={recentInvoices} onViewAll={handleViewAllInvoices} />
    </>
  );
}
