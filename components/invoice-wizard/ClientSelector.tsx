"use client";

import { useState } from "react";
import { Search, UserPlus, Check, X, Loader2 } from "lucide-react";
import type { WizardClient } from "@/data/wizard-sample";

interface ClientSelectorProps {
  clients: WizardClient[];
  selectedClient: WizardClient | null;
  onSelect: (client: WizardClient) => void;
  onCreateClient: (client: {
    name: string;
    company: string;
    email: string;
  }) => Promise<void>;
}

export function ClientSelector({
  clients,
  selectedClient,
  onSelect,
  onCreateClient,
}: ClientSelectorProps) {
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientCompany, setNewClientCompany] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.company.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase())
  );

  const resetCreateForm = () => {
    setNewClientName("");
    setNewClientCompany("");
    setNewClientEmail("");
    setCreateError("");
  };

  const toggleCreateForm = () => {
    setShowCreateForm((prev) => {
      const next = !prev;
      if (!next) {
        resetCreateForm();
      }
      return next;
    });
  };

  const handleCreateClient = async () => {
    const name = newClientName.trim();
    const company = newClientCompany.trim();
    const email = newClientEmail.trim().toLowerCase();

    if (!name || !company || !email) {
      setCreateError("Name, company, and email are required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCreateError("Enter a valid email address.");
      return;
    }

    setIsCreatingClient(true);
    setCreateError("");

    try {
      await onCreateClient({ name, company, email });
      resetCreateForm();
      setShowCreateForm(false);
      setSearch("");
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create client."
      );
    } finally {
      setIsCreatingClient(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-content-muted" />
        <input
          type="text"
          placeholder="Search clients by name, company, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field w-full pl-12 py-3"
        />
      </div>

      {/* Client list */}
      <div className="space-y-2">
        {filteredClients.length === 0 ? (
          <div className="text-center py-8 text-content-muted">
            <p>
              {search.trim()
                ? `No clients found matching "${search}"`
                : "No clients yet. Add one below to continue."}
            </p>
          </div>
        ) : (
          filteredClients.map((client) => {
            const isSelected = selectedClient?.id === client.id;
            return (
              <button
                key={client.id}
                onClick={() => onSelect(client)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all text-left ${
                  isSelected
                    ? "border-2 border-brand-sankofa bg-brand-sankofa/5"
                    : "border-border hover:bg-surface-hover hover:translate-x-1"
                }`}
              >
                {/* Avatar */}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                  style={{
                    background: client.avatarBg || "var(--avatar-bg)",
                    color: client.avatarBg ? "white" : "var(--color-text-secondary)",
                  }}
                >
                  {client.initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-content">{client.name}</p>
                  <p className="text-sm text-content-secondary">{client.company}</p>
                  <p className="text-sm text-content-muted truncate">{client.email}</p>
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-brand-sankofa flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Add new client */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={toggleCreateForm}
          className={`w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed transition-colors ${
            showCreateForm
              ? "border-brand-sankofa text-brand-sankofa bg-brand-sankofa/5"
              : "border-border text-content-muted hover:border-content-muted hover:text-content"
          }`}
        >
          {showCreateForm ? <X className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
          <span>{showCreateForm ? "Cancel New Client" : "Add New Client"}</span>
        </button>

        {showCreateForm && (
          <div className="card p-4 sm:p-5 space-y-4 animate-fade-in-up">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group sm:col-span-2">
                <label className="form-label">Client Name *</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="John Smith"
                  className="input-field w-full"
                  disabled={isCreatingClient}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Company *</label>
                <input
                  type="text"
                  value={newClientCompany}
                  onChange={(e) => setNewClientCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="input-field w-full"
                  disabled={isCreatingClient}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email *</label>
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="john@acme.com"
                  className="input-field w-full"
                  disabled={isCreatingClient}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreateClient();
                    }
                  }}
                />
              </div>
            </div>

            {createError && (
              <p className="text-sm text-error">{createError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleCreateForm}
                disabled={isCreatingClient}
                className="px-4 py-2 rounded-lg border border-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateClient()}
                disabled={isCreatingClient}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingClient ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Create Client
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientSelector;
