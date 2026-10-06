// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Buffer e riserve (§3.7, specifica sez. 6).

import { type TrafficLight, type Warning } from "./types";

export interface BufferThresholds {
  /** Soglia gialla dell'indice di salute (default 1). */
  yellow: number;
  /** Soglia rossa (default 1,5). */
  red: number;
}

export const DEFAULT_BUFFER_THRESHOLDS: BufferThresholds = { yellow: 1, red: 1.5 };

export interface BufferHealth {
  /** Buffer consumato / lavoro completato; `null` se il completato è zero. */
  ratio: number | null;
  light: TrafficLight;
  warnings: Warning[];
}

/** Indice di salute del buffer: ≤ 1 verde, tra 1 e 1,5 giallo, oltre 1,5 rosso. */
export function bufferHealth(
  consumedPct: number,
  completedPct: number,
  thresholds: BufferThresholds = DEFAULT_BUFFER_THRESHOLDS,
): BufferHealth {
  if (completedPct <= 0) {
    return {
      ratio: null,
      light: "nd",
      warnings: [{ code: "BUFFER_NO_PROGRESS", message: "Lavoro completato zero: indice di salute non calcolabile", ref: "§3.7" }],
    };
  }
  const ratio = consumedPct / completedPct;
  const light: TrafficLight = ratio <= thresholds.yellow ? "verde" : ratio <= thresholds.red ? "giallo" : "rosso";
  return { ratio, light, warnings: [] };
}

export interface RiskRow {
  id: string;
  /** Contingenza stanziata per il rischio (euro). */
  allocated: number;
  /** Importo utilizzato (euro). */
  used: number;
  /** Data di utilizzo (ISO), assente se il rischio non si è materializzato. */
  usageDate: string | null;
}

export interface ContingencyStatus {
  used: number;
  residual: number;
  allocatedTotal: number;
  warnings: Warning[];
}

/**
 * Stato della contingency. RES_CONT_NO_RISK: contingency usata senza rischi con
 * data di utilizzo. RES_CONT_MISMATCH: contingency a budget diversa dalla somma
 * stanziata oltre 1 € (esempio fixture: 7.296 € contro 15.000 €).
 */
export function contingencyStatus(risks: RiskRow[], budgetContingency: number): ContingencyStatus {
  const used = risks.reduce((s, r) => s + r.used, 0);
  const allocatedTotal = risks.reduce((s, r) => s + r.allocated, 0);
  const warnings: Warning[] = [];
  const materializzati = risks.some((r) => r.usageDate !== null);
  if (used > 0 && !materializzati) {
    warnings.push({ code: "RES_CONT_NO_RISK", message: "Contingency utilizzata senza rischi con data di utilizzo", ref: "§3.7" });
  }
  if (Math.abs(budgetContingency - allocatedTotal) > 1) {
    warnings.push({
      code: "RES_CONT_MISMATCH",
      message: `Contingency a budget ${budgetContingency.toFixed(2)} € diversa dalla somma stanziata ${allocatedTotal.toFixed(2)} €`,
      ref: "§3.7",
    });
  }
  return { used, residual: allocatedTotal - used, allocatedTotal, warnings };
}

export interface ManagementReserveStatus {
  consumed: number;
  residual: number;
  warnings: Warning[];
}

/** Management reserve: consumo e residuo; uso senza approvazione → RES_MR_UNAPPROVED. */
export function managementReserveStatus(
  total: number,
  consumed: number,
  approved: boolean,
): ManagementReserveStatus {
  const warnings: Warning[] = [];
  if (consumed > 0 && !approved) {
    warnings.push({ code: "RES_MR_UNAPPROVED", message: "Management reserve usata senza approvazione registrata", ref: "§3.7" });
  }
  return { consumed, residual: total - consumed, warnings };
}

/** Buffer temporale residuo in giorni. */
export function timeBufferLeft(timeBufferDays: number, consumedDays: number): number {
  return timeBufferDays - consumedDays;
}
