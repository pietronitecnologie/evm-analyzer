// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Verifica del frontend sul workbook di riferimento: il confronto col motore trova la
// contingency incoerente della fixture e la cache riproduce il BAC del file.

import { describe, expect, it } from "vitest";

import { costruisciCache, verificaWorkbook } from "./workbook";
import { fixtureWorkbook } from "./fixture-workbook";

describe("workbook — verifica col motore sulla fixture", () => {
  it("segnala la contingency incoerente (7.296 € contro 15.000 €)", () => {
    const avvisi = verificaWorkbook(fixtureWorkbook());
    const cont = avvisi.find((a) => a.codice === "XL_CONT_MISMATCH");
    expect(cont).toBeDefined();
    expect(cont!.messaggio).toContain("7295.72");
    expect(cont!.messaggio).toContain("15000.00");
  });

  it("non segnala scarti sui totali: la cache del file coincide col motore", () => {
    const avvisi = verificaWorkbook(fixtureWorkbook()).filter((a) => a.codice === "XL_CACHE_DIFF");
    expect(avvisi).toEqual([]);
  });

  it("la cache per l'export riproduce BAC 55.933,87 € e misura senza contingency 48.638,15 €", () => {
    const cache = costruisciCache(fixtureWorkbook());
    expect(cache.sintesi.bac).toBeCloseTo(55933.87, 2);
    expect(cache.sintesi.bacMisura).toBeCloseTo(48638.15, 2);
    expect(cache.righe).toHaveLength(9);
    expect(cache.buffer.stanziata).toBe(15000);
  });
});
