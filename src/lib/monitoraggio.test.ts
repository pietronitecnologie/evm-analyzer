// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";

import type { DatiMonitoraggio } from "@/lib/api";
import { coperturaTaskPct, evmPerNodoWbs, vistaMonitoraggio } from "./monitoraggio";

function dati(extra: Partial<DatiMonitoraggio>): DatiMonitoraggio {
  return { wbs: [], task: [], snapshot: [], checkpoint: [], ...extra };
}

describe("coperturaTaskPct", () => {
  it("è 0 senza nessuna data di stato", () => {
    expect(coperturaTaskPct(dati({}))).toBe(0);
  });

  it("è 1 quando tutti i task pesabili hanno una riga nell'ultimo snapshot", () => {
    const d = dati({
      task: [
        { uid: "1", wbs: "1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 1000 },
        { uid: "2", wbs: "1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 2000 },
        { uid: "0", wbs: "1", filone: null, riepilogo: true, inizio: null, fine: null, costoBaseline: 0 },
      ],
      snapshot: [{ data: "2026-01-10", etichetta: null, sorgente: "manuale", righe: [
        { uid: "1", pct: 1, ac: 1000 },
        { uid: "2", pct: 1, ac: 2000 },
      ] }],
    });
    expect(coperturaTaskPct(d)).toBe(1);
  });

  it("pesa la copertura parziale sul costo di baseline, non sul conteggio dei task", () => {
    const d = dati({
      task: [
        { uid: "1", wbs: "1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 1000 },
        { uid: "2", wbs: "1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 3000 },
      ],
      snapshot: [
        { data: "2026-01-05", etichetta: null, sorgente: "manuale", righe: [{ uid: "1", pct: 0.5, ac: 500 }] },
        // L'ultimo per data: solo il task da 3000 è coperto -> 3/4, non 1/2.
        { data: "2026-01-10", etichetta: null, sorgente: "manuale", righe: [{ uid: "2", pct: 1, ac: 3000 }] },
      ],
    });
    expect(coperturaTaskPct(d)).toBe(0.75);
  });

  it("ignora i task senza WBS e i riepiloghi nel totale pesabile", () => {
    const d = dati({
      task: [
        { uid: "1", wbs: "1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 1000 },
        { uid: "2", wbs: null, filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 5000 },
      ],
      snapshot: [{ data: "2026-01-10", etichetta: null, sorgente: "manuale", righe: [{ uid: "1", pct: 1, ac: 1000 }] }],
    });
    expect(coperturaTaskPct(d)).toBe(1);
  });

  it("con codiceRadice limita il calcolo al sottoalbero", () => {
    const d = dati({
      task: [
        { uid: "1", wbs: "1.1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 1000 },
        { uid: "2", wbs: "2.1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 1000 },
      ],
      snapshot: [{ data: "2026-01-10", etichetta: null, sorgente: "manuale", righe: [{ uid: "1", pct: 1, ac: 1000 }] }],
    });
    expect(coperturaTaskPct(d, "1")).toBe(1);
    expect(coperturaTaskPct(d, "2")).toBe(0);
    expect(coperturaTaskPct(d)).toBe(0.5);
  });
});

describe("evmPerNodoWbs", () => {
  // Due nodi foglia (1.1, 2.1) sotto due rami, e un nodo riepilogo "1" senza task propri.
  const d = dati({
    wbs: [{ codice: "1", budget: 1000 }, { codice: "1.1", budget: 1000 }, { codice: "2", budget: 2000 }],
    task: [
      { uid: "a", wbs: "1.1", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 1000 },
      { uid: "b", wbs: "2", filone: null, riepilogo: false, inizio: null, fine: null, costoBaseline: 2000 },
    ],
    snapshot: [{ data: "2026-01-10", etichetta: null, sorgente: "manuale", righe: [
      { uid: "a", pct: 1, ac: 1000 },
      { uid: "b", pct: 0.5, ac: 1200 },
    ] }],
  });
  const vista = vistaMonitoraggio(d);
  const punto = vista.punti[0];

  it("un nodo con task diretti somma solo i propri", () => {
    const { input, output } = evmPerNodoWbs(punto, ["1.1"])["1.1"];
    expect(input).toEqual({ bac: 1000, pv: 0, ev: 1000, ac: 1000 });
    expect(output.cv).toBe(0);
  });

  it("un nodo riepilogo senza task propri somma i discendenti", () => {
    const { input } = evmPerNodoWbs(punto, ["1"])["1"];
    expect(input).toEqual({ bac: 1000, pv: 0, ev: 1000, ac: 1000 });
  });

  it("un codice senza alcun task nel sottoalbero dà zeri e indici non definiti", () => {
    const { input, output } = evmPerNodoWbs(punto, ["9"])["9"];
    expect(input).toEqual({ bac: 0, pv: 0, ev: 0, ac: 0 });
    expect(output.cpi).toBeNull();
    expect(output.spi).toBeNull();
  });

  it("il totale dei nodi foglia coincide col progetto (ricalcolato dai totali, non media)", () => {
    const somma = evmPerNodoWbs(punto, ["1.1", "2"]);
    const bacTotale = somma["1.1"].input.bac + somma["2"].input.bac;
    expect(bacTotale).toBe(vista.bac);
  });
});
