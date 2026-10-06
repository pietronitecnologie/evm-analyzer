// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// EVM: varianze, indici, EAC, TCPI, semaforo, curva PV time-phased (§3.5, §3.6, §3.8).
// Nessun NaN o Infinity: un indice indefinito è `null` con avviso.

import { isoToDays } from "./dates";
import {
  type ISODate,
  type Money,
  type ProjectParams,
  type TrafficLight,
  type Warning,
} from "./types";

/**
 * Soglia sotto la quale un importo in euro è trattato come zero (DECISIONS.md):
 * evita indici calcolati su numeri subnormali, che perdono precisione.
 */
export const EURO_ZERO = 1e-9;

export interface EvmInput {
  bac: Money;
  pv: Money;
  ev: Money;
  ac: Money;
}

export interface EvmOutput {
  cv: Money;
  sv: Money;
  cpi: number | null;
  spi: number | null;
  etc: Money;
  eac: Money;
  eacOptimistic: Money;
  eacLinear: Money | null;
  vac: Money;
  tcpi: number | null;
  /** true se l'ETC è stato calcolato senza CPI (ipotesi di ritmo di piano). */
  etcFallback: boolean;
  cpiLight: TrafficLight;
  spiLight: TrafficLight;
  warnings: Warning[];
}

/** Semaforo di un indice con soglie da parametri (§3.3 della specifica). */
export function light(index: number | null, params: Pick<ProjectParams, "greenThreshold" | "yellowThreshold">): TrafficLight {
  if (index === null) return "nd";
  if (index >= params.greenThreshold) return "verde";
  if (index >= params.yellowThreshold) return "giallo";
  return "rosso";
}

/** Indicatori EVM di un insieme di valori (§3.2 della specifica, §3.5–§3.8 del libro). */
export function evm(input: EvmInput, params: Pick<ProjectParams, "greenThreshold" | "yellowThreshold">): EvmOutput {
  const { bac, pv, ev, ac } = input;
  const warnings: Warning[] = [];
  const cv = ev - ac;
  const sv = ev - pv;

  let cpi: number | null = null;
  if (ac > EURO_ZERO && ev > EURO_ZERO) {
    cpi = ev / ac;
  } else {
    warnings.push({
      code: "EVM_CPI_UNDEFINED",
      message: ev <= EURO_ZERO ? "CPI non definito: EV = 0" : "CPI non definito: AC = 0",
      ref: "§3.6",
    });
  }

  let spi: number | null = null;
  if (pv > EURO_ZERO) {
    spi = ev / pv;
  } else if (ev > EURO_ZERO) {
    warnings.push({ code: "EVM_SPI_UNDEFINED", message: "SPI non definito: PV = 0 con EV > 0", ref: "§3.6" });
  }

  let etc: number;
  let etcFallback = false;
  if (cpi !== null) {
    etc = (bac - ev) / cpi;
  } else {
    etc = bac - ev;
    etcFallback = true;
    warnings.push({ code: "EVM_NO_CPI", message: "ETC stimato a ritmo di piano: CPI non definito", ref: "§3.7" });
  }

  const eac = ac + etc;
  const eacOptimistic = ac + (bac - ev);
  const eacLinear = cpi === null ? null : bac / cpi;
  const vac = bac - eac;
  const denominatoreTcpi = bac - ac;
  const tcpi = denominatoreTcpi > EURO_ZERO ? (bac - ev) / denominatoreTcpi : null;

  return {
    cv,
    sv,
    cpi,
    spi,
    etc,
    eac,
    eacOptimistic,
    eacLinear,
    vac,
    tcpi,
    etcFallback,
    cpiLight: light(cpi, params),
    spiLight: light(spi, params),
    warnings,
  };
}

/** Somma pv/ev/ac/bac di un gruppo di misure. */
export function sumEvm(items: EvmInput[]): EvmInput {
  return items.reduce(
    (t, i) => ({ bac: t.bac + i.bac, pv: t.pv + i.pv, ev: t.ev + i.ev, ac: t.ac + i.ac }),
    { bac: 0, pv: 0, ev: 0, ac: 0 },
  );
}

/**
 * Aggrega le misure per chiave (WBS, control account, risorsa, filone, periodo)
 * e applica `evm()` a ogni gruppo. I totali dei gruppi coincidono con il totale.
 */
export function rollup<T extends EvmInput>(
  items: T[],
  keyFn: (item: T) => string,
  params: Pick<ProjectParams, "greenThreshold" | "yellowThreshold">,
): Map<string, EvmOutput> {
  const gruppi = new Map<string, EvmInput[]>();
  for (const item of items) {
    const chiave = keyFn(item);
    const lista = gruppi.get(chiave) ?? [];
    lista.push(item);
    gruppi.set(chiave, lista);
  }
  const out = new Map<string, EvmOutput>();
  for (const [chiave, lista] of gruppi) out.set(chiave, evm(sumEvm(lista), params));
  return out;
}

/** Burn rate: AC del periodo / PV del periodo; `null` se il PV del periodo è zero (§3.4). */
export function burnRate(acPeriodo: Money, pvPeriodo: Money): number | null {
  return pvPeriodo === 0 ? null : acPeriodo / pvPeriodo;
}

/** Accuratezza della previsione a consuntivo: 1 − |EAC − costo finale| / costo finale (§3.4). */
export function forecastAccuracy(eac: Money, costoFinale: Money): number | null {
  if (costoFinale <= 0) return null;
  return 1 - Math.abs(eac - costoFinale) / costoFinale;
}

export interface PvPoint {
  date: ISODate;
  cumulative: Money;
}

export interface PvCurveCheck {
  /** Curva con il massimo cumulato forzato a monotona non decrescente. */
  curve: PvPoint[];
  warnings: Warning[];
}

/**
 * Normalizza una curva PV ordinata: se non è monotona emette `PV_NOT_MONOTONIC`
 * e usa il massimo cumulato fino a ogni punto (§3.5 della specifica).
 */
export function normalizePvCurve(points: PvPoint[]): PvCurveCheck {
  const ordinata = [...points].sort((a, b) => isoToDays(a.date) - isoToDays(b.date));
  const warnings: Warning[] = [];
  let massimo = -Infinity;
  const curve = ordinata.map((p) => {
    if (p.cumulative < massimo) {
      warnings.push({ code: "PV_NOT_MONOTONIC", message: `Curva PV non monotona alla data ${p.date}`, ref: "§3.5" });
    }
    massimo = Math.max(massimo, p.cumulative);
    return { date: p.date, cumulative: massimo };
  });
  return { curve, warnings };
}

/**
 * PV alla data richiesta, interpolazione lineare tra due punti. Prima del primo
 * punto vale 0; dopo l'ultimo vale l'ultimo valore (§3.5 della specifica).
 */
export function pvAt(curve: PvPoint[], date: ISODate): Money {
  if (curve.length === 0) return 0;
  const t = isoToDays(date);
  const primo = curve[0];
  if (t < isoToDays(primo.date)) return 0;
  const ultimo = curve[curve.length - 1];
  if (t >= isoToDays(ultimo.date)) return ultimo.cumulative;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    const ta = isoToDays(a.date);
    const tb = isoToDays(b.date);
    if (t <= tb) {
      if (tb === ta) return b.cumulative;
      return a.cumulative + ((t - ta) / (tb - ta)) * (b.cumulative - a.cumulative);
    }
  }
  return ultimo.cumulative;
}

