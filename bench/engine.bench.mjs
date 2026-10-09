#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie
//
// Metà TypeScript della suite di prestazioni (specifica Fase 6 §3): il calcolo EVM e
// Monte Carlo girano nel motore TypeScript, non nel binario Rust di bench/src/main.rs
// (che misura solo le query SQLite) — stesso formato bench/baseline.json, aggiornato
// per fusione (le chiavi scritte dal binario Rust non si toccano). Eseguito con
// `node --experimental-strip-types` (Node 22+, già la versione di questo progetto) o
// con `npx tsx` se preferito; nessuna nuova dipendenza di build.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { addDays, monitoraggioEvm, simulateVelocity } from "../packages/engine/src/index.ts";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(QUI, "baseline.json");
const REGISTRA = process.argv.includes("--record");
const PARAMETRI = { greenThreshold: 0.95, yellowThreshold: 0.85 };
const SOGLIA_RUMORE_MS = 20;

function generaDati(nTask) {
  const nWbs = Math.max(1, Math.floor(nTask / 10));
  const wbs = Array.from({ length: nWbs }, (_, i) => ({ codice: `1.${i}`, budget: 1000 }));
  const tasks = Array.from({ length: nTask }, (_, i) => ({
    uid: String(i + 1),
    wbs: `1.${i % nWbs}`,
    filone: null,
    riepilogo: false,
    start: "2026-01-01",
    finish: "2026-01-06",
    costoBaseline: 500,
  }));
  const nSnapshot = 52;
  const snapshot = Array.from({ length: nSnapshot }, (_, s) => {
    const pct = Math.min(1, (s + 1) / nSnapshot);
    return {
      date: addDays("2026-01-01", s * 7),
      righe: tasks.map((t) => ({ uid: t.uid, pct, ac: pct * 500 })),
    };
  });
  return { wbs, tasks, snapshot };
}

function cronometra(fn) {
  const t0 = performance.now();
  const risultato = fn();
  return [risultato, performance.now() - t0];
}

function leggiBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function confronta(nome, ms, scala, baseline, aggiornamenti, obiettivoMs) {
  let ok = true;
  if (obiettivoMs !== undefined && ms > obiettivoMs) {
    console.log(`  FALLITO ${nome}: ${ms.toFixed(1)} ms > obiettivo ${obiettivoMs} ms`);
    ok = false;
  }
  const precedente = baseline[nome];
  if (precedente && ms > precedente.ms * 1.2 && precedente.ms > SOGLIA_RUMORE_MS) {
    console.log(`  FALLITO ${nome}: ${ms.toFixed(1)} ms oltre il 20% della baseline registrata (${precedente.ms.toFixed(1)} ms)`);
    ok = false;
  }
  console.log(`  ${nome}: ${ms.toFixed(1)} ms (scala ${scala})`);
  aggiornamenti[nome] = { ms, n: scala, misuratoIl: new Date().toISOString() };
  return ok;
}

function main() {
  const baseline = leggiBaseline();
  const aggiornamenti = { ...baseline };
  let tuttoOk = true;

  for (const nTask of [200, 2000, 5000]) {
    const dati = generaDati(nTask);
    const [, msRicalcolo] = cronometra(() => monitoraggioEvm(dati.wbs, dati.tasks, dati.snapshot, PARAMETRI));
    const obiettivo = nTask === 5000 ? 1000 : undefined; // "Ricalcolo EVM completo (5.000 task) < 1 s" (specifica §3)
    tuttoOk = confronta(`ricalcolo_evm_${nTask}`, msRicalcolo, nTask, baseline, aggiornamenti, obiettivo) && tuttoOk;
  }

  const [, msMonteCarlo] = cronometra(() =>
    simulateVelocity({ history: [8, 10, 9, 11, 7, 10, 12, 9], backlog: 500, nIter: 5000, seed: 42, periodDays: 14, startFrom: "2026-01-01" }),
  );
  tuttoOk = confronta("monte_carlo_5000", msMonteCarlo, 5000, baseline, aggiornamenti, 2000) && tuttoOk;

  if (REGISTRA) {
    writeFileSync(BASELINE_PATH, JSON.stringify(aggiornamenti, null, 2));
    console.log(`\nBaseline aggiornata: ${BASELINE_PATH}`);
  }
  if (!tuttoOk && !REGISTRA) {
    console.log("\nAlcune misure superano l'obiettivo o la baseline di oltre il 20%.");
    process.exit(1);
  }
}

main();
