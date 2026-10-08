// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Controlli qualità dati (specifica sez. 11). Ogni controllo è una funzione
// separata con test positivo e negativo; `runQualityChecks` li compone.

import { type EvMethod, checkCadence, checkMethodChange } from "./ev-methods";
import { type ISODate, type Money, type Warning } from "./types";

export type Severity = "info" | "avviso" | "critico";

export interface Anomaly {
  code: string;
  severity: Severity;
  taskId?: string;
  message: string;
  ref?: string;
}

export interface QTask {
  id: string;
  name: string;
  active: boolean;
  isSummary: boolean;
  isMilestone: boolean;
  hasBaseline: boolean;
  method: EvMethod | null;
  /** Avanzamento 0..100 alla status date. */
  pctComplete: number | null;
  /** Avanzamento 0..100 alla status date precedente. */
  previousPct?: number | null;
  ac: Money | null;
  previousAc?: Money | null;
  actualStart: ISODate | null;
  actualFinish: ISODate | null;
  /** Metodi usati tra le status date (per METHOD_CHANGED). */
  methodHistory?: EvMethod[];
  /** Storico della % soggettiva: (data, pct 0..1, ore consumate). */
  subjectiveHistory?: { statusDate: ISODate; pct: number; hours: number }[];
  /** Segnale indipendente presente alla status date. */
  independentSignal?: boolean;
  /** Variazione di baseline fatta senza change request. */
  baselineChangedWithoutCr?: boolean;
}

export interface QResource {
  name: string;
  /** Tariffa importata (€/h); `null` se mancante. */
  rate: number | null;
  /** Costo orario reale del Cap. 2 (6-bis.7). */
  realHourlyCost?: number | null;
}

export interface QCheckpoint {
  date: ISODate;
  pvPct: number;
  ac: Money;
}

export interface QualityInput {
  statusDate: ISODate;
  projectStart: ISODate;
  projectEnd: ISODate;
  /** Data di inizio dai parametri e dalla WBS: devono coincidere (Q010). */
  paramsStart?: ISODate;
  wbsStart?: ISODate;
  tasks: QTask[];
  resources: QResource[];
  checkpoints?: QCheckpoint[];
  statusDates?: ISODate[];
  /** Stime con O > M o M > P (Q011). */
  estimateOrderIssues?: string[];
  /** Scostamento stima vs startup in percentuale (Q012). */
  estimateDeviationPct?: number | null;
  /** Agile: costo per SP derivato dal consuntivo (Q030). */
  agileCircularCostPerSp?: boolean;
  /** LOE: quota del BAC oltre la soglia (Q031). */
  loeShare?: number;
  loeThreshold?: number;
}

const ana = (
  severity: Severity,
  code: string,
  message: string,
  taskId?: string,
  ref?: string,
): Anomaly => ({ code, severity, taskId, message, ref });

/** Q001 — task attivo senza baseline. */
export function checkQ001(tasks: QTask[]): Anomaly[] {
  return tasks
    .filter((t) => t.active && !t.isSummary && !t.hasBaseline)
    .map((t) => ana("critico", "Q001", "Task attivo senza baseline", t.id, "§3.4"));
}

/** Q002 — metodo EV assente, o assegnato a un riepilogo. */
export function checkQ002(tasks: QTask[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const t of tasks) {
    if (t.isSummary) {
      if (t.method !== null) out.push(ana("avviso", "Q002", "Metodo EV assegnato a un task di riepilogo", t.id, "§3.5"));
    } else if (t.active && t.method === null) {
      out.push(ana("avviso", "Q002", "Metodo EV assente", t.id, "§3.5"));
    }
  }
  return out;
}

/** Q003 — AC mancante con avanzamento > 0. */
export function checkQ003(tasks: QTask[]): Anomaly[] {
  return tasks
    .filter((t) => (t.pctComplete ?? 0) > 0 && (t.ac === null || t.ac === 0))
    .map((t) => ana("avviso", "Q003", "AC mancante con avanzamento maggiore di zero", t.id, "§3.5"));
}

/** Q004 — % oltre 100 o decrescente tra status date. */
export function checkQ004(tasks: QTask[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const t of tasks) {
    const pct = t.pctComplete;
    if (pct !== null && pct > 100) {
      out.push(ana("critico", "Q004", `% completamento oltre 100: ${pct}`, t.id, "§3.5"));
    } else if (pct !== null && t.previousPct !== undefined && t.previousPct !== null && pct < t.previousPct) {
      out.push(ana("critico", "Q004", `% completamento decrescente: ${t.previousPct} → ${pct}`, t.id, "§3.5"));
    }
  }
  return out;
}

/** Q005 — avanzamento > 0 senza actual start. */
export function checkQ005(tasks: QTask[]): Anomaly[] {
  return tasks
    .filter((t) => (t.pctComplete ?? 0) > 0 && t.actualStart === null)
    .map((t) => ana("avviso", "Q005", "Avanzamento senza data di inizio effettiva", t.id, "§3.5"));
}

/** Q006 — data reale successiva alla status date. */
export function checkQ006(tasks: QTask[], statusDate: ISODate): Anomaly[] {
  const out: Anomaly[] = [];
  for (const t of tasks) {
    if (t.actualStart !== null && t.actualStart > statusDate) {
      out.push(ana("critico", "Q006", "Inizio reale successivo alla status date", t.id, "§3.5"));
    }
    if (t.actualFinish !== null && t.actualFinish > statusDate) {
      out.push(ana("critico", "Q006", "Fine reale successiva alla status date", t.id, "§3.5"));
    }
  }
  return out;
}

/** Q007 — risorsa senza tariffa. */
export function checkQ007(resources: QResource[]): Anomaly[] {
  return resources
    .filter((r) => r.rate === null)
    .map((r) => ana("avviso", "Q007", `Resource ${r.name} has no rate`, undefined, "§2.3"));
}

/** Q008 — PctPianificato o AC decrescenti tra check-point. */
export function checkQ008(checkpoints: QCheckpoint[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (let i = 1; i < checkpoints.length; i++) {
    const a = checkpoints[i - 1];
    const b = checkpoints[i];
    if (b.pvPct < a.pvPct) out.push(ana("critico", "Q008", `PctPianificato decrescente al check-point ${b.date}`, undefined, "§3.5"));
    if (b.ac < a.ac) out.push(ana("critico", "Q008", `AC decrescente al check-point ${b.date}`, undefined, "§3.5"));
  }
  return out;
}

/** Q009 — check-point fuori dall'intervallo di progetto. */
export function checkQ009(checkpoints: QCheckpoint[], start: ISODate, end: ISODate): Anomaly[] {
  return checkpoints
    .filter((c) => c.date < start || c.date > end)
    .map((c) => ana("avviso", "Q009", `Check-point ${c.date} fuori dall'intervallo di progetto`, undefined, "§3.5"));
}

/** Q010 — date incoerenti tra sezioni (parametri e WBS). */
export function checkQ010(paramsStart: ISODate | undefined, wbsStart: ISODate | undefined): Anomaly[] {
  if (paramsStart === undefined || wbsStart === undefined || paramsStart === wbsStart) return [];
  return [ana("avviso", "Q010", `Inizio parametri ${paramsStart} diverso dall'inizio WBS ${wbsStart}`, undefined, "§5")];
}

/** Q011 — righe di stima con O > M o M > P. */
export function checkQ011(righe: string[]): Anomaly[] {
  return righe.map((r) => ana("avviso", "Q011", `Stima con ordine non valido: ${r}`, r, "§3.1"));
}

/** Q012 — scostamento stima vs startup: avviso oltre 20%, critico oltre 30%. */
export function checkQ012(deviazionePct: number | null | undefined): Anomaly[] {
  if (deviazionePct === null || deviazionePct === undefined) return [];
  const assoluto = Math.abs(deviazionePct);
  if (assoluto > 30) return [ana("critico", "Q012", `Scostamento stima/startup ${deviazionePct.toFixed(1)}%`, undefined, "§3.1")];
  if (assoluto > 20) return [ana("avviso", "Q012", `Scostamento stima/startup ${deviazionePct.toFixed(1)}%`, undefined, "§3.1")];
  return [];
}

/** Q013 — costo orario non verificato (tariffa senza costo reale). */
export function checkQ013(resources: QResource[]): Anomaly[] {
  return resources
    .filter((r) => r.rate !== null && (r.realHourlyCost === undefined || r.realHourlyCost === null))
    .map((r) => ana("info", "Q013", `Unverified hourly cost for ${r.name}: possible underestimate`, undefined, "§6-bis.7"));
}

/** Q014 — metodo cambiato tra status date. */
export function checkQ014(tasks: QTask[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const t of tasks) {
    const storia = t.methodHistory ?? [];
    for (let i = 1; i < storia.length; i++) {
      const w = checkMethodChange(t.id, storia[i - 1], storia[i]);
      if (w) out.push(ana("critico", "Q014", w.message, t.id, w.ref));
    }
  }
  return out;
}

/** Q015 — intervalli irregolari tra status date. */
export function checkQ015(statusDates: ISODate[]): Anomaly[] {
  return checkCadence(statusDates).map((w: Warning) => ana("info", "Q015", w.message, undefined, w.ref));
}

/** Q016 — variazione di baseline senza change request. */
export function checkQ016(tasks: QTask[]): Anomaly[] {
  return tasks
    .filter((t) => t.baselineChangedWithoutCr === true)
    .map((t) => ana("critico", "Q016", "Baseline variata senza change request", t.id, "§3.4"));
}

/**
 * Q020 — «90% fatto»: pct ≥ 90% per più di 3 status date consecutive (metodo
 * soggettivo). Lo storico è in ordine cronologico.
 */
export function checkQ020(tasks: QTask[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const t of tasks) {
    if (t.method !== "soggettiva") continue;
    let consecutive = 0;
    for (const p of t.subjectiveHistory ?? []) {
      consecutive = p.pct >= 0.9 ? consecutive + 1 : 0;
      if (consecutive === 4) {
        out.push(ana("avviso", "Q020", "«90% fatto»: almeno 90% per più di 3 status date consecutive", t.id, "§3.5"));
      }
    }
  }
  return out;
}

/** Q021 — % soggettiva in crescita senza consumo di ore (segnale assente o piatto). */
export function checkQ021(tasks: QTask[]): Anomaly[] {
  const out: Anomaly[] = [];
  for (const t of tasks) {
    if (t.method !== "soggettiva") continue;
    const storia = t.subjectiveHistory ?? [];
    for (let i = 1; i < storia.length; i++) {
      if (storia[i].pct > storia[i - 1].pct && storia[i].hours <= storia[i - 1].hours) {
        out.push(ana("avviso", "Q021", "% soggettiva in crescita senza ore consumate", t.id, "§3.5"));
        break;
      }
    }
  }
  return out;
}

/** Q030 — agile: costo per SP derivato dal consuntivo (CPI circolare). */
export function checkQ030(circolare: boolean | undefined): Anomaly[] {
  return circolare ? [ana("avviso", "Q030", "Costo per SP derivato dal consuntivo: CPI agile circolare", undefined, "§6-bis.2")] : [];
}

/** Q031 — LOE oltre la soglia di quota del BAC. */
export function checkQ031(quota: number | undefined, soglia = 0.15): Anomaly[] {
  if (quota === undefined || quota <= soglia) return [];
  return [ana("avviso", "Q031", `Quota LOE ${(quota * 100).toFixed(1)}% oltre la soglia`, undefined, "§3.5")];
}

/** Esegue tutti i controlli sul pacchetto di input. */
export function runQualityChecks(input: QualityInput): Anomaly[] {
  const anomalie: Anomaly[] = [
    ...checkQ001(input.tasks),
    ...checkQ002(input.tasks),
    ...checkQ003(input.tasks),
    ...checkQ004(input.tasks),
    ...checkQ005(input.tasks),
    ...checkQ006(input.tasks, input.statusDate),
    ...checkQ007(input.resources),
    ...checkQ008(input.checkpoints ?? []),
    ...checkQ009(input.checkpoints ?? [], input.projectStart, input.projectEnd),
    ...checkQ010(input.paramsStart, input.wbsStart),
    ...checkQ011(input.estimateOrderIssues ?? []),
    ...checkQ012(input.estimateDeviationPct),
    ...checkQ013(input.resources),
    ...checkQ014(input.tasks),
    ...checkQ015(input.statusDates ?? []),
    ...checkQ016(input.tasks),
    ...checkQ020(input.tasks),
    ...checkQ021(input.tasks),
    ...checkQ030(input.agileCircularCostPerSp),
    ...checkQ031(input.loeShare, input.loeThreshold),
  ];
  return anomalie.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
