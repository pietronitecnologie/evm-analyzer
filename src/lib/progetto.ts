// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Flussi di creazione, apertura e importazione di un progetto. Parlano con
// il backend Tauri (crate evm-db) tramite i comandi nuovo_progetto,
// apri_progetto e importa_piano; fuori da Tauri (npm run dev) mostrano un avviso.

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import { notImplemented, useToastStore } from "@/stores/toast-store";
import { useProjectContextStore } from "@/stores/project-context-store";

interface ProgettoAperto {
  percorso: string;
  nome: string;
  origine: string;
  dataInizio: string | null;
  dataFinePrevista: string | null;
  dataDiStato: string | null;
}

interface ImportoRisultato {
  progetto: ProgettoAperto;
  avvisi: string[];
}

const FILTRO_PROGETTO = { name: "Progetto EVM", extensions: ["evmproj"] };
const FILTRO_PIANO = {
  name: "Piano di MS Project",
  extensions: ["xml", "csv", "xlsx", "xlsm", "xls"],
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function mostraErrore(titolo: string, errore: unknown) {
  useToastStore.getState().push({
    title: titolo,
    description: String(errore),
    variant: "destructive",
  });
}

function mostraSuccesso(titolo: string, descrizione?: string) {
  useToastStore.getState().push({ title: titolo, description: descrizione });
}

/** Porta il progetto aperto nella barra di contesto. */
function applicaAlContesto(progetto: ProgettoAperto) {
  useProjectContextStore.getState().impostaProgetto({
    projectName: progetto.nome,
    percorso: progetto.percorso,
    statusDate: progetto.dataDiStato ?? "—",
  });
}

/** Nome del progetto ricavato dal nome del file, senza estensione. */
function nomeDaFile(percorso: string): string {
  const base = percorso.split(/[\\/]/).pop() ?? percorso;
  return base.replace(/\.[^.]+$/, "");
}

export async function nuovoProgetto() {
  if (!isTauriRuntime()) return notImplemented("Nuovo progetto…");
  try {
    const percorso = await save({
      title: "Nuovo progetto",
      defaultPath: "progetto.evmproj",
      filters: [FILTRO_PROGETTO],
    });
    if (!percorso) return;
    const progetto = await invoke<ProgettoAperto>("nuovo_progetto", {
      percorso,
      nome: nomeDaFile(percorso),
    });
    applicaAlContesto(progetto);
    mostraSuccesso("Progetto creato", progetto.percorso);
  } catch (e) {
    mostraErrore("Creazione del progetto non riuscita", e);
  }
}

export async function apriProgetto() {
  if (!isTauriRuntime()) return notImplemented("Apri progetto…");
  try {
    const percorso = await open({
      title: "Apri progetto",
      multiple: false,
      directory: false,
      filters: [FILTRO_PROGETTO],
    });
    if (!percorso) return;
    const progetto = await invoke<ProgettoAperto>("apri_progetto", { percorso });
    applicaAlContesto(progetto);
    mostraSuccesso("Progetto aperto", progetto.nome);
  } catch (e) {
    mostraErrore("Apertura del progetto non riuscita", e);
  }
}

export async function importaPiano() {
  if (!isTauriRuntime()) return notImplemented("Importa piano da export MS Project…");
  try {
    const origine = await open({
      title: "Importa piano da export MS Project",
      multiple: false,
      directory: false,
      filters: [FILTRO_PIANO],
    });
    if (!origine) return;

    const destinazione = await save({
      title: "Salva il nuovo progetto",
      defaultPath: `${nomeDaFile(origine)}.evmproj`,
      filters: [FILTRO_PROGETTO],
    });
    if (!destinazione) return;

    const { progetto, avvisi } = await invoke<ImportoRisultato>("importa_piano", {
      origine,
      destinazione,
      nome: nomeDaFile(destinazione),
    });
    applicaAlContesto(progetto);
    mostraSuccesso(
      "Piano importato",
      avvisi.length > 0
        ? `${avvisi.length} avvisi, ad esempio: ${avvisi[0]}`
        : progetto.nome,
    );
  } catch (e) {
    mostraErrore("Importazione non riuscita", e);
  }
}
