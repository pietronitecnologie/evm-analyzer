// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Pannello Monte Carlo condiviso da Forecast e Agile/Flow (specifica Fase 5, §3.6/§3.9:
// "stessi controlli e salvataggio"). Nessuna barra di avanzamento/Annulla: misurato che
// anche 200.000 iterazioni (il limite qui) girano in ~250ms sul thread principale, quindi
// non c'è un progresso reale da mostrare (vedi lib/montecarlo.ts e DECISIONS.md, che
// chiude così la decisione 72 lasciata aperta proprio per questo caso). Il pulsante Esegui
// si disabilita solo per la (brevissima) durata del calcolo.

import * as React from "react";
import type { EChartsOption } from "echarts";
import { Play } from "lucide-react";

import { EChart } from "@/components/charts/EChart";
import { leggiColoriGrafico } from "@/components/charts/tema";
import { Button } from "@/components/ui/button";
import { chiama, type EsecuzioneMonteCarlo, type TipoMonteCarlo } from "@/lib/api";
import { eur, num } from "@/lib/format";
import { esegui as simula, fraseGuida, generaSeme, ITERAZIONI_DEFAULT, MAX_ITERAZIONI, riassumi, type FonteSimulazione, type RiassuntoMonteCarlo } from "@/lib/montecarlo";
import { CAMPO, esegui as scrivi, useDatiCon } from "@/lib/schermate";
import { Campo, Sezione, Vuoto } from "./comuni";
import { Kpi } from "./kpi";

export type { FonteSimulazione };

function grafico(hist: { periods: number; count: number }[], p50: number, p80: number, p90: number): EChartsOption {
  const colori = leggiColoriGrafico();
  // Asse a categorie: il marcatore deve usare la stessa stringa delle etichette (xAxis.data),
  // non il numero grezzo — altrimenti ECharts lo legge come indice di posizione, non come valore.
  const marcatori = [
    { xAxis: String(p50), label: { formatter: "P50" } },
    { xAxis: String(p80), label: { formatter: "P80" } },
    { xAxis: String(p90), label: { formatter: "P90" } },
  ];
  return {
    textStyle: { color: colori.testo },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: hist.map((h) => String(h.periods)), name: "periods", axisLine: { lineStyle: { color: colori.griglia } } },
    yAxis: { type: "value", axisLine: { lineStyle: { color: colori.griglia } }, splitLine: { lineStyle: { color: colori.griglia } } },
    tooltip: { trigger: "axis" },
    series: [
      {
        name: "Iterations",
        type: "bar",
        data: hist.map((h) => h.count),
        itemStyle: { color: colori.ev },
        markLine: { symbol: "none", lineStyle: { color: colori.testo, type: "dashed" }, data: marcatori },
      },
    ],
  };
}

export function MonteCarloPanel({ percorso, fonti }: { percorso: string; fonti: FonteSimulazione[] }) {
  const disponibili = fonti.filter((f) => f.history.length > 0 && f.history.some((v) => v > 0));
  const [fonteScelta, setFonteScelta] = React.useState<TipoMonteCarlo | "">("");
  const fonteId = fonteScelta || disponibili[0]?.id || "";
  const fonte = disponibili.find((f) => f.id === fonteId);

  if (disponibili.length === 0) {
    return <Vuoto messaggio="No velocity or throughput history yet: record sprints or flow periods first." />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {disponibili.length > 1 && (
        <Campo etichetta="Simulate from">
          <select className={`${CAMPO} max-w-xs`} value={fonteId} onChange={(e) => setFonteScelta(e.target.value as TipoMonteCarlo)}>
            {disponibili.map((f) => (
              <option key={f.id} value={f.id}>{f.etichetta}</option>
            ))}
          </select>
        </Campo>
      )}
      {fonte && <ModuloEsecuzione key={fonte.id} percorso={percorso} fonte={fonte} />}
    </div>
  );
}

type Vista = { tipo: "live"; riassunto: RiassuntoMonteCarlo; seed: number; periodDays: number; startFrom: string } | { tipo: "storico"; run: EsecuzioneMonteCarlo };

function ModuloEsecuzione({ percorso, fonte }: { percorso: string; fonte: FonteSimulazione }) {
  const [parametri, setParametri] = React.useState(() => ({
    nIter: String(ITERAZIONI_DEFAULT),
    seed: String(generaSeme()),
    periodDays: String(fonte.periodDaysDefault),
    backlog: String(fonte.backlogDefault),
    teamCostPerPeriod: fonte.teamCostPerPeriodDefault === null ? "" : String(fonte.teamCostPerPeriodDefault),
    startFrom: new Date().toISOString().slice(0, 10),
  }));
  const [inCorso, setInCorso] = React.useState(false);
  const [vista, setVista] = React.useState<Vista | null>(null);
  const [storico, ricaricaStorico] = useDatiCon<EsecuzioneMonteCarlo[]>("monte_carlo_elenco", percorso, { tipo: null });
  const runSalvate = (storico ?? []).filter((r) => r.tipo === fonte.id);

  async function esegui(e: React.FormEvent) {
    e.preventDefault();
    const nIter = Math.min(MAX_ITERAZIONI, Math.max(1, Math.round(Number(parametri.nIter)) || ITERAZIONI_DEFAULT));
    const seed = Math.round(Number(parametri.seed)) || generaSeme();
    const periodDays = Number(parametri.periodDays) || fonte.periodDaysDefault;
    const backlog = Number(parametri.backlog) || 0;
    const includiCosti = parametri.teamCostPerPeriod.trim() !== "";
    const teamCostPerPeriod = includiCosti ? Number(parametri.teamCostPerPeriod) : undefined;
    setInCorso(true);
    try {
      const risultato = simula({
        history: fonte.history,
        backlog,
        nIter,
        seed,
        periodDays,
        startFrom: parametri.startFrom,
        teamCostPerPeriod,
        acSoFar: fonte.acSoFar ?? undefined,
      });
      const riassunto = riassumi(risultato, includiCosti);
      setVista({ tipo: "live", riassunto, seed, periodDays, startFrom: parametri.startFrom });
      await scrivi("Run not saved", () =>
        chiama(percorso, "monte_carlo_salva", {
          tipo: fonte.id,
          nIter,
          seed,
          parametriJson: JSON.stringify({ backlog, periodDays, teamCostPerPeriod, startFrom: parametri.startFrom }),
          risultatoJson: JSON.stringify(riassunto),
        }),
      );
      await ricaricaStorico();
    } finally {
      setInCorso(false);
    }
  }

  function apriStorica(run: EsecuzioneMonteCarlo) {
    setVista({ tipo: "storico", run });
  }

  const riassuntoMostrato: RiassuntoMonteCarlo | null =
    vista?.tipo === "live" ? vista.riassunto : vista?.tipo === "storico" ? (JSON.parse(vista.run.risultatoJson) as RiassuntoMonteCarlo) : null;
  const periodDaysMostrato = vista?.tipo === "live" ? vista.periodDays : vista?.tipo === "storico" ? (JSON.parse(vista.run.parametriJson) as { periodDays: number }).periodDays : null;
  const startFromMostrato = vista?.tipo === "live" ? vista.startFrom : vista?.tipo === "storico" ? (JSON.parse(vista.run.parametriJson) as { startFrom: string }).startFrom : null;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={esegui} className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Campo etichetta="Iterations">
          <input type="number" min="1" max={MAX_ITERAZIONI} className={CAMPO} value={parametri.nIter} onChange={(ev) => setParametri({ ...parametri, nIter: ev.target.value })} />
        </Campo>
        <Campo etichetta="Seed">
          <div className="flex gap-1">
            <input className={CAMPO} value={parametri.seed} onChange={(ev) => setParametri({ ...parametri, seed: ev.target.value })} />
            <Button type="button" variant="outline" size="sm" onClick={() => setParametri({ ...parametri, seed: String(generaSeme()) })}>New</Button>
          </div>
        </Campo>
        <Campo etichetta="Period (days)">
          <input type="number" min="1" step="1" className={CAMPO} value={parametri.periodDays} onChange={(ev) => setParametri({ ...parametri, periodDays: ev.target.value })} />
        </Campo>
        <Campo etichetta="Backlog">
          <input type="number" min="0" step="1" className={CAMPO} value={parametri.backlog} onChange={(ev) => setParametri({ ...parametri, backlog: ev.target.value })} />
        </Campo>
        <Campo etichetta="Team cost/period (€, optional)">
          <input type="number" min="0" step="0.01" className={CAMPO} value={parametri.teamCostPerPeriod} onChange={(ev) => setParametri({ ...parametri, teamCostPerPeriod: ev.target.value })} />
        </Campo>
        <Campo etichetta="Start from">
          <input type="date" className={CAMPO} value={parametri.startFrom} onChange={(ev) => setParametri({ ...parametri, startFrom: ev.target.value })} />
        </Campo>
        <div className="col-span-2 flex items-end md:col-span-6">
          <Button type="submit" disabled={inCorso}>
            <Play className="size-4" />
            {inCorso ? "Running…" : "Run"}
          </Button>
        </div>
      </form>

      {riassuntoMostrato && periodDaysMostrato !== null && startFromMostrato !== null && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi etichetta="P50 (periods)" valore={num(riassuntoMostrato.p50)} />
            <Kpi etichetta="P80 (periods)" valore={num(riassuntoMostrato.p80)} />
            <Kpi etichetta="P90 (periods)" valore={num(riassuntoMostrato.p90)} />
            <Kpi etichetta="Min / max" valore={`${riassuntoMostrato.min} / ${riassuntoMostrato.max}`} />
            <Kpi etichetta="Mean" valore={num(riassuntoMostrato.mean)} />
            {riassuntoMostrato.costoP80 !== undefined && <Kpi etichetta="Cost P80" valore={eur(riassuntoMostrato.costoP80)} />}
          </div>
          <p className="text-sm text-muted-foreground">{fraseGuida(riassuntoMostrato.p80, startFromMostrato, periodDaysMostrato)}</p>
          <div className="h-64">
            <EChart option={grafico(riassuntoMostrato.histogram, riassuntoMostrato.p50, riassuntoMostrato.p80, riassuntoMostrato.p90)} />
          </div>
        </>
      )}

      <Sezione titolo="Saved runs">
        {runSalvate.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved run yet for this source.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {runSalvate.map((r) => (
              <li key={r.id}>
                <button type="button" className="text-left hover:underline" onClick={() => apriStorica(r)}>
                  {r.creatoIl.slice(0, 16).replace("T", " ")} — {r.nIter} iterations, seed {r.seed}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sezione>
    </div>
  );
}
