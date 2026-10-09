// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Kanban (specifica Fase 5, §3.9): scheda Board (colonne, sotto-task, colore) e Flow
// (throughput/cycle time/WIP, nessuna fonte di import — nessun foglio li esporta,
// vedi DECISIONS.md: si inseriscono a mano, con l'avviso FLOW_WIP_EXCESS, ma non il
// Cumulative Flow Diagram, deferito).

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  chiama,
  type ColonnaKanban,
  type PeriodoFlusso,
  type RiepilogoEffortTask,
  type SottoTaskKanban,
  type TaskEvmRiga,
} from "@/lib/api";
import { avvisoWip, wipTeorico } from "@/lib/agile";
import { classiColore, COLORI_KANBAN } from "@/lib/kanban-colori";
import { num } from "@/lib/format";
import { CAMPO, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useToastStore } from "@/stores/toast-store";
import { Campo, Sezione, Vuoto } from "./comuni";

export function KanbanScreen() {
  const percorso = usePercorso();
  const [flusso, ricaricaFlusso] = useDati<PeriodoFlusso[]>("flusso_elenco", percorso);
  const [task] = useDati<TaskEvmRiga[]>("task_evm_elenco", percorso);

  if (!percorso) return <Vuoto messaggio="Open or create a project for Kanban." />;
  if (!flusso || !task) return <Vuoto messaggio="Loading…" />;

  return (
    <Tabs.Root defaultValue="board" className="flex h-full flex-col">
      <Tabs.List className="flex gap-1 border-b border-border-strong bg-zona-navigazione px-2">
        {[
          { v: "board", t: "Board" },
          { v: "flow", t: "Flow" },
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
      <Tabs.Content value="board" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaBoard percorso={percorso} task={task} />
      </Tabs.Content>
      <Tabs.Content value="flow" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaFlow percorso={percorso} periodi={flusso} ricarica={ricaricaFlusso} />
      </Tabs.Content>
    </Tabs.Root>
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

// --------------------------------------------------------------------- Board

function SelettoreColore({
  valore,
  onChange,
  etichetta,
}: {
  valore: string | null;
  onChange: (colore: string | null) => void;
  etichetta: string;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1" role="group" aria-label={etichetta}>
      <button
        type="button"
        aria-label={`${etichetta}: no color`}
        aria-pressed={valore === null}
        onClick={() => onChange(null)}
        className={`size-3.5 rounded-full border border-dashed border-muted-foreground ${valore === null ? "ring-2 ring-primary" : ""}`}
      />
      {COLORI_KANBAN.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-label={`${etichetta}: ${c.nome}`}
          aria-pressed={valore === c.id}
          onClick={() => onChange(c.id)}
          className={`size-3.5 rounded-full ${c.swatch} ${valore === c.id ? "ring-2 ring-primary" : ""}`}
        />
      ))}
    </span>
  );
}

function SchedaBoard({ percorso, task }: { percorso: string; task: TaskEvmRiga[] }) {
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

  async function coloreColonna(id: number, colore: string | null) {
    const ok = await esegui("Column color not saved", () => chiama(percorso, "kanban_imposta_colore_colonna", { id, colore }));
    if (ok) await ricaricaColonne();
  }

  async function coloreSottotask(id: number, colore: string | null) {
    const ok = await esegui("Sub-task color not saved", () => chiama(percorso, "kanban_imposta_colore_sottotask", { id, colore }));
    if (ok) await ricaricaSottotask();
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
          No task assigned to the Kanban board yet: assign one from the Agile section's Sprint tab ("Assign a task to a sprint").
        </p>
      )}

      {colonneOrdinate.length === 0 ? (
        <p className="text-sm text-muted-foreground">No column yet: create one below.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto">
          {colonneOrdinate.map((c, i) => (
            <div key={c.id} className={`flex w-64 shrink-0 flex-col gap-2 rounded-md border border-border bg-zona-schede p-2 ${classiColore(c.colore)}`}>
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
              <SelettoreColore valore={c.colore} onChange={(colore) => void coloreColonna(c.id, colore)} etichetta={`Color of column ${c.nome}`} />
              <div className="flex flex-col gap-2">
                {sottotask.filter((s) => s.colonnaId === c.id).map((s) => (
                  <div key={s.id} className={`rounded border border-border bg-card p-2 text-xs ${classiColore(s.colore)}`}>
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
                    <div className="mt-1">
                      <SelettoreColore valore={s.colore} onChange={(colore) => void coloreSottotask(s.id, colore)} etichetta={`Color of sub-task ${s.nome}`} />
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
