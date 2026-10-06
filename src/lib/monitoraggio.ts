// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Adatta i dati di monitoraggio del backend al motore (monitoraggioEvm). Tutti i valori
// EVM (PV, EV, AC, indici, EAC, TCPI) escono dal motore.

import {
  monitoraggioEvm,
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
}

export interface VistaMonitoraggio {
  bac: number;
  punti: PuntoVista[];
  avvisi: Warning[];
  budgetPerWbs: Record<string, number | null>;
}

const PARAMETRI = { greenThreshold: 0.95, yellowThreshold: 0.85 };

export function vistaMonitoraggio(d: DatiMonitoraggio): VistaMonitoraggio {
  const wbs: MonWbs[] = d.wbs.map((n) => ({ codice: n.codice, budget: n.budget }));
  const tasks: MonTask[] = d.task.map((t) => ({
    uid: t.uid,
    wbs: t.wbs,
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
  }));
  return {
    bac: risultato.bac,
    punti,
    avvisi: risultato.warnings,
    budgetPerWbs: Object.fromEntries(d.wbs.map((n) => [n.codice, n.budget])),
  };
}
