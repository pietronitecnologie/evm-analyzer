// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// API pubblica del motore EVM (specifica fase 2, sez. 12). Funzioni pure:
// nessun I/O, nessun Date.now(), nessun Math.random(); data e seme sono parametri.

export const ENGINE_NAME = "@evm-analyzer/engine";
export const ENGINE_VERSION = "0.1.0";

export * from "./types";
export * from "./dates";
export * from "./estimate";
export * from "./evm";
export * from "./ev-methods";
export * from "./earned-schedule";
export * from "./buffers";
export * from "./agile";
export * from "./montecarlo";
export * from "./flow";
export * from "./program";
export * from "./quality";
