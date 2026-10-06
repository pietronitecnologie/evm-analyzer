// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Input della fixture del libro nella forma serializzata dal backend, letti dal file
// (usati dai test del frontend). Non sono costanti copiate.

import { resolve } from "node:path";

import type { WorkbookImportato } from "@/stores/esito-importazione-store";
import { leggiWorkbook, type CellValue } from "../../packages/engine/test/helpers/xlsx";

export const FIXTURE = resolve(__dirname, "../../fixtures/Parte_III_Gestione_Progetti.xlsx");

function sprintFixture(wb: Record<string, Record<string, CellValue>>): WorkbookImportato["sprint"] {
  const a = wb["Agile - Velocity"];
  const out: WorkbookImportato["sprint"] = [];
  for (let r = 5; r <= 7; r++) {
    out.push({
      numero: r - 4,
      spPianificati: typeof a[`D${r}`] === "number" ? (a[`D${r}`] as number) : null,
      spCompletati: typeof a[`E${r}`] === "number" ? (a[`E${r}`] as number) : null,
      costoTeam: typeof a[`H${r}`] === "number" ? (a[`H${r}`] as number) : null,
    });
  }
  return out;
}

export function fixtureWorkbook(): WorkbookImportato {
  const wb = leggiWorkbook(FIXTURE);
  const p = wb["Parametri"];
  const w = wb["WBS e Stima Costi"];
  const b = wb["Buffer e Contingency"];
  const n = (f: Record<string, string | number>, ref: string) => (typeof f[ref] === "number" ? (f[ref] as number) : null);
  const attivita = [];
  for (let r = 4; r <= 12; r++) {
    attivita.push({
      id: String(w[`A${r}`]), attivita: String(w[`B${r}`]), fase: null, risorsa: null,
      costoOrario: n(w, `E${r}`), o: n(w, `F${r}`), m: n(w, `G${r}`), p: n(w, `H${r}`), oreGiorno: n(w, `K${r}`),
      materiali: n(w, `N${r}`), serviziEsterni: n(w, `O${r}`), dataInizio: null, filone: null,
    });
  }
  return {
    meta: null,
    parametri: {
      overhead: n(p, "B6"), contingency: n(p, "B7"), riservaGestione: n(p, "B8"), sogliaVerde: n(p, "B11"), sogliaGialla: n(p, "B12"),
      inizio: null, fine: null, bufferGiorni: n(p, "B17"), durataSprint: n(p, "B20"), costoTeamSprint: n(p, "B21"), finestraVelocity: n(p, "B22"),
      baseEv: null, spPerSprint: null, costoPerSp: null,
    },
    attivita,
    checkpoint: [{ date: "2026-01-01", note: "Inizio Lavori", pctPlanned: 0, pctActual: 0, ac: 2000 }],
    rischi: [{ descrizione: String(b["A5"]), probabilita: n(b, "B5"), impatto: n(b, "C5"), contingenza: n(b, "D5"), dataUtilizzo: null, importoUtilizzato: 0 }],
    sprint: sprintFixture(wb),
    cache: { totali: { bac: 55933.8725, diretto: 44216.5, effort: 77.1666, sigma: 2.0615528, contingency: 7295.7225, budget: 58730.566 }, checkpoint: [] },
    avvisi: [],
  };
}
