// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import { checkWipLimits, cumulativeFlow, diagnoseWip, littleCycleTime, littleLaw, littleWip, throughputPerPeriod } from "../src/index";

describe("Legge di Little (§9)", () => {
  it("WIP 12 e throughput 3 item/settimana → cycle time 4 settimane", () => {
    expect(littleCycleTime(12, 3)).toBe(4);
    expect(littleLaw({ wip: 12, throughput: 3 })).toBe(4);
    expect(littleWip(3, 4)).toBe(12);
  });

  it("throughput zero → cycle time null", () => {
    expect(littleCycleTime(12, 0)).toBeNull();
    expect(littleLaw({ wip: 12, throughput: 0 })).toBeNull();
  });

  it("calcola il WIP dai due altri valori", () => {
    expect(littleLaw({ throughput: 2, cycleTime: 5 })).toBe(10);
    expect(littleLaw({})).toBeNull();
  });
});

describe("CFD e throughput (§9)", () => {
  const istantanee = [
    { date: "2026-01-05", backlog: 10, inProgress: 0, done: 0 },
    { date: "2026-01-12", backlog: 6, inProgress: 3, done: 1 },
    { date: "2026-01-19", backlog: 4, inProgress: 2, done: 4 },
  ];

  it("serie cumulate per stato", () => {
    const c = cumulativeFlow(istantanee);
    expect(c[1]).toEqual({ date: "2026-01-12", todoCum: 10, startedCum: 4, doneCum: 1 });
  });

  it("throughput per periodo = Δ done", () => {
    expect(throughputPerPeriod(istantanee)).toEqual([1, 3]);
  });
});

describe("diagnosi WIP eccessivo (§9)", () => {
  it("cycle time in crescita di oltre il 20% con throughput stabile → FLOW_WIP_EXCESS", () => {
    const finestre = [
      { throughput: 3, cycleTime: 4 },
      { throughput: 3, cycleTime: 4.1 },
      { throughput: 3, cycleTime: 6 },
      { throughput: 3.1, cycleTime: 6.2 },
    ];
    expect(diagnoseWip(finestre)?.code).toBe("FLOW_WIP_EXCESS");
  });

  it("throughput in calo → nessuna diagnosi di WIP", () => {
    const finestre = [
      { throughput: 5, cycleTime: 4 },
      { throughput: 5, cycleTime: 4 },
      { throughput: 2, cycleTime: 9 },
      { throughput: 2, cycleTime: 9 },
    ];
    expect(diagnoseWip(finestre)).toBeNull();
  });

  it("dati insufficienti → nessuna diagnosi", () => {
    expect(diagnoseWip([{ throughput: 1, cycleTime: 1 }])).toBeNull();
  });
});

describe("limiti WIP (§9)", () => {
  it("FLOW_WIP_LIMIT per ogni stato oltre il limite", () => {
    const avvisi = checkWipLimits({ inProgress: 5, review: 1 }, { inProgress: 4, review: 2 });
    expect(avvisi.map((w) => w.code)).toEqual(["FLOW_WIP_LIMIT"]);
  });
});
