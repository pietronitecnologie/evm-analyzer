// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Costi delle risorse assegnate ai task (Cap. 2–3). Il costo pianificato è unità × ore
// pianificate × tariffa; l'AC da ore consuntive è ore × tariffa media ponderata per le
// unità. La tariffa è il costo orario reale se verificato, altrimenti la tariffa importata
// (§6-bis.7). Nessun valore è calcolato fuori da questo modulo.

import { type Money } from "./types";

export interface AssegnazioneCosto {
  /** Unità assegnate: 1 = 100%. */
  unita: number;
  /** Tariffa oraria effettiva (€/h): costo reale se verificato, altrimenti importato. */
  tariffa: Money;
}

/** Costo pianificato di una assegnazione: unità × ore pianificate × tariffa. */
export function costoPianificatoAssegnazione(unita: number, orePianificate: number, tariffa: Money): Money {
  return unita * orePianificate * tariffa;
}

/**
 * Tariffa media ponderata per le unità: Σ(unità × tariffa) / Σ unità. `null` se non ci sono
 * unità assegnate.
 */
export function tariffaMediaPonderata(assegnazioni: AssegnazioneCosto[]): Money | null {
  const unitaTotali = assegnazioni.reduce((s, a) => s + a.unita, 0);
  if (unitaTotali <= 0) return null;
  return assegnazioni.reduce((s, a) => s + a.unita * a.tariffa, 0) / unitaTotali;
}

/**
 * Costo consuntivo (AC) dalle ore consuntive: ore × tariffa media ponderata. `null` se le
 * ore non sono inserite o non ci sono risorse con tariffa.
 */
export function acDaOre(oreConsuntive: number | null, assegnazioni: AssegnazioneCosto[]): Money | null {
  if (oreConsuntive === null || oreConsuntive < 0) return null;
  const media = tariffaMediaPonderata(assegnazioni);
  return media === null ? null : oreConsuntive * media;
}
