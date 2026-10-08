// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Agile/Flow (specifica Fase 5, §3.9): schede Sprint, Velocity, Flow, Monte Carlo.
// Sprint/velocity vengono dal foglio "Agile - Velocity" del workbook importato
// (agile_sprint, già popolato, letto qui per la prima volta). I periodi di flusso
// Kanban (kanban_flow) non hanno alcuna fonte di import (nessun foglio li esporta,
// vedi DECISIONS.md): si inseriscono a mano nella scheda Flow, che per questo mostra
// throughput/cycle time/WIP osservato-vs-teorico e l'avviso FLOW_WIP_EXCESS ma non il
// Cumulative Flow Diagram (richiede conteggi grezzi per stato che questa tabella non
// ha — deferito, decisione in DECISIONS.md).

import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { EChartsOption } from "echarts";
import { Plus, Trash2 } from "lucide-react";

import { EChart } from "@/components/charts/EChart";
import { leggiColoriGrafico } from "@/components/charts/tema";
import { Button } from "@/components/ui/button";
import { chiama, type DatiAgile, type PeriodoFlusso } from "@/lib/api";
import { avvisoWip, metricheAgili, wipTeorico } from "@/lib/agile";
import { eur, num } from "@/lib/format";
import { costruisciFonti } from "@/lib/montecarlo";
import { CAMPO, esegui, usePercorso, useDati } from "@/lib/schermate";
import { Campo, Sezione, Vuoto } from "./comuni";
import { Indice, Kpi } from "./kpi";
import { MonteCarloPanel } from "./MonteCarloPanel";

export function AgileFlowScreen() {
  const percorso = usePercorso();
  const [datiAgile, ricaricaAgile] = useDati<DatiAgile>("agile_dati", percorso);
  const [flusso, ricaricaFlusso] = useDati<PeriodoFlusso[]>("flusso_elenco", percorso);

  if (!percorso) return <Vuoto messaggio="Open or create a project for Agile/Flow." />;
  if (!datiAgile || !flusso) return <Vuoto messaggio="Loading…" />;

  const fonti = costruisciFonti(datiAgile, flusso);

  return (
    <Tabs.Root defaultValue="sprint" className="flex h-full flex-col">
      <Tabs.List className="flex gap-1 border-b border-border-strong bg-zona-navigazione px-2">
        {[
          { v: "sprint", t: "Sprint" },
          { v: "velocity", t: "Velocity" },
          { v: "flow", t: "Flow" },
          { v: "monte-carlo", t: "Monte Carlo" },
        ].map(({ v, t }) => (
          <Tabs.Trigger
            key={v}
            value={v}
            className="rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground"
          >
            {t}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="sprint" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaSprint percorso={percorso} dati={datiAgile} ricarica={ricaricaAgile} />
      </Tabs.Content>
      <Tabs.Content value="velocity" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaVelocity dati={datiAgile} />
      </Tabs.Content>
      <Tabs.Content value="flow" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaFlow percorso={percorso} periodi={flusso} ricarica={ricaricaFlusso} />
      </Tabs.Content>
      <Tabs.Content value="monte-carlo" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <MonteCarloPanel percorso={percorso} fonti={fonti} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

// -------------------------------------------------------------------- Sprint

function SchedaSprint({ percorso, dati, ricarica }: { percorso: string; dati: DatiAgile; ricarica: () => Promise<void> }) {
  const [backlog, setBacklog] = React.useState(dati.parametri.backlogSp === null ? "" : String(dati.parametri.backlogSp));
  const metriche = metricheAgili(dati);

  async function salvaBacklog(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Backlog not saved", () => chiama(percorso, "imposta_backlog_sp", { backlogSp: backlog.trim() === "" ? null : Number(backlog) }), "Backlog saved");
    if (ok) await ricarica();
  }

  if (!metriche) return <Vuoto messaggio="No sprint yet: import a workbook with the Agile sheet filled in." />;

  return (
    <div className="flex flex-col gap-4 p-4">
      {metriche.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-semaforo-giallo">
          {metriche.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi etichetta="Velocity (avg)" valore={metriche.velocityAvg === null ? "—" : num(metriche.velocityAvg)} nota="SP/sprint" />
        <Kpi etichetta="Cost/SP (baseline)" valore={eur(metriche.costPerSp)} nota={metriche.costPerSpDerived ? "derived, not fixed" : undefined} />
        <Kpi etichetta="Backlog remaining" valore={dati.parametri.backlogSp === null ? "—" : num(dati.parametri.backlogSp)} nota="SP" />
        <Kpi etichetta="Sprints remaining" valore={metriche.sprintRemainingCeil === null ? "—" : String(metriche.sprintRemainingCeil)} />
        <Kpi etichetta="EAC (time)" valore={metriche.eacTimeDays === null ? "—" : `${num(metriche.eacTimeDays)} d`} />
        <Kpi etichetta="EAC (cost)" valore={metriche.eacCost === null ? "—" : eur(metriche.eacCost)} />
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {["Sprint", "SP planned", "SP completed", "Velocity", "Avg velocity", "Cost/SP", "EV (agile)", "AC", "CPI (agile)"].map((t) => (
              <th key={t} className="sticky top-0 bg-zona-schede px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground first:text-left">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metriche.perSprint.map((s, i) => (
            <tr key={s.index}>
              <td className="border-b border-border px-3 py-1.5">{s.index}</td>
              <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{dati.sprint[i]?.spPianificati ?? "—"}</td>
              <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{dati.sprint[i]?.spCompletati ?? "—"}</td>
              <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{dati.sprint[i]?.spCompletati ?? "—"}</td>
              <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{metriche.velocityAvg === null ? "—" : num(metriche.velocityAvg)}</td>
              <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{eur(metriche.costPerSp)}</td>
              <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{eur(s.ev)}</td>
              <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{eur(s.ac)}</td>
              <td className="border-b border-border px-3 py-1.5 text-right"><Indice valore={s.cpi} luce={s.cpi === null ? "nd" : s.cpi >= 1 ? "verde" : s.cpi >= 0.85 ? "giallo" : "rosso"} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Sezione titolo="Remaining backlog (SP)">
        <form onSubmit={salvaBacklog} className="flex items-end gap-3">
          <Campo etichetta="Backlog remaining (SP)">
            <input type="number" min="0" step="1" className={CAMPO} value={backlog} onChange={(e) => setBacklog(e.target.value)} />
          </Campo>
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">No import provides this figure: enter the story points still to do to get sprints remaining, EAC (time) and EAC (cost).</p>
      </Sezione>
    </div>
  );
}

// ------------------------------------------------------------------ Velocity

function graficoVelocity(velocita: number[], media: number[]): EChartsOption {
  const colori = leggiColoriGrafico();
  return {
    textStyle: { color: colori.testo },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: velocita.map((_, i) => String(i + 1)), name: "sprint", axisLine: { lineStyle: { color: colori.griglia } } },
    yAxis: { type: "value", axisLine: { lineStyle: { color: colori.griglia } }, splitLine: { lineStyle: { color: colori.griglia } } },
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: colori.testo } },
    series: [
      { name: "Velocity", type: "bar", data: velocita, itemStyle: { color: colori.ev } },
      { name: "Moving average", type: "line", data: media, lineStyle: { color: colori.ac }, itemStyle: { color: colori.ac } },
    ],
  };
}

function SchedaVelocity({ dati }: { dati: DatiAgile }) {
  const [finestra, setFinestra] = React.useState(dati.parametri.velocityWindow);
  const velocita = dati.sprint.map((s) => s.spCompletati ?? 0);
  const media = velocita.map((_, i) => {
    const fetta = velocita.slice(Math.max(0, i - finestra + 1), i + 1);
    return fetta.reduce((s, v) => s + v, 0) / fetta.length;
  });

  if (velocita.length === 0) return <Vuoto messaggio="No sprint yet." />;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Campo etichetta="Moving average window (sprints)">
        <input type="number" min="1" step="1" className={`${CAMPO} max-w-32`} value={finestra} onChange={(e) => setFinestra(Math.max(1, Number(e.target.value) || 1))} />
      </Campo>
      <div className="h-72">
        <EChart option={graficoVelocity(velocita, media)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- Flow

function SchedaFlow({ percorso, periodi, ricarica }: { percorso: string; periodi: PeriodoFlusso[]; ricarica: () => Promise<void> }) {
  const [nuovo, setNuovo] = React.useState({ inizio: "", fine: "", throughput: "", cycleTime: "", wip: "" });
  const avviso = avvisoWip(periodi);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    const numero = (v: string) => (v.trim() === "" ? null : Number(v));
    const ok = await esegui(
      "Flow period not saved",
      () =>
        chiama(percorso, "crea_periodo_flusso", {
          inizioPeriodo: nuovo.inizio,
          finePeriodo: nuovo.fine,
          throughput: numero(nuovo.throughput),
          cycleTimeGiorni: numero(nuovo.cycleTime),
          wipOsservato: numero(nuovo.wip),
        }),
      "Flow period saved",
    );
    if (ok) {
      setNuovo({ inizio: "", fine: "", throughput: "", cycleTime: "", wip: "" });
      await ricarica();
    }
  }

  async function elimina(id: number) {
    const ok = await esegui("Flow period not removed", () => chiama(percorso, "elimina_periodo_flusso", { id }), "Flow period removed");
    if (ok) await ricarica();
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {avviso && <p className="rounded-md border border-semaforo-giallo bg-semaforo-giallo/10 p-3 text-sm text-semaforo-giallo">{avviso.message}</p>}

      {periodi.length === 0 ? (
        <p className="text-sm text-muted-foreground">No flow period yet: no import provides Kanban data, record periods below.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Period start", "Period end", "Throughput", "Cycle time (d)", "WIP observed", "WIP theoretical", ""].map((t) => (
                <th key={t} className="sticky top-0 bg-zona-schede px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground first:text-left">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periodi.map((p) => (
              <tr key={p.id}>
                <td className="border-b border-border px-3 py-1.5 tabular-num">{p.inizioPeriodo}</td>
                <td className="border-b border-border px-3 py-1.5 tabular-num text-right">{p.finePeriodo}</td>
                <td className="border-b border-border px-3 py-1.5 tabular-num text-right">{p.throughput ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5 tabular-num text-right">{p.cycleTimeGiorni ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5 tabular-num text-right">{p.wipOsservato ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5 tabular-num text-right">{num(wipTeorico(p))}</td>
                <td className="border-b border-border px-3 py-1.5 text-right">
                  <Button size="sm" variant="ghost" aria-label={`Remove period ${p.id}`} onClick={() => elimina(p.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Sezione titolo="Record a flow period">
        <form onSubmit={aggiungi} className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Campo etichetta="Period start">
            <input type="date" required className={CAMPO} value={nuovo.inizio} onChange={(e) => setNuovo({ ...nuovo, inizio: e.target.value })} />
          </Campo>
          <Campo etichetta="Period end">
            <input type="date" required className={CAMPO} value={nuovo.fine} onChange={(e) => setNuovo({ ...nuovo, fine: e.target.value })} />
          </Campo>
          <Campo etichetta="Throughput (items)">
            <input type="number" min="0" step="0.1" className={CAMPO} value={nuovo.throughput} onChange={(e) => setNuovo({ ...nuovo, throughput: e.target.value })} />
          </Campo>
          <Campo etichetta="Cycle time (days)">
            <input type="number" min="0" step="0.1" className={CAMPO} value={nuovo.cycleTime} onChange={(e) => setNuovo({ ...nuovo, cycleTime: e.target.value })} />
          </Campo>
          <Campo etichetta="WIP observed">
            <input type="number" min="0" step="0.1" className={CAMPO} value={nuovo.wip} onChange={(e) => setNuovo({ ...nuovo, wip: e.target.value })} />
          </Campo>
          <div className="col-span-2 flex justify-end md:col-span-5">
            <Button type="submit"><Plus className="size-4" />Add period</Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">No automated source provides Kanban flow data yet (the workbook's Agile sheet doesn't export it): enter observed periods here.</p>
      </Sezione>
    </div>
  );
}
