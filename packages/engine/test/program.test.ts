// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import { checkGate, programRollup, withDefaults, type Workstream } from "../src/index";

const P = withDefaults({});
const COSTRUZIONE: Workstream = {
  name: "Costruzione",
  kind: "costruzione",
  rows: [{ bac: 60000, pv: 52000, ev: 50000, ac: 55000, loe: false }],
};
const SOFTWARE: Workstream = {
  name: "Software",
  kind: "software",
  variableScope: true,
  rows: [{ bac: 40000, pv: 36000, ev: 33200, ac: 36000, loe: false }],
};

describe("programma — riferimento (§10)", () => {
  const r = programRollup([COSTRUZIONE, SOFTWARE], [], P);

  it("somma EV, AC e PV dei filoni", () => {
    expect(r.evProgram).toBe(83200);
    expect(r.acProgram).toBe(91000);
    expect(r.pvProgram).toBe(88000);
  });

  it("indici di programma sulle somme", () => {
    expect(r.cpiProgram).toBeCloseTo(0.914286, 6);
    expect(r.spiProgram).toBeCloseTo(0.945455, 6);
  });

  it("contributi per filone alle quote di EV e AC", () => {
    const c = r.workstreams.find((w) => w.name === "Costruzione")!;
    expect(c.evShare).toBeCloseTo(50000 / 83200, 9);
    expect(c.acShare).toBeCloseTo(55000 / 91000, 9);
  });
});

describe("programma — LOE e soglia (§3.5, §10)", () => {
  it("quota LOE oltre soglia: SPI del filone senza LOE, con avviso", () => {
    const filone: Workstream = {
      name: "Automazione",
      kind: "automazione",
      rows: [
        { bac: 300, pv: 100, ev: 100, ac: 100, loe: true },
        { bac: 700, pv: 200, ev: 150, ac: 180, loe: false },
      ],
    };
    const r = programRollup([filone], [], P);
    const w = r.workstreams[0];
    expect(w.loeShare).toBeCloseTo(0.3, 9);
    expect(w.spiExLoe).toBeCloseTo(150 / 200, 9);
    expect(r.warnings.map((x) => x.code)).toContain("LOE_SHARE");
  });

  it("quota LOE sotto soglia: nessun esclusione", () => {
    const filone: Workstream = {
      name: "Misto",
      kind: "altro",
      rows: [
        { bac: 100, pv: 10, ev: 10, ac: 10, loe: true },
        { bac: 900, pv: 200, ev: 150, ac: 180, loe: false },
      ],
    };
    const w = programRollup([filone], [], P).workstreams[0];
    expect(w.spiExLoe).toBeCloseTo(160 / 210, 9);
  });
});

describe("gate tra filoni (§10, §3.9.7)", () => {
  const gate = { fromWorkstream: "Software", toWorkstream: "Costruzione", dueDate: "2026-06-30", bufferDays: 5 };

  it("consegna prevista oltre il gate di più del buffer → GATE_NO_BUFFER", () => {
    expect(checkGate(gate, "2026-07-20", true)?.code).toBe("GATE_NO_BUFFER");
  });

  it("buffer che copre il ritardo: nessun avviso", () => {
    expect(checkGate(gate, "2026-07-03", true)).toBeNull();
  });

  it("scope fisso o consegna in anticipo: nessun avviso", () => {
    expect(checkGate(gate, "2026-07-20", false)).toBeNull();
    expect(checkGate(gate, "2026-06-01", true)).toBeNull();
  });

  it("programRollup verifica il gate con la data prevista del filone", () => {
    const r = programRollup([SOFTWARE], [gate], P, { Software: "2026-08-01" });
    expect(r.warnings.map((w) => w.code)).toContain("GATE_NO_BUFFER");
  });
});
