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
}

export interface RigaApprovazione {
  id: number;
  uid: string;
  nome: string;
  pct: number;
  inizioEffettivo: string | null;
  fineEffettiva: string | null;
  inviatoIl: string;
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

export const TIPI_CONSUMO = ["contingency", "management_reserve", "buffer_tempo"] as const;

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

export const GIORNI_SETTIMANA = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"] as const;

/** Etichette dei giorni lavorativi di una maschera, in ordine lun → dom. */
export function giorniDi(maschera: number): string {
  return GIORNI_SETTIMANA.filter((_, i) => maschera & (1 << i)).join(", ") || "nessuno";
}
