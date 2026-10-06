// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Agile (§3.9.3–§3.9.6) con la correzione di §6-bis.2: costo per story point
// fissato in baseline, non circolare (specifica sez. 7).

import { type ISODate, type Money, type ProjectParams, type Warning, requireNonNegative } from "./types";
import { addDays } from "./dates";

export interface SprintInput {
  index: number;
  spCompleted: number;
  spPlanned: number;
  /** Costo team sostenuto nello sprint. */
  cost: Money;
}

export interface SprintMetrics {
  index: number;
  spCum: number;
  spPlannedCum: number;
  acCum: number;
  ev: Money;
  pv: Money;
  ac: Money;
  cpi: number | null;
  spi: number | null;
  spiVelocity: number | null;
}

export interface AgileResult {
  costPerSp: Money;
  /** true se il costo per SP è derivato dal primo sprint (import di un template vecchio). */
  costPerSpDerived: boolean;
  perSprint: SprintMetrics[];
  velocityAvg: number | null;
  sprintRemaining: number | null;
  sprintRemainingCeil: number | null;
  eacTimeDays: number | null;
  eacCost: Money | null;
  warnings: Warning[];
}

/**
 * Costo per story point di baseline (§6-bis.2): teamCostPerSprint ÷ plannedSpPerSprint.
 * Se manca nei parametri (template vecchio) si deriva dal primo sprint e si avvisa
 * (AGILE_COST_PER_SP_DERIVED). Divisione per zero → errore tipizzato.
 */
export function baselineCostPerSp(
  params: Pick<ProjectParams, "teamCostPerSprint" | "plannedSpPerSprint" | "baselineCostPerSp">,
  primoSprint?: SprintInput,
): { value: Money; derived: boolean; warnings: Warning[] } {
  if (params.baselineCostPerSp !== undefined) {
    return { value: params.baselineCostPerSp, derived: false, warnings: [] };
  }
  if (params.plannedSpPerSprint <= 0) {
    if (primoSprint && primoSprint.spPlanned > 0) {
      return {
        value: primoSprint.cost / primoSprint.spPlanned,
        derived: true,
        warnings: [{ code: "AGILE_COST_PER_SP_DERIVED", message: "Costo per SP derivato dal primo sprint: fissalo in baseline", ref: "§6-bis.2" }],
      };
    }
    throw new Error("SP pianificati per sprint assenti e nessun primo sprint per derivare il costo per SP");
  }
  return {
    value: params.teamCostPerSprint / params.plannedSpPerSprint,
    derived: true,
    warnings: [{ code: "AGILE_COST_PER_SP_DERIVED", message: "Costo per SP calcolato da parametri di progetto: fissalo in baseline", ref: "§6-bis.2" }],
  };
}

/** Media delle ultime `window` velocity, con avviso se gli sprint sono meno della finestra. */
export function velocityAverage(velocita: number[], window: number): { avg: number | null; warnings: Warning[] } {
  if (velocita.length === 0) {
    return { avg: null, warnings: [{ code: "VEL_EMPTY", message: "Nessuno sprint: velocity non disponibile", ref: "§3.9.3" }] };
  }
  const warnings: Warning[] = [];
  if (velocita.length < window) {
    warnings.push({ code: "VEL_SHORT", message: `Solo ${velocita.length} sprint disponibili su una finestra di ${window}`, ref: "§3.9.3" });
  }
  const ultime = velocita.slice(-window);
  return { avg: ultime.reduce((s, v) => s + v, 0) / ultime.length, warnings };
}

/**
 * Metriche agile per sprint e forecast (specifica sez. 7.2–7.3). Il backlog
 * residuo è in SP; con velocity media zero il forecast è `null` con avviso.
 */
export function agileMetrics(sprints: SprintInput[], params: ProjectParams, backlogSp: number): AgileResult {
  requireNonNegative(backlogSp, "backlogSp");
  if (sprints.length === 0) {
    throw new Error("Le metriche agili richiedono almeno uno sprint");
  }
  const costo = baselineCostPerSp(params, sprints[0]);
  const perSprint: SprintMetrics[] = [];
  const warnings: Warning[] = [...costo.warnings];
  let spCum = 0;
  let spPlannedCum = 0;
  let acCum = 0;
  for (const s of sprints) {
    spCum += s.spCompleted;
    spPlannedCum += s.spPlanned;
    acCum += s.cost;
    const ev = spCum * costo.value;
    const pv = spPlannedCum * costo.value;
    const ac = acCum;
    perSprint.push({
      index: s.index,
      spCum,
      spPlannedCum,
      acCum,
      ev,
      pv,
      ac,
      cpi: ac > 0 && ev > 0 ? ev / ac : null,
      spi: pv > 0 ? ev / pv : null,
      spiVelocity: params.plannedSpPerSprint > 0 ? s.spCompleted / params.plannedSpPerSprint : null,
    });
  }
  const velocita = sprints.map((s) => s.spCompleted);
  const vel = velocityAverage(velocita, params.velocityWindow);
  warnings.push(...vel.warnings);
  let sprintRemaining: number | null = null;
  let eacTimeDays: number | null = null;
  let eacCost: Money | null = null;
  if (vel.avg === null || vel.avg <= 0) {
    warnings.push({ code: "VEL_ZERO", message: "Velocity media nulla: forecast non calcolabile", ref: "§3.9.3" });
  } else {
    sprintRemaining = backlogSp / vel.avg;
    eacTimeDays = sprintRemaining * params.sprintDays;
    eacCost = sprintRemaining * params.teamCostPerSprint + acCum;
  }
  return {
    costPerSp: costo.value,
    costPerSpDerived: costo.derived,
    perSprint,
    velocityAvg: vel.avg,
    sprintRemaining,
    sprintRemainingCeil: sprintRemaining === null ? null : Math.ceil(sprintRemaining),
    eacTimeDays,
    eacCost,
    warnings,
  };
}

/** Data di fine dal presente: inizio + giorni del forecast (utile per i report). */
export function forecastFinishDate(startFrom: ISODate, eacTimeDays: number): ISODate {
  return addDays(startFrom, Math.ceil(eacTimeDays));
}
