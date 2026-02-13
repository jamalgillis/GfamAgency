"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import {
  Search,
  Plus,
  Users,
  UserCheck,
  Zap,
  UserPlus,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Mail,
  Building2,
  User,
} from "lucide-react";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface ClientData {
  id: Id<"clients">;
  name: string;
  company: string;
  email: string;
  initials: string;
  hasStripe: boolean;
  invoiceCount: number;
  totalRevenue: number;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "UC";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

type ModalMode = "add" | "edit" | null;

export default function ClientsPage() {
  const clientsFromDb = useQuery(api.clients.list, { limit: 500 });
  const invoicesFromDb = useQuery(api.invoiceActions.listInvoices, { limit: 500 });

  const createClient = useMutation(api.clients.create);
  const updateClient = useMutation(api.clients.update);
  const removeClient = useMutation(api.clients.remove);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingClient, setEditingClient] = useState<ClientData | null>(null);
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete confirmation
  const [deletingClient, setDeletingClient] = useState<ClientData | null>(null);

  // Action menu
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  const isLoading = clientsFromDb === undefined;

  // Build client data with invoice stats
  const allClients = useMemo<ClientData[]>(() => {
    if (!clientsFromDb) return [];

    // Build invoice stats per client
    const invoiceStats = new Map<string, { count: number; revenue: number }>();
    if (invoicesFromDb) {
      for (const invoice of invoicesFromDb) {
        const clientId = invoice.clientId;
        const existing = invoiceStats.get(clientId) ?? { count: 0, revenue: 0 };
        existing.count += 1;
        if (invoice.status === "paid") {
          existing.revenue += invoice.totalCents / 100;
        }
        invoiceStats.set(clientId, existing);
      }
    }

    return clientsFromDb.map((client) => {
      const stats = invoiceStats.get(client._id) ?? { count: 0, revenue: 0 };
      return {
        id: client._id,
        name: client.name,
        company: client.company,
        email: client.email,
        initials: getInitials(client.name),
        hasStripe: !!client.stripeCustomerId,
        invoiceCount: stats.count,
        totalRevenue: stats.revenue,
      };
    });
  }, [clientsFromDb, invoicesFromDb]);

  // Summary stats
  const summary = useMemo(() => {
    const total = allClients.length;
    const withStripe = allClients.filter((c) => c.hasStripe).length;
    const withInvoices = allClients.filter((c) => c.invoiceCount > 0).length;
    const totalRevenue = allClients.reduce((sum, c) => sum + c.totalRevenue, 0);
    return { total, withStripe, withInvoices, totalRevenue };
  }, [allClients]);

  // Filtered clients
  const filteredClients = useMemo(() => {
    if (searchQuery === "") return allClients;
    const query = searchQuery.toLowerCase();
    return allClients.filter(
      (client) =>
        client.name.toLowerCase().includes(query) ||
        client.company.toLowerCase().includes(query) ||
        client.email.toLowerCase().includes(query)
    );
  }, [allClients, searchQuery]);

  // Paginated clients
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(start, start + itemsPerPage);
  }, [filteredClients, currentPage]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const showingFrom = filteredClients.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = filteredClients.length === 0 ? 0 : Math.min(currentPage * itemsPerPage, filteredClients.length);

  useEffect(() => {
    if (totalPages === 0) {
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Close action menu on outside click
  useEffect(() => {
    if (!openActionMenu) return;
    const handler = () => setOpenActionMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openActionMenu]);

  // Modal handlers
  const openAddModal = () => {
    setModalMode("add");
    setEditingClient(null);
    setFormName("");
    setFormCompany("");
    setFormEmail("");
    setFormError("");
  };

  const openEditModal = (client: ClientData) => {
    setModalMode("edit");
    setEditingClient(client);
    setFormName(client.name);
    setFormCompany(client.company);
    setFormEmail(client.email);
    setFormError("");
    setOpenActionMenu(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingClient(null);
    setFormError("");
  };

  const handleSubmit = useCallback(async () => {
    const name = formName.trim();
    const company = formCompany.trim();
    const email = formEmail.trim();

    if (!name || !company || !email) {
      setFormError("All fields are required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }

    setFormSubmitting(true);
    setFormError("");

    try {
      if (modalMode === "add") {
        await createClient({ name, company, email });
      } else if (modalMode === "edit" && editingClient) {
        await updateClient({
          clientId: editingClient.id,
          name,
          company,
          email,
        });
      }
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFormSubmitting(false);
    }
  }, [formName, formCompany, formEmail, modalMode, editingClient, createClient, updateClient]);

  const handleDelete = useCallback(async () => {
    if (!deletingClient) return;
    try {
      await removeClient({ clientId: deletingClient.id });
      setDeletingClient(null);
    } catch (err) {
      // If delete fails, just close
      setDeletingClient(null);
    }
  }, [deletingClient, removeClient]);

  const confirmDelete = (client: ClientData) => {
    setDeletingClient(client);
    setOpenActionMenu(null);
  };

  return (
    <>
      {/* Header */}
      <header className="mb-6 md:mb-8 animate-fade-in-up">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-content">Clients</h1>
            <p className="text-content-muted text-sm mt-1">
              Manage your client directory and track engagement
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <ThemeSwitch />

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="input-field pl-10 pr-4 py-2.5 w-48 sm:w-64"
              />
            </div>

            <button onClick={openAddModal} className="btn-primary whitespace-nowrap">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Client</span>
            </button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
        <div
          className="summary-card opacity-0 animate-fade-in-up"
          style={{ animationDelay: "50ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon bg-surface-tertiary">
              <Users className="w-5 h-5 text-content" />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value">{summary.total}</div>
            <div className="summary-label">Total Clients</div>
          </div>
        </div>

        <div
          className="summary-card opacity-0 animate-fade-in-up"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon summary-icon-paid">
              <UserCheck className="w-5 h-5" style={{ color: "var(--brand-sankofa)" }} />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value text-success">{summary.withInvoices}</div>
            <div className="summary-label">Active Clients</div>
            <div className="summary-count">with invoices</div>
          </div>
        </div>

        <div
          className="summary-card opacity-0 animate-fade-in-up"
          style={{ animationDelay: "150ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon" style={{ background: "rgba(99, 91, 255, 0.12)" }}>
              <Zap className="w-5 h-5" style={{ color: "#635bff" }} />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value" style={{ color: "#635bff" }}>{summary.withStripe}</div>
            <div className="summary-label">Stripe Synced</div>
            <div className="summary-count">connected to Stripe</div>
          </div>
        </div>

        <div
          className="summary-card opacity-0 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          <div className="flex items-start justify-between">
            <div className="summary-icon" style={{ background: "rgba(59, 130, 246, 0.12)" }}>
              <UserPlus className="w-5 h-5" style={{ color: "var(--brand-gfam)" }} />
            </div>
          </div>
          <div className="mt-4 text-left">
            <div className="summary-value">{formatCurrency(summary.totalRevenue)}</div>
            <div className="summary-label">Total Revenue</div>
            <div className="summary-count">from paid invoices</div>
          </div>
        </div>
      </div>

      {/* Client Table */}
      {isLoading ? (
        <div className="invoices-table-card opacity-0 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
          <div className="p-8 text-center text-content-muted">Loading clients...</div>
        </div>
      ) : (
        <div className="invoices-table-card opacity-0 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <div className="clients-table-header">
              <div>Client</div>
              <div>Company</div>
              <div>Email</div>
              <div>Invoices</div>
              <div>Revenue</div>
              <div>Stripe</div>
              <div></div>
            </div>

            {paginatedClients.length === 0 ? (
              <div className="p-8 text-center text-content-muted">
                {searchQuery ? "No clients found matching your search." : "No clients yet. Add your first client to get started."}
              </div>
            ) : (
              paginatedClients.map((client, index) => (
                <div
                  key={client.id}
                  className="clients-table-row opacity-0 animate-slide-in-left"
                  style={{ animationDelay: `${300 + index * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="client-avatar">
                      {client.initials}
                    </div>
                    <div className="client-name">{client.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-content-secondary">{client.company}</div>
                  </div>
                  <div>
                    <div className="text-sm text-content-muted">{client.email}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-content">{client.invoiceCount}</div>
                  </div>
                  <div>
                    <div className="amount">{formatCurrency(client.totalRevenue)}</div>
                  </div>
                  <div>
                    {client.hasStripe ? (
                      <span className="stripe-synced">
                        <Zap className="w-3 h-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="text-meta text-content-muted">Not synced</span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="row-actions">
                      <button
                        className="action-btn"
                        title="Actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionMenu(openActionMenu === client.id ? null : client.id);
                        }}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    {openActionMenu === client.id && (
                      <div className="dropdown-menu right-0 left-auto" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="dropdown-item"
                          onClick={() => openEditModal(client)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          className="dropdown-item text-error hover:text-error"
                          onClick={() => confirmDelete(client)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden divide-y divide-border">
            {paginatedClients.length === 0 ? (
              <div className="p-8 text-center text-content-muted">
                {searchQuery ? "No clients found." : "No clients yet."}
              </div>
            ) : (
              paginatedClients.map((client, index) => (
                <div
                  key={client.id}
                  className="p-4 opacity-0 animate-slide-in-left"
                  style={{ animationDelay: `${300 + index * 50}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="client-avatar flex-shrink-0">
                        {client.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-content">{client.name}</div>
                        <p className="text-sm text-content-secondary truncate">{client.company}</p>
                        <p className="text-xs text-content-muted truncate">{client.email}</p>
                      </div>
                    </div>
                    <button
                      className="action-btn flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionMenu(openActionMenu === client.id ? null : client.id);
                      }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3 pl-12">
                    <div className="flex items-center gap-3 text-xs text-content-muted">
                      <span>{client.invoiceCount} invoices</span>
                      {client.hasStripe && (
                        <span className="stripe-synced">
                          <Zap className="w-3 h-3" />
                          Stripe
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-content text-sm">
                      {formatCurrency(client.totalRevenue)}
                    </span>
                  </div>
                  {openActionMenu === client.id && (
                    <div className="mt-2 ml-12 flex gap-2">
                      <button
                        className="btn-secondary text-meta-lg"
                        onClick={() => openEditModal(client)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        className="btn-secondary text-meta-lg text-error"
                        onClick={() => confirmDelete(client)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          <div className="pagination">
            <div className="pagination-info">
              Showing <strong>{showingFrom}-{showingTo}</strong> of <strong>{filteredClients.length}</strong>{" "}
              clients
            </div>
            <div className="pagination-controls">
              <button
                className="page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`page-btn ${currentPage === page ? "active" : ""}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              {totalPages > 3 && (
                <>
                  <span className="text-content-muted">...</span>
                  <button
                    className={`page-btn ${currentPage === totalPages ? "active" : ""}`}
                    onClick={() => setCurrentPage(totalPages)}
                  >
                    {totalPages}
                  </button>
                </>
              )}
              <button
                className="page-btn"
                disabled={filteredClients.length === 0 || currentPage >= totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Client Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-surface-secondary rounded-card-lg border border-border p-6 w-full max-w-md animate-fade-in-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-content">
                {modalMode === "add" ? "Add New Client" : "Edit Client"}
              </h2>
              <button className="btn-icon" onClick={closeModal}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input-field pl-10 w-full"
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Company</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    className="input-field pl-10 w-full"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                  <input
                    type="email"
                    placeholder="john@acme.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="input-field pl-10 w-full"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-sm text-error">{formError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1 justify-center" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1 justify-center"
                onClick={handleSubmit}
                disabled={formSubmitting}
              >
                {formSubmitting
                  ? "Saving..."
                  : modalMode === "add"
                    ? "Add Client"
                    : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeletingClient(null)} />
          <div className="relative bg-surface-secondary rounded-card-lg border border-border p-6 w-full max-w-sm animate-fade-in-up">
            <h2 className="text-lg font-semibold text-content mb-2">Delete Client</h2>
            <p className="text-sm text-content-muted mb-6">
              Are you sure you want to delete <strong className="text-content">{deletingClient.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1 justify-center"
                onClick={() => setDeletingClient(null)}
              >
                Cancel
              </button>
              <button
                className="flex-1 justify-center inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium bg-error text-white transition-all duration-200 hover:opacity-90"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
