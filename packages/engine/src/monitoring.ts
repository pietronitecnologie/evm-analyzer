// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Monitoraggio EVM su budget assegnato ai WBS (§3.5–§3.8). Il budget di ogni nodo WBS
// con task si distribuisce sui task in proporzione al costo di baseline (in parti uguali
// se il costo è zero). Il PV di un task è distribuito linearmente tra le date pianificate
// (giorni di calendario). EV, AC e indici a ogni data di stato derivano dagli
// avanzamenti registrati. Nessun valore è calcolato fuori da questo modulo.

import { isoToDays } from "./dates";
import { evm, rollup, sumEvm, type EvmInput, type EvmOutput } from "./evm";
import { type ISODate, type Money, type ProjectParams, type Warning } from "./types";

export interface MonTask {
  uid: string;
  /** Codice del nodo WBS a cui appartiene il task (null se non assegnato). */
  wbs: string | null;
  /** Nome del filone (workstream) a cui appartiene il task (null se non assegnato). */
  filone: string | null;
  riepilogo: boolean;
  start: ISODate | null;
  finish: ISODate | null;
  /** Costo di baseline del task: serve per ripartire il budget del nodo WBS. */
  costoBaseline: Money;
}

export interface MonWbs {
  codice: string;
  /** Budget assegnato al nodo, in euro. `null` se non assegnato. */
  budget: Money | null;
}

export interface RigaAvanzamentoMon {
  uid: string;
  /** Percentuale fisica 0..1. */
  pct: number;
  /** AC cumulato del task alla data di stato. */
  ac: Money;
}

export interface SnapshotMon {
  date: ISODate;
  righe: RigaAvanzamentoMon[];
}

export interface PuntoMonitoraggio {
  date: ISODate;
  pv: Money;
  ev: Money;
  ac: Money;
  evm: EvmOutput;
  /** Indici per nodo WBS. */
  perWbs: Record<string, EvmOutput>;
  /** Somme PV/EV/AC/BAC per nodo WBS. */
  perWbsMisure: Record<string, EvmInput>;
  /** Indici per task (uid): ogni task è già la propria riga, nessun raggruppamento. */
  perTask: Record<string, EvmOutput>;
  /** PV/EV/AC/BAC del singolo task. */
  perTaskMisure: Record<string, EvmInput>;
  /** Indici per filone (workstream), specifica Fase 5 §3.7. Solo i task con filone assegnato. */
  perFilone: Record<string, EvmOutput>;
  /** Somme PV/EV/AC/BAC per filone. */
  perFiloneMisure: Record<string, EvmInput>;
}

export interface MonitoraggioResult {
  bac: Money;
  /** Budget effettivo per task (uid → €). */
  budgetTask: Record<string, Money>;
  punti: PuntoMonitoraggio[];
  warnings: Warning[];
}

/**
 * Ripartisce il budget dei nodi WBS sui task. Un nodo senza task che ha un budget
 * produce un avviso (il budget non è allocabile). Un nodo con task senza budget
 * produce un avviso e lascia i task a zero.
 */
export function allocaBudgetTask(wbs: MonWbs[], tasks: MonTask[]): { budgetTask: Record<string, Money>; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const budgetTask: Record<string, Money> = {};
  const perNodo = new Map<string, MonTask[]>();
  for (const t of tasks) {
    if (t.riepilogo || t.wbs === null) continue;
    budgetTask[t.uid] = 0;
    const lista = perNodo.get(t.wbs) ?? [];
    lista.push(t);
    perNodo.set(t.wbs, lista);
  }
  const nodi = new Map(wbs.map((n) => [n.codice, n]));
  for (const [codice, lista] of perNodo) {
    const nodo = nodi.get(codice);
    if (!nodo || nodo.budget === null) {
      warnings.push({ code: "WBS_NO_BUDGET", message: `Nodo WBS ${codice}: nessun budget assegnato`, ref: "§3.4" });
      continue;
    }
    const costoTotale = lista.reduce((s, t) => s + t.costoBaseline, 0);
    for (const t of lista) {
      budgetTask[t.uid] = costoTotale > 0 ? (nodo.budget * t.costoBaseline) / costoTotale : nodo.budget / lista.length;
    }
  }
  for (const n of wbs) {
    if (n.budget !== null && n.budget > 0 && !perNodo.has(n.codice)) {
      warnings.push({ code: "WBS_BUDGET_UNALLOCABLE", message: `Nodo WBS ${n.codice}: budget senza task su cui distribuirlo`, ref: "§3.4" });
    }
  }
  return { budgetTask, warnings };
}

/**
 * PV lineare di un task alla data: budget × frazione di durata pianificata trascorsa.
 * Frazione in [0, 1]; un task senza date o di durata nulla vale tutto alla data di inizio.
 */
export function pvLineareTask(budget: Money, start: ISODate | null, finish: ISODate | null, data: ISODate): Money {
  if (start === null) return 0;
  const t = isoToDays(data);
  const i = isoToDays(start);
  const f = finish === null ? i : isoToDays(finish);
  if (f <= i) return t >= i ? budget : 0;
  const frazione = Math.min(Math.max((t - i) / (f - i), 0), 1);
  return budget * frazione;
}

/**
 * Serie EVM sui punti di stato. Per ogni snapshot: PV alla sua data, EV = Σ budget × %
 * fisica, AC = Σ AC cumulato. Il BAC è la somma dei budget dei task.
 */
export function monitoraggioEvm(
  wbs: MonWbs[],
  tasks: MonTask[],
  snapshots: SnapshotMon[],
  params: Pick<ProjectParams, "greenThreshold" | "yellowThreshold">,
): MonitoraggioResult {
  const { budgetTask, warnings } = allocaBudgetTask(wbs, tasks);
  const bac = Object.values(budgetTask).reduce((s, v) => s + v, 0);
  const tasksPerUid = new Map(tasks.map((t) => [t.uid, t]));
  const punti: PuntoMonitoraggio[] = [];
  const ordinati = [...snapshots].sort((a, b) => isoToDays(a.date) - isoToDays(b.date));
  for (const snap of ordinati) {
    const perUid = new Map(snap.righe.map((r) => [r.uid, r]));
    const righeEvm: (EvmInput & { wbs: string; uid: string; filone: string | null })[] = [];
    for (const [uid, budget] of Object.entries(budgetTask)) {
      const t = tasksPerUid.get(uid);
      if (!t || t.wbs === null) continue;
      const r = perUid.get(uid);
      righeEvm.push({
        wbs: t.wbs,
        uid,
        filone: t.filone,
        bac: budget,
        pv: pvLineareTask(budget, t.start, t.finish, snap.date),
        ev: budget * (r?.pct ?? 0),
        ac: r?.ac ?? 0,
      });
    }
    const totale = sumEvm(righeEvm);
    const gruppi = rollup(righeEvm, (x) => x.wbs, params);
    const perWbs: Record<string, EvmOutput> = {};
    for (const [codice, out] of gruppi) perWbs[codice] = out;
    const perWbsMisure: Record<string, EvmInput> = {};
    for (const codice of gruppi.keys()) {
      perWbsMisure[codice] = sumEvm(righeEvm.filter((x) => x.wbs === codice));
    }
    // Un task è già la propria riga: nessun raggruppamento, solo evm() riga per riga.
    const perTask: Record<string, EvmOutput> = {};
    const perTaskMisure: Record<string, EvmInput> = {};
    for (const riga of righeEvm) {
      perTask[riga.uid] = evm(riga, params);
      perTaskMisure[riga.uid] = riga;
    }
    // Solo i task con filone assegnato: nessun bucket "non assegnato" (come perWbs).
    const righeConFilone = righeEvm.filter((x): x is EvmInput & { wbs: string; uid: string; filone: string } => x.filone !== null);
    const gruppiFilone = rollup(righeConFilone, (x) => x.filone, params);
    const perFilone: Record<string, EvmOutput> = {};
    for (const [nome, out] of gruppiFilone) perFilone[nome] = out;
    const perFiloneMisure: Record<string, EvmInput> = {};
    for (const nome of gruppiFilone.keys()) {
      perFiloneMisure[nome] = sumEvm(righeConFilone.filter((x) => x.filone === nome));
    }
    punti.push({
      date: snap.date,
      pv: totale.pv,
      ev: totale.ev,
      ac: totale.ac,
      evm: evm({ ...totale, bac }, params),
      perWbs,
      perWbsMisure,
      perTask,
      perTaskMisure,
      perFilone,
      perFiloneMisure,
    });
  }
  return { bac, budgetTask, punti, warnings };
}
