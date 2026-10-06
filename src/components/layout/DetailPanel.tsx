// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import * as Tabs from "@radix-ui/react-tabs";
import { PanelRightClose } from "lucide-react";

import { useLayoutStore } from "@/stores/layout-store";

const TABS = [
  { id: "dettaglio", label: "Dettaglio" },
  { id: "storico", label: "Storico" },
  { id: "audit", label: "Audit" },
  { id: "anomalie", label: "Anomalie" },
];

export function DetailPanel() {
  const toggleDetailPanel = useLayoutStore((s) => s.toggleDetailPanel);

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex h-9 items-center justify-between border-b border-border px-2">
        <span className="text-sm font-medium">Dettaglio</span>
        <button
          type="button"
          aria-label="Chiudi pannello dettaglio (Ctrl+I)"
          title="Chiudi pannello dettaglio (Ctrl+I)"
          onClick={toggleDetailPanel}
          className="rounded p-1 text-muted-foreground hover:bg-accent"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>
      <Tabs.Root defaultValue="dettaglio" className="flex flex-1 flex-col">
        <Tabs.List className="flex border-b border-border">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="flex-1 border-b-2 border-transparent px-2 py-1.5 text-xs font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TABS.map((tab) => (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className="flex-1 overflow-y-auto p-3 text-sm text-muted-foreground"
          >
            Seleziona una riga in una tabella per vederne il {tab.label.toLowerCase()}.
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
