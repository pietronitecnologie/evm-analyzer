// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { earnedSchedule, earnedSchedulePoints } from "../src/index";

// Curva di riferimento della specifica §5: periodi di 1, AT = 5, PD = 10, BAC = 100.
const CURVA = [0, 5, 12, 22, 35, 50, 65, 78, 88, 95, 100].map((pv, t) => ({ t, pv }));
const es = (ev: number) => earnedSchedulePoints(CURVA, ev, 100, 5, 10);

describe("Earned Schedule — riferimento (§5)", () => {
  it("ev = 35: ES = 4, SPI(t) = 0,8, SV(t) = −1", () => {
    const r = es(35);
    expect(r.es).toBeCloseTo(4, 9);
    expect(r.spiT).toBeCloseTo(0.8, 9);
    expect(r.svT).toBeCloseTo(-1, 9);
  });

  it("ev = 40: ES = 4,333333, SPI(t) = 0,866667, SV(t) = −0,666667, IEAC(t) = 11,538462", () => {
    const r = es(40);
    expect(r.es).toBeCloseTo(4.333333, 6);
    expect(r.spiT).toBeCloseTo(0.866667, 6);
    expect(r.svT).toBeCloseTo(-0.666667, 6);
    expect(r.ieacT).toBeCloseTo(11.538462, 6);
  });

  it("ev = 0 → ES = 0; ev = bac → ES = PD", () => {
    expect(es(0).es).toBe(0);
    expect(es(100).es).toBe(10);
  });
});

describe("Earned Schedule — su date di calendario", () => {
  it("calcola AT, PD, SPI(t) e data di fine stimata", () => {
    const r = earnedSchedule({
      pvCurve: [
        { date: "2026-01-01", cumulative: 0 },
        { date: "2026-01-11", cumulative: 100 },
      ],
      ev: 50,
      bac: 100,
      statusDate: "2026-01-06",
      startDate: "2026-01-01",
      plannedEndDate: "2026-01-11",
    });
    expect(r.at).toBe(5);
    expect(r.pd).toBe(10);
    expect(r.es).toBeCloseTo(5, 9);
    expect(r.spiT).toBeCloseTo(1, 9);
    expect(r.estimatedFinish).toBe("2026-01-11");
  });

  it("SPI(t) null se AT = 0", () => {
    const r = earnedSchedule({
      pvCurve: [
        { date: "2026-01-01", cumulative: 0 },
        { date: "2026-01-11", cumulative: 100 },
      ],
      ev: 10,
      bac: 100,
      statusDate: "2026-01-01",
      startDate: "2026-01-01",
      plannedEndDate: "2026-01-11",
    });
    expect(r.spiT).toBeNull();
    expect(r.ieacT).toBeNull();
    expect(r.estimatedFinish).toBeNull();
  });
});

describe("Earned Schedule — proprietà", () => {
  it("ES non decresce al crescere di ev e resta in [0, PD]", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), fc.double({ min: 0, max: 100, noNaN: true }), (a, b) => {
        const [piccolo, grande] = a <= b ? [a, b] : [b, a];
        const ra = es(piccolo).es;
        const rb = es(grande).es;
        return ra <= rb + 1e-9 && ra >= 0 && rb <= 10 + 1e-9;
      }),
      { numRuns: 1000 },
    );
  });
});
