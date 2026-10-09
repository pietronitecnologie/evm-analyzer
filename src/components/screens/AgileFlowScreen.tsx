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
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import type { EChartsOption } from "echarts";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { EChart } from "@/components/charts/EChart";
import { leggiColoriGrafico } from "@/components/charts/tema";
import { Button } from "@/components/ui/button";
import {
  chiama,
  type ColonnaKanban,
  type DatiAgile,
  type PeriodoFlusso,
  type RiepilogoEffortTask,
  type SottoTaskKanban,
  type TaskEvmRiga,
} from "@/lib/api";
import { avvisoWip, metricheAgili, wipTeorico } from "@/lib/agile";
import { eur, num } from "@/lib/format";
import { costruisciFonti } from "@/lib/montecarlo";
import { CAMPO, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useToastStore } from "@/stores/toast-store";
import { Campo, Sezione, Vuoto } from "./comuni";
import { Indice, Kpi } from "./kpi";
import { MonteCarloPanel } from "./MonteCarloPanel";

export function AgileFlowScreen() {
  const percorso = usePercorso();
  const [datiAgile, ricaricaAgile] = useDati<DatiAgile>("agile_dati", percorso);
  const [flusso, ricaricaFlusso] = useDati<PeriodoFlusso[]>("flusso_elenco", percorso);
  const [task, ricaricaTask] = useDati<TaskEvmRiga[]>("task_evm_elenco", percorso);

  if (!percorso) return <Vuoto messaggio="Open or create a project for Agile/Flow." />;
  if (!datiAgile || !flusso || !task) return <Vuoto messaggio="Loading…" />;

  const fonti = costruisciFonti(datiAgile, flusso);

  return (
    <Tabs.Root defaultValue="sprint" className="flex h-full flex-col">
      <Tabs.List className="flex gap-1 border-b border-border-strong bg-zona-navigazione px-2">
        {[
          { v: "sprint", t: "Sprint" },
          { v: "velocity", t: "Velocity" },
          { v: "flow", t: "Flow" },
          { v: "kanban", t: "Kanban" },
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
        <SchedaSprint percorso={percorso} dati={datiAgile} task={task} ricarica={ricaricaAgile} ricaricaTask={ricaricaTask} />
      </Tabs.Content>
      <Tabs.Content value="velocity" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaVelocity dati={datiAgile} />
      </Tabs.Content>
      <Tabs.Content value="flow" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaFlow percorso={percorso} periodi={flusso} ricarica={ricaricaFlusso} />
      </Tabs.Content>
      <Tabs.Content value="kanban" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaKanban percorso={percorso} task={task} />
      </Tabs.Content>
      <Tabs.Content value="monte-carlo" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <MonteCarloPanel percorso={percorso} fonti={fonti} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

// -------------------------------------------------------------------- Sprint

function EditSprintDialog({
  percorso,
  sprint,
  open,
  onOpenChange,
  ricarica,
}: {
  percorso: string;
  sprint: DatiAgile["sprint"][number];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ricarica: () => Promise<void>;
}) {
  const [modulo, setModulo] = React.useState({
    inizio: sprint.inizio ?? "",
    fine: sprint.fine ?? "",
    spPianificati: sprint.spPianificati === null ? "" : String(sprint.spPianificati),
    spCompletati: sprint.spCompletati === null ? "" : String(sprint.spCompletati),
    costo: sprint.costo === null ? "" : String(sprint.costo),
  });

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const numero = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      await chiama(percorso, "agile_modifica_sprint", {
        id: sprint.id,
        inizio: modulo.inizio || null,
        fine: modulo.fine || null,
        spPianificati: numero(modulo.spPianificati),
        spCompletati: numero(modulo.spCompletati),
        costo: numero(modulo.costo),
      });
      useToastStore.getState().push({ title: `Sprint ${sprint.numero} updated` });
      onOpenChange(false);
      await ricarica();
    } catch (err) {
      avviso("Sprint not updated", err);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(360px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Sprint {sprint.numero}</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close"><X className="size-4" /></Dialog.Close>
          </div>
          <form onSubmit={salva} className="flex flex-col gap-3 p-4">
            <Campo etichetta="Start date">
              <input type="date" className={CAMPO} value={modulo.inizio} onChange={(e) => setModulo({ ...modulo, inizio: e.target.value })} />
            </Campo>
            <Campo etichetta="End date">
              <input type="date" className={CAMPO} value={modulo.fine} onChange={(e) => setModulo({ ...modulo, fine: e.target.value })} />
            </Campo>
            <Campo etichetta="SP planned">
              <input type="number" min="0" step="0.5" className={CAMPO} value={modulo.spPianificati} onChange={(e) => setModulo({ ...modulo, spPianificati: e.target.value })} />
            </Campo>
            <Campo etichetta="SP completed">
              <input type="number" min="0" step="0.5" className={CAMPO} value={modulo.spCompletati} onChange={(e) => setModulo({ ...modulo, spCompletati: e.target.value })} />
            </Campo>
            <Campo etichetta="Team cost (€)">
              <input type="number" min="0" step="0.01" className={CAMPO} value={modulo.costo} onChange={(e) => setModulo({ ...modulo, costo: e.target.value })} />
            </Campo>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SchedaSprint({
  percorso,
  dati,
  task,
  ricarica,
  ricaricaTask,
}: {
  percorso: string;
  dati: DatiAgile;
  task: TaskEvmRiga[];
  ricarica: () => Promise<void>;
  ricaricaTask: () => Promise<void>;
}) {
  const [backlog, setBacklog] = React.useState(dati.parametri.backlogSp === null ? "" : String(dati.parametri.backlogSp));
  const [nuovoSprint, setNuovoSprint] = React.useState({ numero: "", inizio: "", fine: "", spPianificati: "" });
  const [inModifica, setInModifica] = React.useState<DatiAgile["sprint"][number] | null>(null);
  const [assegnazione, setAssegnazione] = React.useState({ task: "", destinazione: "" });
  const metriche = metricheAgili(dati);

  async function salvaBacklog(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Backlog not saved", () => chiama(percorso, "imposta_backlog_sp", { backlogSp: backlog.trim() === "" ? null : Number(backlog) }), "Backlog saved");
    if (ok) await ricarica();
  }

  async function creaSprint(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui(
      "Sprint not created",
      () =>
        chiama(percorso, "agile_crea_sprint", {
          numero: Number(nuovoSprint.numero),
          workstreamId: null,
          inizio: nuovoSprint.inizio || null,
          fine: nuovoSprint.fine || null,
          spPianificati: nuovoSprint.spPianificati.trim() === "" ? null : Number(nuovoSprint.spPianificati),
        }),
      "Sprint created",
    );
    if (ok) {
      setNuovoSprint({ numero: "", inizio: "", fine: "", spPianificati: "" });
      await ricarica();
    }
  }

  async function eliminaSprint(id: number, numero: number) {
    const ok = await esegui("Sprint not removed", () => chiama(percorso, "agile_elimina_sprint", { id }), `Sprint ${numero} removed`);
    if (ok) await ricarica();
  }

  async function assegna(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui(
      "Assignment not saved",
      async () => {
        if (assegnazione.destinazione === "kanban") {
          await chiama(percorso, "agile_assegna_kanban", { uid: assegnazione.task, kanban: true });
        } else if (assegnazione.destinazione === "") {
          await chiama(percorso, "agile_assegna_sprint", { uid: assegnazione.task, sprintId: null });
          await chiama(percorso, "agile_assegna_kanban", { uid: assegnazione.task, kanban: false });
        } else {
          await chiama(percorso, "agile_assegna_sprint", { uid: assegnazione.task, sprintId: Number(assegnazione.destinazione) });
        }
      },
      "Assignment saved",
    );
    if (ok) {
      setAssegnazione({ task: "", destinazione: "" });
      await ricaricaTask();
    }
  }

  const taskPerSprint = React.useMemo(() => {
    const mappa = new Map<number, TaskEvmRiga[]>();
    for (const t of task) {
      if (t.sprintNumero === null) continue;
      const lista = mappa.get(t.sprintNumero) ?? [];
      lista.push(t);
      mappa.set(t.sprintNumero, lista);
    }
    return mappa;
  }, [task]);

  const corpo = !metriche ? null : (
    <>
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
            {["Sprint", "SP planned", "SP completed", "Avg velocity", "Cost/SP", "EV (agile)", "AC", "CPI (agile)", "Tasks", ""].map((t) => (
              <th key={t} className="sticky top-0 bg-zona-schede px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground first:text-left">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metriche.perSprint.map((s, i) => {
            const riga = dati.sprint[i];
            return (
              <tr key={riga.id}>
                <td className="border-b border-border px-3 py-1.5">{s.index}</td>
                <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{riga?.spPianificati ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{riga?.spCompletati ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{metriche.velocityAvg === null ? "—" : num(metriche.velocityAvg)}</td>
                <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{eur(metriche.costPerSp)}</td>
                <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{eur(s.ev)}</td>
                <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{eur(s.ac)}</td>
                <td className="border-b border-border px-3 py-1.5 text-right"><Indice valore={s.cpi} luce={s.cpi === null ? "nd" : s.cpi >= 1 ? "verde" : s.cpi >= 0.85 ? "giallo" : "rosso"} /></td>
                <td className="border-b border-border px-3 py-1.5 text-right tabular-num" title={(taskPerSprint.get(riga?.numero ?? -1) ?? []).map((t) => `${t.uid} ${t.nome}`).join(", ")}>
                  {(taskPerSprint.get(riga?.numero ?? -1) ?? []).length}
                </td>
                <td className="border-b border-border px-3 py-1.5">
                  <span className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Edit sprint ${riga?.numero}`} onClick={() => setInModifica(riga)}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove sprint ${riga?.numero}`} onClick={() => riga && void eliminaSprint(riga.id, riga.numero)}><Trash2 className="size-4" /></Button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {corpo ?? <p className="text-sm text-muted-foreground">No sprint yet: create one below, or import a workbook with the Agile sheet filled in.</p>}

      <Sezione titolo="New sprint">
        <form onSubmit={creaSprint} className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Campo etichetta="Sprint number">
            <input type="number" min="1" step="1" required className={CAMPO} value={nuovoSprint.numero} onChange={(e) => setNuovoSprint({ ...nuovoSprint, numero: e.target.value })} />
          </Campo>
          <Campo etichetta="Start date">
            <input type="date" className={CAMPO} value={nuovoSprint.inizio} onChange={(e) => setNuovoSprint({ ...nuovoSprint, inizio: e.target.value })} />
          </Campo>
          <Campo etichetta="End date">
            <input type="date" className={CAMPO} value={nuovoSprint.fine} onChange={(e) => setNuovoSprint({ ...nuovoSprint, fine: e.target.value })} />
          </Campo>
          <Campo etichetta="SP planned">
            <input type="number" min="0" step="0.5" className={CAMPO} value={nuovoSprint.spPianificati} onChange={(e) => setNuovoSprint({ ...nuovoSprint, spPianificati: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />New sprint</Button>
        </form>
      </Sezione>

      <Sezione titolo="Assign a task to a sprint or the Kanban board">
        <form onSubmit={assegna} className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
          <Campo etichetta="Task">
            <select className={CAMPO} required value={assegnazione.task} onChange={(e) => setAssegnazione({ ...assegnazione, task: e.target.value })}>
              <option value="">— choose —</option>
              {task.filter((t) => !t.riepilogo).map((t) => (
                <option key={t.uid} value={t.uid}>
                  {t.uid} · {t.nome} {t.sprintNumero !== null ? `(currently: Sprint ${t.sprintNumero})` : t.kanban ? "(currently: Kanban)" : ""}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etichetta="Assign to">
            <select className={CAMPO} value={assegnazione.destinazione} onChange={(e) => setAssegnazione({ ...assegnazione, destinazione: e.target.value })}>
              <option value="">— none —</option>
              <option value="kanban">Kanban board</option>
              {dati.sprint.map((s) => <option key={s.id} value={s.id}>Sprint {s.numero}</option>)}
            </select>
          </Campo>
          <Button type="submit">Assign</Button>
        </form>
      </Sezione>

      <Sezione titolo="Remaining backlog (SP)">
        <form onSubmit={salvaBacklog} className="flex items-end gap-3">
          <Campo etichetta="Backlog remaining (SP)">
            <input type="number" min="0" step="1" className={CAMPO} value={backlog} onChange={(e) => setBacklog(e.target.value)} />
          </Campo>
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">No import provides this figure: enter the story points still to do to get sprints remaining, EAC (time) and EAC (cost).</p>
      </Sezione>

      {inModifica && (
        <EditSprintDialog key={inModifica.id} percorso={percorso} sprint={inModifica} open onOpenChange={(v) => !v && setInModifica(null)} ricarica={ricarica} />
      )}
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

// ------------------------------------------------------------------- Kanban

function SchedaKanban({ percorso, task }: { percorso: string; task: TaskEvmRiga[] }) {
  const [colonne, ricaricaColonne] = useDati<ColonnaKanban[]>("kanban_colonne", percorso);
  const [sottotask, ricaricaSottotask] = useDati<SottoTaskKanban[]>("kanban_sottotask_elenco", percorso);
  const [riepilogo] = useDati<RiepilogoEffortTask[]>("kanban_riepilogo_effort", percorso);
  const [nuovaColonna, setNuovaColonna] = React.useState({ nome: "", isDone: false });
  const [nuovaSottotask, setNuovaSottotask] = React.useState({ task: "", colonna: "", nome: "", punti: "" });
  const [inModifica, setInModifica] = React.useState<ColonnaKanban | null>(null);

  const taskKanban = React.useMemo(() => task.filter((t) => t.kanban), [task]);

  async function ricaricaTutto() {
    await Promise.all([ricaricaColonne(), ricaricaSottotask()]);
  }

  async function creaColonna(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Column not created", () => chiama(percorso, "kanban_crea_colonna", { nome: nuovaColonna.nome, isDone: nuovaColonna.isDone }), "Column created");
    if (ok) {
      setNuovaColonna({ nome: "", isDone: false });
      await ricaricaColonne();
    }
  }

  async function spostaColonna(id: number, direzione: -1 | 1) {
    if (!colonne) return;
    const ordine = [...colonne].sort((a, b) => a.posizione - b.posizione).map((c) => c.id);
    const indice = ordine.indexOf(id);
    const nuovoIndice = indice + direzione;
    if (nuovoIndice < 0 || nuovoIndice >= ordine.length) return;
    [ordine[indice], ordine[nuovoIndice]] = [ordine[nuovoIndice], ordine[indice]];
    const ok = await esegui("Columns not reordered", () => chiama(percorso, "kanban_riordina_colonne", { ordine }));
    if (ok) await ricaricaColonne();
  }

  async function eliminaColonna(id: number) {
    const ok = await esegui("Column not removed", () => chiama(percorso, "kanban_elimina_colonna", { id }), "Column removed");
    if (ok) await ricaricaColonne();
  }

  async function creaSottotask(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui(
      "Sub-task not created",
      () =>
        chiama(percorso, "kanban_crea_sottotask", {
          taskUid: nuovaSottotask.task,
          colonnaId: Number(nuovaSottotask.colonna),
          nome: nuovaSottotask.nome,
          puntiEffort: nuovaSottotask.punti.trim() === "" ? 0 : Number(nuovaSottotask.punti),
        }),
      "Sub-task created",
    );
    if (ok) {
      setNuovaSottotask({ task: "", colonna: "", nome: "", punti: "" });
      await ricaricaSottotask();
    }
  }

  async function spostaSottotask(id: number, colonnaId: number) {
    const ok = await esegui("Sub-task not moved", () => chiama(percorso, "kanban_sposta_sottotask", { id, colonnaId }));
    if (ok) await ricaricaSottotask();
  }

  async function eliminaSottotask(id: number) {
    const ok = await esegui("Sub-task not removed", () => chiama(percorso, "kanban_elimina_sottotask", { id }), "Sub-task removed");
    if (ok) await ricaricaSottotask();
  }

  if (!colonne || !sottotask) return <Vuoto messaggio="Loading…" />;

  const colonneOrdinate = [...colonne].sort((a, b) => a.posizione - b.posizione);

  return (
    <div className="flex flex-col gap-4 p-4">
      {taskKanban.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No task assigned to the Kanban board yet: assign one from the Sprint tab ("Assign a task to a sprint or the Kanban board").
        </p>
      )}

      {colonneOrdinate.length === 0 ? (
        <p className="text-sm text-muted-foreground">No column yet: create one below.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto">
          {colonneOrdinate.map((c, i) => (
            <div key={c.id} className="flex w-64 shrink-0 flex-col gap-2 rounded-md border border-border bg-zona-schede p-2">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-sm font-semibold">
                  {c.nome} {c.isDone && <span className="text-xs font-normal text-muted-foreground">(done)</span>}
                </span>
                <span className="flex shrink-0 gap-0.5">
                  <Button size="sm" variant="ghost" aria-label={`Move ${c.nome} left`} disabled={i === 0} onClick={() => void spostaColonna(c.id, -1)}>←</Button>
                  <Button size="sm" variant="ghost" aria-label={`Move ${c.nome} right`} disabled={i === colonneOrdinate.length - 1} onClick={() => void spostaColonna(c.id, 1)}>→</Button>
                  <Button size="sm" variant="ghost" aria-label={`Edit column ${c.nome}`} onClick={() => setInModifica(c)}><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove column ${c.nome}`} onClick={() => void eliminaColonna(c.id)}><Trash2 className="size-3.5" /></Button>
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {sottotask.filter((s) => s.colonnaId === c.id).map((s) => (
                  <div key={s.id} className="rounded border border-border bg-card p-2 text-xs">
                    <p className="font-medium">{s.nome}</p>
                    <p className="text-muted-foreground">{s.taskUid} · {s.taskNome}</p>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="tabular-num">{num(s.puntiEffort)} pts</span>
                      <span className="flex items-center gap-1">
                        <select
                          aria-label={`Move "${s.nome}" to column`}
                          className="rounded border border-input bg-background px-1 py-0.5 text-xs"
                          value={c.id}
                          onChange={(e) => void spostaSottotask(s.id, Number(e.target.value))}
                        >
                          {colonneOrdinate.map((dest) => <option key={dest.id} value={dest.id}>{dest.nome}</option>)}
                        </select>
                        <button type="button" aria-label={`Remove sub-task ${s.nome}`} onClick={() => void eliminaSottotask(s.id)} className="text-muted-foreground hover:text-foreground">
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
                {sottotask.filter((s) => s.colonnaId === c.id).length === 0 && (
                  <p className="px-1 text-xs text-muted-foreground">No sub-task.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sezione titolo="New column">
        <form onSubmit={creaColonna} className="flex flex-wrap items-end gap-3">
          <Campo etichetta="Name">
            <input className={CAMPO} required value={nuovaColonna.nome} onChange={(e) => setNuovaColonna({ ...nuovaColonna, nome: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 pb-2 text-xs font-medium">
            <input type="checkbox" checked={nuovaColonna.isDone} onChange={(e) => setNuovaColonna({ ...nuovaColonna, isDone: e.target.checked })} />
            Done column (its effort counts as completed)
          </label>
          <Button type="submit"><Plus className="size-4" />New column</Button>
        </form>
      </Sezione>

      <Sezione titolo="New sub-task">
        {taskKanban.length === 0 || colonneOrdinate.length === 0 ? (
          <p className="text-sm text-muted-foreground">Needs at least one Kanban-assigned task and one column.</p>
        ) : (
          <form onSubmit={creaSottotask} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
            <Campo etichetta="Task">
              <select className={CAMPO} required value={nuovaSottotask.task} onChange={(e) => setNuovaSottotask({ ...nuovaSottotask, task: e.target.value })}>
                <option value="">— choose —</option>
                {taskKanban.map((t) => <option key={t.uid} value={t.uid}>{t.uid} · {t.nome}</option>)}
              </select>
            </Campo>
            <Campo etichetta="Column">
              <select className={CAMPO} required value={nuovaSottotask.colonna} onChange={(e) => setNuovaSottotask({ ...nuovaSottotask, colonna: e.target.value })}>
                <option value="">— choose —</option>
                {colonneOrdinate.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo etichetta="Name">
              <input className={CAMPO} required value={nuovaSottotask.nome} onChange={(e) => setNuovaSottotask({ ...nuovaSottotask, nome: e.target.value })} />
            </Campo>
            <Campo etichetta="Effort points">
              <input type="number" min="0" step="0.5" className={CAMPO} value={nuovaSottotask.punti} onChange={(e) => setNuovaSottotask({ ...nuovaSottotask, punti: e.target.value })} />
            </Campo>
            <Button type="submit"><Plus className="size-4" />Add sub-task</Button>
          </form>
        )}
      </Sezione>

      {riepilogo && riepilogo.length > 0 && (
        <Sezione titolo="Effort spent">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Task", "Total points", "Completed points", "%"].map((t) => (
                  <th key={t} className="sticky top-0 bg-zona-schede px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground first:text-left">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riepilogo.map((r) => (
                <tr key={r.taskUid}>
                  <td className="border-b border-border px-3 py-1.5">{r.taskUid} · {r.taskNome}</td>
                  <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{num(r.puntiTotali)}</td>
                  <td className="border-b border-border px-3 py-1.5 text-right tabular-num">{num(r.puntiCompletati)}</td>
                  <td className="border-b border-border px-3 py-1.5 text-right tabular-num">
                    {r.puntiTotali > 0 ? num((r.puntiCompletati / r.puntiTotali) * 100) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sezione>
      )}

      {inModifica && (
        <EditColumnDialog
          key={inModifica.id}
          percorso={percorso}
          colonna={inModifica}
          open
          onOpenChange={(v) => !v && setInModifica(null)}
          ricarica={ricaricaTutto}
        />
      )}
    </div>
  );
}

function EditColumnDialog({
  percorso,
  colonna,
  open,
  onOpenChange,
  ricarica,
}: {
  percorso: string;
  colonna: ColonnaKanban;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ricarica: () => Promise<void>;
}) {
  const [nome, setNome] = React.useState(colonna.nome);
  const [isDone, setIsDone] = React.useState(colonna.isDone);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    try {
      await chiama(percorso, "kanban_rinomina_colonna", { id: colonna.id, nome, isDone });
      useToastStore.getState().push({ title: "Column updated" });
      onOpenChange(false);
      await ricarica();
    } catch (err) {
      avviso("Column not updated", err);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(320px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Edit column</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close"><X className="size-4" /></Dialog.Close>
          </div>
          <form onSubmit={salva} className="flex flex-col gap-3 p-4">
            <Campo etichetta="Name">
              <input className={CAMPO} required value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={isDone} onChange={(e) => setIsDone(e.target.checked)} />
              Done column (its effort counts as completed)
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
