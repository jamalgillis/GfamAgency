"use client";

import { useState } from "react";
import { Search, UserPlus, Check } from "lucide-react";
import type { WizardClient } from "@/data/wizard-sample";

interface ClientSelectorProps {
  clients: WizardClient[];
  selectedClient: WizardClient | null;
  onSelect: (client: WizardClient) => void;
}

export function ClientSelector({
  clients,
  selectedClient,
  onSelect,
}: ClientSelectorProps) {
  const [search, setSearch] = useState("");

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.company.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase())
  );

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
            <p>No clients found matching "{search}"</p>
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
      <button className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-border text-content-muted hover:border-content-muted hover:text-content transition-colors">
        <UserPlus className="w-5 h-5" />
        <span>Add New Client</span>
      </button>
    </div>
  );
}

export default ClientSelector;
