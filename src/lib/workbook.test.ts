// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Verifica del frontend sul workbook di riferimento: il confronto col motore trova la
// contingency incoerente della fixture e la cache riproduce il BAC del file.

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { costruisciCache, verificaWorkbook } from "./workbook";
import type { WorkbookImportato } from "@/stores/esito-importazione-store";
import { leggiWorkbook } from "../../packages/engine/test/helpers/xlsx";

const FIXTURE = resolve(__dirname, "../../fixtures/Parte_III_Gestione_Progetti.xlsx");

/** Input della fixture nella forma serializzata dal backend (dati letti dal file). */
function fixtureWorkbook(): WorkbookImportato {
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
    sprint: [],
    cache: { totali: { bac: 55933.8725, diretto: 44216.5, effort: 77.1666, sigma: 2.0615528, contingency: 7295.7225, budget: 58730.566 }, checkpoint: [] },
    avvisi: [],
  };
}

describe("workbook — verifica col motore sulla fixture", () => {
  it("segnala la contingency incoerente (7.296 € contro 15.000 €)", () => {
    const avvisi = verificaWorkbook(fixtureWorkbook());
    const cont = avvisi.find((a) => a.codice === "XL_CONT_MISMATCH");
    expect(cont).toBeDefined();
    expect(cont!.messaggio).toContain("7295.72");
    expect(cont!.messaggio).toContain("15000.00");
  });

  it("non segnala scarti sui totali: la cache del file coincide col motore", () => {
    const avvisi = verificaWorkbook(fixtureWorkbook()).filter((a) => a.codice === "XL_CACHE_DIFF");
    expect(avvisi).toEqual([]);
  });

  it("la cache per l'export riproduce BAC 55.933,87 € e misura senza contingency 48.638,15 €", () => {
    const cache = costruisciCache(fixtureWorkbook());
    expect(cache.sintesi.bac).toBeCloseTo(55933.87, 2);
    expect(cache.sintesi.bacMisura).toBeCloseTo(48638.15, 2);
    expect(cache.righe).toHaveLength(9);
    expect(cache.buffer.stanziata).toBe(15000);
  });
});
