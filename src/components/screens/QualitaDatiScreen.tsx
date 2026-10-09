// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Qualità dati (specifica Fase 6, §1.3): registro unico delle anomalie calcolate dal
// motore (lib/qualita.ts), con filtri, accettazione con motivo (supervisore o
// coordinatore del piano) e riapertura. Il ricalcolo è manuale (pulsante Ricalcola): la
// specifica lo vorrebbe automatico dopo ogni evento rilevante (import, approvazione,
// cambio status date), ma agganciarlo a ogni punto di scrittura dell'app è un lavoro a
// parte — qui si ricalcola quando si apre la schermata e su richiesta, non ad ogni
// mutazione altrove (vedi DECISIONS.md).

import * as React from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Check, Download, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  chiama,
  type DatiAgile,
  type DatiMonitoraggio,
  type FiloneRiga,
  type PeriodoFlusso,
  type ProblemaRiga,
  type Riserve,
  type RisorsaRiga,
  type SnapshotRiga,
} from "@/lib/api";
import { puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { calcolaProblemiMotore } from "@/lib/qualita";
import { CAMPO, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Vuoto } from "./comuni";
import { Kpi } from "./kpi";

const ETICHETTA_STATO: Record<string, string> = { aperta: "Open", accettata: "Accepted", risolta: "Resolved" };
const ETICHETTA_GRAVITA: Record<string, string> = { critico: "Critical", avviso: "Warning", info: "Info" };
const CATEGORIE = ["baseline", "metodo_ev", "costi", "date", "perimetro", "import", "avanzamento", "riserve", "agile", "flusso"];

export function QualitaDatiScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [problemi, ricaricaProblemi] = useDati<ProblemaRiga[]>("elenco_problemi", percorso);
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [risorse] = useDati<RisorsaRiga[]>("risorse_elenco", percorso);
  const [datiAgile] = useDati<DatiAgile>("agile_dati", percorso);
  const [flusso] = useDati<PeriodoFlusso[]>("flusso_elenco", percorso);
  const [filoni] = useDati<FiloneRiga[]>("elenco_filoni", percorso);
  const [riserve] = useDati<Riserve>("riserve_dati", percorso);
  const [snapshot] = useDati<SnapshotRiga[]>("snapshot_elenco", percorso);

  const [soloCritiche, setSoloCritiche] = React.useState(false);
  const [soloAperte, setSoloAperte] = React.useState(true);
  const [soloMie, setSoloMie] = React.useState(false);
  const [categoria, setCategoria] = React.useState("");
  const [motivoAccetta, setMotivoAccetta] = React.useState<Record<number, string>>({});
  const [ricalcolando, setRicalcolando] = React.useState(false);

  if (!percorso) return <Vuoto messaggio="Open or create a project to see data quality." />;
  if (!problemi || !datiMon || !risorse || !datiAgile || !flusso || !filoni || !riserve || !snapshot) return <Vuoto messaggio="Loading…" />;

  const vista = vistaMonitoraggio(datiMon);
  const testata = puntoTestata(vista, ctx);
  const pctCompletato = testata && vista.bac > 0 ? (testata.ev / vista.bac) * 100 : 0;
  const snapshotIdEffettivo = ctx.snapshotId ?? snapshot[0]?.id ?? null;

  async function ricalcola() {
    setRicalcolando(true);
    try {
      const freschi = calcolaProblemiMotore({ vista, testata, risorse: risorse!, datiAgile: datiAgile!, flusso: flusso!, filoni: filoni!, riserve: riserve!, pctCompletato });
      const ok = await esegui(
        "Recalculation failed",
        () => chiama(percorso!, "ricalcola_problemi", { snapshotId: snapshotIdEffettivo, source: "motore", problemi: freschi }),
        "Data quality recalculated",
      );
      if (ok) await ricaricaProblemi();
    } finally {
      setRicalcolando(false);
    }
  }

  async function accetta(id: number) {
    const motivo = (motivoAccetta[id] ?? "").trim();
    if (!motivo) {
      avviso("Specify a reason to accept this issue");
      return;
    }
    const ok = await esegui("Accept failed", () => chiama(percorso!, "accetta_problema", { attoreId: ctx.attoreId, id, motivo }), "Issue accepted");
    if (ok) {
      setMotivoAccetta((m) => ({ ...m, [id]: "" }));
      await ricaricaProblemi();
    }
  }

  async function riapri(id: number) {
    const ok = await esegui("Reopen failed", () => chiama(percorso!, "riapri_problema", { id }), "Issue reopened");
    if (ok) await ricaricaProblemi();
  }

  async function esportaCsv() {
    const destinazione = await save({ title: "Export data quality issues", defaultPath: "qualita-dati.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (!destinazione) return;
    const campo = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const righe = [
      ["Severity", "Code", "Task/WBS", "Message", "Suggestion", "Status", "User"].join(","),
      ...filtrati.map((p) =>
        [
          ETICHETTA_GRAVITA[p.severity] ?? p.severity,
          p.code,
          p.taskUid ?? p.wbsCodice ?? "",
          p.message,
          p.suggestion ?? "",
          ETICHETTA_STATO[p.state] ?? p.state,
          p.acceptedBy ?? "",
        ]
          .map(campo)
          .join(","),
      ),
    ];
    await invoke("salva_testo", { percorso: destinazione, contenuto: `\uFEFF${righe.join("\n")}\n` });
  }

  const filtrati = problemi.filter((p) => {
    if (soloCritiche && p.severity !== "critico") return false;
    if (soloAperte && p.state !== "aperta") return false;
    if (soloMie && p.acceptedBy !== ctx.userName) return false;
    if (categoria && p.category !== categoria) return false;
    return true;
  });

  const conteggi = {
    critici: problemi.filter((p) => p.state === "aperta" && p.severity === "critico").length,
    avvisi: problemi.filter((p) => p.state === "aperta" && p.severity === "avviso").length,
    info: problemi.filter((p) => p.state === "aperta" && p.severity === "info").length,
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-3 gap-3 md:grid-cols-3">
        <Kpi etichetta="Critical (open)" valore={String(conteggi.critici)} />
        <Kpi etichetta="Warnings (open)" valore={String(conteggi.avvisi)} />
        <Kpi etichetta="Info (open)" valore={String(conteggi.info)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void ricalcola()} disabled={ricalcolando}>
          <RefreshCw className="size-4" />
          {ricalcolando ? "Recalculating…" : "Recalculate"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void esportaCsv()}>
          <Download className="size-4" />
          Export CSV
        </Button>
        <span className="mx-2 h-4 w-px bg-border" />
        <Button size="sm" variant={soloCritiche ? "outline" : "ghost"} onClick={() => setSoloCritiche(!soloCritiche)}>
          Critical
        </Button>
        <Button size="sm" variant={soloAperte ? "outline" : "ghost"} onClick={() => setSoloAperte(!soloAperte)}>
          Open
        </Button>
        <Button size="sm" variant={soloMie ? "outline" : "ghost"} onClick={() => setSoloMie(!soloMie)}>
          Mine
        </Button>
        <select className={`${CAMPO} max-w-40`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIE.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {filtrati.length === 0 ? (
        <Vuoto messaggio="No data quality issue matches these filters. Try Recalculate if the project just changed." />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Severity", "Rule", "Task/WBS", "Description", "Suggestion", "Status", "User", ""].map((t) => (
                <th key={t} className="sticky top-0 bg-zona-schede px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrati.map((p) => (
              <tr key={p.id}>
                <td className={`border-b border-border px-3 py-1.5 ${p.severity === "critico" ? "text-semaforo-rosso" : p.severity === "avviso" ? "text-semaforo-giallo" : "text-muted-foreground"}`}>
                  {ETICHETTA_GRAVITA[p.severity] ?? p.severity}
                </td>
                <td className="border-b border-border px-3 py-1.5 font-mono text-xs">{p.code}</td>
                <td className="border-b border-border px-3 py-1.5">
                  {p.taskUid ? (
                    <button type="button" className="underline" onClick={() => useLayoutStore.getState().openScreen("task-risorse", "Tasks and resources")}>
                      {p.taskUid}
                    </button>
                  ) : p.wbsCodice ? (
                    <button type="button" className="underline" onClick={() => useLayoutStore.getState().openScreen("wbs", "WBS")}>
                      {p.wbsCodice}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="border-b border-border px-3 py-1.5">{p.message}</td>
                <td className="border-b border-border px-3 py-1.5 text-muted-foreground">{p.suggestion ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5">
                  {ETICHETTA_STATO[p.state] ?? p.state}
                  {p.state === "accettata" && p.acceptedReason ? ` — ${p.acceptedReason}` : ""}
                </td>
                <td className="border-b border-border px-3 py-1.5">{p.acceptedBy ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5">
                  {p.state === "aperta" ? (
                    <div className="flex items-center gap-1">
                      <input
                        className={`${CAMPO} w-32`}
                        placeholder="Reason"
                        value={motivoAccetta[p.id] ?? ""}
                        onChange={(e) => setMotivoAccetta((m) => ({ ...m, [p.id]: e.target.value }))}
                      />
                      <Button size="sm" variant="outline" onClick={() => void accetta(p.id)}>
                        <Check className="size-3.5" />
                        Accept
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => void riapri(p.id)}>
                      <RotateCcw className="size-3.5" />
                      Reopen
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
