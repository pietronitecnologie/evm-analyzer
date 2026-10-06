// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { Bell, ChevronDown, Search, UserRound } from "lucide-react";

import { StatoBadge } from "@/components/ui/stato-badge";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";

function ContextSelector({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-accent"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
      <ChevronDown className="size-3.5 text-muted-foreground" />
    </button>
  );
}

const STATO_LABEL: Record<string, string> = {
  bozza: "Bozza",
  provvisorio: "Provvisorio",
  finale: "Finale",
};

const STATO_SEMANTICO: Record<string, "neutro" | "provvisorio" | "verde"> = {
  bozza: "neutro",
  provvisorio: "provvisorio",
  finale: "verde",
};

export function ContextBar() {
  const ctx = useProjectContextStore();
  const setCommandPaletteOpen = useLayoutStore((s) => s.setCommandPaletteOpen);

  return (
    <div className="flex h-10 flex-wrap items-center gap-1 border-b border-border bg-card px-2">
      <ContextSelector label="Progetto" value={ctx.projectName} />
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent">
        <span className="text-muted-foreground">Status date</span>
        <span className="font-medium tabular-num">{ctx.statusDate}</span>
        <StatoBadge
          stato={STATO_SEMANTICO[ctx.statusDateState]}
          label={STATO_LABEL[ctx.statusDateState]}
        />
      </div>
      <ContextSelector label="Perimetro" value={ctx.perimetro} />
      <ContextSelector label="Baseline" value={ctx.baseline} />
      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        Base EV:{" "}
        {ctx.evBaseMode === "bac_senza_contingency"
          ? "senza contingency"
          : "con contingency"}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
        >
          <Search className="size-3.5" />
          Cerca task…
          <kbd className="rounded border border-border px-1 text-[10px]">
            Ctrl+K
          </kbd>
        </button>
        <button
          type="button"
          aria-label="Notifiche"
          className="relative rounded-md p-1.5 hover:bg-accent"
        >
          <Bell className="size-4" />
          {ctx.notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-semaforo-rosso text-[10px] text-semaforo-rosso-fg">
              {ctx.notificationCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm">
          <UserRound className="size-4" />
          <span className="font-medium">{ctx.userName}</span>
          <span className="text-muted-foreground">({ctx.userRole})</span>
        </div>
      </div>
    </div>
  );
}
