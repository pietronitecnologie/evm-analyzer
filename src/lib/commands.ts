// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Registro unico dei comandi: alimenta sia la barra dei menu (sez. 8.3)
// sia la palette comandi Ctrl+K (cmdk), così ogni azione è raggiungibile
// da entrambi i percorsi senza duplicare la logica.

import { apriProgetto, importaPiano, nuovoProgetto } from "@/lib/progetto";
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
      label: `Vai a ${item.label}`,
      group: "Vai a",
      run: () => useLayoutStore.getState().openScreen(item.id, item.label),
    }),
  ),
);

const viewCommands: Command[] = [
  {
    id: "vista.tema",
    label: "Cambia tema chiaro/scuro",
    group: "Vista",
    run: () => {
      useThemeStore.getState().toggleTheme();
      const { theme, fontScale } = useThemeStore.getState();
      applyThemeToDocument(theme, fontScale);
    },
  },
  {
    id: "vista.sidebar",
    label: "Mostra/nascondi barra laterale",
    shortcut: "Ctrl+B",
    group: "Vista",
    run: () => useLayoutStore.getState().toggleSidebar(),
  },
  {
    id: "vista.dettaglio",
    label: "Mostra/nascondi pannello dettaglio",
    shortcut: "Ctrl+I",
    group: "Vista",
    run: () => useLayoutStore.getState().toggleDetailPanel(),
  },
  {
    id: "vista.schermo-intero",
    label: "Schermo intero",
    shortcut: "F11",
    group: "Vista",
    run: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
  },
  {
    id: "vista.testo-piu-grande",
    label: "Aumenta dimensione testo",
    group: "Vista",
    run: () => {
      const s = useThemeStore.getState();
      s.setFontScale(s.fontScale + 0.1);
      applyThemeToDocument(s.theme, useThemeStore.getState().fontScale);
    },
  },
  {
    id: "vista.testo-piu-piccolo",
    label: "Riduci dimensione testo",
    group: "Vista",
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
  {
    id: "progetto.calendari",
    label: "Calendari di lavoro…",
    group: "Progetto",
    run: () => useLayoutStore.getState().openScreen("calendari", "Calendari di lavoro"),
  },
  {
    id: "progetto.nuovo-task",
    label: "Nuovo task…",
    group: "Progetto",
    run: () => useLayoutStore.getState().openScreen("task-risorse", "Task e risorse"),
  },
  { id: "file.nuovo", label: "Nuovo progetto…", group: "File", run: () => void nuovoProgetto() },
  { id: "file.apri", label: "Apri progetto…", group: "File", run: () => void apriProgetto() },
  {
    id: "file.importa-piano",
    label: "Importa piano da export MS Project…",
    group: "File",
    run: () => void importaPiano(),
  },
];

const placeholderCommands: Command[] = [
  placeholder("file.progetti-recenti", "Progetti recenti", "File"),
  placeholder("file.importa-workbook", "Importa workbook Excel…", "File"),
  placeholder("file.importa-pacchetto", "Importa pacchetto…", "File"),
  placeholder("file.esporta-workbook", "Esporta workbook Excel…", "File"),
  placeholder("file.esporta-report", "Esporta report PDF…", "File"),
  placeholder("file.esporta-pacchetto-lavoro", "Esporta pacchetto di lavoro…", "File"),
  placeholder("file.esporta-pacchetto-avanzamento", "Esporta pacchetto di avanzamento…", "File"),
  placeholder("file.esporta-csv", "Esporta CSV della vista corrente", "File"),
  placeholder("file.chiudi-progetto", "Chiudi progetto", "File"),
  placeholder("modifica.annulla", "Annulla", "Modifica"),
  placeholder("modifica.ripeti", "Ripeti", "Modifica"),
  placeholder("modifica.copia", "Copia", "Modifica"),
  placeholder("modifica.incolla", "Incolla", "Modifica"),
  placeholder("modifica.trova", "Trova", "Modifica"),
  placeholder("modifica.vai-task", "Vai al task…", "Modifica"),
  placeholder("vista.colonne", "Colonne…", "Vista"),
  placeholder("vista.salva-vista", "Salva vista corrente…", "Vista"),
  placeholder("vista.ripristina-layout", "Ripristina layout", "Vista"),
  placeholder("progetto.parametri", "Parametri e soglie…", "Progetto"),
  placeholder("progetto.base-ev", "Base di misura EV…", "Progetto"),
  placeholder("progetto.calendario-status-date", "Calendario status date…", "Progetto"),
  placeholder("progetto.nuovo-snapshot", "Crea snapshot…", "Progetto"),
  placeholder("progetto.blocca-baseline", "Blocca baseline…", "Progetto"),
  placeholder("progetto.change-request", "Nuova change request…", "Progetto"),
  placeholder("progetto.risincronizza", "Ri-sincronizza piano", "Progetto"),
  placeholder("avanzamento.invia", "Invia per approvazione", "Avanzamento"),
  placeholder("avanzamento.approva", "Approva selezione", "Avanzamento"),
  placeholder("avanzamento.respingi", "Respingi selezione…", "Avanzamento"),
  placeholder("avanzamento.copia-periodo-precedente", "Copia avanzamento dalla status date precedente", "Avanzamento"),
  placeholder("feed.wizard", "Procedura guidata feed MS Project…", "Feed"),
  placeholder("feed.verifica", "Verifica aggiornamento (carica il nuovo export)…", "Feed"),
  placeholder("feed.storico", "Storico feed", "Feed"),
  placeholder("analisi.earned-schedule", "Earned Schedule", "Analisi"),
  placeholder("analisi.monte-carlo", "Monte Carlo…", "Analisi"),
  placeholder("analisi.confronta-baseline", "Confronta baseline…", "Analisi"),
  placeholder("analisi.qualita-dati", "Esegui controlli di qualità dati", "Analisi"),
  placeholder("strumenti.utenti", "Gestione utenti e perimetri", "Strumenti"),
  placeholder("strumenti.log-importazione", "Log di importazione", "Strumenti"),
  placeholder("strumenti.cartella-dati", "Cartella dati", "Strumenti"),
  placeholder("aiuto.guida", "Guida", "Aiuto"),
  placeholder("aiuto.glossario", "Glossario KPI", "Aiuto"),
  placeholder("aiuto.scorciatoie", "Scorciatoie da tastiera", "Aiuto"),
  placeholder("aiuto.informazioni", "Informazioni", "Aiuto"),
  placeholder("aiuto.licenza", "Licenza GPL e terze parti", "Aiuto"),
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
