// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";

import type { Calendario, RigaGantt } from "@/lib/api";
import { GIORNO_PX, LIVELLI_ZOOM, modelloGantt } from "./gantt";

const riga = (id: number, extra: Partial<RigaGantt>): RigaGantt => ({
  id,
  uid: String(id),
  nome: `Task ${id}`,
  wbs: null,
  inizio: "2026-01-05",
  fine: "2026-01-09",
  inizioBaseline: null,
  fineBaseline: null,
  durataGiorni: 5,
  critico: false,
  riepilogo: false,
  milestone: false,
  pct: 0,
  predecessori: [],
  ...extra,
});

const LUN_VEN: Calendario = { id: 1, nome: "Standard", predefinito: true, maschera: 0b0011111, festivi: ["2026-01-07"] };

describe("modello del Gantt", () => {
  it("segna fine settimana e festivi secondo il calendario", () => {
    const m = modelloGantt([riga(1, {})], LUN_VEN);
    const sab = m.giorni.find((g) => g.iso === "2026-01-10");
    const mer = m.giorni.find((g) => g.iso === "2026-01-07");
    const lun = m.giorni.find((g) => g.iso === "2026-01-05");
    expect(sab?.weekend).toBe(true);
    expect(mer?.festivo).toBe(true);
    expect(lun?.weekend).toBe(false);
    expect(lun?.settimana).toBe(0);
  });

  it("posiziona la barra in base al giorno di inizio e alla durata", () => {
    const m = modelloGantt([riga(1, {})], LUN_VEN);
    const indiceInizio = m.giorni.findIndex((g) => g.iso === "2026-01-05");
    expect(m.barre[0].xInizio).toBe(indiceInizio * GIORNO_PX);
    expect(m.barre[0].larghezza).toBe(5 * GIORNO_PX);
  });

  it("le milestone sono barre di larghezza zero", () => {
    const m = modelloGantt([riga(1, { milestone: true, fine: "2026-01-05" })], LUN_VEN);
    expect(m.barre[0].milestone).toBe(true);
    expect(m.barre[0].larghezza).toBe(0);
  });

  it("le frecce partono dalla fine del predecessore per le precedenze FS", () => {
    const righe = [riga(1, { uid: "1" }), riga(2, { uid: "2", inizio: "2026-01-12", fine: "2026-01-16", predecessori: ["1FS"] })];
    const m = modelloGantt(righe, LUN_VEN);
    expect(m.frecce).toHaveLength(1);
    expect(m.frecce[0].da).toBe(0);
    expect(m.frecce[0].a).toBe(1);
    expect(m.frecce[0].xDa).toBe(m.barre[0].xFine);
    expect(m.frecce[0].xA).toBe(m.barre[1].xInizio);
  });

  it("senza date nessun modello di scala e nessuna barra", () => {
    const m = modelloGantt([riga(1, { inizio: null, fine: null })], LUN_VEN);
    expect(m.giorni).toHaveLength(0);
    expect(m.conDate).toBe(0);
  });

  it("la barra della baseline si posiziona sulle date di baseline, non su quelle pianificate", () => {
    const m = modelloGantt([riga(1, { inizioBaseline: "2026-01-02", fineBaseline: "2026-01-06" })], LUN_VEN);
    const indiceBaseline = m.giorni.findIndex((g) => g.iso === "2026-01-02");
    expect(m.barre[0].baseline).not.toBeNull();
    expect(m.barre[0].baseline!.x).toBe(indiceBaseline * GIORNO_PX);
    expect(m.barre[0].baseline!.larghezza).toBe(5 * GIORNO_PX);
    // La barra attuale non si sposta.
    expect(m.barre[0].xInizio).not.toBe(m.barre[0].baseline!.x);
  });

  it("un task senza date di baseline non ha barra di baseline", () => {
    const m = modelloGantt([riga(1, {})], LUN_VEN);
    expect(m.barre[0].baseline).toBeNull();
  });

  it("il livello di zoom scala la larghezza delle barre e della timeline", () => {
    const pxSettimana = LIVELLI_ZOOM.find((l) => l.id === "settimana")!.pxPerGiorno;
    const m = modelloGantt([riga(1, {})], LUN_VEN, pxSettimana);
    expect(m.barre[0].larghezza).toBe(5 * pxSettimana);
    expect(m.larghezzaPx).toBe(m.giorni.length * pxSettimana);
  });
});
