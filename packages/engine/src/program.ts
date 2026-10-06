// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Filoni e programma (§3.9.2, §3.9.4, §3.9.7; specifica sez. 10).
// Il livello di programma riceve da ogni filone pv, ev, ac: gli indici si
// calcolano sulle somme, mai come media di indici.

import { daysToIso, isoToDays } from "./dates";
import { evm, light, sumEvm, type EvmInput } from "./evm";
import { type ISODate, type Money, type ProjectParams, type TrafficLight, type Warning } from "./types";

export interface WorkstreamRow extends EvmInput {
  /** Il task usa il metodo LOE. */
  loe: boolean;
}

export interface Workstream {
  name: string;
  kind: "costruzione" | "automazione" | "software" | "altro";
  rows: WorkstreamRow[];
  /** Scope variabile (filone software): alimenta il controllo dei gate. */
  variableScope?: boolean;
}

export interface Gate {
  fromWorkstream: string;
  toWorkstream: string;
  /** Data del gate (ISO). */
  dueDate: ISODate;
  bufferDays: number;
}

export interface WorkstreamResult {
  name: string;
  kind: Workstream["kind"];
  bac: Money;
  pv: Money;
  ev: Money;
  ac: Money;
  cpi: number | null;
  spi: number | null;
  /** Quota di BAC occupata dai task LOE. */
  loeShare: number;
  /** SPI calcolato escludendo i LOE quando la quota supera la soglia. */
  spiExLoe: number | null;
  /** Peso del filone sull'EV e sull'AC di programma: contributo alle variazioni. */
  evShare: number;
  acShare: number;
  cpiLight: TrafficLight;
  spiLight: TrafficLight;
}

export interface ProgramResult {
  bacProgram: Money;
  pvProgram: Money;
  evProgram: Money;
  acProgram: Money;
  cpiProgram: number | null;
  spiProgram: number | null;
  workstreams: WorkstreamResult[];
  warnings: Warning[];
}

const quota = (parte: number, totale: number) => (totale > 0 ? parte / totale : 0);

/** Aggregazione del programma dai filoni (specifica sez. 10). */
export function programRollup(
  workstreams: Workstream[],
  gates: Gate[],
  params: Pick<ProjectParams, "greenThreshold" | "yellowThreshold" | "loeShareThreshold">,
  forecasts: Record<string, ISODate> = {},
): ProgramResult {
  const warnings: Warning[] = [];
  const perFilone = workstreams.map((w) => {
    const totali = sumEvm(w.rows);
    const bacLoe = w.rows.filter((r) => r.loe).reduce((s, r) => s + r.bac, 0);
    const loeShare = quota(bacLoe, totali.bac);
    const senzaLoe = w.rows.filter((r) => !r.loe);
    const spiEsclusi = loeShare > params.loeShareThreshold ? sumEvm(senzaLoe) : totali;
    if (loeShare > params.loeShareThreshold) {
      warnings.push({
        code: "LOE_SHARE",
        message: `Filone ${w.name}: quota LOE ${(loeShare * 100).toFixed(1)}% oltre la soglia, SPI calcolato senza LOE`,
        ref: "§3.5",
      });
    }
    const spiExLoe = spiEsclusi.pv > 0 ? spiEsclusi.ev / spiEsclusi.pv : null;
    return { w, totali, loeShare, spiExLoe };
  });

  const programma = sumEvm(perFilone.map((f) => f.totali));
  const indiciProgramma = evm(programma, params);
  for (const avviso of indiciProgramma.warnings) {
    warnings.push({ ...avviso, message: `Programma: ${avviso.message}` });
  }

  // Gate: verificati solo per i filoni con una consegna prevista (P80 o eacTimeDays).
  for (const g of gates) {
    const sorgente = workstreams.find((w) => w.name === g.fromWorkstream);
    const previsto = forecasts[g.fromWorkstream];
    if (!sorgente || previsto === undefined) continue;
    const avviso = checkGate(g, previsto, sorgente.variableScope === true);
    if (avviso) warnings.push(avviso);
  }

  const workstreamResults: WorkstreamResult[] = perFilone.map((f) => {
    const indici = evm(f.totali, params);
    return {
      name: f.w.name,
      kind: f.w.kind,
      bac: f.totali.bac,
      pv: f.totali.pv,
      ev: f.totali.ev,
      ac: f.totali.ac,
      cpi: indici.cpi,
      spi: indici.spi,
      loeShare: f.loeShare,
      spiExLoe: f.spiExLoe,
      evShare: quota(f.totali.ev, programma.ev),
      acShare: quota(f.totali.ac, programma.ac),
      cpiLight: light(indici.cpi, params),
      spiLight: light(indici.spi, params),
    };
  });

  return {
    bacProgram: programma.bac,
    pvProgram: programma.pv,
    evProgram: programma.ev,
    acProgram: programma.ac,
    cpiProgram: indiciProgramma.cpi,
    spiProgram: indiciProgramma.spi,
    workstreams: workstreamResults,
    warnings,
  };
}

/**
 * GATE_NO_BUFFER: il filone a scope variabile prevede la consegna dopo la data
 * del gate e il buffer di programma non copre il ritardo previsto. La data
 * prevista viene dal P80 del Monte Carlo o da eacTimeDays.
 */
export function checkGate(gate: Gate, forecastDate: ISODate, scopeVariabile: boolean): Warning | null {
  if (!scopeVariabile) return null;
  const ritardo = isoToDays(forecastDate) - isoToDays(gate.dueDate);
  if (ritardo <= 0) return null;
  if (gate.bufferDays >= ritardo) return null;
  return {
    code: "GATE_NO_BUFFER",
    message: `Gate ${gate.fromWorkstream} → ${gate.toWorkstream}: consegna prevista ${daysToIso(isoToDays(forecastDate))}, ritardo ${ritardo} gg oltre un buffer di ${gate.bufferDays} gg`,
    ref: "§3.9.7",
  };
}
