// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { estimateProject, EngineInputError, withDefaults, type ActivityEstimate } from "../src/index";

// Caso A della specifica (§2.4): overhead 20%, contingency 10%, 8 h/giorno.
const CASO_A: ActivityEstimate[] = [
  { id: "T1", o: 4, m: 5, p: 12, hoursPerDay: 8, hourlyCost: 50, materials: 1000, externalServices: 0 },
  { id: "T2", o: 8, m: 10, p: 18, hoursPerDay: 8, hourlyCost: 60, materials: 0, externalServices: 2000 },
  { id: "T3", o: 2, m: 3, p: 4, hoursPerDay: 8, hourlyCost: 40, materials: 500, externalServices: 0 },
];
const PARAMS = withDefaults({ overheadPct: 0.2, contingencyPct: 0.1, evBaseMode: "bac_senza_contingency" });

describe("stima — caso A (§2.4)", () => {
  const r = estimateProject(CASO_A, PARAMS);

  it("riproduce i costi diretti per attività", () => {
    expect(r.activities.map((a) => a.directCost)).toEqual([3400, 7280, 1460]);
    expect(r.activities.map((a) => a.pert)).toEqual([6, 11, 3]);
  });

  it("riproduce effort, σ di progetto e aggregati", () => {
    expect(r.effortDays).toBeCloseTo(20.0, 9);
    expect(r.sigmaProject).toBeCloseTo(2.160247, 6);
    expect(r.direct).toBeCloseTo(12140, 6);
    expect(r.indirect).toBeCloseTo(2428, 6);
    expect(r.contingency).toBeCloseTo(1456.8, 6);
    expect(r.bacTotal).toBeCloseTo(16024.8, 6);
    expect(r.bacMeasure).toBeCloseTo(14568, 6);
    expect(r.evBaseMode).toBe("bac_senza_contingency");
  });

  it("riproduce il costo di deviazione σ (convenzione in DECISIONS.md)", () => {
    expect(Math.abs(r.sigmaCost - 1160.85)).toBeLessThan(0.01);
  });

  it("calcola range di effort e di BAC a ±1σ e ±2σ", () => {
    expect(r.effortRange.high1 - r.effortDays).toBeCloseTo(r.sigmaProject, 9);
    expect(r.bacRange.high2 - r.bacTotal).toBeCloseTo(2 * r.sigmaCost, 6);
  });

  it("usa il BAC con contingency se richiesto (6-bis.1)", () => {
    const c = estimateProject(CASO_A, withDefaults({ ...PARAMS, evBaseMode: "bac_con_contingency" }));
    expect(c.bacMeasure).toBeCloseTo(c.bacTotal, 9);
  });
});

describe("stima — validazioni e casi limite", () => {
  it("O > M segnala EST_ORDER senza bloccare", () => {
    const r = estimateProject([{ ...CASO_A[0], o: 9, m: 5 }], PARAMS);
    expect(r.warnings.map((w) => w.code)).toContain("EST_ORDER");
  });

  it("valori negativi o lista vuota sono errori tipizzati", () => {
    expect(() => estimateProject([{ ...CASO_A[0], materials: -1 }], PARAMS)).toThrow(EngineInputError);
    expect(() => estimateProject([], PARAMS)).toThrow(EngineInputError);
  });

  it("tutti i valori finiti non negativi producono output finiti (proprietà)", () => {
    const attivita = fc.record({
      o: fc.double({ min: 0, max: 100, noNaN: true }),
      dm: fc.double({ min: 0, max: 100, noNaN: true }),
      dp: fc.double({ min: 0, max: 100, noNaN: true }),
      hoursPerDay: fc.double({ min: 0, max: 24, noNaN: true }),
      hourlyCost: fc.double({ min: 0, max: 500, noNaN: true }),
      materials: fc.double({ min: 0, max: 1e6, noNaN: true }),
      externalServices: fc.double({ min: 0, max: 1e6, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(attivita, { minLength: 1, maxLength: 5 }), (lista) => {
        const acts = lista.map((a, i) => ({ id: `A${i}`, o: a.o, m: a.o + a.dm, p: a.o + a.dm + a.dp, ...a }));
        const r = estimateProject(acts, PARAMS);
        const numeri = [r.effortDays, r.sigmaProject, r.bacTotal, r.bacMeasure, r.sigmaCost];
        return numeri.every((v) => Number.isFinite(v));
      }),
      { numRuns: 1000 },
    );
  });
});
