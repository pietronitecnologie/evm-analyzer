// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Struttura della barra dei menu (sez. 8.3): ogni voce referenzia un
// comando del registro in commands.ts, così menu e palette comandi
// restano sempre sincronizzati. Solo funzionalità implementate: nessuna
// voce "arriva più avanti" (vedi todo.md).

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
      sep,
      cmd("file.importa-piano"),
      cmd("file.importa-workbook"),
      sep,
      cmd("file.esporta-workbook"),
      cmd("file.esporta-report"),
    ],
  },
  {
    id: "vista",
    label: "View",
    entries: [
      cmd("vista.tema"),
      cmd("vista.testo-piu-grande"),
      cmd("vista.testo-piu-piccolo"),
      sep,
      cmd("vista.sidebar"),
      cmd("vista.chiudi-schede"),
      sep,
      cmd("vista.schermo-intero"),
    ],
  },
  {
    id: "progetto",
    label: "Project",
    entries: [
      cmd("progetto.nuovo-task"),
      cmd("progetto.calendari"),
      cmd("progetto.monitoraggio"),
      cmd("progetto.governance"),
      sep,
      cmd("progetto.blocca-baseline"),
      cmd("progetto.change-request"),
      sep,
      cmd("progetto.risincronizza"),
    ],
  },
  {
    id: "avanzamento",
    label: "Progress",
    entries: [cmd("vai.avanzamento")],
  },
  {
    id: "analisi",
    label: "Analysis",
    entries: [
      cmd("vai.dashboard"),
      cmd("analisi.eac"),
      cmd("analisi.earned-schedule"),
      cmd("analisi.monte-carlo"),
      sep,
      cmd("analisi.confronta-baseline"),
      cmd("analisi.qualita-dati"),
    ],
  },
  {
    id: "aiuto",
    label: "Help",
    entries: [cmd("aiuto.diagnostica")],
  },
];
