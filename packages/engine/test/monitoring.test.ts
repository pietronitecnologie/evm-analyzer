// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";

import { allocaBudgetTask, monitoraggioEvm, pvLineareTask, type MonTask, type MonWbs } from "../src/index";

const P = { greenThreshold: 0.95, yellowThreshold: 0.85 };
const task = (uid: string, wbs: string, costo: number, start: string, finish: string): MonTask => ({
  uid, wbs, riepilogo: false, start, finish, costoBaseline: costo,
});

describe("allocazione del budget ai task", () => {
  it("ripartisce il budget del nodo in proporzione al costo di baseline", () => {
    const { budgetTask, warnings } = allocaBudgetTask(
      [{ codice: "2.1", budget: 1000 }],
      [task("A", "2.1", 300, "2026-01-01", "2026-01-05"), task("B", "2.1", 100, "2026-01-01", "2026-01-05")],
    );
    expect(budgetTask.A).toBeCloseTo(750, 9);
    expect(budgetTask.B).toBeCloseTo(250, 9);
    expect(warnings).toHaveLength(0);
  });

  it("costo di baseline zero: ripartizione in parti uguali", () => {
    const { budgetTask } = allocaBudgetTask(
      [{ codice: "2.1", budget: 900 }],
      [task("A", "2.1", 0, "2026-01-01", "2026-01-05"), task("B", "2.1", 0, "2026-01-01", "2026-01-05"), task("C", "2.1", 0, "2026-01-01", "2026-01-05")],
    );
    expect(budgetTask.A).toBe(300);
    expect(budgetTask.C).toBe(300);
  });

  it("nodo con task senza budget: avviso e budget zero; budget senza task: avviso", () => {
    const wbs: MonWbs[] = [{ codice: "2.1", budget: null }, { codice: "9", budget: 500 }];
    const { budgetTask, warnings } = allocaBudgetTask(wbs, [task("A", "2.1", 10, "2026-01-01", "2026-01-05")]);
    expect(budgetTask.A).toBe(0);
    expect(warnings.map((w) => w.code)).toEqual(["WBS_NO_BUDGET", "WBS_BUDGET_UNALLOCABLE"]);
  });

  it("i riepiloghi non ricevono budget", () => {
    const riepilogo: MonTask = { ...task("R", "2", 10, "2026-01-01", "2026-01-05"), riepilogo: true };
    const { budgetTask } = allocaBudgetTask([{ codice: "2", budget: 100 }], [riepilogo]);
    expect(budgetTask.R).toBeUndefined();
  });
});

describe("PV lineare", () => {
  it("frazione della durata pianificata trascorsa, limitata a [0, 1]", () => {
    expect(pvLineareTask(100, "2026-01-01", "2026-01-11", "2026-01-06")).toBeCloseTo(50, 9);
    expect(pvLineareTask(100, "2026-01-01", "2026-01-11", "2025-12-01")).toBe(0);
    expect(pvLineareTask(100, "2026-01-01", "2026-01-11", "2027-01-01")).toBe(100);
  });

  it("task senza date o di durata nulla", () => {
    expect(pvLineareTask(100, null, null, "2026-01-01")).toBe(0);
    expect(pvLineareTask(100, "2026-01-05", "2026-01-05", "2026-01-04")).toBe(0);
    expect(pvLineareTask(100, "2026-01-05", "2026-01-05", "2026-01-05")).toBe(100);
  });
});

describe("serie di monitoraggio", () => {
  // Due nodi: 2.1 (budget 1.000, un task) e 2.2 (budget 500, un task). BAC 1.500.
  const wbs: MonWbs[] = [{ codice: "2.1", budget: 1000 }, { codice: "2.2", budget: 500 }];
  const tasks = [task("A", "2.1", 1, "2026-01-01", "2026-01-11"), task("B", "2.2", 1, "2026-01-01", "2026-01-11")];

  it("EV, AC, PV e indici a ogni data di stato, con dettaglio per WBS", () => {
    const r = monitoraggioEvm(wbs, tasks, [
      { date: "2026-01-06", righe: [{ uid: "A", pct: 0.4, ac: 500 }, { uid: "B", pct: 0.2, ac: 300 }] },
    ], P);
    expect(r.bac).toBe(1500);
    const p = r.punti[0];
    expect(p.pv).toBeCloseTo(0.5 * 1500, 6);
    expect(p.ev).toBeCloseTo(0.4 * 1000 + 0.2 * 500, 6);
    expect(p.ac).toBe(800);
    expect(p.evm.cpi).toBeCloseTo(500 / 800, 9);
    // Nodo 2.1: EV 400, AC 500 → CV −100. Nodo 2.2: EV 100, AC 300 → CPI 1/3.
    expect(p.perWbs["2.1"].cv).toBeCloseTo(-100, 6);
    expect(p.perWbs["2.2"].cpi).toBeCloseTo(1 / 3, 9);
    expect(p.perWbsMisure["2.1"]).toEqual({ bac: 1000, pv: 500, ev: 400, ac: 500 });
  });

  it("i punti sono ordinati per data e un progetto senza avanzamenti ha EV zero", () => {
    const r = monitoraggioEvm(wbs, tasks, [
      { date: "2026-01-11", righe: [] },
      { date: "2026-01-06", righe: [] },
    ], P);
    expect(r.punti.map((p) => p.date)).toEqual(["2026-01-06", "2026-01-11"]);
    expect(r.punti[0].ev).toBe(0);
    expect(r.punti[0].evm.cpi).toBeNull();
  });
});
