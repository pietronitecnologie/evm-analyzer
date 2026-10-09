// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Agile (specifica Fase 5, §3.9, todo.md "rendila autosufficiente"): schede Sprint,
// Velocity. Ogni sprint si crea, popola di task e chiude da qui — nessun import
// esterno richiesto. L'avanzamento di sprint non dipende più solo da SP completati
// inseriti a mano (quel campo resta, per chi importa un workbook Agile/Velocity, ma
// è secondario): la barra di avanzamento della card nasce dalla % reale dei task
// assegnati allo sprint (stessa `pctReale` di Task e risorse), già presente nel
// progetto senza bisogno di alcuna fonte esterna.

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import type { EChartsOption } from "echarts";
import { CheckCircle2, Pencil, Plus, Trash2, X } from "lucide-react";

import { EChart } from "@/components/charts/EChart";
import { leggiColoriGrafico } from "@/components/charts/tema";
import { Button } from "@/components/ui/button";
import { chiama, type DatiAgile, type TaskEvmRiga } from "@/lib/api";
import { metricheAgili } from "@/lib/agile";
import { eur, num } from "@/lib/format";
import { CAMPO, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useToastStore } from "@/stores/toast-store";
import { Campo, Sezione, Vuoto } from "./comuni";
import { Indice, Kpi } from "./kpi";

export function AgileScreen() {
  const percorso = usePercorso();
  const [datiAgile, ricaricaAgile] = useDati<DatiAgile>("agile_dati", percorso);
  const [task, ricaricaTask] = useDati<TaskEvmRiga[]>("task_evm_elenco", percorso);

  if (!percorso) return <Vuoto messaggio="Open or create a project for Agile." />;
  if (!datiAgile || !task) return <Vuoto messaggio="Loading…" />;

  return (
    <Tabs.Root defaultValue="sprint" className="flex h-full flex-col">
      <Tabs.List className="flex gap-1 border-b border-border-strong bg-zona-navigazione px-2">
        {[
          { v: "sprint", t: "Sprint" },
          { v: "velocity", t: "Velocity" },
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
            <p className="text-xs text-muted-foreground">Story points are optional: only needed for the velocity/cost-per-SP metrics below. Sprint progress is read from the assigned tasks regardless.</p>
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

function barraColore(pct: number): string {
  if (pct >= 100) return "bg-semaforo-verde";
  if (pct >= 50) return "bg-semaforo-giallo";
  return "bg-semaforo-rosso";
}

function SprintCard({
  sprint,
  taskSprint,
  ev,
  ac,
  cpi,
  onEdit,
  onDelete,
}: {
  sprint: DatiAgile["sprint"][number];
  taskSprint: TaskEvmRiga[];
  ev: number | null;
  ac: number | null;
  cpi: number | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const completati = taskSprint.filter((t) => t.pctReale === 1).length;
  const avanzamento =
    taskSprint.length > 0
      ? (taskSprint.reduce((s, t) => s + (t.pctReale ?? 0), 0) / taskSprint.length) * 100
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-strong bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Sprint {sprint.numero}</h3>
          <p className="text-xs text-muted-foreground">
            {sprint.inizio ?? "no start"} → {sprint.fine ?? "no end"}
          </p>
        </div>
        <span className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" aria-label={`Edit sprint ${sprint.numero}`} onClick={onEdit}><Pencil className="size-4" /></Button>
          <Button size="sm" variant="ghost" aria-label={`Remove sprint ${sprint.numero}`} onClick={onDelete}><Trash2 className="size-4" /></Button>
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress ({completati}/{taskSprint.length} tasks done)</span>
          <span className="tabular-num">{avanzamento === null ? "—" : `${num(avanzamento)}%`}</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zona-contesto">
          {avanzamento !== null && (
            <div className={`h-full rounded-full ${barraColore(avanzamento)}`} style={{ width: `${Math.min(100, avanzamento)}%` }} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>SP planned: <strong className="tabular-num text-foreground">{sprint.spPianificati ?? "—"}</strong></span>
        <span>SP completed: <strong className="tabular-num text-foreground">{sprint.spCompletati ?? "—"}</strong></span>
        <span>EV: <strong className="tabular-num text-foreground">{eur(ev)}</strong></span>
        <span>AC: <strong className="tabular-num text-foreground">{eur(ac)}</strong></span>
        <span className="flex items-center gap-1">CPI: <Indice valore={cpi} luce={cpi === null ? "nd" : cpi >= 1 ? "verde" : cpi >= 0.85 ? "giallo" : "rosso"} /></span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tasks ({taskSprint.length})</p>
        {taskSprint.length === 0 ? (
          <p className="text-sm text-muted-foreground">No task assigned yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {taskSprint.map((t) => (
              <li key={t.uid} className="flex items-center gap-2 rounded border border-border bg-zona-schede px-2 py-1 text-sm">
                {t.pctReale === 1 ? <CheckCircle2 className="size-4 shrink-0 text-semaforo-verde" /> : <span className="size-4 shrink-0" />}
                <span className="truncate text-muted-foreground">{t.uid}</span>
                <span className="truncate">{t.nome}</span>
                {t.critico && <span className="shrink-0 rounded bg-semaforo-rosso/10 px-1 text-xs text-semaforo-rosso">critical</span>}
                <span className="ml-auto shrink-0 tabular-num text-xs text-muted-foreground">{t.pctReale === null ? "—" : `${num(t.pctReale * 100)}%`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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

  return (
    <div className="flex flex-col gap-4 p-4">
      {metriche && metriche.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-semaforo-giallo">
          {metriche.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
        </ul>
      )}

      {metriche && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi etichetta="Velocity (avg)" valore={metriche.velocityAvg === null ? "—" : num(metriche.velocityAvg)} nota="SP/sprint" />
          <Kpi etichetta="Cost/SP (baseline)" valore={eur(metriche.costPerSp)} nota={metriche.costPerSpDerived ? "derived, not fixed" : undefined} />
          <Kpi etichetta="Backlog remaining" valore={dati.parametri.backlogSp === null ? "—" : num(dati.parametri.backlogSp)} nota="SP" />
          <Kpi etichetta="Sprints remaining" valore={metriche.sprintRemainingCeil === null ? "—" : String(metriche.sprintRemainingCeil)} />
          <Kpi etichetta="EAC (time)" valore={metriche.eacTimeDays === null ? "—" : `${num(metriche.eacTimeDays)} d`} />
          <Kpi etichetta="EAC (cost)" valore={metriche.eacCost === null ? "—" : eur(metriche.eacCost)} />
        </div>
      )}

      {dati.sprint.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sprint yet: create one below. Sprint progress is tracked from the tasks you assign to it — no import needed.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {dati.sprint.map((s, i) => (
            <SprintCard
              key={s.id}
              sprint={s}
              taskSprint={taskPerSprint.get(s.numero) ?? []}
              ev={metriche?.perSprint[i]?.ev ?? null}
              ac={metriche?.perSprint[i]?.ac ?? null}
              cpi={metriche?.perSprint[i]?.cpi ?? null}
              onEdit={() => setInModifica(s)}
              onDelete={() => void eliminaSprint(s.id, s.numero)}
            />
          ))}
        </div>
      )}

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
          <Campo etichetta="SP planned (optional)">
            <input type="number" min="0" step="0.5" className={CAMPO} value={nuovoSprint.spPianificati} onChange={(e) => setNuovoSprint({ ...nuovoSprint, spPianificati: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />New sprint</Button>
        </form>
      </Sezione>

      <Sezione titolo="Assign a task to a sprint">
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
        <p className="mt-2 text-xs text-muted-foreground">Optional, only needed for sprints-remaining/EAC forecasts below: enter the story points still to do.</p>
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
