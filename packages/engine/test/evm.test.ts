// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { addDays, burnRate, evm, forecastAccuracy, light, normalizePvCurve, pvAt, rollup } from "../src/index";

const P = { greenThreshold: 0.95, yellowThreshold: 0.85 };
const finito = fc.double({ min: 0, max: 1e7, noNaN: true });

describe("EVM — test numerico di riferimento (§3.6)", () => {
  const r = evm({ bac: 100000, pv: 40000, ev: 35000, ac: 42000 }, P);

  it("riproduce varianze e indici", () => {
    expect(r.cv).toBe(-7000);
    expect(r.sv).toBe(-5000);
    expect(r.cpi).toBeCloseTo(0.833333, 6);
    expect(r.spi).toBeCloseTo(0.875, 9);
  });

  it("riproduce EAC, VAC e TCPI", () => {
    expect(r.etc).toBeCloseTo(78000, 6);
    expect(r.eac).toBeCloseTo(120000, 6);
    expect(r.eacOptimistic).toBeCloseTo(107000, 6);
    expect(r.eacLinear).toBeCloseTo(120000, 6);
    expect(r.vac).toBeCloseTo(-20000, 6);
    expect(r.tcpi).toBeCloseTo(1.12069, 5);
    expect(r.etcFallback).toBe(false);
  });

  it("assegna i semafori con le soglie di default", () => {
    expect(r.cpiLight).toBe("rosso");
    expect(r.spiLight).toBe("giallo");
  });
});

describe("EVM — casi limite (§3.6)", () => {
  it("ev = 0: CPI null, ETC a ritmo di piano con avviso", () => {
    const r = evm({ bac: 100, pv: 10, ev: 0, ac: 5 }, P);
    expect(r.cpi).toBeNull();
    expect(r.etc).toBe(100);
    expect(r.etcFallback).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain("EVM_NO_CPI");
    expect(r.eacLinear).toBeNull();
  });

  it("ac = 0: CPI null", () => {
    expect(evm({ bac: 100, pv: 10, ev: 5, ac: 0 }, P).cpi).toBeNull();
  });

  it("bac = ac: TCPI null", () => {
    expect(evm({ bac: 50, pv: 50, ev: 40, ac: 50 }, P).tcpi).toBeNull();
  });

  it("pv = 0: SPI null", () => {
    expect(evm({ bac: 100, pv: 0, ev: 5, ac: 5 }, P).spi).toBeNull();
  });

  it("tutti i valori a zero: nessuna eccezione e nessun NaN", () => {
    const r = evm({ bac: 0, pv: 0, ev: 0, ac: 0 }, P);
    expect(r.cpi).toBeNull();
    expect(r.spi).toBeNull();
    expect(Number.isNaN(r.eac)).toBe(false);
  });

  it("light() assegna nd per null e i colori per soglia", () => {
    expect(light(null, P)).toBe("nd");
    expect(light(0.95, P)).toBe("verde");
    expect(light(0.85, P)).toBe("giallo");
    expect(light(0.84, P)).toBe("rosso");
  });
});

describe("EVM — proprietà (1.000 casi)", () => {
  const input = fc.record({ bac: finito, pv: finito, ev: finito, ac: finito });

  it("nessun output è NaN o Infinity", () => {
    fc.assert(
      fc.property(input, (i) => {
        const r = evm(i, P);
        const valori = [r.cv, r.sv, r.etc, r.eac, r.eacOptimistic, r.vac];
        const opzionali = [r.cpi, r.spi, r.eacLinear, r.tcpi].filter((v): v is number => v !== null);
        return [...valori, ...opzionali].every((v) => Number.isFinite(v));
      }),
      { numRuns: 1000 },
    );
  });

  it("per cpi non nullo: eacLinear = eac (identità)", () => {
    fc.assert(
      fc.property(input, (i) => {
        const r = evm(i, P);
        if (r.cpi === null || r.eacLinear === null) return true;
        // Tolleranza sulla scala dei termini (AC, BAC): la cancellazione in virgola mobile
        // può lasciare residui assoluti proporzionali ai termini, non a eac.
        const scala = Math.max(1, Math.abs(r.eac), Math.abs(i.ac), Math.abs(i.bac));
        return Math.abs(r.eacLinear - r.eac) <= 1e-9 * scala;
      }),
      { numRuns: 1000 },
    );
  });

  it("per cpi non nullo: cpi × ac = ev", () => {
    fc.assert(
      fc.property(input, (i) => {
        const r = evm(i, P);
        if (r.cpi === null) return true;
        return Math.abs(r.cpi * i.ac - i.ev) <= 1e-6 * Math.max(1, i.ev);
      }),
      { numRuns: 1000 },
    );
  });

  it("rollup: la somma dei gruppi uguaglia il totale", () => {
    const misure = fc.array(input, { minLength: 1, maxLength: 20 });
    fc.assert(
      fc.property(misure, (lista) => {
        const items = lista.map((m, i) => ({ ...m, wbs: i % 3 }));
        const gruppi = rollup(items, (x) => String(x.wbs), P);
        const cvTotale = items.reduce((s, x) => s + (x.ev - x.ac), 0);
        const cvGruppi = [...gruppi.values()].reduce((s, g) => s + g.cv, 0);
        return Math.abs(cvGruppi - cvTotale) <= 1e-6 * Math.max(1, Math.abs(cvTotale));
      }),
      { numRuns: 500 },
    );
  });

  it("pvAt è monotona non decrescente nella data", () => {
    const curva = [
      { date: "2026-01-01", cumulative: 0 },
      { date: "2026-02-01", cumulative: 40 },
      { date: "2026-04-01", cumulative: 100 },
    ];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 }), (a, b) => {
        const da = addDays("2026-01-01", Math.min(a, b));
        const db = addDays("2026-01-01", Math.max(a, b));
        return pvAt(curva, da) <= pvAt(curva, db) + 1e-9;
      }),
      { numRuns: 1000 },
    );
  });
});

describe("EVM — altri indicatori e curva PV", () => {
  it("burn rate e forecast accuracy con i casi nulli", () => {
    expect(burnRate(100, 0)).toBeNull();
    expect(burnRate(100, 50)).toBe(2);
    expect(forecastAccuracy(120, 0)).toBeNull();
    expect(forecastAccuracy(110, 100)).toBeCloseTo(0.9, 9);
  });

  it("curva non monotona: avviso e massimo cumulato forzato", () => {
    const { curve, warnings } = normalizePvCurve([
      { date: "2026-01-01", cumulative: 0 },
      { date: "2026-02-01", cumulative: 50 },
      { date: "2026-03-01", cumulative: 40 },
    ]);
    expect(warnings.map((w) => w.code)).toContain("PV_NOT_MONOTONIC");
    expect(curve[2].cumulative).toBe(50);
  });

  it("pvAt: prima del primo punto 0, dopo l'ultimo l'ultimo valore, in mezzo interpolato", () => {
    const curva = [
      { date: "2026-01-01", cumulative: 0 },
      { date: "2026-01-11", cumulative: 100 },
    ];
    expect(pvAt(curva, "2025-12-31")).toBe(0);
    expect(pvAt(curva, "2026-01-06")).toBeCloseTo(50, 9);
    expect(pvAt(curva, "2027-01-01")).toBe(100);
    expect(pvAt([], "2026-01-01")).toBe(0);
  });
});

