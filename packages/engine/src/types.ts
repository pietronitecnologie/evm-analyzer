// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Tipi comuni del motore (specifica fase 2, sez. 1).

/** Data in formato 'YYYY-MM-DD'. */
export type ISODate = string;
/** Importo in euro. */
export type Money = number;

export interface Warning {
  code: string;
  message: string;
  ref?: string;
}

export type TrafficLight = "verde" | "giallo" | "rosso" | "nd";

/** Errore tipizzato per input strutturalmente invalidi (mai per casi matematici degeneri). */
export class EngineInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EngineInputError";
    this.code = code;
  }
}

export interface ProjectParams {
  /** Frazioni 0..1, es. 0,20. */
  overheadPct: number;
  contingencyPct: number;
  mgmtReservePct: number;
  greenThreshold: number;
  yellowThreshold: number;
  startDate: ISODate;
  plannedEndDate: ISODate;
  timeBufferDays: number;
  sprintDays: number;
  teamCostPerSprint: Money;
  velocityWindow: number;
  evBaseMode: "bac_con_contingency" | "bac_senza_contingency";
  plannedSpPerSprint: number;
  baselineCostPerSp?: Money;
  loeShareThreshold: number;
}

/** Parametri di default della specifica (soglie semaforo 0,95 / 0,85, finestra velocity 3, LOE 15%). */
export const DEFAULT_PARAMS: ProjectParams = {
  overheadPct: 0,
  contingencyPct: 0,
  mgmtReservePct: 0,
  greenThreshold: 0.95,
  yellowThreshold: 0.85,
  startDate: "1970-01-01",
  plannedEndDate: "1970-01-01",
  timeBufferDays: 0,
  sprintDays: 14,
  teamCostPerSprint: 0,
  velocityWindow: 3,
  evBaseMode: "bac_senza_contingency",
  plannedSpPerSprint: 0,
  loeShareThreshold: 0.15,
};

/** Unisce parametri parziali ai default. */
export function withDefaults(partial: Partial<ProjectParams>): ProjectParams {
  return { ...DEFAULT_PARAMS, ...partial };
}

/** Verifica che un numero sia finito e non negativo; altrimenti errore tipizzato. */
export function requireNonNegative(valore: number, nome: string): number {
  if (!Number.isFinite(valore) || valore < 0) {
    throw new EngineInputError("INPUT_NEGATIVE", `${nome} deve essere un numero finito ≥ 0 (ricevuto ${valore})`);
  }
  return valore;
}
