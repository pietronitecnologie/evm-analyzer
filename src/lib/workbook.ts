// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Workbook Excel «Impresa Numerica» (specifica fase 3): import con pannello di esito,
// export con formule e valori in cache. Il backend legge e scrive; ogni calcolo e
// ogni confronto con i valori del file passa dal motore (packages/engine).

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  agileMetrics,
  estimateProject,
  evm,
  withDefaults,
  type ActivityEstimate,
  type ProjectParams,
} from "@evm-analyzer/engine";

import { useEsitoStore, type Avviso, type WorkbookImportato } from "@/stores/esito-importazione-store";
import { useProjectContextStore } from "@/stores/project-context-store";
import { notImplemented, useToastStore } from "@/stores/toast-store";

/** Cache calcolata dal motore, nella forma letta dal backend di esportazione. */
export interface CacheExport {
  righe: Record<string, number>[];
  sintesi: Record<string, number>;
  checkpoint: Record<string, number>[];
  sprint: Record<string, number>[];
  buffer: Record<string, number>;
}

interface EsitoImportWorkbook {
  progetto: { percorso: string; nome: string; origine: string; dataInizio: string | null; dataFinePrevista: string | null; dataDiStato: string | null };
  dati: WorkbookImportato;
}

const FILTRO_EXCEL = { name: "Workbook Impresa Numerica", extensions: ["xlsx", "xlsm"] };

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function mostraErrore(titolo: string, errore: unknown) {
  useToastStore.getState().push({ title: titolo, description: String(errore), variant: "destructive" });
}

const sommaNumeri = (valori: (number | null)[]) => valori.reduce<number>((s, v) => s + (v ?? 0), 0);

/** Parametri del motore a partire dal workbook letto (valori già in frazioni). */
export function parametriDaWorkbook(w: WorkbookImportato): ProjectParams {
  const p = w.parametri;
  const evBaseMode = (p.baseEv ?? "").toLowerCase().includes("senza") ? "bac_senza_contingency" : "bac_con_contingency";
  // Il backend espone le percentuali in intero (0..100); il motore lavora in frazioni (0..1).
  const frazione = (percento: number | null | undefined, predefinito: number) => (percento ?? predefinito) / 100;
  return withDefaults({
    overheadPct: frazione(p.overhead, 0),
    contingencyPct: frazione(p.contingency, 0),
    mgmtReservePct: frazione(p.riservaGestione, 0),
    greenThreshold: frazione(p.sogliaVerde, 95),
    yellowThreshold: frazione(p.sogliaGialla, 85),
    startDate: p.inizio ?? "1970-01-01",
    plannedEndDate: p.fine ?? "1970-01-01",
    timeBufferDays: p.bufferGiorni ?? 0,
    sprintDays: p.durataSprint ?? 14,
    teamCostPerSprint: p.costoTeamSprint ?? 0,
    velocityWindow: p.finestraVelocity ?? 3,
    evBaseMode,
    plannedSpPerSprint: p.spPerSprint ?? 0,
    baselineCostPerSp: p.costoPerSp ?? undefined,
  });
}

function stimeDaWorkbook(w: WorkbookImportato): ActivityEstimate[] {
  return w.attivita.map((a) => ({
    id: a.id,
    o: a.o ?? 0,
    m: a.m ?? 0,
    p: a.p ?? 0,
    hoursPerDay: a.oreGiorno ?? 0,
    hourlyCost: a.costoOrario ?? 0,
    materials: a.materiali ?? 0,
    externalServices: a.serviziEsterni ?? 0,
  }));
}

/**
 * Confronti che richiedono il motore (specifica §2.7, §2.9): valori del file contro
 * ricalcolo, contingency a budget contro le contingenze stanziate per rischio.
 */
export function verificaWorkbook(w: WorkbookImportato): Avviso[] {
  const avvisi: Avviso[] = [];
  if (w.attivita.length === 0) return avvisi;
  const params = parametriDaWorkbook(w);
  let r;
  try {
    r = estimateProject(stimeDaWorkbook(w), params);
  } catch (errore) {
    avvisi.push({ gravita: "critico", foglio: "WBS and Cost Estimate", cella: "", codice: "XL_ENGINE", messaggio: String(errore), suggerimento: "Check the estimate values" });
    return avvisi;
  }
  const stanziata = sommaNumeri(w.rischi.map((x) => x.contingenza));
  if (w.rischi.length > 0 && Math.abs(r.contingency - stanziata) > 1) {
    avvisi.push({
      gravita: "avviso",
      foglio: "Buffer and Contingency",
      cella: "D14",
      codice: "XL_CONT_MISMATCH",
      messaggio: `Budgeted contingency ${r.contingency.toFixed(2)} € differs from the amount allocated per risk ${stanziata.toFixed(2)} €`,
      suggerimento: "Align the Parameters contingency with the risks, or accept the difference",
    });
  }
  const confronti: [string, number, number][] = [
    ["effort", r.effortDays, 0.001],
    ["sigma", r.sigmaProject, 0.001],
    ["diretto", r.direct, 0.01],
    ["indiretto", r.indirect, 0.01],
    ["contingency", r.contingency, 0.01],
    ["bac", r.bacTotal, 0.01],
    ["budget", r.budgetApproved, 0.01],
  ];
  for (const [chiave, valoreMotore, tolleranza] of confronti) {
    const valoreFile = w.cache.totali[chiave];
    if (valoreFile !== undefined && Math.abs(valoreFile - valoreMotore) > tolleranza) {
      avvisi.push({
        gravita: "avviso",
        foglio: "WBS and Cost Estimate",
        cella: "",
        codice: "XL_CACHE_DIFF",
        messaggio: `${chiave}: file value ${valoreFile.toFixed(4)}, recalculated ${valoreMotore.toFixed(4)}. The engine value takes precedence.`,
        suggerimento: "Recalculate the workbook before exporting it, or check the formulas",
      });
    }
  }
  const base = params.evBaseMode === "bac_con_contingency" ? r.bacTotal : r.bacMeasure;
  w.checkpoint.forEach((c, i) => {
    const cache = w.cache.checkpoint[i];
    if (!cache) return;
    const e = evm({ bac: base, pv: (c.pctPlanned ?? 0) * base, ev: (c.pctActual ?? 0) * base, ac: c.ac ?? 0 }, params);
    const confrontiCp: [string, number | null][] = [["cpi", e.cpi], ["spi", e.spi], ["eac", e.eac]];
    for (const [chiave, valoreMotore] of confrontiCp) {
      const valoreFile = cache[chiave];
      if (valoreFile !== undefined && valoreMotore !== null && Math.abs(valoreFile - valoreMotore) > 0.001) {
        avvisi.push({
          gravita: "avviso",
          foglio: "EVM Monitoring",
          cella: "",
          codice: "XL_CACHE_DIFF",
          messaggio: `Checkpoint ${c.date}: ${chiave} from the file ${valoreFile.toFixed(4)}, recalculated ${valoreMotore.toFixed(4)}`,
          suggerimento: "The engine value takes precedence: recalculate the workbook",
        });
      }
    }
  });
  return avvisi;
}

/** Metriche agili per sprint (costo per SP di baseline, EV e CPI cumulati). Vuoto se non calcolabili. */
function calcolaSprint(
  w: WorkbookImportato,
  params: ProjectParams,
  numeri: (obj: Record<string, number | null | undefined>) => Record<string, number>,
): Record<string, number>[] {
  try {
    const risultato = agileMetrics(
      w.sprint.map((s, i) => ({ index: i + 1, spCompleted: s.spCompletati ?? 0, spPlanned: s.spPianificati ?? 0, cost: s.costoTeam ?? 0 })),
      params,
      0,
    );
    return risultato.perSprint.map((m) => numeri({ costoPerSp: risultato.costPerSp, ev: m.ev, cpi: m.cpi }));
  } catch {
    return [];
  }
}

/** Cache per l'esportazione: tutti i valori delle formule calcolati dal motore. */
export function costruisciCache(w: WorkbookImportato): CacheExport {
  const params = parametriDaWorkbook(w);
  const vuoto: CacheExport = { righe: [], sintesi: {}, checkpoint: [], sprint: [], buffer: {} };
  if (w.attivita.length === 0) return vuoto;
  const r = estimateProject(stimeDaWorkbook(w), params);
  const numeri = (obj: Record<string, number | null | undefined>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === "number" && Number.isFinite(v))) as Record<string, number>;

  const righe = r.activities.map((a, i) => {
    const sorgente = w.attivita[i];
    const effortOre = a.pert * (sorgente.oreGiorno ?? 0);
    const costoPersone = effortOre * (sorgente.costoOrario ?? 0);
    const indiretto = a.directCost * params.overheadPct;
    return numeri({
      pert: a.pert,
      sigma: a.sigma,
      effortOre,
      costoPersone,
      diretto: a.directCost,
      indiretto,
      attivita: a.directCost + indiretto,
      durata: a.pert,
    });
  });
  const totaleAttivita = sommaNumeri(righe.map((x) => x.attivita ?? 0));
  righe.forEach((x) => {
    x.pesoPct = totaleAttivita > 0 ? (x.attivita ?? 0) / totaleAttivita : 0;
  });

  const base = params.evBaseMode === "bac_con_contingency" ? r.bacTotal : r.bacMeasure;
  const checkpoint = w.checkpoint.map((c) => {
    const e = evm({ bac: base, pv: (c.pctPlanned ?? 0) * base, ev: (c.pctActual ?? 0) * base, ac: c.ac ?? 0 }, params);
    return numeri({
      pv: (c.pctPlanned ?? 0) * base,
      ev: (c.pctActual ?? 0) * base,
      cv: e.cv,
      sv: e.sv,
      cpi: e.cpi,
      spi: e.spi,
      etc: e.etc,
      eac: e.eac,
      eacOtt: e.eacOptimistic,
      eacLin: e.eacLinear,
      vac: e.vac,
      tcpi: e.tcpi,
    });
  });

  return {
    righe,
    sintesi: numeri({
      effort: r.effortDays,
      sigmaProject: r.sigmaProject,
      diretto: r.direct,
      indiretto: r.indirect,
      subtotale: r.direct + r.indirect,
      contingency: r.contingency,
      bac: r.bacTotal,
      // Misura senza contingency (diretto + indiretto): il foglio la mostra sempre accanto al BAC.
      bacMisura: r.direct + r.indirect,
      riserva: r.mgmtReserve,
      budget: r.budgetApproved,
    }),
    checkpoint,
    sprint: calcolaSprint(w, params, numeri),
    buffer: {
      stanziata: sommaNumeri(w.rischi.map((x) => x.contingenza)),
      usata: sommaNumeri(w.rischi.map((x) => x.importoUtilizzato)),
    },
  };
}

/** Passo 1 dell'import: anteprima con avvisi del backend e verifica del motore, poi pannello. */
export async function importaWorkbook() {
  if (!isTauriRuntime()) return notImplemented("Import Excel workbook…");
  try {
    const origine = await open({ title: "Import Excel workbook", multiple: false, directory: false, filters: [FILTRO_EXCEL] });
    if (!origine) return;
    const anteprima = await invoke<WorkbookImportato>("anteprima_workbook", { percorso: origine });
    const dati: WorkbookImportato = { ...anteprima, avvisi: [...anteprima.avvisi, ...verificaWorkbook(anteprima)] };
    useEsitoStore.getState().apri({ origine, dati, modalita: "nuovo" });
  } catch (errore) {
    mostraErrore("Workbook preview failed", errore);
  }
}

/** Passo 2: l'utente conferma (nessun critico): scelta del file di destinazione e scrittura. */
export async function confermaImportazione() {
  const stato = useEsitoStore.getState();
  if (!stato.origine || !stato.dati) return;
  try {
    const nomeBase = stato.origine.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "progetto";
    const destinazione = await save({ title: "Save the new project", defaultPath: `${nomeBase}.evmproj`, filters: [{ name: "EVM Project", extensions: ["evmproj"] }] });
    if (!destinazione) return;
    const esito = await invoke<EsitoImportWorkbook>("importa_workbook", { origine: stato.origine, destinazione, nome: nomeBase });
    useProjectContextStore.getState().impostaProgetto({
      projectName: esito.progetto.nome,
      percorso: esito.progetto.percorso,
      statusDate: esito.progetto.dataDiStato ?? "—",
      dataInizio: esito.progetto.dataInizio,
      dataFinePrevista: esito.progetto.dataFinePrevista,
    });
    stato.chiudi();
    useToastStore.getState().push({ title: "Workbook imported", description: `${stato.dati.avvisi.length} warnings` });
  } catch (errore) {
    mostraErrore("Import failed", errore);
  }
}

/** Export del progetto aperto in un workbook nuovo con formule e cache del motore. */
export async function esportaWorkbook() {
  if (!isTauriRuntime()) return notImplemented("Export Excel workbook…");
  const percorso = useProjectContextStore.getState().percorso;
  if (!percorso) {
    mostraErrore("Export not possible", "open a project before exporting it");
    return;
  }
  try {
    const destinazione = await save({ title: "Export Excel workbook", defaultPath: "impresa-numerica.xlsx", filters: [FILTRO_EXCEL] });
    if (!destinazione) return;
    const input = await invoke<WorkbookImportato>("input_workbook", { percorso });
    const cache = costruisciCache(input);
    await invoke("esporta_workbook", { percorso, destinazione, cache, opzioni: { conFormule: true, dataDiStato: null } });
    useToastStore.getState().push({ title: "Workbook exported", description: destinazione });
  } catch (errore) {
    mostraErrore("Export failed", errore);
  }
}

/** Salva il log degli avvisi in CSV (pannello di esito). */
export async function esportaLogCsv(avvisi: Avviso[]) {
  const percorso = await save({ title: "Export import log", defaultPath: "log-importazione.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (!percorso) return;
  const campi = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const righe = [
    ["Severity", "Sheet", "Cell", "Code", "Message", "Suggestion"].join(","),
    ...avvisi.map((a) => [a.gravita, a.foglio, a.cella, a.codice, a.messaggio, a.suggerimento].map(campi).join(",")),
  ];
  await invoke("salva_testo", { percorso, contenuto: `\uFEFF${righe.join("\n")}\n` });
}
