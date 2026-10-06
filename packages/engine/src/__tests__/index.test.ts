// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import { ENGINE_NAME, ENGINE_VERSION } from "../index";

describe("scaffold del motore EVM", () => {
  it("esporta nome e versione del pacchetto", () => {
    expect(ENGINE_NAME).toBe("@evm-analyzer/engine");
    expect(ENGINE_VERSION).toBe("0.1.0");
  });
});
