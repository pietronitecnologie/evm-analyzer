// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Test sulla fixture Excel del libro (specifica §12.2.2): i dati di ingresso
// vengono letti dal file, non copiati come costanti.

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { agileMetrics, checkQ010, daysToIso, estimateProject, withDefaults, type ActivityEstimate, type SprintInput } from "../src/index";
import { leggiWorkbook, type CellValue } from "./helpers/xlsx";

const FIXTURE = resolve(__dirname, "../../../fixtures/Parte_III_Gestione_Progetti.xlsx");
const wb = leggiWorkbook(FIXTURE);
const parametri = wb["Parametri"];
const wbs = wb["WBS e Stima Costi"];
const agile = wb["Agile - Velocity"];
const num = (foglio: Record<string, CellValue>, ref: string): number => {
  const v = foglio[ref];
  if (typeof v !== "number") throw new Error(`cella ${ref} non numerica: ${v}`);
  return v;
};

// Righe di attività: 4..12 (la 13 è vuota). Colonne: F=O, G=M, H=P, E=CostoOrario, K=OreGiorno, N=Materiali, O=Servizi.
const attivita: ActivityEstimate[] = [];
for (let r = 4; r <= 12; r++) {
  attivita.push({
    id: String(wbs[`A${r}`]),
    o: num(wbs, `F${r}`),
    m: num(wbs, `G${r}`),
    p: num(wbs, `H${r}`),
    hoursPerDay: num(wbs, `K${r}`),
    hourlyCost: num(wbs, `E${r}`),
    materials: num(wbs, `N${r}`),
    externalServices: num(wbs, `O${r}`),
  });
}
const params = withDefaults({
  overheadPct: num(parametri, "B6"),
  contingencyPct: num(parametri, "B7"),
  mgmtReservePct: num(parametri, "B8"),
  evBaseMode: "bac_con_contingency",
  teamCostPerSprint: num(parametri, "B21"),
  sprintDays: num(parametri, "B20"),
  velocityWindow: num(parametri, "B22"),
});

describe("fixture Excel — stima (§12.2.2)", () => {
  const r = estimateProject(attivita, params);

  it("legge nove attività e i parametri di overhead, contingency e riserva", () => {
    expect(attivita).toHaveLength(9);
    expect(params.overheadPct).toBeCloseTo(0.1, 12);
    expect(params.contingencyPct).toBeCloseTo(0.15, 12);
    expect(params.mgmtReservePct).toBeCloseTo(0.05, 12);
  });

  it("BAC = 55.933,87 € (con contingency, come nel workbook)", () => {
    expect(r.bacTotal).toBeCloseTo(num(wbs, "B31"), 2);
    expect(r.bacTotal).toBeCloseTo(55933.87, 2);
  });

  it("BAC di misura senza contingency = 48.638,15 €", () => {
    expect(r.direct + r.indirect).toBeCloseTo(num(wbs, "B29"), 2);
    expect(r.direct + r.indirect).toBeCloseTo(48638.15, 2);
  });

  it("contingency = 15% di 48.638,15 € = 7.295,72 €", () => {
    expect(r.contingency).toBeCloseTo(num(wbs, "B30"), 2);
  });

  it("effort = 77,17 gg-persona e σ di progetto = 2,06", () => {
    expect(r.effortDays).toBeCloseTo(num(wbs, "B24"), 6);
    expect(r.effortDays).toBeCloseTo(77.17, 2);
    expect(r.sigmaProject).toBeCloseTo(num(wbs, "B25"), 6);
    expect(r.sigmaProject).toBeCloseTo(2.06, 2);
  });

  it("riserva di gestione = BAC × 5% e budget approvato = BAC + riserva", () => {
    expect(r.mgmtReserve).toBeCloseTo(num(wbs, "B32"), 2);
    expect(r.budgetApproved).toBeCloseTo(num(wbs, "B33"), 2);
  });
});

describe("fixture Excel — agile (§12.2.2, §7.4)", () => {
  const sprint: SprintInput[] = [];
  for (let r = 5; r <= 7; r++) {
    sprint.push({
      index: r - 4,
      spPlanned: num(agile, `D${r}`),
      spCompleted: num(agile, `E${r}`),
      cost: num(agile, `H${r}`),
    });
  }
  const r = agileMetrics(sprint, params, 210);
  const s3 = r.perSprint[2];

  it("sprint 3: SP cumulati 83, EV 33.200 €, AC 36.000 €, CPI = SPI = 0,922222", () => {
    expect(s3.spCum).toBe(83);
    expect(s3.ev).toBeCloseTo(33200, 6);
    expect(s3.ac).toBeCloseTo(36000, 6);
    expect(s3.pv).toBeCloseTo(36000, 6);
    expect(s3.cpi).toBeCloseTo(0.922222, 6);
    expect(s3.spi).toBeCloseTo(0.922222, 6);
  });

  it("costo per SP di baseline 400 €/SP, non il 433,73 € del template circolare", () => {
    expect(r.costPerSp).toBe(400);
    expect(num(agile, "I7")).toBeCloseTo(433.7349, 3);
  });
});

// Date seriali Excel (giorni dal 1899-12-30) convertite in ISO: 25569 = giorni fino al 1970-01-01.
const seriale = (v: number) => daysToIso(v - 25569);

describe("fixture Excel — coerenza tra fogli (§5, Q010)", () => {
  it("inizio parametri diverso dall'inizio WBS nel workbook: Q010", () => {
    const inizioParametri = seriale(num(parametri, "B15"));
    const inizioWbs = seriale(num(wbs, "S4"));
    expect(inizioParametri).toBe("2027-01-01");
    expect(inizioWbs).toBe("2026-01-01");
    expect(checkQ010(inizioParametri, inizioWbs).map((a) => a.code)).toEqual(["Q010"]);
  });
});
