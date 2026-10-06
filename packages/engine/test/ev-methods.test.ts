// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import { checkCadence, checkLoeShare, checkMethodChange, loeShare, measureProgress, type TaskMeasure } from "../src/index";

const task = (method: TaskMeasure["method"], extra: Partial<TaskMeasure> = {}): TaskMeasure => ({ id: "T", bac: 1000, method, ...extra });

describe("metodi di misura — regole (specifica §4)", () => {
  it("0/100: 1 solo se finito", () => {
    expect(measureProgress(task("zero_cento"), { started: true, finished: false }).pct).toBe(0);
    expect(measureProgress(task("zero_cento"), { started: true, finished: true }).pct).toBe(1);
  });

  it("50/50 e 20/80 seguono i tre stati", () => {
    expect(measureProgress(task("cinquanta_cinquanta"), { started: true, finished: false }).pct).toBe(0.5);
    expect(measureProgress(task("venti_ottanta"), { started: true, finished: false }).pct).toBe(0.2);
    expect(measureProgress(task("venti_ottanta"), { started: false, finished: false }).pct).toBe(0);
  });

  it("ev = pct × BAC del task", () => {
    expect(measureProgress(task("cinquanta_cinquanta"), { started: true, finished: false }).ev).toBe(500);
  });

  it("unità fisiche: clamp 0..1; totale zero → null con avviso", () => {
    expect(measureProgress(task("unita_fisiche"), { started: true, finished: false, unitsDone: 30, unitsTotal: 40 }).pct).toBeCloseTo(0.75, 9);
    expect(measureProgress(task("unita_fisiche"), { started: true, finished: false, unitsDone: 50, unitsTotal: 40 }).pct).toBe(1);
    const zero = measureProgress(task("unita_fisiche"), { started: true, finished: false, unitsDone: 5, unitsTotal: 0 });
    expect(zero.pct).toBeNull();
    expect(zero.warnings.map((w) => w.code)).toContain("UNITS_TOTAL_ZERO");
  });

  it("milestone pesate: somma dei pesi chiusi; pesi ≠ 100% normalizzati con avviso", () => {
    const ok = measureProgress(task("milestone_pesate"), {
      started: true,
      finished: false,
      milestones: [
        { weight: 0.4, closed: true },
        { weight: 0.6, closed: false },
      ],
    });
    expect(ok.pct).toBeCloseTo(0.4, 9);
    expect(ok.warnings).toHaveLength(0);
    const normalizzati = measureProgress(task("milestone_pesate"), {
      started: true,
      finished: false,
      milestones: [
        { weight: 2, closed: true },
        { weight: 2, closed: false },
      ],
    });
    expect(normalizzati.pct).toBeCloseTo(0.5, 9);
    expect(normalizzati.warnings.map((w) => w.code)).toContain("MILESTONE_WEIGHTS");
  });

  it("milestone assenti: null con avviso", () => {
    expect(measureProgress(task("milestone_pesate"), { started: true, finished: false }).pct).toBeNull();
  });

  it("LOE: ev = pv del task e badge di avviso", () => {
    const r = measureProgress(task("loe", { pv: 300 }), { started: true, finished: false });
    expect(r.ev).toBe(300);
    expect(r.warnings.map((w) => w.code)).toContain("LOE_NO_DELAY_SIGNAL");
  });

  it("soggettiva senza segnale indipendente: avviso; valore clampato", () => {
    const senza = measureProgress(task("soggettiva"), { started: true, finished: false, subjectivePct: 0.7 });
    expect(senza.warnings.map((w) => w.code)).toContain("SUBJECTIVE_NO_SIGNAL");
    const con = measureProgress(task("soggettiva"), { started: true, finished: false, subjectivePct: 1.5, independentSignal: true });
    expect(con.pct).toBe(1);
    expect(con.warnings).toHaveLength(0);
  });
});

describe("cambio di metodo e cadenza", () => {
  it("METHOD_CHANGED solo se il metodo cambia", () => {
    expect(checkMethodChange("T1", "zero_cento", "zero_cento")).toBeNull();
    expect(checkMethodChange("T1", "zero_cento", "loe")?.code).toBe("METHOD_CHANGED");
  });

  it("CADENCE_IRREGULAR oltre il 50% dalla mediana", () => {
    const regolari = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"];
    expect(checkCadence(regolari)).toHaveLength(0);
    const irregolare = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-02-15"];
    expect(checkCadence(irregolare).map((w) => w.code)).toContain("CADENCE_IRREGULAR");
  });

  it("LOE: quota del BAC e avviso sopra soglia", () => {
    const share = loeShare([
      { bac: 100, method: "loe" },
      { bac: 900, method: "zero_cento" },
    ]);
    expect(share).toBeCloseTo(0.1, 9);
    expect(checkLoeShare(share)).toBeNull();
    expect(checkLoeShare(0.2)?.code).toBe("LOE_SHARE");
    expect(loeShare([])).toBe(0);
  });
});
