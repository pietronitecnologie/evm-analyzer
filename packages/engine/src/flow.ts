// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Flusso (§3.9.5; specifica sez. 9): CFD, Legge di Little, diagnosi WIP, limiti WIP.

import { type ISODate, type Warning } from "./types";

export interface FlowSnapshot {
  date: ISODate;
  backlog: number;
  inProgress: number;
  done: number;
}

export interface CumulativePoint {
  date: ISODate;
  todoCum: number;
  startedCum: number;
  doneCum: number;
}

/** Serie cumulata per stato: todoCum = backlog + inProgress + done, startedCum = inProgress + done, doneCum = done. */
export function cumulativeFlow(snapshots: FlowSnapshot[]): CumulativePoint[] {
  return snapshots.map((s) => ({
    date: s.date,
    todoCum: s.backlog + s.inProgress + s.done,
    startedCum: s.inProgress + s.done,
    doneCum: s.done,
  }));
}

/** Throughput per periodo = Δ done tra istantanee consecutive. */
export function throughputPerPeriod(snapshots: FlowSnapshot[]): number[] {
  return snapshots.slice(1).map((s, i) => s.done - snapshots[i].done);
}

/** Legge di Little: WIP = throughput × cycle time (item, item/giorno, giorni; §3.9.5). */
export function littleWip(throughput: number, cycleTime: number): number {
  return throughput * cycleTime;
}

/** Cycle time = WIP / throughput; `null` se il throughput è zero. */
export function littleCycleTime(wip: number, throughput: number): number | null {
  return throughput === 0 ? null : wip / throughput;
}

/** Legge di Little nella forma usata dall'app: restituisce il valore mancante. */
export function littleLaw(input: { wip?: number; throughput?: number; cycleTime?: number }): number | null {
  if (input.throughput !== undefined && input.cycleTime !== undefined) {
    return littleWip(input.throughput, input.cycleTime);
  }
  if (input.wip !== undefined && input.throughput !== undefined) {
    return littleCycleTime(input.wip, input.throughput);
  }
  return null;
}

export interface FlowWindow {
  throughput: number;
  cycleTime: number;
}

/**
 * Diagnosi del WIP sulle ultime `k` finestre (default 4): se il cycle time cresce
 * di oltre il 20% tra la prima e la seconda metà e il throughput varia meno del
 * 10% in valore assoluto, emette FLOW_WIP_EXCESS.
 */
export function diagnoseWip(windows: FlowWindow[], k = 4): Warning | null {
  const ultime = windows.slice(-k);
  if (ultime.length < 2) return null;
  const meta = Math.floor(ultime.length / 2);
  const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ctPrima = media(ultime.slice(0, meta).map((w) => w.cycleTime));
  const ctDopo = media(ultime.slice(meta).map((w) => w.cycleTime));
  const tpPrima = media(ultime.slice(0, meta).map((w) => w.throughput));
  const tpDopo = media(ultime.slice(meta).map((w) => w.throughput));
  if (ctPrima <= 0 || tpPrima <= 0) return null;
  const crescitaCt = (ctDopo - ctPrima) / ctPrima;
  const variazioneTp = (tpDopo - tpPrima) / tpPrima;
  if (crescitaCt > 0.2 && Math.abs(variazioneTp) < 0.1) {
    return {
      code: "FLOW_WIP_EXCESS",
      message: "Cycle Time in crescita con throughput stabile ⇒ WIP eccessivo",
      ref: "§3.9.5",
    };
  }
  return null;
}

/** FLOW_WIP_LIMIT: avviso per ogni stato che supera il proprio limite WIP. */
export function checkWipLimits(counts: Record<string, number>, limits: Record<string, number>): Warning[] {
  return Object.entries(limits)
    .filter(([stato, limite]) => (counts[stato] ?? 0) > limite)
    .map(([stato, limite]) => ({
      code: "FLOW_WIP_LIMIT",
      message: `Stato «${stato}»: ${counts[stato] ?? 0} item oltre il limite di ${limite}`,
      ref: "§3.9.5",
    }));
}
