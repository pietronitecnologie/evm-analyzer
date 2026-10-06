// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Stato del pannello «Esito importazione» (specifica fase 3, §4).

import { create } from "zustand";

export type GravitaAvviso = "critico" | "avviso" | "info";

export interface Avviso {
  gravita: GravitaAvviso;
  foglio: string;
  cella: string;
  codice: string;
  messaggio: string;
  suggerimento: string;
}

/** Contenuto letto dal workbook, come lo serializza il backend (camelCase). */
export interface WorkbookImportato {
  meta: { schemaVersion: number | null; projectId: number | null; exportedAt: string | null; appVersion: string | null } | null;
  parametri: {
    overhead: number | null;
    contingency: number | null;
    riservaGestione: number | null;
    sogliaVerde: number | null;
    sogliaGialla: number | null;
    inizio: string | null;
    fine: string | null;
    bufferGiorni: number | null;
    durataSprint: number | null;
    costoTeamSprint: number | null;
    finestraVelocity: number | null;
    baseEv: string | null;
    spPerSprint: number | null;
    costoPerSp: number | null;
  };
  attivita: {
    id: string;
    attivita: string | null;
    fase: string | null;
    risorsa: string | null;
    costoOrario: number | null;
    o: number | null;
    m: number | null;
    p: number | null;
    oreGiorno: number | null;
    materiali: number | null;
    serviziEsterni: number | null;
    dataInizio: string | null;
    filone: string | null;
  }[];
  checkpoint: { date: string; note: string | null; pctPlanned: number | null; pctActual: number | null; ac: number | null }[];
  rischi: {
    descrizione: string;
    probabilita: number | null;
    impatto: number | null;
    contingenza: number | null;
    dataUtilizzo: string | null;
    importoUtilizzato: number | null;
  }[];
  sprint: { numero: number; spPianificati: number | null; spCompletati: number | null; costoTeam: number | null }[];
  cache: { totali: Record<string, number>; checkpoint: Record<string, number>[] };
  avvisi: Avviso[];
}

interface EsitoState {
  aperto: boolean;
  origine: string | null;
  dati: WorkbookImportato | null;
  modalita: "nuovo";
  apri: (v: { origine: string; dati: WorkbookImportato; modalita: "nuovo" }) => void;
  chiudi: () => void;
}

export const useEsitoStore = create<EsitoState>()((set) => ({
  aperto: false,
  origine: null,
  dati: null,
  modalita: "nuovo",
  apri: ({ origine, dati, modalita }) => set({ aperto: true, origine, dati, modalita }),
  chiudi: () => set({ aperto: false, origine: null, dati: null }),
}));
