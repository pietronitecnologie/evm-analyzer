// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { describe, expect, it } from "vitest";
import {
  checkQ001, checkQ002, checkQ003, checkQ004, checkQ005, checkQ006, checkQ007, checkQ008, checkQ009,
  checkQ010, checkQ011, checkQ012, checkQ013, checkQ014, checkQ015, checkQ016, checkQ020, checkQ021,
  checkQ030, checkQ031, runQualityChecks, type QTask,
} from "../src/index";

const base: QTask = {
  id: "T1",
  name: "Scavo",
  active: true,
  isSummary: false,
  isMilestone: false,
  hasBaseline: true,
  method: "zero_cento",
  pctComplete: 50,
  ac: 1000,
  actualStart: "2026-01-05",
  actualFinish: null,
};
const t = (extra: Partial<QTask>): QTask => ({ ...base, ...extra });
const codici = (a: { code: string }[]) => a.map((x) => x.code);

describe("Q001 — baseline mancante", () => {
  it("positivo: task attivo senza baseline", () => {
    expect(codici(checkQ001([t({ hasBaseline: false })]))).toEqual(["Q001"]);
  });
  it("negativo: task con baseline o inattivo", () => {
    expect(checkQ001([t({})])).toHaveLength(0);
    expect(checkQ001([t({ hasBaseline: false, active: false })])).toHaveLength(0);
  });
});

describe("Q002 — metodo EV assente o incoerente", () => {
  it("positivo: metodo assente su task attivo; metodo su riepilogo", () => {
    expect(codici(checkQ002([t({ method: null })]))).toEqual(["Q002"]);
    expect(codici(checkQ002([t({ isSummary: true, method: "zero_cento" })]))).toEqual(["Q002"]);
  });
  it("negativo: metodo coerente", () => {
    expect(checkQ002([t({})])).toHaveLength(0);
  });
});

describe("Q003 — AC mancante con avanzamento", () => {
  it("positivo: avanzamento e AC nullo", () => {
    expect(codici(checkQ003([t({ ac: null })]))).toEqual(["Q003"]);
  });
  it("negativo: AC presente o avanzamento zero", () => {
    expect(checkQ003([t({})])).toHaveLength(0);
    expect(checkQ003([t({ ac: null, pctComplete: 0 })])).toHaveLength(0);
  });
});

describe("Q004 — % oltre 100 o decrescente", () => {
  it("positivo: 120% e calo tra status date", () => {
    expect(codici(checkQ004([t({ pctComplete: 120 })]))).toEqual(["Q004"]);
    expect(codici(checkQ004([t({ pctComplete: 40, previousPct: 60 })]))).toEqual(["Q004"]);
  });
  it("negativo: crescita regolare", () => {
    expect(checkQ004([t({ pctComplete: 70, previousPct: 60 })])).toHaveLength(0);
  });
});

describe("Q005 — avanzamento senza actual start", () => {
  it("positivo", () => {
    expect(codici(checkQ005([t({ actualStart: null })]))).toEqual(["Q005"]);
  });
  it("negativo", () => {
    expect(checkQ005([t({ pctComplete: 0, actualStart: null })])).toHaveLength(0);
  });
});

describe("Q006 — data reale nel futuro", () => {
  it("positivo: fine reale dopo la status date", () => {
    expect(codici(checkQ006([t({ actualFinish: "2026-12-01" })], "2026-06-01"))).toEqual(["Q006"]);
  });
  it("negativo: date reali entro la status date", () => {
    expect(checkQ006([t({ actualFinish: "2026-05-01" })], "2026-06-01")).toHaveLength(0);
  });
});

describe("Q007 — risorsa senza tariffa", () => {
  it("positivo e negativo", () => {
    expect(codici(checkQ007([{ name: "Mario", rate: null }]))).toEqual(["Q007"]);
    expect(checkQ007([{ name: "Mario", rate: 40 }])).toHaveLength(0);
  });
});

describe("Q008 — check-point decrescenti", () => {
  it("positivo: AC e PV in calo", () => {
    const r = checkQ008([
      { date: "2026-01-31", pvPct: 40, ac: 100 },
      { date: "2026-02-28", pvPct: 30, ac: 90 },
    ]);
    expect(r).toHaveLength(2);
  });
  it("negativo: crescita regolare", () => {
    expect(checkQ008([{ date: "2026-01-31", pvPct: 40, ac: 100 }, { date: "2026-02-28", pvPct: 60, ac: 150 }])).toHaveLength(0);
  });
});

describe("Q009 — check-point fuori dal progetto", () => {
  it("positivo e negativo", () => {
    expect(checkQ009([{ date: "2027-01-01", pvPct: 1, ac: 1 }], "2026-01-01", "2026-12-31")).toHaveLength(1);
    expect(checkQ009([{ date: "2026-06-01", pvPct: 1, ac: 1 }], "2026-01-01", "2026-12-31")).toHaveLength(0);
  });
});

describe("Q010 — date incoerenti tra sezioni", () => {
  it("positivo e negativo", () => {
    expect(codici(checkQ010("2027-01-01", "2026-01-01"))).toEqual(["Q010"]);
    expect(checkQ010("2026-01-01", "2026-01-01")).toHaveLength(0);
    expect(checkQ010(undefined, "2026-01-01")).toHaveLength(0);
  });
});

describe("Q011 — stime con ordine non valido", () => {
  it("positivo e negativo", () => {
    expect(codici(checkQ011(["T2"]))).toEqual(["Q011"]);
    expect(checkQ011([])).toHaveLength(0);
  });
});

describe("Q012 — scostamento stima/startup", () => {
  it("avviso oltre 20%, critico oltre 30%, nessun avviso sotto", () => {
    expect(checkQ012(25).map((x) => x.severity)).toEqual(["avviso"]);
    expect(checkQ012(-35).map((x) => x.severity)).toEqual(["critico"]);
    expect(checkQ012(10)).toHaveLength(0);
    expect(checkQ012(null)).toHaveLength(0);
  });
});

describe("Q013 — costo orario non verificato", () => {
  it("positivo: tariffa senza costo reale; negativo: costo reale presente", () => {
    expect(codici(checkQ013([{ name: "Mario", rate: 40 }]))).toEqual(["Q013"]);
    expect(checkQ013([{ name: "Mario", rate: 40, realHourlyCost: 55 }])).toHaveLength(0);
  });
});

describe("Q014 — metodo cambiato tra status date", () => {
  it("positivo e negativo", () => {
    expect(codici(checkQ014([t({ methodHistory: ["zero_cento", "loe"] })]))).toEqual(["Q014"]);
    expect(checkQ014([t({ methodHistory: ["loe", "loe"] })])).toHaveLength(0);
  });
});

describe("Q015 — intervalli irregolari", () => {
  it("positivo e negativo", () => {
    expect(codici(checkQ015(["2026-01-01", "2026-01-08", "2026-01-15", "2026-03-01"]))).toEqual(["Q015"]);
    expect(checkQ015(["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"])).toHaveLength(0);
  });
});

describe("Q016 — baseline variata senza change request", () => {
  it("positivo e negativo", () => {
    expect(codici(checkQ016([t({ baselineChangedWithoutCr: true })]))).toEqual(["Q016"]);
    expect(checkQ016([t({})])).toHaveLength(0);
  });
});

describe("Q020 — «90% fatto»", () => {
  const storico = (pcts: number[]) => pcts.map((pct, i) => ({ statusDate: `2026-0${i + 1}-01`, pct, hours: i * 10 }));
  it("positivo: quattro status date consecutive a 90% o oltre", () => {
    expect(codici(checkQ020([t({ method: "soggettiva", subjectiveHistory: storico([0.9, 0.92, 0.95, 0.97]) })]))).toEqual(["Q020"]);
  });
  it("negativo: tre status date a 90% o oltre, poi calo", () => {
    expect(checkQ020([t({ method: "soggettiva", subjectiveHistory: storico([0.9, 0.92, 0.95, 0.5]) })])).toHaveLength(0);
  });
});

describe("Q021 — crescita soggettiva senza ore", () => {
  it("positivo: % in crescita con ore ferme; negativo: ore in crescita", () => {
    const ferma = [
      { statusDate: "2026-01-01", pct: 0.3, hours: 10 },
      { statusDate: "2026-02-01", pct: 0.5, hours: 10 },
    ];
    expect(codici(checkQ021([t({ method: "soggettiva", subjectiveHistory: ferma })]))).toEqual(["Q021"]);
    const consumo = [
      { statusDate: "2026-01-01", pct: 0.3, hours: 10 },
      { statusDate: "2026-02-01", pct: 0.5, hours: 40 },
    ];
    expect(checkQ021([t({ method: "soggettiva", subjectiveHistory: consumo })])).toHaveLength(0);
  });
});

describe("Q030 e Q031 — agile e LOE", () => {
  it("Q030: costo per SP circolare", () => {
    expect(codici(checkQ030(true))).toEqual(["Q030"]);
    expect(checkQ030(false)).toHaveLength(0);
  });
  it("Q031: quota LOE sopra soglia", () => {
    expect(codici(checkQ031(0.3))).toEqual(["Q031"]);
    expect(checkQ031(0.1)).toHaveLength(0);
  });
});

describe("runQualityChecks", () => {
  it("compone i controlli e restituisce gli elementi ordinati per codice", () => {
    const anomalie = runQualityChecks({
      statusDate: "2026-06-01",
      projectStart: "2026-01-01",
      projectEnd: "2026-12-31",
      tasks: [t({ hasBaseline: false, ac: null })],
      resources: [{ name: "Mario", rate: null }],
      loeShare: 0.4,
    });
    const codiciOrdinati = anomalie.map((a) => a.code);
    expect(codiciOrdinati).toEqual([...codiciOrdinati].sort());
    expect(codiciOrdinati).toEqual(expect.arrayContaining(["Q001", "Q003", "Q007", "Q031"]));
  });
});
