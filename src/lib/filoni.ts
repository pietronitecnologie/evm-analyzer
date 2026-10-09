// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Adatta i filoni del backend al motore (programRollup). Un filone diventa una singola
// riga aggregata (`perFiloneMisure`, già calcolato da monitoraggioEvm): la quota LOE per
// filone (loeShare/spiExLoe, avviso LOE_SHARE) richiederebbe di tracciare il metodo EV di
// ogni task dentro il rollup di monitoraggio, non ancora fatto — ogni riga qui è `loe:
// false`, quindi `loeShare` resta 0 e SPI non viene mai corretto dal LOE (nessuna
// sovrastima nascosta: il valore mostrato è lo SPI semplice, coerente con le colonne
// della specifica Fase 5 §3.7, che non elenca una colonna LOE). GATE_NO_BUFFER non si
// calcola: richiederebbe una data di consegna prevista per filone, che non esiste (vedi
// DECISIONS.md) — l'elenco dei gate si mostra comunque, solo senza l'avviso automatico.

import { programRollup, type ProgramResult, type Workstream } from "@evm-analyzer/engine";

import type { FiloneRiga } from "@/lib/api";
import { PARAMETRI, type PuntoVista } from "@/lib/monitoraggio";

const PARAMETRI_PROGRAMMA = { ...PARAMETRI, loeShareThreshold: 0.15 };

export function costruisciProgramma(filoni: FiloneRiga[], punto: PuntoVista): ProgramResult {
  const workstreams: Workstream[] = filoni.map((f) => ({
    name: f.nome,
    kind: f.tipo as Workstream["kind"],
    rows: [{ ...(punto.perFiloneMisure[f.nome] ?? { bac: 0, pv: 0, ev: 0, ac: 0 }), loe: false }],
    variableScope: f.scopeVariabile,
  }));
  return programRollup(workstreams, [], PARAMETRI_PROGRAMMA);
}
