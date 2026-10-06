// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";

import { GLOSSARIO_EVM } from "./glossario-evm";

describe("glossario EVM", () => {
  it("spiega tutte le sigle mostrate nel monitoraggio", () => {
    for (const sigla of ["BAC", "PV", "EV", "AC", "CV", "SV", "CPI", "SPI", "EAC", "VAC", "TCPI", "ETC"]) {
      const voce = GLOSSARIO_EVM[sigla];
      expect(voce, sigla).toBeDefined();
      expect(voce.significato.length, sigla).toBeGreaterThan(20);
      expect(voce.riferimento, sigla).toMatch(/^§3\.\d/);
    }
  });
});
