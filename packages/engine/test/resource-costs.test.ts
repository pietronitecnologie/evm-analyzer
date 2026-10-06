// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";

import { acDaOre, costoPianificatoAssegnazione, tariffaMediaPonderata } from "../src/index";

describe("costi delle risorse", () => {
  it("costo pianificato = unità × ore × tariffa", () => {
    // Un ingegnere al 50% per 40 ore a 60 €/h.
    expect(costoPianificatoAssegnazione(0.5, 40, 60)).toBe(1200);
  });

  it("tariffa media ponderata per unità", () => {
    const media = tariffaMediaPonderata([
      { unita: 1, tariffa: 60 },
      { unita: 0.5, tariffa: 30 },
    ]);
    expect(media).toBeCloseTo((60 + 15) / 1.5, 9);
  });

  it("nessuna unità assegnata: tariffa media e AC non definiti", () => {
    expect(tariffaMediaPonderata([])).toBeNull();
    expect(acDaOre(10, [])).toBeNull();
  });

  it("AC da ore consuntive: ore × tariffa media", () => {
    expect(acDaOre(20, [{ unita: 1, tariffa: 40 }])).toBe(800);
    expect(acDaOre(null, [{ unita: 1, tariffa: 40 }])).toBeNull();
    expect(acDaOre(-1, [{ unita: 1, tariffa: 40 }])).toBeNull();
  });
});
