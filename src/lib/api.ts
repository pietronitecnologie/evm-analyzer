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
  bloccata: boolean;
  archiviata: boolean;
  bacTotale: number | null;
}

export interface ChangeRequestRiga {
  id: number;
  richiestaIl: string;
  motivo: string;
  deltaCosto: number | null;
  deltaDurata: number | null;
  approvataIl: string | null;
  approvataDa: string | null;
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
