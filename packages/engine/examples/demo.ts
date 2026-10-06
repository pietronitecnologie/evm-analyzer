// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Esempio d'uso del motore: riepilogo EVM del caso §3.6 e Monte Carlo del caso §8.4.
// Esecuzione (strumento di sviluppo, non dipendenza): npx tsx packages/engine/examples/demo.ts

import { evm, simulateVelocity, withDefaults } from "../src/index";

const params = withDefaults({ greenThreshold: 0.95, yellowThreshold: 0.85 });
const e = evm({ bac: 100000, pv: 40000, ev: 35000, ac: 42000 }, params);

console.log("EVM — caso §3.6 (BAC 100.000 €, PV 40.000 €, EV 35.000 €, AC 42.000 €)");
console.log(`  CV ${e.cv.toFixed(0)} €   SV ${e.sv.toFixed(0)} €`);
console.log(`  CPI ${e.cpi?.toFixed(6)} (${e.cpiLight})   SPI ${e.spi?.toFixed(6)} (${e.spiLight})`);
console.log(`  EAC base ${e.eac.toFixed(0)} €   EAC ottimistica ${e.eacOptimistic.toFixed(0)} €   EAC lineare ${e.eacLinear?.toFixed(0)} €`);
console.log(`  VAC ${e.vac.toFixed(0)} €   TCPI ${e.tcpi?.toFixed(6)}`);

const mc = simulateVelocity({
  history: [20, 35, 18, 40, 25],
  backlog: 300,
  nIter: 5000,
  seed: 42,
  periodDays: 14,
  startFrom: "2026-01-05",
});

console.log("\nMonte Carlo — caso §8.4 (storico [20, 35, 18, 40, 25], backlog 300 SP, seme 42)");
console.log(`  P50 ${mc.p50} sprint   P80 ${mc.p80} sprint   P90 ${mc.p90} sprint`);
console.log(`  minimo ${mc.min}   massimo ${mc.max}   media ${mc.mean.toFixed(4)}`);
console.log(`  probabilità di finire entro 12 sprint: ${(mc.probabilityWithin(12) * 100).toFixed(1)}%`);
