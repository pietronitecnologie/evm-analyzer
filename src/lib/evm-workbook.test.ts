// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Vista EVM del workbook (sezione Dashboard): valori dal motore sulla fixture del libro.

import { describe, expect, it } from "vitest";

import { vistaEvmWorkbook } from "./evm-workbook";
import { fixtureWorkbook } from "./fixture-workbook";

describe("vista EVM del workbook — fixture", () => {
  const vista = vistaEvmWorkbook(fixtureWorkbook());

  it("stima: BAC 55.933,87 € con contingency e misura 48.638,15 € senza", () => {
    expect(vista).not.toBeNull();
    expect(vista!.stima.bacTotal).toBeCloseTo(55933.87, 2);
    expect(vista!.stima.direct + vista!.stima.indirect).toBeCloseTo(48638.15, 2);
    expect(vista!.etichettaBase).toBe("BAC con contingency");
    expect(vista!.baseMisura).toBeCloseTo(55933.87, 2);
    expect(vista!.nomi).toHaveLength(9);
  });

  it("checkpoint con EV zero: CPI e SPI non definiti, con il motivo", () => {
    const cp = vista!.checkpoint[0];
    expect(cp.cpi).toBeNull();
    expect(cp.cpiLight).toBe("nd");
    expect(cp.motivi.join(" ")).toContain("EV = 0");
    expect(cp.etc).toBeCloseTo(55933.87, 2);
  });

  it("agile: sprint 3 con CPI 0,9222 e costo per SP di 400 €", () => {
    const s3 = vista!.sprint[2];
    expect(s3.cpi).toBeCloseTo(0.922222, 5);
    expect(s3.costoPerSp).toBe(400);
    expect(s3.cpiLight).toBe("giallo");
  });

  it("riserve: contingency stanziata 15.000 € e incoerenza con il budget", () => {
    expect(vista!.contingenza.allocatedTotal).toBe(15000);
    expect(vista!.avvisi.join(" ")).toContain("Contingency");
  });

  it("senza attività non c'è vista", () => {
    const w = fixtureWorkbook();
    expect(vistaEvmWorkbook({ ...w, attivita: [] })).toBeNull();
  });
});
