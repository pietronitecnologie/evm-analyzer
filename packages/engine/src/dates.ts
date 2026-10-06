// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Date del motore: giorni di calendario interi calcolati in pura aritmetica
// civile (nessun accesso a Date, per riproducibilità). Conversione da/verso
// serial Excel fuori dal motore (sez. 0, regola 5).

import { EngineInputError, type ISODate } from "./types";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Giorni dall'epoca 1970-01-01 per una data ISO valida. */
export function isoToDays(iso: ISODate): number {
  const m = ISO.exec(iso);
  if (!m) throw new EngineInputError("DATE_FORMAT", `data non in formato YYYY-MM-DD: ${iso}`);
  const y = Number(m[1]);
  const mese = Number(m[2]);
  const giorno = Number(m[3]);
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) {
    throw new EngineInputError("DATE_RANGE", `data non valida: ${iso}`);
  }
  const yy = mese <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = mese > 2 ? mese - 3 : mese + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + giorno - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const giorni = era * 146097 + doe - 719468;
  if (daysToIso(giorni) !== iso) throw new EngineInputError("DATE_RANGE", `data inesistente: ${iso}`);
  return giorni;
}

/** Data ISO di un numero di giorni dall'epoca. */
export function daysToIso(giorni: number): ISODate {
  const z = giorni + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const anno = m <= 2 ? y + 1 : y;
  return `${String(anno).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Giorni di calendario tra due date (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return isoToDays(b) - isoToDays(a);
}

/** Aggiunge giorni di calendario a una data ISO. */
export function addDays(iso: ISODate, giorni: number): ISODate {
  return daysToIso(isoToDays(iso) + giorni);
}
