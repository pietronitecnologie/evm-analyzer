// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Tipi e chiamate verso i comandi Tauri delle schermate di lavoro. I nomi
// dei campi seguono la serializzazione camelCase del backend (crate evm-db).

import { invoke } from "@tauri-apps/api/core";

export interface Anomalia {
  uid: string;
  nome: string;
  messaggio: string;
}

export interface Dashboard {
  taskTotali: number;
  taskCritici: number;
  milestone: number;
  bacTotale: number | null;
  avanzamentoMedioPct: number | null;
  dataDiStato: string | null;
  anomalie: Anomalia[];
}

export interface NodoWbs {
  id: number;
  codice: string;
  nome: string;
  genitore: string | null;
  task: number;
  /** Budget assegnato al nodo (€), `null` se non assegnato. */
  budget: number | null;
}

export interface RigaGantt {
  id: number;
  uid: string;
  nome: string;
  inizio: string | null;
  fine: string | null;
  durataGiorni: number | null;
  critico: boolean;
  riepilogo: boolean;
  milestone: boolean;
  pct: number;
  predecessori: string[];
}

export interface RigaAvanzamento {
  uid: string;
  nome: string;
  pct: number;
  inizioEffettivo: string | null;
  fineEffettiva: string | null;
  statoUltimaVoce: string | null;
  notaUltimaVoce: string | null;
  /** AC cumulato vigente del task (€). */
  ac: number;
}

export interface RigaApprovazione {
  id: number;
  uid: string;
  nome: string;
  pct: number;
  inizioEffettivo: string | null;
  fineEffettiva: string | null;
  inviatoIl: string;
  /** AC cumulato proposto (€), se inserito. */
  ac: number | null;
}

export interface Utente {
  id: number;
  uid: string;
  nome: string;
  ruoli: string[];
  attivo: boolean;
}

export interface Perimetro {
  id: number;
  nome: string;
  codiceWbs: string | null;
  task: number;
  proprietario: string | null;
}

export interface Rischio {
  id: number;
  descrizione: string;
  probabilitaPct: number | null;
  impatto: number | null;
  contingenza: number | null;
  stato: string;
}

export interface Consumo {
  id: number;
  tipo: string;
  importo: number;
  data: string;
  nota: string | null;
}

export interface Riserve {
  contingencyPct: number;
  mgmtReservePct: number;
  timeBufferDays: number;
  bacTotale: number | null;
  contingenzaAllocata: number;
  rischi: Rischio[];
  consumi: Consumo[];
}

export const RUOLI = [
  "project_engineer",
  "supervisore",
  "coordinatore_piano",
  "amministratore",
] as const;

/** Etichette inglesi dei ruoli mostrate all'utente; i valori restano quelli inviati al backend. */
export const ETICHETTA_RUOLO: Record<string, string> = {
  project_engineer: "Project engineer",
  supervisore: "Supervisor",
  coordinatore_piano: "Plan coordinator",
  amministratore: "Administrator",
};

export const TIPI_CONSUMO = ["contingency", "management_reserve", "buffer_tempo"] as const;

/** Etichette inglesi dei tipi di consumo mostrate all'utente; i valori restano quelli inviati al backend. */
export const ETICHETTA_TIPO_CONSUMO: Record<string, string> = {
  contingency: "Contingency",
  management_reserve: "Management reserve",
  buffer_tempo: "Time buffer",
};

/** Chiama un comando del backend sul progetto aperto. */
export function chiama<T>(
  percorso: string,
  comando: string,
  argomenti: Record<string, unknown> = {},
): Promise<T> {
  return invoke<T>(comando, { percorso, ...argomenti });
}

export interface Calendario {
  id: number;
  nome: string;
  predefinito: boolean;
  /** Bit 0 = lunedì … bit 6 = domenica. */
  maschera: number;
  festivi: string[];
}

export const GIORNI_SETTIMANA = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Etichette dei giorni lavorativi di una maschera, in ordine lun → dom. */
export function giorniDi(maschera: number): string {
  return GIORNI_SETTIMANA.filter((_, i) => maschera & (1 << i)).join(", ") || "none";
}

// ------------------------------------------------------------- Costi e governance

export interface BudgetWbs {
  codice: string;
  budget: number | null;
}

export interface TaskMon {
  uid: string;
  wbs: string | null;
  riepilogo: boolean;
  inizio: string | null;
  fine: string | null;
  costoBaseline: number;
}

export interface SnapshotMon {
  data: string;
  etichetta: string | null;
  sorgente: string;
  righe: { uid: string; pct: number; ac: number }[];
}

export interface CheckpointMon {
  data: string;
  nota: string | null;
  pctPianificato: number | null;
  pctReale: number | null;
  ac: number | null;
}

export interface DatiMonitoraggio {
  wbs: BudgetWbs[];
  task: TaskMon[];
  snapshot: SnapshotMon[];
  checkpoint: CheckpointMon[];
}

export interface ConsumoRiserva {
  id: number;
  tipo: string;
  importo: number;
  data: string;
  nota: string | null;
}

export interface BaselineRiga {
  id: number;
  nome: string;
  tipo: string;
  creataIl: string;
  creataDa: string | null;
  bloccata: boolean;
  archiviata: boolean;
  bacDiretto: number | null;
  bacIndiretto: number | null;
  bacContingency: number | null;
  bacTotale: number | null;
}

export interface SnapshotRiga {
  id: number;
  statusDate: string;
  label: string | null;
  source: string;
}

export type StatoChangeRequest = "pending" | "approved" | "rejected";

export interface ChangeRequestRiga {
  id: number;
  richiestaIl: string;
  richiestaDa: string | null;
  motivo: string;
  deltaCosto: number | null;
  deltaDurata: number | null;
  deltaScope: string | null;
  stato: StatoChangeRequest;
  approvataIl: string | null;
  approvataDa: string | null;
  baselineDaId: number | null;
  baselineAId: number | null;
}

export interface RigaConfrontoBaseline {
  codice: string;
  nome: string;
  costoA: number;
  costoB: number;
  deltaCosto: number;
  deltaCostoPct: number | null;
  durataA: number | null;
  durataB: number | null;
  deltaDurata: number | null;
  inizioA: string | null;
  inizioB: string | null;
  fineA: string | null;
  fineB: string | null;
  deltaInizio: number | null;
  deltaFine: number | null;
}

export interface RigaBaselineScope {
  wbsId: number;
  codice: string;
  nome: string;
  incluso: boolean;
  nota: string | null;
}

export interface SprintRiga {
  numero: number;
  inizio: string | null;
  fine: string | null;
  spPianificati: number | null;
  spCompletati: number | null;
  costo: number | null;
}

export interface ParametriAgile {
  sprintDays: number;
  teamCostPerSprint: number | null;
  velocityWindow: number;
  plannedSpPerSprint: number | null;
  baselineCostPerSp: number | null;
  backlogSp: number | null;
}

export interface DatiAgile {
  sprint: SprintRiga[];
  parametri: ParametriAgile;
}

export interface PeriodoFlusso {
  id: number;
  inizioPeriodo: string;
  finePeriodo: string;
  throughput: number | null;
  cycleTimeGiorni: number | null;
  wipOsservato: number | null;
}

export type TipoMonteCarlo = "velocity" | "throughput";

export interface EsecuzioneMonteCarlo {
  id: number;
  tipo: TipoMonteCarlo;
  nIter: number;
  seed: number;
  parametriJson: string;
  risultatoJson: string;
  creatoIl: string;
}

export interface Governance {
  budgetTotale: number;
  wbsConBudget: number;
  /** Percentuale intera (0..100). */
  contingencyPct: number;
  contingencyStanziata: number;
  contingencyUsata: number;
  /** Percentuale intera (0..100). */
  riservaGestionePct: number;
  riservaGestioneUsata: number;
  consumi: ConsumoRiserva[];
  baseline: BaselineRiga[];
  changeRequest: ChangeRequestRiga[];
}

export interface RisorsaRiga {
  id: number;
  nome: string;
  tipo: string | null;
  tariffa: number | null;
  tariffaStraordinario: number | null;
  costoPerUso: number | null;
  costoOrarioReale: number | null;
  fonte: string;
  task: number;
  unita: number;
}

export interface AssegnazioneRiga {
  id: number;
  taskUid: string;
  taskNome: string;
  risorsaId: number;
  risorsaNome: string;
  unita: number;
}

export interface TaskRiga {
  id: number;
  uid: string;
  nome: string;
  wbs: string | null;
  inizio: string | null;
  fine: string | null;
  durataGiorni: number | null;
  milestone: boolean;
  riepilogo: boolean;
}

/** Riga della scheda Task e risorse (Fase 5, §3.3): pianificazione e baseline. */
export interface TaskEvmRiga {
  id: number;
  uid: string;
  nome: string;
  wbs: string | null;
  filone: string | null;
  metodoEv: string | null;
  inizioPianificato: string | null;
  finePianificata: string | null;
  inizioBaseline: string | null;
  fineBaseline: string | null;
  pctReale: number | null;
  floatDays: number | null;
  critico: boolean;
  riepilogo: boolean;
  milestone: boolean;
}
