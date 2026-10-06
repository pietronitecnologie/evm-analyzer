// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Monte Carlo sulla velocity e sul throughput (§3.9.6, §6-bis.5; specifica sez. 8).
// Generatore mulberry32 esatto per riproducibilità tra piattaforme.

import { addDays } from "./dates";
import { EngineInputError, type ISODate, type Money } from "./types";

/** Generatore pseudocasuale mulberry32 (specifica sez. 8.1). Output in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile con metodo nearest-rank: P_q = valori[ceil(q·N) − 1] su campione ordinato. */
export function nearestRank(ordinato: number[], q: number): number {
  if (ordinato.length === 0) throw new EngineInputError("EMPTY_SAMPLE", "Campione vuoto");
  const indice = Math.min(Math.max(Math.ceil(q * ordinato.length) - 1, 0), ordinato.length - 1);
  return ordinato[indice];
}

const MAX_PERIODI = 10_000;

export interface MonteCarloOptions {
  /** Velocity storiche (SP per sprint) oppure item per settimana. ≥ 1 valore, tutti ≥ 0, non tutti zero. */
  history: number[];
  backlog: number;
  nIter?: number;
  seed: number;
  /** Durata di un periodo in giorni (sprint o settimana). */
  periodDays: number;
  /** Costo team per periodo (per la distribuzione del costo). */
  teamCostPerPeriod?: Money;
  /** AC già sostenuto (per la distribuzione del costo). */
  acSoFar?: Money;
  startFrom: ISODate;
}

export interface MonteCarloResult {
  /** Periodi necessari per ogni iterazione, in ordine di iterazione (non ordinato). */
  periods: number[];
  /** Periodi ordinati in crescendo. */
  sortedPeriods: number[];
  p50: number;
  p80: number;
  p90: number;
  min: number;
  max: number;
  mean: number;
  /** Istogramma a bin interi: periodi → numero di iterazioni. */
  histogram: { periods: number; count: number }[];
  /** P(periodi ≤ k). */
  probabilityWithin(k: number): number;
  /** P(data di fine ≤ data). */
  probabilityFinishBy(date: ISODate): number;
  /** Distribuzione del costo finale (AC + periodi × costo per periodo), ordinata. */
  costs: number[];
}

function validaHistory(history: number[]): void {
  if (history.length === 0) throw new EngineInputError("EMPTY_HISTORY", "Lo storico deve contenere almeno un valore");
  if (history.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new EngineInputError("HISTORY_NEGATIVE", "Lo storico deve contenere solo valori finiti ≥ 0");
  }
  if (history.every((v) => v === 0)) {
    throw new EngineInputError("HISTORY_ALL_ZERO", "Lo storico non può essere tutto zero");
  }
}

/**
 * Simulazione del completamento: per ogni iterazione si ricampionano le velocity
 * con reinserimento finché il backlog è esaurito. Ordine di campionamento fisso
 * (specifica 8.2): i test dipendono da esso.
 */
export function simulateVelocity(opts: MonteCarloOptions): MonteCarloResult {
  validaHistory(opts.history);
  const nIter = opts.nIter ?? 5000;
  const rng = mulberry32(opts.seed);
  const periods: number[] = [];
  const costs: number[] = [];
  for (let it = 0; it < nIter; it++) {
    let done = 0;
    let n = 0;
    while (done < opts.backlog) {
      done += opts.history[Math.floor(rng() * opts.history.length)];
      n += 1;
      if (n > MAX_PERIODI) {
        throw new EngineInputError("SIMULATION_LIMIT", `Oltre ${MAX_PERIODI} periodi in un'iterazione: velocity insufficiente`);
      }
    }
    periods.push(n);
    costs.push((opts.acSoFar ?? 0) + n * (opts.teamCostPerPeriod ?? 0));
  }
  return buildResult(periods, costs, opts.startFrom, opts.periodDays);
}

/** Variante throughput (Kanban, specifica 8.3): stessa procedura, unità = settimane. */
export function simulateThroughput(opts: {
  history: number[];
  backlogItems: number;
  nIter?: number;
  seed: number;
  startFrom: ISODate;
}): MonteCarloResult {
  return simulateVelocity({
    history: opts.history,
    backlog: opts.backlogItems,
    nIter: opts.nIter,
    seed: opts.seed,
    periodDays: 7,
    startFrom: opts.startFrom,
  });
}

function buildResult(periods: number[], costs: number[], startFrom: ISODate, periodDays: number): MonteCarloResult {
  const sortedPeriods = [...periods].sort((a, b) => a - b);
  const sortedCosts = [...costs].sort((a, b) => a - b);
  const bins = new Map<number, number>();
  for (const p of periods) bins.set(p, (bins.get(p) ?? 0) + 1);
  const histogram = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([p, count]) => ({ periods: p, count }));
  const n = periods.length;
  return {
    periods,
    sortedPeriods,
    p50: nearestRank(sortedPeriods, 0.5),
    p80: nearestRank(sortedPeriods, 0.8),
    p90: nearestRank(sortedPeriods, 0.9),
    min: sortedPeriods[0],
    max: sortedPeriods[n - 1],
    mean: periods.reduce((s, p) => s + p, 0) / n,
    histogram,
    probabilityWithin(k: number) {
      return periods.filter((p) => p <= k).length / n;
    },
    probabilityFinishBy(date: ISODate) {
      return periods.filter((p) => addDays(startFrom, Math.ceil(p * periodDays)) <= date).length / n;
    },
    costs: sortedCosts,
  };
}
