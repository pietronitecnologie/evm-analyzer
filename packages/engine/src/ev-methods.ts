// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Metodi di misura dell'avanzamento per task (§3.5 del libro, specifica sez. 4).
// Ogni task ha un solo metodo, che non può cambiare a metà progetto.

import { isoToDays } from "./dates";
import { type ISODate, type Money, type Warning } from "./types";

export type EvMethod =
  | "zero_cento"
  | "cinquanta_cinquanta"
  | "venti_ottanta"
  | "unita_fisiche"
  | "milestone_pesate"
  | "loe"
  | "soggettiva";

export interface TaskMeasure {
  id: string;
  bac: Money;
  /** PV del task alla status date: serve per il metodo LOE (EV = PV). */
  pv?: Money;
  method: EvMethod;
}

export interface TaskStatus {
  started: boolean;
  finished: boolean;
  unitsDone?: number;
  unitsTotal?: number;
  /** Pesi delle milestone (frazioni) e stato di chiusura. */
  milestones?: { weight: number; closed: boolean }[];
  /** Percentuale dichiarata 0..1 (metodo soggettiva). */
  subjectivePct?: number;
  /** Segnale indipendente di incrocio presente (ore, deliverable, difetti). */
  independentSignal?: boolean;
}

export interface ProgressResult {
  /** Percentuale 0..1; `null` se non calcolabile. */
  pct: number | null;
  ev: Money | null;
  warnings: Warning[];
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Avanzamento di un task secondo il suo metodo (tabella di §4 della specifica). */
export function measureProgress(task: TaskMeasure, status: TaskStatus): ProgressResult {
  const warnings: Warning[] = [];
  let pct: number | null;
  switch (task.method) {
    case "zero_cento":
      pct = status.finished ? 1 : 0;
      break;
    case "cinquanta_cinquanta":
      pct = status.finished ? 1 : status.started ? 0.5 : 0;
      break;
    case "venti_ottanta":
      pct = status.finished ? 1 : status.started ? 0.2 : 0;
      break;
    case "unita_fisiche": {
      if (!status.unitsTotal || status.unitsTotal <= 0) {
        warnings.push({ code: "UNITS_TOTAL_ZERO", message: `Task ${task.id}: unità totali nulle, % non calcolabile`, ref: "§3.5" });
        pct = null;
      } else {
        pct = clamp01((status.unitsDone ?? 0) / status.unitsTotal);
      }
      break;
    }
    case "milestone_pesate": {
      const milestones = status.milestones ?? [];
      const somma = milestones.reduce((s, m) => s + m.weight, 0);
      if (milestones.length === 0 || somma <= 0) {
        warnings.push({ code: "MILESTONE_EMPTY", message: `Task ${task.id}: nessuna milestone pesata`, ref: "§3.5" });
        pct = null;
        break;
      }
      if (Math.abs(somma - 1) > 0.001) {
        warnings.push({
          code: "MILESTONE_WEIGHTS",
          message: `Task ${task.id}: pesi delle milestone sommati a ${somma.toFixed(4)}, normalizzati al 100%`,
          ref: "§3.5",
        });
      }
      const chiuse = milestones.filter((m) => m.closed).reduce((s, m) => s + m.weight, 0);
      pct = clamp01(chiuse / somma);
      break;
    }
    case "loe": {
      const pv = task.pv ?? 0;
      return {
        pct: task.bac > 0 ? clamp01(pv / task.bac) : null,
        ev: pv,
        warnings: [{ code: "LOE_NO_DELAY_SIGNAL", message: `Task ${task.id} a LOE: non può rilevare ritardi`, ref: "§3.5" }],
      };
    }
    case "soggettiva": {
      if (!status.independentSignal) {
        warnings.push({ code: "SUBJECTIVE_NO_SIGNAL", message: `Task ${task.id}: segnale indipendente mancante`, ref: "§3.5" });
      }
      pct = status.subjectivePct === undefined ? null : clamp01(status.subjectivePct);
      break;
    }
  }
  return { pct, ev: pct === null ? null : pct * task.bac, warnings };
}

/** METHOD_CHANGED: cambio di metodo tra due status date consecutive (grave). */
export function checkMethodChange(taskId: string, previous: EvMethod, current: EvMethod): Warning | null {
  if (previous === current) return null;
  return {
    code: "METHOD_CHANGED",
    message: `Task ${taskId}: metodo cambiato da ${previous} a ${current} tra due status date`,
    ref: "§3.5",
  };
}

/** Quota di BAC dei task LOE sul totale. */
export function loeShare(tasks: { bac: Money; method: EvMethod }[]): number {
  const totale = tasks.reduce((s, t) => s + t.bac, 0);
  if (totale <= 0) return 0;
  return tasks.filter((t) => t.method === "loe").reduce((s, t) => s + t.bac, 0) / totale;
}

/** LOE_SHARE: avviso se la quota LOE supera la soglia (default 15%). */
export function checkLoeShare(share: number, threshold = 0.15): Warning | null {
  if (share <= threshold) return null;
  return {
    code: "LOE_SHARE",
    message: `Quota LOE ${(share * 100).toFixed(1)}% oltre la soglia del ${(threshold * 100).toFixed(0)}%: SPI di filone senza LOE`,
    ref: "§3.5",
  };
}

/** Mediana di una lista numerica (lista non vuota). */
function mediana(valori: number[]): number {
  const o = [...valori].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 0 ? (o[m - 1] + o[m]) / 2 : o[m];
}

/**
 * CADENCE_IRREGULAR: avviso se l'intervallo tra due status date consecutive
 * differisce dalla mediana di più del 50% (sez. 4 della specifica).
 */
export function checkCadence(statusDates: ISODate[]): Warning[] {
  if (statusDates.length < 3) return [];
  const giorni = statusDates.map(isoToDays);
  const intervalli = giorni.slice(1).map((g, i) => g - giorni[i]);
  const med = mediana(intervalli);
  const avvisi: Warning[] = [];
  intervalli.forEach((iv, i) => {
    if (med > 0 && Math.abs(iv - med) / med > 0.5) {
      avvisi.push({
        code: "CADENCE_IRREGULAR",
        message: `Intervallo irregolare tra ${statusDates[i]} e ${statusDates[i + 1]}: ${iv} giorni contro una mediana di ${med}`,
        ref: "§3.5",
      });
    }
  });
  return avvisi;
}
