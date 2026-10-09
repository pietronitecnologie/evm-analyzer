// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Registro unico dei comandi: alimenta sia la barra dei menu (sez. 8.3)
// sia la palette comandi Ctrl+K (cmdk), così ogni azione è raggiungibile
// da entrambi i percorsi senza duplicare la logica.

import { apriProgetto, nuovoProgetto } from "@/lib/progetto";
import { esportaWorkbook, importaWorkbook } from "@/lib/workbook";
import { NAV_GROUPS } from "@/lib/navigation";
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
    id: "progetto.blocca-baseline",
    label: "Lock baseline…",
    group: "Project",
    run: () => useLayoutStore.getState().openScreen("baseline-cr", "Baseline and change requests"),
  },
  {
    id: "progetto.change-request",
    label: "New change request…",
    group: "Project",
    run: () => useLayoutStore.getState().openScreen("baseline-cr", "Baseline and change requests"),
  },
  {
    id: "analisi.confronta-baseline",
    label: "Compare baseline…",
    group: "Analysis",
    run: () => useLayoutStore.getState().openScreen("baseline-cr", "Baseline and change requests"),
  },
  {
    id: "analisi.eac",
    label: "EAC forecast…",
    group: "Analysis",
    run: () => useLayoutStore.getState().openScreen("forecast", "Forecast"),
  },
  {
    id: "analisi.earned-schedule",
    label: "Earned Schedule",
    group: "Analysis",
    run: () => useLayoutStore.getState().openScreen("forecast", "Forecast"),
  },
  {
    id: "analisi.monte-carlo",
    label: "Monte Carlo…",
    group: "Analysis",
    run: () => useLayoutStore.getState().openScreen("forecast", "Forecast"),
  },
  {
    id: "analisi.qualita-dati",
    label: "Data quality…",
    group: "Analysis",
    run: () => useLayoutStore.getState().openScreen("qualita-dati", "Data quality"),
  },
  {
    id: "file.esporta-report",
    label: "Export PDF report…",
    group: "File",
    run: () => useLayoutStore.getState().openScreen("report", "Report"),
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
  {
    id: "aiuto.diagnostica",
    label: "Diagnostics…",
    group: "Help",
    run: () => useLayoutStore.getState().setDiagnosticsDialogOpen(true),
  },
  {
    id: "aiuto.guida",
    label: "Guide",
    group: "Help",
    run: () => useLayoutStore.getState().openScreen("guida", "Guide"),
  },
];

export const COMMANDS: Command[] = [
  ...screenCommands,
  ...viewCommands,
  ...progettoCommands,
];

export function runCommand(id: string) {
  COMMANDS.find((c) => c.id === id)?.run();
}
