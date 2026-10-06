// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Struttura della barra dei menu (sez. 8.3): ogni voce referenzia un
// comando del registro in commands.ts, così menu e palette comandi
// restano sempre sincronizzati.

export type MenuEntry = { commandId: string } | { separator: true };

export interface MenuDef {
  id: string;
  label: string;
  entries: MenuEntry[];
}

const cmd = (commandId: string): MenuEntry => ({ commandId });
const sep: MenuEntry = { separator: true };

export const MENUS: MenuDef[] = [
  {
    id: "file",
    label: "File",
    entries: [
      cmd("file.nuovo"),
      cmd("file.apri"),
      cmd("file.progetti-recenti"),
      sep,
      cmd("file.importa-piano"),
      cmd("file.importa-workbook"),
      cmd("file.importa-pacchetto"),
      sep,
      cmd("file.esporta-workbook"),
      cmd("file.esporta-report"),
      cmd("file.esporta-pacchetto-lavoro"),
      cmd("file.esporta-pacchetto-avanzamento"),
      cmd("file.esporta-csv"),
      sep,
      cmd("file.chiudi-progetto"),
    ],
  },
  {
    id: "modifica",
    label: "Modifica",
    entries: [
      cmd("modifica.annulla"),
      cmd("modifica.ripeti"),
      sep,
      cmd("modifica.copia"),
      cmd("modifica.incolla"),
      sep,
      cmd("modifica.trova"),
      cmd("modifica.vai-task"),
    ],
  },
  {
    id: "vista",
    label: "Vista",
    entries: [
      cmd("vista.tema"),
      cmd("vista.testo-piu-grande"),
      cmd("vista.testo-piu-piccolo"),
      sep,
      cmd("vista.sidebar"),
      cmd("vista.dettaglio"),
      cmd("vista.colonne"),
      sep,
      cmd("vista.salva-vista"),
      cmd("vista.ripristina-layout"),
      sep,
      cmd("vista.schermo-intero"),
    ],
  },
  {
    id: "progetto",
    label: "Progetto",
    entries: [
      cmd("progetto.nuovo-task"),
      cmd("progetto.calendari"),
      sep,
      cmd("progetto.parametri"),
      cmd("progetto.base-ev"),
      cmd("progetto.calendario-status-date"),
      sep,
      cmd("progetto.nuovo-snapshot"),
      cmd("progetto.blocca-baseline"),
      cmd("progetto.change-request"),
      sep,
      cmd("progetto.risincronizza"),
    ],
  },
  {
    id: "avanzamento",
    label: "Avanzamento",
    entries: [
      cmd("vai.avanzamento"),
      sep,
      cmd("avanzamento.invia"),
      cmd("avanzamento.approva"),
      cmd("avanzamento.respingi"),
      sep,
      cmd("avanzamento.copia-periodo-precedente"),
    ],
  },
  {
    id: "feed",
    label: "Feed",
    entries: [
      cmd("feed.wizard"),
      cmd("feed.verifica"),
      cmd("feed.storico"),
    ],
  },
  {
    id: "analisi",
    label: "Analisi",
    entries: [
      cmd("vai.dashboard"),
      cmd("analisi.earned-schedule"),
      cmd("analisi.monte-carlo"),
      sep,
      cmd("analisi.confronta-baseline"),
      cmd("analisi.qualita-dati"),
    ],
  },
  {
    id: "strumenti",
    label: "Strumenti",
    entries: [
      cmd("strumenti.utenti"),
      cmd("strumenti.log-importazione"),
      cmd("strumenti.cartella-dati"),
    ],
  },
  {
    id: "aiuto",
    label: "Aiuto",
    entries: [
      cmd("aiuto.guida"),
      cmd("aiuto.glossario"),
      cmd("aiuto.scorciatoie"),
      sep,
      cmd("aiuto.informazioni"),
      cmd("aiuto.licenza"),
    ],
  },
];
