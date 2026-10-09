// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";

import type { DatiMonitoraggio } from "@/lib/api";
import { puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { generaReportHtml, SEZIONI_DEFAULT, type DatiReport, type OpzioniReport } from "./report";

function datiMinimi(): DatiMonitoraggio {
  return {
    wbs: [{ codice: "1", budget: 1000 }],
    task: [{ uid: "1", wbs: "1", filone: null, riepilogo: false, inizio: "2026-01-01", fine: "2026-01-10", costoBaseline: 1000 }],
    snapshot: [{ data: "2026-01-05", etichetta: null, sorgente: "manuale", righe: [{ uid: "1", pct: 0.5, ac: 400 }] }],
    checkpoint: [],
  };
}

describe("generaReportHtml", () => {
  it("genera un documento autosufficiente senza NaN/undefined, con le sole sezioni richieste", async () => {
    const vista = vistaMonitoraggio(datiMinimi());
    const testata = puntoTestata(vista, { snapshotId: null, statusDate: "2026-01-05" });
    const dati: DatiReport = {
      nomeProgetto: "Progetto di prova",
      statusDate: "2026-01-05",
      statusDateState: "provvisorio",
      perimetro: "Whole project",
      baseline: "Startup",
      evBaseMode: "bac_senza_contingency",
      copertura: 0.5,
      versioneApp: "0.1.0",
      vista,
      testata,
      riserve: null,
      filoni: [],
      programma: null,
      metricheAgili: null,
      pctCompletatoBuffer: 50,
      problemi: [],
      conteggioProblemi: { critici: 0, avvisi: 0, info: 0 },
    };
    const opz: OpzioniReport = { sezioni: SEZIONI_DEFAULT, nomeAzienda: "Acme", autore: "Mario Rossi" };
    const html = await generaReportHtml(dati, opz);

    expect(html).toContain("Progetto di prova");
    expect(html).toContain("Acme");
    expect(html).toContain("PROVISIONAL");
    expect(html).not.toMatch(/NaN/);
    expect(html).not.toMatch(/>undefined</);
    expect(html).toContain("<svg");

    // Con le sezioni disattivate, il contenuto non compare più.
    const soloRiepilogo = { ...SEZIONI_DEFAULT, curvaS: false, trendIndici: false, wbs: false, topScostamenti: false, anomalie: false, riserve: false, filoni: false, agile: false, glossario: false };
    const htmlRidotto = await generaReportHtml(dati, { ...opz, sezioni: soloRiepilogo });
    expect(htmlRidotto).not.toContain("<svg");
    expect(htmlRidotto).not.toMatch(/>undefined</);
    expect(htmlRidotto).toContain("Executive summary");
  });

  it("senza data di stato (nessuno snapshot) non genera le sezioni che dipendono da `testata`", async () => {
    const vista = vistaMonitoraggio({ wbs: [], task: [], snapshot: [], checkpoint: [] });
    const dati: DatiReport = {
      nomeProgetto: "Senza avanzamento",
      statusDate: "—",
      statusDateState: "bozza",
      perimetro: "Whole project",
      baseline: "Startup",
      evBaseMode: "bac_senza_contingency",
      copertura: 0,
      versioneApp: "0.1.0",
      vista,
      testata: undefined,
      riserve: null,
      filoni: [],
      programma: null,
      metricheAgili: null,
      pctCompletatoBuffer: 0,
      problemi: [],
      conteggioProblemi: { critici: 0, avvisi: 0, info: 0 },
    };
    const html = await generaReportHtml(dati, { sezioni: SEZIONI_DEFAULT, nomeAzienda: "", autore: "—" });
    expect(html).not.toMatch(/NaN/);
    expect(html).not.toMatch(/>undefined</);
    expect(html).toContain("Senza avanzamento");
  });
});
