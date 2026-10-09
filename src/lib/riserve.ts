// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Adatta le riserve del backend al motore (buffers.ts). L'indice di salute si applica
// solo al buffer di tempo (il "fever chart" classico: consumo del buffer contro
// percentuale di progetto completata); contingency e management reserve hanno il loro
// proprio stato (usato/residuo/avviso), non un indice di salute.

import { bufferHealth, contingencyStatus, managementReserveStatus, timeBufferLeft, type BufferHealth, type ContingencyStatus, type ManagementReserveStatus } from "@evm-analyzer/engine";

import type { Riserve } from "@/lib/api";

export function statoContingency(r: Riserve): ContingencyStatus {
  const rischi = r.rischi.map((x) => ({ id: String(x.id), allocated: x.contingenza ?? 0, used: x.utilizzato ?? 0, usageDate: x.dataUtilizzo }));
  const budgetContingency = ((r.bacTotale ?? 0) * r.contingencyPct) / 100;
  return contingencyStatus(rischi, budgetContingency);
}

/** Approvato = nessun consumo di management reserve senza approvazione (RES_MR_UNAPPROVED). */
export function statoRiservaGestione(r: Riserve): ManagementReserveStatus {
  const totale = ((r.bacTotale ?? 0) * r.mgmtReservePct) / 100;
  const consumiMr = r.consumi.filter((c) => c.tipo === "management_reserve");
  const consumato = consumiMr.reduce((s, c) => s + c.importo, 0);
  const approvato = consumiMr.every((c) => c.approvato);
  return managementReserveStatus(totale, consumato, approvato);
}

/** Giorni di buffer di tempo consumati: stesso campo `importo` dei consumi, per questo tipo in giorni, non €. */
export function giorniBufferConsumati(r: Riserve): number {
  return r.consumi.filter((c) => c.tipo === "buffer_tempo").reduce((s, c) => s + c.importo, 0);
}

export function bufferTempoResiduo(r: Riserve): number {
  return timeBufferLeft(r.timeBufferDays, giorniBufferConsumati(r));
}

/** `pctCompletato`: percentuale di progetto completata (EV/BAC × 100), da `dati_monitoraggio`. */
export function saluteBufferTempo(r: Riserve, pctCompletato: number): BufferHealth {
  const consumatoPct = r.timeBufferDays > 0 ? (giorniBufferConsumati(r) / r.timeBufferDays) * 100 : 0;
  return bufferHealth(consumatoPct, pctCompletato);
}
