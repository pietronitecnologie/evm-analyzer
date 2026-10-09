// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Adatta i dati Agile del backend al motore (agileMetrics/flow). Il backlog
// residuo (SP) è un parametro a mano (nessun import lo fornisce, vedi DECISIONS.md):
// qui si calcola comunque con 0 se assente, così sprint/velocity/costo per SP restano
// disponibili; sprintRemaining/eacTimeDays/eacCost vanno ignorati dalla UI quando
// `parametri.backlogSp` è `null` (il risultato con backlog 0 sarebbe un forecast
// "già finito" fuorviante, non un dato mancante).

import { agileMetrics, diagnoseWip, littleWip, withDefaults, type AgileResult, type FlowWindow, type SprintInput, type Warning } from "@evm-analyzer/engine";

import type { DatiAgile, PeriodoFlusso } from "@/lib/api";

export function metricheAgili(d: DatiAgile): AgileResult | null {
  if (d.sprint.length === 0) return null;
  const sprints: SprintInput[] = d.sprint.map((s) => ({
    index: s.numero,
    spCompleted: s.spCompletati ?? 0,
    spPlanned: s.spPianificati ?? 0,
    cost: s.costo ?? 0,
  }));
  const params = withDefaults({
    sprintDays: d.parametri.sprintDays,
    teamCostPerSprint: d.parametri.teamCostPerSprint ?? 0,
    velocityWindow: d.parametri.velocityWindow,
    plannedSpPerSprint: d.parametri.plannedSpPerSprint ?? 0,
    baselineCostPerSp: d.parametri.baselineCostPerSp ?? undefined,
  });
  return agileMetrics(sprints, params, d.parametri.backlogSp ?? 0);
}

/** Solo i periodi con throughput e cycle time registrati: `littleWip`/`diagnoseWip` non li accettano `null`. */
export function finestreFlusso(periodi: PeriodoFlusso[]): FlowWindow[] {
  return periodi
    .filter((p): p is PeriodoFlusso & { throughput: number; cycleTimeGiorni: number } => p.throughput !== null && p.cycleTimeGiorni !== null)
    .map((p) => ({ throughput: p.throughput, cycleTime: p.cycleTimeGiorni }));
}

export function avvisoWip(periodi: PeriodoFlusso[]): Warning | null {
  return diagnoseWip(finestreFlusso(periodi));
}

/** WIP teorico (Legge di Little) per un periodo con throughput e cycle time registrati. */
export function wipTeorico(p: PeriodoFlusso): number | null {
  if (p.throughput === null || p.cycleTimeGiorni === null) return null;
  return littleWip(p.throughput, p.cycleTimeGiorni);
}
