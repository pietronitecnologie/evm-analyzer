// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";

import type { NodoWbs } from "@/lib/api";
import { appiattisciVisibile, codiciConFigli, costruisciAlbero } from "./wbs-albero";

function nodo(codice: string, genitore: string | null, extra: Partial<NodoWbs> = {}): NodoWbs {
  return { id: Number(codice.replace(/\D/g, "")) || Math.random(), codice, nome: `Nodo ${codice}`, genitore, task: 0, budget: null, ...extra };
}

describe("costruisciAlbero", () => {
  it("annida i nodi secondo il campo genitore", () => {
    const piatto = [nodo("1", null), nodo("1.1", "1"), nodo("1.2", "1"), nodo("2", null)];
    const albero = costruisciAlbero(piatto);
    expect(albero.map((r) => r.nodo.codice)).toEqual(["1", "2"]);
    expect(albero[0].figli.map((f) => f.nodo.codice)).toEqual(["1.1", "1.2"]);
    expect(albero[1].figli).toEqual([]);
  });

  it("ordina per codice in modo numerico, non lessicale", () => {
    const piatto = [nodo("1", null), nodo("1.10", "1"), nodo("1.2", "1"), nodo("1.1", "1")];
    const albero = costruisciAlbero(piatto);
    expect(albero[0].figli.map((f) => f.nodo.codice)).toEqual(["1.1", "1.2", "1.10"]);
  });

  it("ordina anche le radici", () => {
    const piatto = [nodo("10", null), nodo("2", null), nodo("1", null)];
    const albero = costruisciAlbero(piatto);
    expect(albero.map((r) => r.nodo.codice)).toEqual(["1", "2", "10"]);
  });
});

describe("appiattisciVisibile", () => {
  const albero = costruisciAlbero([nodo("1", null), nodo("1.1", "1"), nodo("1.1.1", "1.1"), nodo("2", null)]);

  it("con nessun nodo espanso mostra solo le radici", () => {
    const righe = appiattisciVisibile(albero, new Set());
    expect(righe.map((r) => r.nodo.codice)).toEqual(["1", "2"]);
    expect(righe[0].haFigli).toBe(true);
    expect(righe[1].haFigli).toBe(false);
  });

  it("espandendo un nodo compaiono i suoi figli diretti, non i nipoti", () => {
    const righe = appiattisciVisibile(albero, new Set(["1"]));
    expect(righe.map((r) => r.nodo.codice)).toEqual(["1", "1.1", "2"]);
    expect(righe[1].profondita).toBe(1);
  });

  it("espandendo anche il nipote compaiono tutti i livelli", () => {
    const righe = appiattisciVisibile(albero, new Set(["1", "1.1"]));
    expect(righe.map((r) => r.nodo.codice)).toEqual(["1", "1.1", "1.1.1", "2"]);
    expect(righe[2].profondita).toBe(2);
  });
});

describe("codiciConFigli", () => {
  it("elenca solo i codici che compaiono come genitore di qualcosa", () => {
    const piatto = [nodo("1", null), nodo("1.1", "1"), nodo("2", null)];
    expect(codiciConFigli(piatto).sort()).toEqual(["1"]);
  });
});
