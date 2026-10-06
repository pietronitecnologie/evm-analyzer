// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Earned Schedule (specifica sez. 5): ES, SPI(t), SV(t), IEAC(t) su giorni di calendario.

import { addDays, diffDays } from "./dates";
import { type ISODate, type Money } from "./types";
import { type PvPoint } from "./evm";

export interface EarnedScheduleInput {
  pvCurve: PvPoint[];
  ev: Money;
  bac: Money;
  statusDate: ISODate;
  startDate: ISODate;
  plannedEndDate: ISODate;
}

export interface EarnedScheduleResult {
  /** Tempo guadagnato (giorni dall'inizio). */
  es: number;
  /** Tempo reale trascorso (giorni dall'inizio). */
  at: number;
  /** Durata pianificata (giorni). */
  pd: number;
  /** SPI(t) = ES / AT; `null` se AT = 0. */
  spiT: number | null;
  /** SV(t) = ES − AT (giorni). */
  svT: number;
  /** IEAC(t) = PD / SPI(t) (giorni); `null` se SPI(t) non è positivo. */
  ieacT: number | null;
  /** Data di fine stimata: inizio + IEAC arrotondato per eccesso. */
  estimatedFinish: ISODate | null;
}

/**
 * Algoritmo di ES su punti (t, PV) in periodi qualsiasi. Usato dalla versione su
 * date e dai test di riferimento della specifica (curva in periodi di 1).
 */
export function earnedSchedulePoints(
  punti: { t: number; pv: number }[],
  ev: number,
  bac: number,
  at: number,
  pd: number,
): { es: number; spiT: number | null; svT: number; ieacT: number | null } {
  let es: number;
  if (ev <= 0) {
    es = 0;
  } else if (ev >= bac) {
    es = pd;
  } else {
    es = punti[punti.length - 1].t;
    for (let k = 0; k < punti.length - 1; k++) {
      const pvK = punti[k].pv;
      const pvK1 = punti[k + 1].pv;
      if (pvK <= ev && pvK1 > ev) {
        es = punti[k].t + ((ev - pvK) / (pvK1 - pvK)) * (punti[k + 1].t - punti[k].t);
        break;
      }
    }
  }
  const spiT = at > 0 ? es / at : null;
  const ieacT = spiT !== null && spiT > 0 ? pd / spiT : null;
  return { es, spiT, svT: es - at, ieacT };
}

/** Earned Schedule su date di calendario (specifica sez. 5, passi 1–7). */
export function earnedSchedule(input: EarnedScheduleInput): EarnedScheduleResult {
  const at = diffDays(input.startDate, input.statusDate);
  const pd = diffDays(input.startDate, input.plannedEndDate);
  const punti = input.pvCurve.map((p) => ({ t: diffDays(input.startDate, p.date), pv: p.cumulative }));
  const r = earnedSchedulePoints(punti, input.ev, input.bac, at, pd);
  return {
    es: r.es,
    at,
    pd,
    spiT: r.spiT,
    svT: r.svT,
    ieacT: r.ieacT,
    estimatedFinish: r.ieacT === null ? null : addDays(input.startDate, Math.ceil(r.ieacT)),
  };
}
