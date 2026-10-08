// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Flussi di creazione, apertura e importazione di un progetto. Parlano con
// il backend Tauri (crate evm-db) tramite i comandi nuovo_progetto,
// apri_progetto, inspect_plan_file/preview_plan_import/commit_plan_import
// (la procedura guidata di import) e resync_plan; fuori da Tauri (npm run
// dev) mostrano un avviso.

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

export interface PlanInspection {
  format: string;
  sizeBytes: number;
  estimatedTaskCount: number;
  detectedColumns: string[];
}

export interface PlanPreview {
  taskCount: number;
  resourceCount: number;
  assignmentCount: number;
  warnings: string[];
  bacEstimate: number | null;
}

export interface BacOptions {
  overheadPct: number;
  applyOverhead: boolean;
  contingencyPct: number;
  applyContingency: boolean;
}

export interface CommitOptions {
  bac: BacOptions;
  baselineKind: "startup" | "stima" | "altra";
  lockBaseline: boolean;
  statusDate: string | null;
}

export interface ResyncReport {
  added: string[];
  removed: string[];
  moved: string[];
  baselineChangedLocked: boolean;
  warnings: string[];
}

const FILTRO_PROGETTO = { name: "EVM Project", extensions: ["evmproj"] };
const FILTRO_PIANO = {
  name: "MS Project plan",
  extensions: ["xml", "csv", "xlsx", "xlsm", "xls"],
};

export function isTauriRuntime(): boolean {
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
  if (!isTauriRuntime()) return notImplemented("New project…");
  try {
    const percorso = await save({
      title: "New project",
      defaultPath: "progetto.evmproj",
      filters: [FILTRO_PROGETTO],
    });
    if (!percorso) return;
    const progetto = await invoke<ProgettoAperto>("nuovo_progetto", {
      percorso,
      nome: nomeDaFile(percorso),
    });
    applicaAlContesto(progetto);
    mostraSuccesso("Project created", progetto.percorso);
  } catch (e) {
    mostraErrore("Project creation failed", e);
  }
}

export async function apriProgetto() {
  if (!isTauriRuntime()) return notImplemented("Open project…");
  try {
    const percorso = await open({
      title: "Open project",
      multiple: false,
      directory: false,
      filters: [FILTRO_PROGETTO],
    });
    if (!percorso) return;
    const progetto = await invoke<ProgettoAperto>("apri_progetto", { percorso });
    applicaAlContesto(progetto);
    mostraSuccesso("Project opened", progetto.nome);
  } catch (e) {
    mostraErrore("Project opening failed", e);
  }
}

/** Step 1 of the import wizard: pick the plan export file to import. */
export async function pickPlanFile(): Promise<string | null> {
  if (!isTauriRuntime()) {
    notImplemented("Import plan from MS Project export…");
    return null;
  }
  const origine = await open({
    title: "Import plan from MS Project export",
    multiple: false,
    directory: false,
    filters: [FILTRO_PIANO],
  });
  return (origine as string | null) ?? null;
}

/** Step 1 of the import wizard: quick look at the file (format, size, columns). */
export async function inspectPlanFile(origine: string): Promise<PlanInspection> {
  return invoke<PlanInspection>("inspect_plan_file", { percorso: origine });
}

/** Step 3 of the import wizard: full preview, nothing written yet. */
export async function previewPlanImport(origine: string): Promise<PlanPreview> {
  return invoke<PlanPreview>("preview_plan_import", { percorso: origine });
}

/**
 * Last step of the import wizard: asks where to save the new project, then
 * commits the import with the baseline/BAC/status-date options chosen in
 * the previous steps.
 */
export async function commitPlanImport(
  origine: string,
  opzioni: CommitOptions,
): Promise<ImportoRisultato | null> {
  try {
    const destinazione = await save({
      title: "Save the new project",
      defaultPath: `${nomeDaFile(origine)}.evmproj`,
      filters: [FILTRO_PROGETTO],
    });
    if (!destinazione) return null;

    const esito = await invoke<ImportoRisultato>("commit_plan_import", {
      origine,
      destinazione,
      nome: nomeDaFile(destinazione),
      opzioni,
    });
    applicaAlContesto(esito.progetto);
    mostraSuccesso(
      "Plan imported",
      esito.avvisi.length > 0
        ? `${esito.avvisi.length} warnings, for example: ${esito.avvisi[0]}`
        : esito.progetto.nome,
    );
    return esito;
  } catch (e) {
    mostraErrore("Import failed", e);
    return null;
  }
}

/** Opens the "re-sync plan" dialog's file picker (an updated plan export). */
export async function pickResyncFile(): Promise<string | null> {
  if (!isTauriRuntime()) {
    notImplemented("Re-sync plan…");
    return null;
  }
  const origine = await open({
    title: "Re-sync plan from a new export",
    multiple: false,
    directory: false,
    filters: [FILTRO_PIANO],
  });
  return (origine as string | null) ?? null;
}

/** Re-syncs the open project (at `percorso`) with a new export of the same plan. */
export async function resyncPlan(
  percorso: string,
  origine: string,
  dataDiStato: string | null,
): Promise<ResyncReport | null> {
  try {
    const report = await invoke<ResyncReport>("resync_plan", { percorso, origine, dataDiStato });
    mostraSuccesso(
      "Plan re-synced",
      `${report.added.length} added, ${report.removed.length} removed, ${report.moved.length} moved`,
    );
    return report;
  } catch (e) {
    mostraErrore("Re-sync failed", e);
    return null;
  }
}
