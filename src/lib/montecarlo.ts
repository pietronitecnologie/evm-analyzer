// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Adatta la simulazione Monte Carlo del motore (packages/engine/src/montecarlo.ts) alle
// due schede che la usano — Forecast e Agile/Flow (specifica Fase 5, §3.6/§3.9): stessa
// infrastruttura, "velocity" (sprint) o "throughput" (periodi di flusso Kanban) è solo
// l'origine della cronologia, non un algoritmo diverso (sempre `simulateVelocity`:
// `simulateThroughput` fissa periodDays a 7 e non porta costo/AC, meno flessibile di
// quanto serva qui). 5.000 iterazioni girano in ~13ms (misurato), 200.000 in ~250ms:
// nessun Web Worker o chunking, sincrono sul thread principale (vedi DECISIONS.md,
// che riprende la decisione 72 lasciata aperta proprio per questo caso).

import { addDays, nearestRank, simulateVelocity, type MonteCarloResult } from "@evm-analyzer/engine";

import type { DatiAgile, PeriodoFlusso, TipoMonteCarlo } from "@/lib/api";
import { formatDateIt } from "@/lib/format";

export interface FonteSimulazione {
  id: TipoMonteCarlo;
  etichetta: string;
  /** Velocity (SP/sprint) o throughput (item/periodo) storici: ≥ 1 valore, non tutti zero. */
  history: number[];
  periodDaysDefault: number;
  backlogDefault: number;
  teamCostPerPeriodDefault: number | null;
  acSoFar: number | null;
}

/** Le due fonti condivise da Forecast e Agile/Flow (specifica: "stessi controlli e salvataggio"). */
export function costruisciFonti(datiAgile: DatiAgile, flusso: PeriodoFlusso[]): FonteSimulazione[] {
  return [
    {
      id: "velocity",
      etichetta: "Sprint velocity",
      history: datiAgile.sprint.map((s) => s.spCompletati ?? 0),
      periodDaysDefault: datiAgile.parametri.sprintDays,
      backlogDefault: datiAgile.parametri.backlogSp ?? 0,
      teamCostPerPeriodDefault: datiAgile.parametri.teamCostPerSprint,
      acSoFar: datiAgile.sprint.reduce((s, sp) => s + (sp.costo ?? 0), 0),
    },
    {
      id: "throughput",
      etichetta: "Kanban throughput",
      history: flusso.map((p) => p.throughput ?? 0),
      periodDaysDefault: 7,
      backlogDefault: 0,
      teamCostPerPeriodDefault: null,
      acSoFar: null,
    },
  ];
}

export interface ParametriSimulazione {
  history: number[];
  backlog: number;
  nIter: number;
  seed: number;
  periodDays: number;
  startFrom: string;
  teamCostPerPeriod?: number;
  acSoFar?: number;
}

export interface RiassuntoMonteCarlo {
  p50: number;
  p80: number;
  p90: number;
  min: number;
  max: number;
  mean: number;
  histogram: { periods: number; count: number }[];
  /** Presenti solo se la run aveva un costo per periodo impostato (altrimenti `costs` sarebbe tutto a zero). */
  costoP50?: number;
  costoP80?: number;
  costoP90?: number;
}

export const ITERAZIONI_DEFAULT = 5000;
export const MAX_ITERAZIONI = 200_000;

export function generaSeme(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function esegui(parametri: ParametriSimulazione): MonteCarloResult {
  return simulateVelocity({
    history: parametri.history,
    backlog: parametri.backlog,
    nIter: parametri.nIter,
    seed: parametri.seed,
    periodDays: parametri.periodDays,
    startFrom: parametri.startFrom,
    teamCostPerPeriod: parametri.teamCostPerPeriod,
    acSoFar: parametri.acSoFar,
  });
}

/**
 * Solo percentili/istogramma: basta a ri-mostrare una run salvata senza ricalcolo.
 * `includiCosti` aggiunge i percentili di costo solo quando la run aveva un costo per
 * periodo impostato (altrimenti `r.costs` è tutto a zero e non significherebbe nulla).
 */
export function riassumi(r: MonteCarloResult, includiCosti: boolean): RiassuntoMonteCarlo {
  const base: RiassuntoMonteCarlo = { p50: r.p50, p80: r.p80, p90: r.p90, min: r.min, max: r.max, mean: r.mean, histogram: r.histogram };
  if (!includiCosti) return base;
  return { ...base, costoP50: nearestRank(r.costs, 0.5), costoP80: nearestRank(r.costs, 0.8), costoP90: nearestRank(r.costs, 0.9) };
}

/** «80% di probabilità di finire entro il …» (specifica §3.6), dal P80 in periodi e dalla data di inizio. */
export function fraseGuida(p80: number, startFrom: string, periodDays: number): string {
  const data = addDays(startFrom, Math.ceil(p80 * periodDays));
  return `80% probability of finishing within ${p80} period(s), by ${formatDateIt(data)}.`;
}
