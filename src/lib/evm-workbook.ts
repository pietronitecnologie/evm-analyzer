// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Vista EVM del workbook per la UI: ogni valore arriva dal motore (packages/engine)
// a partire dagli input del progetto. Nessun calcolo è duplicato qui.

import {
  agileMetrics,
  contingencyStatus,
  estimateProject,
  evm,
  light,
  managementReserveStatus,
  type ContingencyStatus,
  type EstimateResult,
  type ManagementReserveStatus,
  type TrafficLight,
} from "@evm-analyzer/engine";

import { parametriDaWorkbook } from "@/lib/workbook";
import type { WorkbookImportato } from "@/stores/esito-importazione-store";

export interface RigaCheckpoint {
  data: string;
  nota: string | null;
  pctPianificato: number;
  pctReale: number;
  pv: number;
  ev: number;
  ac: number;
  cv: number;
  sv: number;
  cpi: number | null;
  spi: number | null;
  cpiLight: TrafficLight;
  spiLight: TrafficLight;
  etc: number;
  eac: number;
  eacOttimistica: number;
  eacLineare: number | null;
  vac: number;
  tcpi: number | null;
  /** Motivi per cui un indice non è definito, mostrati come tooltip. */
  motivi: string[];
}

export interface RigaSprint {
  numero: number;
  costoPerSp: number;
  ev: number;
  pv: number;
  ac: number;
  cpi: number | null;
  spi: number | null;
  cpiLight: TrafficLight;
  spiLight: TrafficLight;
}

export interface VistaEvmWorkbook {
  stima: EstimateResult;
  /** Nomi delle attività, nello stesso ordine di `stima.activities`. */
  nomi: string[];
  /** BAC nella base in uso (con o senza contingency, secondo Base di misura EV). */
  baseMisura: number;
  etichettaBase: string;
  checkpoint: RigaCheckpoint[];
  sprint: RigaSprint[];
  contingenza: ContingencyStatus;
  riservaGestione: ManagementReserveStatus;
  avvisi: string[];
}

/** Vista calcolata dal motore, o `null` se il workbook non ha attività. */
export function vistaEvmWorkbook(w: WorkbookImportato): VistaEvmWorkbook | null {
  if (w.attivita.length === 0) return null;
  const params = parametriDaWorkbook(w);
  const stima = estimateProject(
    w.attivita.map((a) => ({
      id: a.id,
      o: a.o ?? 0,
      m: a.m ?? 0,
      p: a.p ?? 0,
      hoursPerDay: a.oreGiorno ?? 0,
      hourlyCost: a.costoOrario ?? 0,
      materials: a.materiali ?? 0,
      externalServices: a.serviziEsterni ?? 0,
    })),
    params,
  );
  const conContingency = params.evBaseMode === "bac_con_contingency";
  const baseMisura = conContingency ? stima.bacTotal : stima.bacMeasure;

  const checkpoint = w.checkpoint.map((c): RigaCheckpoint => {
    const pv = (c.pctPlanned ?? 0) * baseMisura;
    const ev = (c.pctActual ?? 0) * baseMisura;
    const ac = c.ac ?? 0;
    const e = evm({ bac: baseMisura, pv, ev, ac }, params);
    return {
      data: c.date,
      nota: c.note,
      pctPianificato: c.pctPlanned ?? 0,
      pctReale: c.pctActual ?? 0,
      pv,
      ev,
      ac,
      cv: e.cv,
      sv: e.sv,
      cpi: e.cpi,
      spi: e.spi,
      cpiLight: e.cpiLight,
      spiLight: e.spiLight,
      etc: e.etc,
      eac: e.eac,
      eacOttimistica: e.eacOptimistic,
      eacLineare: e.eacLinear,
      vac: e.vac,
      tcpi: e.tcpi,
      motivi: e.warnings.map((x) => x.message),
    };
  });

  let sprint: RigaSprint[] = [];
  const avvisi: string[] = [];
  try {
    const risultato = agileMetrics(
      w.sprint.map((s, i) => ({ index: i + 1, spCompleted: s.spCompletati ?? 0, spPlanned: s.spPianificati ?? 0, cost: s.costoTeam ?? 0 })),
      params,
      0,
    );
    sprint = risultato.perSprint.map((m) => ({
      numero: m.index,
      costoPerSp: risultato.costPerSp,
      ev: m.ev,
      pv: m.pv,
      ac: m.ac,
      cpi: m.cpi,
      spi: m.spi,
      cpiLight: light(m.cpi, params),
      spiLight: light(m.spi, params),
    }));
    avvisi.push(...risultato.warnings.map((x) => x.message));
  } catch (errore) {
    if (w.sprint.length > 0) avvisi.push(`Agile non calcolabile: ${String(errore)}`);
  }

  const contingenza = contingencyStatus(
    w.rischi.map((r, i) => ({
      id: String(i),
      allocated: r.contingenza ?? 0,
      used: r.importoUtilizzato ?? 0,
      usageDate: r.dataUtilizzo,
    })),
    stima.contingency,
  );
  const riservaGestione = managementReserveStatus(stima.mgmtReserve, 0, true);
  avvisi.push(...stima.warnings.map((x) => x.message), ...contingenza.warnings.map((x) => x.message));

  return {
    stima,
    nomi: w.attivita.map((a) => a.attivita ?? ""),
    baseMisura,
    etichettaBase: conContingency ? "BAC con contingency" : "BAC senza contingency",
    checkpoint,
    sprint,
    contingenza,
    riservaGestione,
    avvisi,
  };
}

/** Classe di colore del semaforo (il colore non è l'unico segnale: il testo è sempre presente). */
export function classeSemaforo(l: TrafficLight): string {
  return {
    verde: "text-semaforo-verde",
    giallo: "text-semaforo-giallo",
    rosso: "text-semaforo-rosso",
    nd: "text-muted-foreground",
  }[l];
}
