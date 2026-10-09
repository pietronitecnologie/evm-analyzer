// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Registro unico delle anomalie (specifica Fase 6, §1): raccoglie in un'unica lista gli
// avvisi che il motore calcola già per schermata (WBS, EVM, Agile, Flusso, Filoni,
// Riserve) e la lista delle risorse (Q007/Q013) — stesse funzioni già richiamate da
// AgileFlowScreen/FiloniScreen/RiserveScreen/TaskRisorseScreen, nessun calcolo nuovo.
//
// Fuori da questo primo giro (vedi DECISIONS.md): gli avvisi EVM_*/PV_NOT_MONOTONIC a
// livello di singolo task/nodo WBS (centinaia di righe "CPI non definito" per task con
// AC=0 sarebbero rumore, non anomalie — si prende solo il livello di progetto); Q001-
// Q006, Q008-Q011, Q014-Q016, Q020-Q021, Q030-Q031 (richiedono uno storico per task —
// metodo EV nel tempo, % soggettiva nel tempo, variazioni di baseline — non ancora
// assemblato da nessuna pipeline); i codici XL_*/PLAN_* (import, non ancora strutturati
// con un campo `code` pulito) e V001-V016 (non esistono: le validazioni di invio
// avanzamento della Fase 4-bis non sono mai state implementate).

import { checkQ007, checkQ013, type QResource } from "@evm-analyzer/engine";

import { avvisoWip, metricheAgili } from "@/lib/agile";
import type { CategoriaProblema, DatiAgile, FiloneRiga, GravitaProblema, NuovoProblema, PeriodoFlusso, Riserve, RisorsaRiga } from "@/lib/api";
import { costruisciProgramma } from "@/lib/filoni";
import type { PuntoVista, VistaMonitoraggio } from "@/lib/monitoraggio";
import { saluteBufferTempo, statoContingency, statoRiservaGestione } from "@/lib/riserve";

interface InfoCodice {
  severity: GravitaProblema;
  category: CategoriaProblema;
  suggestion?: string;
}

/** Catalogo dei codici non già accompagnati da una propria gravità (i Q-della specifica
 * la portano già dal motore): gravità e categoria assegnate qui, suggerimento quando
 * utile. Un codice assente qui finisce "avviso"/"costi" di default, non scartato. */
const CATALOGO: Record<string, InfoCodice> = {
  WBS_NO_BUDGET: { severity: "avviso", category: "costi", suggestion: "Assegna un budget al nodo WBS nella schermata WBS." },
  WBS_BUDGET_UNALLOCABLE: { severity: "avviso", category: "costi", suggestion: "Assegna almeno un task al nodo WBS o rimuovi il budget." },
  EVM_CPI_UNDEFINED: { severity: "info", category: "costi" },
  EVM_SPI_UNDEFINED: { severity: "info", category: "date" },
  EVM_NO_CPI: { severity: "info", category: "costi" },
  PV_NOT_MONOTONIC: { severity: "avviso", category: "baseline" },
  LOE_SHARE: { severity: "avviso", category: "metodo_ev", suggestion: "Verifica la quota di task LOE nel filone: lo SPI potrebbe sottostimare il ritardo." },
  GATE_NO_BUFFER: { severity: "critico", category: "date", suggestion: "Rinegozia il gate o aumenta il buffer tra i filoni." },
  FLOW_WIP_EXCESS: { severity: "avviso", category: "flusso" },
  FLOW_WIP_LIMIT: { severity: "avviso", category: "flusso" },
  BUFFER_NO_PROGRESS: { severity: "info", category: "riserve" },
  RES_CONT_NO_RISK: { severity: "critico", category: "riserve", suggestion: "Registra il rischio materializzato o correggi il consumo registrato." },
  RES_CONT_MISMATCH: { severity: "avviso", category: "riserve", suggestion: "Verifica la contingency a budget contro la somma stanziata per rischio." },
  RES_MR_UNAPPROVED: { severity: "critico", category: "riserve", suggestion: "Fai approvare il consumo dal coordinatore del piano." },
  AGILE_COST_PER_SP_DERIVED: { severity: "avviso", category: "agile", suggestion: "Fissa il costo per SP in baseline (parametri di progetto)." },
  VEL_EMPTY: { severity: "avviso", category: "agile" },
  VEL_SHORT: { severity: "info", category: "agile" },
  VEL_ZERO: { severity: "avviso", category: "agile" },
  Q007: { severity: "avviso", category: "costi", suggestion: "Imposta una tariffa importata o un costo orario reale per la risorsa." },
  Q013: { severity: "info", category: "costi", suggestion: "Verifica il costo orario reale per questa risorsa." },
};

function problema(code: string, message: string, severity?: GravitaProblema, taskUid: string | null = null, wbsCodice: string | null = null): NuovoProblema {
  const info = CATALOGO[code];
  return {
    code,
    severity: severity ?? info?.severity ?? "avviso",
    category: info?.category ?? "costi",
    taskUid,
    wbsCodice,
    scopeId: null,
    message,
    suggestion: info?.suggestion ?? null,
  };
}

export interface InputQualita {
  vista: VistaMonitoraggio;
  testata: PuntoVista | undefined;
  risorse: RisorsaRiga[];
  datiAgile: DatiAgile | null;
  flusso: PeriodoFlusso[];
  filoni: FiloneRiga[];
  riserve: Riserve | null;
  /** Percentuale di progetto completata (EV/BAC × 100), per l'indice di salute del buffer. */
  pctCompletato: number;
}

/** Calcola la lista fresca di anomalie dal motore, pronta per `ricalcola_problemi`. */
export function calcolaProblemiMotore(input: InputQualita): NuovoProblema[] {
  const out: NuovoProblema[] = [];

  if (input.testata) {
    for (const w of input.testata.evm.warnings) out.push(problema(w.code, w.message));
  }
  for (const w of input.vista.avvisi) out.push(problema(w.code, w.message));

  const risorse: QResource[] = input.risorse.map((r) => ({ name: r.nome, rate: r.tariffa, realHourlyCost: r.costoOrarioReale }));
  for (const a of checkQ007(risorse)) out.push(problema(a.code, a.message, a.severity));
  for (const a of checkQ013(risorse)) out.push(problema(a.code, a.message, a.severity));

  if (input.datiAgile) {
    const metriche = metricheAgili(input.datiAgile);
    if (metriche) for (const w of metriche.warnings) out.push(problema(w.code, w.message));
  }

  const wip = avvisoWip(input.flusso);
  if (wip) out.push(problema(wip.code, wip.message));

  if (input.testata && input.filoni.length > 0) {
    const programma = costruisciProgramma(input.filoni, input.testata);
    for (const w of programma.warnings) out.push(problema(w.code, w.message));
  }

  if (input.riserve) {
    for (const w of statoContingency(input.riserve).warnings) out.push(problema(w.code, w.message));
    for (const w of statoRiservaGestione(input.riserve).warnings) out.push(problema(w.code, w.message));
    for (const w of saluteBufferTempo(input.riserve, input.pctCompletato).warnings) out.push(problema(w.code, w.message));
  }

  return out;
}

