// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Registro unico dei comandi: alimenta sia la barra dei menu (sez. 8.3)
// sia la palette comandi Ctrl+K (cmdk), così ogni azione è raggiungibile
// da entrambi i percorsi senza duplicare la logica.

import { apriProgetto, nuovoProgetto } from "@/lib/progetto";
import { esportaWorkbook, importaWorkbook } from "@/lib/workbook";
import { NAV_GROUPS } from "@/lib/navigation";
import { notImplemented } from "@/stores/toast-store";
import { applyThemeToDocument, useThemeStore } from "@/stores/theme-store";
import { useLayoutStore } from "@/stores/layout-store";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  group: string;
  run: () => void;
}

const screenCommands: Command[] = NAV_GROUPS.flatMap((group) =>
  group.items.map(
    (item): Command => ({
      id: `vai.${item.id}`,
      label: `Go to ${item.label}`,
      group: "Go to",
      run: () => useLayoutStore.getState().openScreen(item.id, item.label),
    }),
  ),
);

const viewCommands: Command[] = [
  {
    id: "vista.tema",
    label: "Toggle light/dark theme",
    group: "View",
    run: () => {
      useThemeStore.getState().toggleTheme();
      const { theme, fontScale } = useThemeStore.getState();
      applyThemeToDocument(theme, fontScale);
    },
  },
  {
    id: "vista.sidebar",
    label: "Show/hide sidebar",
    shortcut: "Ctrl+B",
    group: "View",
    run: () => useLayoutStore.getState().toggleSidebar(),
  },
  {
    id: "vista.chiudi-schede",
    label: "Close all tabs",
    group: "View",
    run: () => useLayoutStore.getState().closeAllTabs(),
  },
  {
    id: "vista.schermo-intero",
    label: "Full screen",
    shortcut: "F11",
    group: "View",
    run: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
  },
  {
    id: "vista.testo-piu-grande",
    label: "Increase text size",
    group: "View",
    run: () => {
      const s = useThemeStore.getState();
      s.setFontScale(s.fontScale + 0.1);
      applyThemeToDocument(s.theme, useThemeStore.getState().fontScale);
    },
  },
  {
    id: "vista.testo-piu-piccolo",
    label: "Decrease text size",
    group: "View",
    run: () => {
      const s = useThemeStore.getState();
      s.setFontScale(s.fontScale - 0.1);
      applyThemeToDocument(s.theme, useThemeStore.getState().fontScale);
    },
  },
];

// Voci di menu previste dalla specifica (sez. 8.3) ma la cui funzionalità
// arriva in fasi successive (import, feed, baseline, report, ...): restano
// raggiungibili e visibili, e segnalano con un toast la fase di arrivo.
function placeholder(id: string, label: string, group: string): Command {
  return { id, label, group, run: () => notImplemented(label) };
}

// Creazione, apertura e importazione del piano: funzionanti nell'app desktop.
const progettoCommands: Command[] = [
  { id: "file.importa-workbook", label: "Import Excel workbook…", group: "File", run: () => void importaWorkbook() },
  { id: "file.esporta-workbook", label: "Export Excel workbook…", group: "File", run: () => void esportaWorkbook() },
  {
    id: "progetto.monitoraggio",
    label: "EVM Monitoring…",
    group: "Project",
    run: () => useLayoutStore.getState().openScreen("monitoraggio", "EVM Monitoring"),
  },
  {
    id: "progetto.governance",
    label: "Cost governance…",
    group: "Project",
    run: () => useLayoutStore.getState().openScreen("governance-costi", "Cost governance"),
  },
  {
    id: "progetto.calendari",
    label: "Working calendars…",
    group: "Project",
    run: () => useLayoutStore.getState().openScreen("calendari", "Working calendars"),
  },
  {
    id: "progetto.nuovo-task",
    label: "New task…",
    group: "Project",
    run: () => useLayoutStore.getState().openScreen("task-risorse", "Tasks and resources"),
  },
  { id: "file.nuovo", label: "New project…", group: "File", run: () => void nuovoProgetto() },
  { id: "file.apri", label: "Open project…", group: "File", run: () => void apriProgetto() },
  {
    id: "file.importa-piano",
    label: "Import plan from MS Project export…",
    group: "File",
    run: () => useLayoutStore.getState().setImportWizardOpen(true),
  },
  {
    id: "progetto.risincronizza",
    label: "Re-sync plan",
    group: "Project",
    run: () => useLayoutStore.getState().setResyncDialogOpen(true),
  },
];

const placeholderCommands: Command[] = [
  placeholder("file.progetti-recenti", "Recent projects", "File"),
  placeholder("file.importa-pacchetto", "Import package…", "File"),
  placeholder("file.esporta-report", "Export PDF report…", "File"),
  placeholder("file.esporta-pacchetto-lavoro", "Export work package…", "File"),
  placeholder("file.esporta-pacchetto-avanzamento", "Export progress package…", "File"),
  placeholder("file.esporta-csv", "Export CSV of current view", "File"),
  placeholder("file.chiudi-progetto", "Close project", "File"),
  placeholder("modifica.annulla", "Undo", "Edit"),
  placeholder("modifica.ripeti", "Redo", "Edit"),
  placeholder("modifica.copia", "Copy", "Edit"),
  placeholder("modifica.incolla", "Paste", "Edit"),
  placeholder("modifica.trova", "Find", "Edit"),
  placeholder("modifica.vai-task", "Go to task…", "Edit"),
  placeholder("vista.colonne", "Columns…", "View"),
  placeholder("vista.salva-vista", "Save current view…", "View"),
  placeholder("vista.ripristina-layout", "Restore layout", "View"),
  placeholder("progetto.parametri", "Parameters and thresholds…", "Project"),
  placeholder("progetto.base-ev", "EV measurement basis…", "Project"),
  placeholder("progetto.calendario-status-date", "Status date calendar…", "Project"),
  placeholder("progetto.nuovo-snapshot", "Create snapshot…", "Project"),
  placeholder("progetto.blocca-baseline", "Lock baseline…", "Project"),
  placeholder("progetto.change-request", "New change request…", "Project"),
  placeholder("avanzamento.invia", "Submit for approval", "Progress"),
  placeholder("avanzamento.approva", "Approve selection", "Progress"),
  placeholder("avanzamento.respingi", "Reject selection…", "Progress"),
  placeholder("avanzamento.copia-periodo-precedente", "Copy progress from previous status date", "Progress"),
  placeholder("feed.wizard", "MS Project feed wizard…", "Feed"),
  placeholder("feed.verifica", "Check for update (load new export)…", "Feed"),
  placeholder("feed.storico", "Feed history", "Feed"),
  placeholder("analisi.earned-schedule", "Earned Schedule", "Analysis"),
  placeholder("analisi.monte-carlo", "Monte Carlo…", "Analysis"),
  placeholder("analisi.confronta-baseline", "Compare baseline…", "Analysis"),
  placeholder("analisi.qualita-dati", "Run data quality checks", "Analysis"),
  placeholder("strumenti.utenti", "User and scope management", "Tools"),
  placeholder("strumenti.log-importazione", "Import log", "Tools"),
  placeholder("strumenti.cartella-dati", "Data folder", "Tools"),
  placeholder("aiuto.guida", "Guide", "Help"),
  placeholder("aiuto.glossario", "KPI glossary", "Help"),
  placeholder("aiuto.scorciatoie", "Keyboard shortcuts", "Help"),
  placeholder("aiuto.informazioni", "About", "Help"),
  placeholder("aiuto.licenza", "GPL license and third parties", "Help"),
];

export const COMMANDS: Command[] = [
  ...screenCommands,
  ...viewCommands,
  ...progettoCommands,
  ...placeholderCommands,
];

export function runCommand(id: string) {
  COMMANDS.find((c) => c.id === id)?.run();
}
