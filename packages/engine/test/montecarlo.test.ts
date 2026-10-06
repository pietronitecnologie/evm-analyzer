// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { EngineInputError, mulberry32, nearestRank, simulateThroughput, simulateVelocity } from "../src/index";

const OPZ = { history: [20, 35, 18, 40, 25], backlog: 300, nIter: 5000, periodDays: 14, startFrom: "2026-01-05" };

describe("generatore mulberry32 (§8.1)", () => {
  it("mulberry32(42) produce 0,601104 · 0,448291 · 0,852466", () => {
    const rng = mulberry32(42);
    expect(rng().toFixed(6)).toBe("0.601104");
    expect(rng().toFixed(6)).toBe("0.448291");
    expect(rng().toFixed(6)).toBe("0.852466");
  });

  it("valori sempre in [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer(), (seme) => {
        const rng = mulberry32(seme);
        for (let i = 0; i < 20; i++) {
          const v = rng();
          if (!(v >= 0 && v < 1)) return false;
        }
        return true;
      }),
      { numRuns: 1000 },
    );
  });
});

describe("percentili nearest-rank (§8.2)", () => {
  it("P_q = valori[ceil(q·N) − 1]", () => {
    const campione = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(nearestRank(campione, 0.5)).toBe(5);
    expect(nearestRank(campione, 0.8)).toBe(8);
    expect(nearestRank(campione, 0.9)).toBe(9);
  });
});

describe("simulazione sulla velocity (§8.4)", () => {
  const r = simulateVelocity({ ...OPZ, seed: 42 });

  it("riproduce P50 = 11, P80 = 12, P90 = 13, minimo 8, massimo 16", () => {
    expect(r.p50).toBe(11);
    expect(r.p80).toBe(12);
    expect(r.p90).toBe(13);
    expect(r.min).toBe(8);
    expect(r.max).toBe(16);
  });

  it("riproduce la media 11,4112 (tolleranza 1e-4)", () => {
    expect(Math.abs(r.mean - 11.4112)).toBeLessThan(1e-4);
  });

  it("stesso seed → output identico; seed diverso → output diverso", () => {
    expect(simulateVelocity({ ...OPZ, seed: 42 }).periods).toEqual(r.periods);
    expect(simulateVelocity({ ...OPZ, seed: 43 }).periods).not.toEqual(r.periods);
  });

  it("storico costante [30,30,30], backlog 300 → P50 = P80 = P90 = 10", () => {
    const c = simulateVelocity({ history: [30, 30, 30], backlog: 300, nIter: 500, seed: 7, periodDays: 14, startFrom: "2026-01-05" });
    expect(c.p50).toBe(10);
    expect(c.p80).toBe(10);
    expect(c.p90).toBe(10);
  });

  it("istogramma, probabilità entro k e data di fine", () => {
    const totale = r.histogram.reduce((s, b) => s + b.count, 0);
    expect(totale).toBe(5000);
    expect(r.probabilityWithin(16)).toBe(1);
    expect(r.probabilityWithin(7)).toBe(0);
    expect(r.probabilityFinishBy("2026-01-05")).toBe(0);
    expect(r.probabilityFinishBy("2030-01-01")).toBe(1);
  });

  it("costo finale = AC + periodi × costo per periodo", () => {
    const c = simulateVelocity({ ...OPZ, nIter: 200, seed: 1, acSoFar: 1000, teamCostPerPeriod: 500 });
    expect(c.costs[0]).toBe(1000 + c.sortedPeriods[0] * 500);
  });

  it("errori tipizzati su storico non valido", () => {
    expect(() => simulateVelocity({ ...OPZ, history: [], seed: 1 })).toThrow(EngineInputError);
    expect(() => simulateVelocity({ ...OPZ, history: [0, 0], seed: 1 })).toThrow(EngineInputError);
    expect(() => simulateVelocity({ ...OPZ, history: [-1, 5], seed: 1 })).toThrow(EngineInputError);
  });

  it("oltre il limite di periodi per iterazione: errore", () => {
    expect(() => simulateVelocity({ ...OPZ, history: [1], backlog: 20000, nIter: 1, seed: 1 })).toThrow(EngineInputError);
  });

  it("proprietà: P50 ≤ P80 ≤ P90 per ogni seme", () => {
    fc.assert(
      fc.property(fc.integer(), (seme) => {
        const c = simulateVelocity({ history: [5, 10, 15], backlog: 100, nIter: 300, seed: seme, periodDays: 7, startFrom: "2026-01-05" });
        return c.p50 <= c.p80 && c.p80 <= c.p90;
      }),
      { numRuns: 1000 },
    );
  });
});

describe("variante throughput (§8.3)", () => {
  it("usa settimane come periodo", () => {
    const c = simulateThroughput({ history: [3, 4], backlogItems: 10, nIter: 300, seed: 3, startFrom: "2026-01-05" });
    expect(c.min).toBeGreaterThanOrEqual(3);
    expect(c.max).toBeLessThanOrEqual(4);
  });
});
