// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import { bufferHealth, contingencyStatus, managementReserveStatus, timeBufferLeft } from "../src/index";

describe("buffer — indice di salute (§3.7)", () => {
  it("≤ 1 verde, tra 1 e 1,5 giallo, oltre 1,5 rosso", () => {
    expect(bufferHealth(40, 50).light).toBe("verde");
    expect(bufferHealth(60, 50).light).toBe("giallo");
    expect(bufferHealth(90, 50).light).toBe("rosso");
    expect(bufferHealth(60, 50).ratio).toBeCloseTo(1.2, 9);
  });

  it("completato zero: null con avviso", () => {
    const r = bufferHealth(10, 0);
    expect(r.ratio).toBeNull();
    expect(r.light).toBe("nd");
    expect(r.warnings[0].code).toBe("BUFFER_NO_PROGRESS");
  });
});

describe("contingency e management reserve", () => {
  it("fixture: contingency a budget 7.296 € contro 15.000 € stanziati → RES_CONT_MISMATCH", () => {
    const s = contingencyStatus(
      [
        { id: "R1", allocated: 10000, used: 0, usageDate: null },
        { id: "R2", allocated: 5000, used: 0, usageDate: null },
      ],
      7296,
    );
    expect(s.allocatedTotal).toBe(15000);
    expect(s.warnings.map((w) => w.code)).toContain("RES_CONT_MISMATCH");
  });

  it("nessun mismatch entro 1 €", () => {
    const s = contingencyStatus([{ id: "R1", allocated: 1000, used: 0, usageDate: null }], 1000.5);
    expect(s.warnings.map((w) => w.code)).not.toContain("RES_CONT_MISMATCH");
  });

  it("contingency usata senza rischio materializzato → RES_CONT_NO_RISK", () => {
    const senza = contingencyStatus([{ id: "R1", allocated: 1000, used: 300, usageDate: null }], 1000);
    expect(senza.warnings.map((w) => w.code)).toContain("RES_CONT_NO_RISK");
    const con = contingencyStatus([{ id: "R1", allocated: 1000, used: 300, usageDate: "2026-02-01" }], 1000);
    expect(con.warnings.map((w) => w.code)).not.toContain("RES_CONT_NO_RISK");
    expect(con.residual).toBe(700);
  });

  it("management reserve usata senza approvazione → RES_MR_UNAPPROVED", () => {
    expect(managementReserveStatus(5000, 1000, false).warnings.map((w) => w.code)).toContain("RES_MR_UNAPPROVED");
    expect(managementReserveStatus(5000, 1000, true).residual).toBe(4000);
  });

  it("buffer temporale residuo", () => {
    expect(timeBufferLeft(10, 4)).toBe(6);
  });
});
