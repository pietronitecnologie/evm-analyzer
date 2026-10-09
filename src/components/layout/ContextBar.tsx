// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Barra di contesto (sez. 8.2): selettori di data di stato, perimetro e
// baseline. Cambiare un selettore aggiorna lo store condiviso; le schermate
// che leggono snapshotId/scopeId/baselineId si aggiornano di conseguenza
// (per ora solo la Dashboard, Fase 5 incremento 1 — vedi DECISIONS.md).

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, ChevronDown, Search } from "lucide-react";

import { StatoBadge } from "@/components/ui/stato-badge";
import { ETICHETTA_RUOLO, type BaselineRiga, type Perimetro, type SnapshotRiga, type Utente } from "@/lib/api";
import { usePercorso, useDati } from "@/lib/schermate";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";

function ContextSelector({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{value}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-48 rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function VoceSelettore({
  selezionata,
  onSelect,
  children,
}: {
  selezionata?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground ${
        selezionata ? "font-semibold" : ""
      }`}
    >
      {children}
    </DropdownMenu.Item>
  );
}

const STATO_LABEL: Record<string, string> = {
  bozza: "Draft",
  provvisorio: "Provisional",
  finale: "Final",
};

const STATO_SEMANTICO: Record<string, "neutro" | "provvisorio" | "verde"> = {
  bozza: "neutro",
  provvisorio: "provvisorio",
  finale: "verde",
};

export function ContextBar() {
  const ctx = useProjectContextStore();
  const setCommandPaletteOpen = useLayoutStore((s) => s.setCommandPaletteOpen);
  const percorso = usePercorso();
  const [baseline] = useDati<BaselineRiga[]>("baseline_elenco", percorso);
  const [snapshot] = useDati<SnapshotRiga[]>("snapshot_elenco", percorso);
  const [perimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);
  const [utenti] = useDati<Utente[]>("utenti_elenco", percorso);

  return (
    <div className="flex h-10 flex-wrap items-center gap-1 border-b border-border-strong bg-zona-contesto px-2">
      <ContextSelector label="Project" value={ctx.projectName} />

      <ContextSelector label="Status date" value={ctx.statusDate}>
        <VoceSelettore selezionata={ctx.snapshotId === null} onSelect={() => ctx.setSnapshot(null, snapshot?.[0]?.statusDate ?? "—", snapshot?.[0]?.state)}>
          Latest
        </VoceSelettore>
        {(snapshot ?? []).map((s) => (
          <VoceSelettore key={s.id} selezionata={ctx.snapshotId === s.id} onSelect={() => ctx.setSnapshot(s.id, s.statusDate, s.state)}>
            {s.statusDate} {s.label ? `— ${s.label}` : ""}
          </VoceSelettore>
        ))}
        {(snapshot ?? []).length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No status date yet.</p>}
      </ContextSelector>
      <StatoBadge stato={STATO_SEMANTICO[ctx.statusDateState]} label={STATO_LABEL[ctx.statusDateState]} />

      <ContextSelector label="Scope" value={ctx.perimetro}>
        <VoceSelettore selezionata={ctx.scopeId === null} onSelect={() => ctx.setScope(null, "Whole project")}>
          Whole project
        </VoceSelettore>
        {(perimetri ?? []).map((p) => (
          <VoceSelettore key={p.id} selezionata={ctx.scopeId === p.id} onSelect={() => ctx.setScope(p.id, p.nome)}>
            {p.nome}
          </VoceSelettore>
        ))}
      </ContextSelector>

      <ContextSelector label="Baseline" value={ctx.baseline}>
        {(baseline ?? [])
          .filter((b) => !b.archiviata)
          .map((b) => (
            <VoceSelettore key={b.id} selezionata={ctx.baselineId === b.id} onSelect={() => ctx.setBaseline(b.id, b.nome)}>
              {b.nome} {b.bloccata ? "🔒" : ""}
            </VoceSelettore>
          ))}
        {(baseline ?? []).length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No baseline yet.</p>}
      </ContextSelector>
      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        Base EV:{" "}
        {ctx.evBaseMode === "bac_senza_contingency"
          ? "without contingency"
          : "with contingency"}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
        >
          <Search className="size-3.5" />
          Search tasks…
          <kbd className="rounded border border-border px-1 text-[10px]">
            Ctrl+K
          </kbd>
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-md p-1.5 hover:bg-accent"
        >
          <Bell className="size-4" />
          {ctx.notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-semaforo-rosso text-[10px] text-semaforo-rosso-fg">
              {ctx.notificationCount}
            </span>
          )}
        </button>
        <ContextSelector label="Acting as" value={ctx.userName}>
          <VoceSelettore selezionata={ctx.attoreId === null} onSelect={() => ctx.setAttore(null, "—", [])}>
            None
          </VoceSelettore>
          {(utenti ?? [])
            .filter((u) => u.attivo)
            .map((u) => (
              <VoceSelettore key={u.id} selezionata={ctx.attoreId === u.id} onSelect={() => ctx.setAttore(u.id, u.nome, u.ruoli)}>
                {u.nome} <span className="text-muted-foreground">({u.ruoli.map((r) => ETICHETTA_RUOLO[r] ?? r).join(", ")})</span>
              </VoceSelettore>
            ))}
          {(utenti ?? []).length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No user yet.</p>}
        </ContextSelector>
      </div>
    </div>
  );
}
