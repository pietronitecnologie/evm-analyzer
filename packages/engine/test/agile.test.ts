// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import { agileMetrics, baselineCostPerSp, velocityAverage, withDefaults, type SprintInput } from "../src/index";

// Fixture della specifica §7: 12.000 € per sprint, 30 SP pianificati per sprint → 400 €/SP.
const PARAMS = withDefaults({
  teamCostPerSprint: 12000,
  plannedSpPerSprint: 30,
  velocityWindow: 3,
  sprintDays: 14,
});
// Sprint di test costruiti perché allo sprint 3 valgano 83 SP completati e 36.000 € di AC.
const SPRINT: SprintInput[] = [
  { index: 1, spCompleted: 27, spPlanned: 30, cost: 12000 },
  { index: 2, spCompleted: 26, spPlanned: 30, cost: 12000 },
  { index: 3, spCompleted: 30, spPlanned: 30, cost: 12000 },
];

describe("agile — costo per SP non circolare (§6-bis.2)", () => {
  it("12.000 ÷ 30 = 400 €/SP", () => {
    const c = baselineCostPerSp(PARAMS);
    expect(c.value).toBe(400);
    expect(c.derived).toBe(true);
  });

  it("baselineCostPerSp esplicito prevale senza avviso", () => {
    const c = baselineCostPerSp(withDefaults({ ...PARAMS, baselineCostPerSp: 420 }));
    expect(c).toEqual({ value: 420, derived: false, warnings: [] });
  });

  it("parametro assente: deriva dal primo sprint con avviso", () => {
    const c = baselineCostPerSp(withDefaults({ plannedSpPerSprint: 0, teamCostPerSprint: 0 }), SPRINT[0]);
    expect(c.value).toBe(12000 / 30);
    expect(c.warnings.map((w) => w.code)).toContain("AGILE_COST_PER_SP_DERIVED");
  });

  it("nessun dato per derivare il costo: errore", () => {
    expect(() => baselineCostPerSp(withDefaults({ plannedSpPerSprint: 0 }))).toThrow();
  });
});

describe("agile — sprint 3 (§7.4)", () => {
  const r = agileMetrics(SPRINT, PARAMS, 210);
  const s3 = r.perSprint[2];

  it("riproduce EV, PV, AC e indici dello sprint 3", () => {
    expect(s3.spCum).toBe(83);
    expect(s3.ev).toBeCloseTo(33200, 6);
    expect(s3.pv).toBeCloseTo(36000, 6);
    expect(s3.ac).toBe(36000);
    expect(s3.cpi).toBeCloseTo(0.922222, 6);
    expect(s3.spi).toBeCloseTo(0.922222, 6);
  });

  it("non è circolare: il CPI agile non vale 1", () => {
    expect(s3.cpi).not.toBeCloseTo(1, 3);
  });
});

describe("agile — velocity e forecast (§7.3)", () => {
  it("media delle ultime N velocity: [28, 26, 31] → 28,3333", () => {
    expect(velocityAverage([28, 26, 31], 3).avg).toBeCloseTo(28.333333, 5);
  });

  it("backlog 210 → sprint residui 7,411765; costo e tempo del forecast", () => {
    const r = agileMetrics(
      [
        { index: 1, spCompleted: 28, spPlanned: 30, cost: 12000 },
        { index: 2, spCompleted: 26, spPlanned: 30, cost: 12000 },
        { index: 3, spCompleted: 31, spPlanned: 30, cost: 12000 },
      ],
      PARAMS,
      210,
    );
    expect(r.sprintRemaining).toBeCloseTo(7.411765, 6);
    expect(r.sprintRemainingCeil).toBe(8);
    expect(r.eacTimeDays).toBeCloseTo((210 / (85 / 3)) * 14, 9);
    expect(r.eacCost).toBeCloseTo((210 / (85 / 3)) * 12000 + 36000, 6);
  });

  it("finestra più lunga degli sprint disponibili: VEL_SHORT", () => {
    expect(velocityAverage([10], 3).warnings.map((w) => w.code)).toContain("VEL_SHORT");
  });

  it("velocity media zero: forecast null con avviso", () => {
    const r = agileMetrics([{ index: 1, spCompleted: 0, spPlanned: 30, cost: 12000 }], PARAMS, 100);
    expect(r.sprintRemaining).toBeNull();
    expect(r.eacCost).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain("VEL_ZERO");
  });

  it("nessuno sprint: velocity media null", () => {
    expect(velocityAverage([], 3).avg).toBeNull();
  });
});
