// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Snapshot di regressione (specifica §12.2.6): i risultati di riferimento sono in
// test/fixtures/golden.json. Il file non si rigenera da solo: cambiarlo richiede
// una decisione esplicita registrata in DECISIONS.md.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { earnedSchedulePoints, estimateProject, evm, mulberry32, simulateVelocity, withDefaults } from "../src/index";

const golden = JSON.parse(readFileSync(resolve(__dirname, "fixtures/golden.json"), "utf8")) as Record<string, number>;

function risultati(): Record<string, number> {
  const caso = estimateProject(
    [
      { id: "T1", o: 4, m: 5, p: 12, hoursPerDay: 8, hourlyCost: 50, materials: 1000, externalServices: 0 },
      { id: "T2", o: 8, m: 10, p: 18, hoursPerDay: 8, hourlyCost: 60, materials: 0, externalServices: 2000 },
      { id: "T3", o: 2, m: 3, p: 4, hoursPerDay: 8, hourlyCost: 40, materials: 500, externalServices: 0 },
    ],
    withDefaults({ overheadPct: 0.2, contingencyPct: 0.1 }),
  );
  const e = evm({ bac: 100000, pv: 40000, ev: 35000, ac: 42000 }, withDefaults({}));
  const curva = [0, 5, 12, 22, 35, 50, 65, 78, 88, 95, 100].map((pv, t) => ({ t, pv }));
  const es = earnedSchedulePoints(curva, 40, 100, 5, 10);
  const mc = simulateVelocity({ history: [20, 35, 18, 40, 25], backlog: 300, nIter: 5000, seed: 42, periodDays: 14, startFrom: "2026-01-05" });
  return {
    caso_a_bac_totale: caso.bacTotal,
    caso_a_bac_misura: caso.bacMeasure,
    caso_a_sigma_costo: caso.sigmaCost,
    evm_cpi: e.cpi as number,
    evm_spi: e.spi as number,
    evm_eac: e.eac,
    evm_eac_lineare: e.eacLinear as number,
    evm_tcpi: e.tcpi as number,
    es_ev40: es.es,
    es_ieac_ev40: es.ieacT as number,
    mc_p50: mc.p50,
    mc_p80: mc.p80,
    mc_p90: mc.p90,
    mc_media: mc.mean,
    rng_primo: Number(mulberry32(42)().toFixed(6)),
  };
}

describe("snapshot di regressione (golden.json)", () => {
  const attuali = risultati();
  for (const chiave of Object.keys(golden)) {
    it(`${chiave} coincide con il riferimento`, () => {
      expect(attuali[chiave]).toBeCloseTo(golden[chiave], 6);
    });
  }
  it("il riferimento copre tutti i risultati attesi", () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(attuali).sort());
  });
});
