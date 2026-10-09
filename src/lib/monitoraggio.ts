// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Adatta i dati di monitoraggio del backend al motore (monitoraggioEvm). Tutti i valori
// EVM (PV, EV, AC, indici, EAC, TCPI) escono dal motore.

import {
  evm,
  monitoraggioEvm,
  sumEvm,
  type EvmInput,
  type EvmOutput,
  type MonTask,
  type MonWbs,
  type SnapshotMon as SnapshotEngine,
  type Warning,
} from "@evm-analyzer/engine";

import type { DatiMonitoraggio } from "@/lib/api";

export interface PuntoVista {
  data: string;
  sorgente: string;
  etichetta: string | null;
  pv: number;
  ev: number;
  ac: number;
  evm: EvmOutput;
  perWbs: Record<string, EvmOutput>;
  perWbsMisure: Record<string, EvmInput>;
  perTask: Record<string, EvmOutput>;
  perTaskMisure: Record<string, EvmInput>;
  /** Indici per filone (workstream), specifica Fase 5 §3.7. */
  perFilone: Record<string, EvmOutput>;
  perFiloneMisure: Record<string, EvmInput>;
}

export interface VistaMonitoraggio {
  bac: number;
  punti: PuntoVista[];
  avvisi: Warning[];
  budgetPerWbs: Record<string, number | null>;
}

export const PARAMETRI = { greenThreshold: 0.95, yellowThreshold: 0.85 };

export function vistaMonitoraggio(d: DatiMonitoraggio): VistaMonitoraggio {
  const wbs: MonWbs[] = d.wbs.map((n) => ({ codice: n.codice, budget: n.budget }));
  const tasks: MonTask[] = d.task.map((t) => ({
    uid: t.uid,
    wbs: t.wbs,
    filone: t.filone,
    riepilogo: t.riepilogo,
    start: t.inizio,
    finish: t.fine,
    costoBaseline: t.costoBaseline,
  }));
  const snapshots: SnapshotEngine[] = d.snapshot.map((s) => ({ date: s.data, righe: s.righe.map((r) => ({ uid: r.uid, pct: r.pct, ac: r.ac })) }));
  const risultato = monitoraggioEvm(wbs, tasks, snapshots, PARAMETRI);
  // Il sorgente e l'etichetta arrivano dal backend, nello stesso ordine dei punti (ordinati per data).
  const sorgenti = [...d.snapshot].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const punti: PuntoVista[] = risultato.punti.map((p, i) => ({
    data: p.date,
    sorgente: sorgenti[i]?.sorgente ?? "",
    etichetta: sorgenti[i]?.etichetta ?? null,
    pv: p.pv,
    ev: p.ev,
    ac: p.ac,
    evm: p.evm,
    perWbs: p.perWbs,
    perWbsMisure: p.perWbsMisure,
    perTask: p.perTask,
    perTaskMisure: p.perTaskMisure,
    perFilone: p.perFilone,
    perFiloneMisure: p.perFiloneMisure,
  }));
  return {
    bac: risultato.bac,
    punti,
    avvisi: risultato.warnings,
    budgetPerWbs: Object.fromEntries(d.wbs.map((n) => [n.codice, n.budget])),
  };
}

/** `codice` è `radice` stessa o un suo discendente (`"1.2"` sotto `"1"`). */
export function sottoalbero(codice: string | null, radice: string): boolean {
  return codice !== null && (codice === radice || codice.startsWith(`${radice}.`));
}

/** Limita i dati di monitoraggio al sottoalbero WBS del perimetro scelto (`null` = tutto il progetto). */
export function filtraPerPerimetro(dati: DatiMonitoraggio, codiceRadice: string | null): DatiMonitoraggio {
  if (!codiceRadice) return dati;
  return {
    ...dati,
    wbs: dati.wbs.filter((w) => sottoalbero(w.codice, codiceRadice)),
    task: dati.task.filter((t) => sottoalbero(t.wbs, codiceRadice)),
  };
}

/** Punto della vista da mostrare come "attuale": quello scelto nel contesto, altrimenti l'ultimo. */
export function puntoTestata(
  vista: VistaMonitoraggio,
  ctx: { snapshotId: number | null; statusDate: string },
): PuntoVista | undefined {
  return (ctx.snapshotId !== null && vista.punti.find((p) => p.data === ctx.statusDate)) || vista.punti.at(-1);
}

/**
 * Copertura (sez. 2 della specifica Fase 5): quota del BAC con avanzamento
 * registrato alla data di stato più recente, pesata sul costo di baseline dei
 * task (proxy del budget quando il budget del nodo WBS non si divide 1:1 per
 * task). `0` se non c'è ancora nessuna data di stato o nessun task pesabile.
 * Con `codiceRadice` limita il calcolo al sottoalbero WBS di quel nodo.
 */
export function coperturaTaskPct(d: DatiMonitoraggio, codiceRadice: string | null = null): number {
  if (d.snapshot.length === 0) return 0;
  const ultimo = [...d.snapshot].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)).at(-1)!;
  const coperti = new Set(ultimo.righe.map((r) => r.uid));
  const pesabili = d.task.filter((t) => !t.riepilogo && t.wbs !== null && (!codiceRadice || sottoalbero(t.wbs, codiceRadice)));
  const totale = pesabili.reduce((s, t) => s + t.costoBaseline, 0);
  if (totale <= 0) return 0;
  const coperto = pesabili.filter((t) => coperti.has(t.uid)).reduce((s, t) => s + t.costoBaseline, 0);
  return coperto / totale;
}

/**
 * Indici EVM per ogni nodo WBS dato (sez. 3.2 della specifica): somma le
 * misure dei codici che sono quel nodo o un suo discendente (`perWbsMisure`
 * copre solo i codici con task assegnati direttamente), poi applica `evm()`
 * una sola volta sul totale — così un nodo riepilogo ha gli stessi indici
 * "ricalcolati dai totali" di una riga di dettaglio, non una media.
 */
export function evmPerNodoWbs(
  punto: Pick<PuntoVista, "perWbsMisure">,
  codici: string[],
): Record<string, { input: EvmInput; output: EvmOutput }> {
  const voci = Object.entries(punto.perWbsMisure);
  const risultato: Record<string, { input: EvmInput; output: EvmOutput }> = {};
  for (const codice of codici) {
    const input = sumEvm(voci.filter(([c]) => sottoalbero(c, codice)).map(([, v]) => v));
    risultato[codice] = { input, output: evm(input, PARAMETRI) };
  }
  return risultato;
}
