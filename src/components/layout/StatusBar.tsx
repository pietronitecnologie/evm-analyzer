// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import * as React from "react";
import { AlertTriangle, Check, RefreshCw, Save } from "lucide-react";

import { chiama, type ConteggioProblemi } from "@/lib/api";
import { formatPercentIt, NON_CALCOLABILE } from "@/lib/format";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";

/** Ogni quanto si aggiorna il conteggio: la barra di stato resta montata per tutta la
 * sessione di un progetto, a differenza delle schermate — non c'è un evento React da
 * ascoltare quando l'utente accetta/risolve un'anomalia da un'altra schermata. */
const INTERVALLO_CONTEGGIO_MS = 15_000;

export function StatusBar() {
  const ctx = useProjectContextStore();
  const openScreen = useLayoutStore((s) => s.openScreen);
  const percorso = ctx.percorso;
  const setAnomalyCount = useProjectContextStore((s) => s.setAnomalyCount);

  React.useEffect(() => {
    if (!percorso) return;
    let annullato = false;
    async function aggiorna() {
      try {
        const c = await chiama<ConteggioProblemi>(percorso!, "conteggio_problemi");
        if (!annullato) setAnomalyCount(c.critici + c.avvisi + c.info);
      } catch {
        // La barra di stato non mostra errori: il conteggio resta quello precedente.
      }
    }
    void aggiorna();
    const timer = setInterval(aggiorna, INTERVALLO_CONTEGGIO_MS);
    return () => {
      annullato = true;
      clearInterval(timer);
    };
  }, [percorso, setAnomalyCount]);

  return (
    <div className="flex h-6 items-center gap-4 border-t border-black/40 bg-zona-stato px-3 text-xs text-zona-stato-foreground">
      <span>
        Coverage{" "}
        <strong className="text-white">
          {ctx.coveragePct === null
            ? NON_CALCOLABILE
            : formatPercentIt(ctx.coveragePct, 0)}
        </strong>{" "}
        BAC
      </span>
      <span className="flex items-center gap-1">
        <RefreshCw className="size-3" />
        Plan:{" "}
        {ctx.planSynced ? (
          <span className="flex items-center gap-1 text-white">
            synced <Check className="size-3 text-semaforo-verde" />
            {ctx.planSyncHash && `(hash ${ctx.planSyncHash})`}
          </span>
        ) : (
          <span className="text-semaforo-rosso">needs re-sync</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => openScreen("qualita-dati", "Data quality")}
        className="flex items-center gap-1 rounded px-1 hover:bg-white/10 hover:text-white"
      >
        <AlertTriangle className="size-3" />
        {ctx.anomalyCount} anomalies
      </button>
      <span className="ml-auto flex items-center gap-1">
        <Save className="size-3" />
        {ctx.saved ? "Saved" : "Saving…"}
      </span>
    </div>
  );
}
