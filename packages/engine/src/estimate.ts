// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Stima a tre punti, aggregazione di progetto, BAC e range (§3.1–§3.4, sez. 2).

import { requireNonNegative, EngineInputError, type ProjectParams, type Warning, type Money } from "./types";

export interface ActivityEstimate {
  id: string;
  /** Stima a tre punti in giorni-persona. */
  o: number;
  m: number;
  p: number;
  hoursPerDay: number;
  /** Costo orario in euro/ora. */
  hourlyCost: number;
  materials: Money;
  externalServices: Money;
}

export interface ActivityEstimateResult {
  id: string;
  pert: number;
  sigma: number;
  directCost: Money;
  warnings: Warning[];
}

export interface EstimateResult {
  activities: ActivityEstimateResult[];
  effortDays: number;
  sigmaProject: number;
  direct: Money;
  indirect: Money;
  contingency: Money;
  /** BAC del libro: diretto + indiretto + contingency (§3.2). */
  bacTotal: Money;
  /** BAC di misura secondo `evBaseMode` (6-bis.1). */
  bacMeasure: Money;
  evBaseMode: ProjectParams["evBaseMode"];
  mgmtReserve: Money;
  budgetApproved: Money;
  effortRange: { low1: number; high1: number; low2: number; high2: number };
  sigmaCost: Money;
  bacRange: { low1: Money; high1: Money; low2: Money; high2: Money };
  warnings: Warning[];
}

/** PERT = (O + 4M + P) / 6 (§3.1). */
export function pertOf(o: number, m: number, p: number): number {
  return (o + 4 * m + p) / 6;
}

/** σ = (P − O) / 6 (§3.1). */
export function sigmaOf(o: number, p: number): number {
  return (p - o) / 6;
}

/** Stima di una singola attività (sez. 2.1). Valori negativi → errore tipizzato; O > M o M > P → avviso. */
export function estimateActivity(a: ActivityEstimate): ActivityEstimateResult {
  for (const [nome, v] of [
    ["O", a.o],
    ["M", a.m],
    ["P", a.p],
    ["hoursPerDay", a.hoursPerDay],
    ["hourlyCost", a.hourlyCost],
    ["materials", a.materials],
    ["externalServices", a.externalServices],
  ] as const) {
    requireNonNegative(v, `${nome} (${a.id})`);
  }
  const warnings: Warning[] = [];
  if (a.o > a.m || a.m > a.p) {
    warnings.push({
      code: "EST_ORDER",
      message: `Attività ${a.id}: attesa O ≤ M ≤ P (ricevuto ${a.o}, ${a.m}, ${a.p})`,
      ref: "Q011",
    });
  }
  const pert = pertOf(a.o, a.m, a.p);
  const directCost = pert * a.hoursPerDay * a.hourlyCost + a.materials + a.externalServices;
  return { id: a.id, pert, sigma: sigmaOf(a.o, a.p), directCost, warnings };
}

/**
 * Stima di progetto (§3.1–§3.4, sez. 2.2–2.3). Il BAC è sempre restituito in
 * entrambe le versioni (con e senza contingency) e la base in uso è dichiarata.
 * Convenzioni: σ costo = √Σ(σᵢ·hᵢ·cᵢ)² · (1 + overhead); contingency e materiali
 * esclusi da σ costo (DECISIONS.md).
 */
export function estimateProject(activities: ActivityEstimate[], params: ProjectParams): EstimateResult {
  if (activities.length === 0) {
    throw new EngineInputError("EMPTY_ACTIVITIES", "La stima richiede almeno un'attività");
  }
  const risultati = activities.map(estimateActivity);
  const effortDays = risultati.reduce((s, r) => s + r.pert, 0);
  const sigmaProject = Math.sqrt(risultati.reduce((s, r) => s + r.sigma * r.sigma, 0));
  const direct = risultati.reduce((s, r) => s + r.directCost, 0);
  const indirect = direct * params.overheadPct;
  const contingency = (direct + indirect) * params.contingencyPct;
  const bacTotal = direct + indirect + contingency;
  const bacMeasure = params.evBaseMode === "bac_con_contingency" ? bacTotal : direct + indirect;
  // Riserva di gestione: esterna al BAC. La formula precisa va verificata sulla fixture (DECISIONS.md).
  const mgmtReserve = bacTotal * params.mgmtReservePct;
  const sigmaCostoBase = Math.sqrt(
    activities.reduce((s, a, i) => {
      const sigmaI = risultati[i].sigma;
      return s + (sigmaI * a.hoursPerDay * a.hourlyCost) ** 2;
    }, 0),
  );
  const sigmaCost = sigmaCostoBase * (1 + params.overheadPct);
  const warnings = risultati.flatMap((r) => r.warnings);
  return {
    activities: risultati,
    effortDays,
    sigmaProject,
    direct,
    indirect,
    contingency,
    bacTotal,
    bacMeasure,
    evBaseMode: params.evBaseMode,
    mgmtReserve,
    budgetApproved: bacTotal + mgmtReserve,
    effortRange: {
      low1: effortDays - sigmaProject,
      high1: effortDays + sigmaProject,
      low2: effortDays - 2 * sigmaProject,
      high2: effortDays + 2 * sigmaProject,
    },
    sigmaCost,
    bacRange: {
      low1: bacTotal - sigmaCost,
      high1: bacTotal + sigmaCost,
      low2: bacTotal - 2 * sigmaCost,
      high2: bacTotal + 2 * sigmaCost,
    },
    warnings,
  };
}
