// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Modello del Gantt di sola lettura: scala, giorni con fine settimana e festivi dal calendario
// di progetto, posizione delle barre e delle frecce di precedenza. Nessuna modifica dei dati.

import { daysToIso, isoToDays } from "@evm-analyzer/engine";

import type { Calendario, RigaGantt } from "@/lib/api";

/** Larghezza di un giorno in pixel. */
export const GIORNO_PX = 18;
/** Altezza di una riga. */
export const RIGA_PX = 28;
/** Giorni di margine prima e dopo il progetto. */
const MARGINE_GIORNI = 3;

export interface GiornoGantt {
  giorno: number;
  iso: string;
  /** Giorno della settimana: 0 = lunedì … 6 = domenica. */
  settimana: number;
  /** Non lavorativo per maschera del calendario (fine settimana). */
  weekend: boolean;
  /** Festivo esplicito del calendario. */
  festivo: boolean;
}

export interface BarraGantt {
  id: number;
  x: number;
  larghezza: number;
  pct: number;
  critico: boolean;
  riepilogo: boolean;
  milestone: boolean;
  /** Estremi in pixel usati dalle frecce di precedenza. */
  xInizio: number;
  xFine: number;
}

export interface FrecciaGantt {
  /** Indice di riga del predecessore e del successore. */
  da: number;
  a: number;
  /** Coordinate in pixel degli estremi collegati (FS: fine → inizio, ecc.). */
  xDa: number;
  xA: number;
  tipo: string;
}

export interface ModelloGantt {
  giorni: GiornoGantt[];
  larghezzaPx: number;
  barre: BarraGantt[];
  frecce: FrecciaGantt[];
  /** Quante attività hanno date pianificate (le altre sono in elenco senza barra). */
  conDate: number;
  inizio: string | null;
  fine: string | null;
}

/** Giorno di lavoro secondo la maschera del calendario (bit 0 = lunedì). */
function lavorativo(maschera: number, settimana: number): boolean {
  return (maschera & (1 << settimana)) !== 0;
}

/** Modello completo del Gantt. Le righe senza date restano in elenco senza barra. */
export function modelloGantt(righe: RigaGantt[], calendario: Calendario | null): ModelloGantt {
  const datate = righe.filter((r) => r.inizio && r.fine);
  const maschera = calendario?.maschera ?? 0b0011111;
  const festivi = new Set((calendario?.festivi ?? []).map((iso) => isoToDays(iso)));
  if (datate.length === 0) {
    return { giorni: [], larghezzaPx: 0, barre: [], frecce: [], conDate: 0, inizio: null, fine: null };
  }
  const primo = Math.min(...datate.map((r) => isoToDays(r.inizio!))) - MARGINE_GIORNI;
  const ultimo = Math.max(...datate.map((r) => isoToDays(r.fine!))) + MARGINE_GIORNI;

  const giorni: GiornoGantt[] = [];
  for (let g = primo; g <= ultimo; g++) {
    const settimana = (((g + 3) % 7) + 7) % 7;
    giorni.push({
      giorno: g,
      iso: daysToIso(g),
      settimana,
      weekend: !lavorativo(maschera, settimana),
      festivo: festivi.has(g),
    });
  }

  const xDi = (g: number) => (g - primo) * GIORNO_PX;
  const barre: BarraGantt[] = [];
  const posizioni = new Map<number, BarraGantt>();
  for (const r of datate) {
    const gi = isoToDays(r.inizio!);
    const gf = isoToDays(r.fine!);
    const xInizio = xDi(gi);
    const xFine = xDi(gf) + GIORNO_PX;
    const milestone = r.milestone;
    const barra: BarraGantt = {
      id: r.id,
      x: milestone ? xInizio + GIORNO_PX / 2 : xInizio,
      larghezza: milestone ? 0 : Math.max(xFine - xInizio, GIORNO_PX / 2),
      pct: r.pct,
      critico: r.critico,
      riepilogo: r.riepilogo,
      milestone,
      xInizio,
      xFine: milestone ? xInizio + GIORNO_PX / 2 : xFine,
    };
    barre.push(barra);
    posizioni.set(r.id, barra);
  }

  // Precedenze: il tipo (FS, SS, FF, SF) decide da quale estremo parte e a quale arriva la freccia.
  const indiceUid = new Map(righe.map((r, i) => [r.uid, i]));
  const idDaUid = new Map(righe.map((r) => [r.uid, r.id]));
  const frecce: FrecciaGantt[] = [];
  for (const r of righe) {
    const succ = posizioni.get(r.id);
    if (!succ) continue;
    for (const p of r.predecessori) {
      const m = /^(\d+)(FS|SS|FF|SF)/.exec(p);
      if (!m) continue;
      const predId = idDaUid.get(m[1]);
      const pred = predId === undefined ? undefined : posizioni.get(predId);
      const indicePred = indiceUid.get(m[1]);
      if (!pred || indicePred === undefined) continue;
      const tipo = m[2];
      const da = tipo === "SS" || tipo === "SF" ? pred.xInizio : pred.xFine;
      const a = tipo === "SS" || tipo === "FS" ? succ.xInizio : succ.xFine;
      frecce.push({ da: indicePred, a: indiceUid.get(r.uid)!, xDa: da, xA: a, tipo });
    }
  }

  return {
    giorni,
    larghezzaPx: giorni.length * GIORNO_PX,
    barre,
    frecce,
    conDate: datate.length,
    inizio: daysToIso(Math.min(...datate.map((r) => isoToDays(r.inizio!)))),
    fine: daysToIso(Math.max(...datate.map((r) => isoToDays(r.fine!)))),
  };
}
