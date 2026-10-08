// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Costruisce e appiattisce l'albero della WBS (specifica Fase 5, §3.2) a
// partire dall'elenco piatto restituito da `wbs_elenco` (ogni nodo porta il
// codice del genitore, non un riferimento diretto).

import type { NodoWbs } from "@/lib/api";

export interface NodoAlbero {
  nodo: NodoWbs;
  figli: NodoAlbero[];
}

/** Confronto numerico dei segmenti del codice: "1.2" prima di "1.10". */
function confrontaCodici(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Costruisce l'albero (radici + figli ricorsivi), ordinato per codice a ogni livello. */
export function costruisciAlbero(nodi: NodoWbs[]): NodoAlbero[] {
  const perCodice = new Map(nodi.map((n) => [n.codice, { nodo: n, figli: [] as NodoAlbero[] }]));
  const radici: NodoAlbero[] = [];
  for (const voce of perCodice.values()) {
    const genitore = voce.nodo.genitore ? perCodice.get(voce.nodo.genitore) : undefined;
    (genitore ? genitore.figli : radici).push(voce);
  }
  const ordina = (lista: NodoAlbero[]) => {
    lista.sort((a, b) => confrontaCodici(a.nodo.codice, b.nodo.codice));
    lista.forEach((v) => ordina(v.figli));
  };
  ordina(radici);
  return radici;
}

export interface RigaVisibile {
  nodo: NodoWbs;
  profondita: number;
  haFigli: boolean;
}

/**
 * Appiattisce l'albero in un elenco ordinato di righe visibili: i figli di
 * un nodo compaiono solo se il suo codice è in `espansi`.
 */
export function appiattisciVisibile(alberi: NodoAlbero[], espansi: ReadonlySet<string>): RigaVisibile[] {
  const righe: RigaVisibile[] = [];
  const visita = (lista: NodoAlbero[], profondita: number) => {
    for (const { nodo, figli } of lista) {
      righe.push({ nodo, profondita, haFigli: figli.length > 0 });
      if (figli.length > 0 && espansi.has(nodo.codice)) visita(figli, profondita + 1);
    }
  };
  visita(alberi, 0);
  return righe;
}

/** Tutti i codici che hanno almeno un figlio (per inizializzare "tutto espanso"). */
export function codiciConFigli(nodi: NodoWbs[]): string[] {
  const genitori = new Set(nodi.map((n) => n.genitore).filter((g): g is string => g !== null));
  return [...genitori];
}
