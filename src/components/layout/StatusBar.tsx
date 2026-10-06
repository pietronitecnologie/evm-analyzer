// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { AlertTriangle, Check, RefreshCw, Save } from "lucide-react";

import { formatPercentIt, NON_CALCOLABILE } from "@/lib/format";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";

export function StatusBar() {
  const ctx = useProjectContextStore();
  const openScreen = useLayoutStore((s) => s.openScreen);

  return (
    <div className="flex h-6 items-center gap-4 border-t border-border bg-card px-3 text-xs text-muted-foreground">
      <span>
        Copertura{" "}
        <strong className="text-foreground">
          {ctx.coveragePct === null
            ? NON_CALCOLABILE
            : formatPercentIt(ctx.coveragePct, 0)}
        </strong>{" "}
        BAC
      </span>
      <span className="flex items-center gap-1">
        <RefreshCw className="size-3" />
        Piano:{" "}
        {ctx.planSynced ? (
          <span className="flex items-center gap-1 text-foreground">
            sincronizzato <Check className="size-3 text-semaforo-verde" />
            {ctx.planSyncHash && `(hash ${ctx.planSyncHash})`}
          </span>
        ) : (
          <span className="text-semaforo-rosso">da ri-sincronizzare</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => openScreen("qualita-dati", "Qualità dati")}
        className="flex items-center gap-1 hover:text-foreground"
      >
        <AlertTriangle className="size-3" />
        {ctx.anomalyCount} anomalie
      </button>
      <span className="ml-auto flex items-center gap-1">
        <Save className="size-3" />
        {ctx.saved ? "Salvato" : "Salvataggio…"}
      </span>
    </div>
  );
}
