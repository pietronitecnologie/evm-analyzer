// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Dashboard (specifica Fase 5, §3.1): riga KPI, curva S, trend CPI/SPI, top
// scostamenti, copertura, riserve, anomalie. I valori EVM vengono dallo
// stesso adattatore già usato da MonitoraggioScreen (lib/monitoraggio.ts),
// filtrato per perimetro se il selettore di contesto ne ha scelto uno
// (vedi DECISIONS.md: la baseline selezionata non incide ancora sui calcoli).

import * as React from "react";
import type { EChartsOption } from "echarts";

import { EChart } from "@/components/charts/EChart";
import { leggiColoriGrafico } from "@/components/charts/tema";
import type { Dashboard, DatiMonitoraggio, Perimetro, Riserve } from "@/lib/api";
import { CELLA, TESTA_TABELLA, usePercorso, useDati } from "@/lib/schermate";
import { coperturaTaskPct, filtraPerPerimetro, PARAMETRI, puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Vuoto } from "./comuni";
import { EvmWorkbookSezione } from "./EvmWorkbookSezione";
import { Indice, Kpi } from "./kpi";
import { eur, num } from "@/lib/format";

function curvaS(punti: { data: string; pv: number; ev: number; ac: number }[], bac: number, dataEvidenziata?: string): EChartsOption {
  const colori = leggiColoriGrafico();
  return {
    textStyle: { color: colori.testo },
    grid: { left: 56, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: punti.map((p) => p.data), axisLine: { lineStyle: { color: colori.griglia } } },
    yAxis: { type: "value", axisLine: { lineStyle: { color: colori.griglia } }, splitLine: { lineStyle: { color: colori.griglia } } },
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: colori.testo } },
    series: [
      { name: "PV", type: "line", data: punti.map((p) => p.pv), lineStyle: { color: colori.pv, type: "dashed" }, itemStyle: { color: colori.pv } },
      {
        name: "EV",
        type: "line",
        data: punti.map((p) => p.ev),
        lineStyle: { color: colori.ev },
        itemStyle: { color: colori.ev },
        markLine: dataEvidenziata
          ? { symbol: "none", label: { show: false }, lineStyle: { color: colori.testo }, data: [{ xAxis: dataEvidenziata }] }
          : undefined,
      },
      {
        name: "AC",
        type: "line",
        data: punti.map((p) => p.ac),
        lineStyle: { color: colori.ac },
        itemStyle: { color: colori.ac },
        markLine: { symbol: "none", label: { formatter: "BAC" }, lineStyle: { color: colori.testo, type: "dotted" }, data: [{ yAxis: bac }] },
      },
    ],
  };
}

function trendIndici(punti: { data: string; evm: { cpi: number | null; spi: number | null } }[]): EChartsOption {
  const colori = leggiColoriGrafico();
  return {
    textStyle: { color: colori.testo },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: punti.map((p) => p.data), axisLine: { lineStyle: { color: colori.griglia } } },
    yAxis: { type: "value", axisLine: { lineStyle: { color: colori.griglia } }, splitLine: { lineStyle: { color: colori.griglia } } },
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: colori.testo } },
    series: [
      {
        name: "CPI",
        type: "line",
        data: punti.map((p) => p.evm.cpi),
        lineStyle: { color: colori.ev },
        itemStyle: { color: colori.ev },
        markArea: {
          silent: true,
          data: [
            [{ yAxis: PARAMETRI.greenThreshold, itemStyle: { color: colori.verde, opacity: 0.08 } }, { yAxis: 10 }],
            [{ yAxis: PARAMETRI.yellowThreshold, itemStyle: { color: colori.giallo, opacity: 0.08 } }, { yAxis: PARAMETRI.greenThreshold }],
            [{ yAxis: 0, itemStyle: { color: colori.rosso, opacity: 0.08 } }, { yAxis: PARAMETRI.yellowThreshold }],
          ],
        },
      },
      { name: "SPI", type: "line", data: punti.map((p) => p.evm.spi), lineStyle: { color: colori.ac }, itemStyle: { color: colori.ac } },
    ],
  };
}

export function DashboardScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [d] = useDati<Dashboard>("dashboard", percorso);
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [riserve] = useDati<Riserve>("riserve_dati", percorso);
  const [perimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);

  const codiceRadice = React.useMemo(
    () => perimetri?.find((p) => p.id === ctx.scopeId)?.codiceWbs ?? null,
    [perimetri, ctx.scopeId],
  );
  const vista = React.useMemo(
    () => (datiMon ? vistaMonitoraggio(filtraPerPerimetro(datiMon, codiceRadice)) : null),
    [datiMon, codiceRadice],
  );
  const copertura = React.useMemo(
    () => (datiMon ? coperturaTaskPct(filtraPerPerimetro(datiMon, codiceRadice)) : 0),
    [datiMon, codiceRadice],
  );

  if (!percorso) return <Vuoto messaggio="Open or create a project to see the dashboard." />;
  if (!d || !datiMon || !vista) return <Vuoto messaggio="Loading…" />;

  const testata = puntoTestata(vista, ctx);

  return (
    <div className="flex flex-col gap-6 p-4">
      {!testata ? (
        <Vuoto messaggio="No status date: import a plan or a workbook, or record progress in the Progress screen." />
      ) : (
        <>
          <section className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              EVM as of {testata.data}
              {copertura < 1 && (
                <span className="ml-2 rounded-full bg-semaforo-giallo/20 px-2 py-0.5 text-xs font-normal text-semaforo-giallo">
                  Provisional — {num(copertura * 100)}% of BAC covered
                </span>
              )}
            </h2>
          </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Kpi etichetta="BAC" valore={eur(vista.bac)} nota="WBS budget" />
            <Kpi etichetta="Budget baseline" valore={d.bacTotale === null ? "—" : eur(d.bacTotale)} nota="WBS + indirect + contingency" />
            <Kpi etichetta="PV" valore={eur(testata.pv)} />
            <Kpi etichetta="EV" valore={eur(testata.ev)} />
            <Kpi etichetta="AC" valore={eur(testata.ac)} />
            <Kpi etichetta="CV / SV" valore={`${eur(testata.evm.cv)} / ${eur(testata.evm.sv)}`} />
            <Kpi etichetta="CPI" valore={<Indice valore={testata.evm.cpi} luce={testata.evm.cpiLight} />} nota="EV ÷ AC" />
            <Kpi etichetta="SPI" valore={<Indice valore={testata.evm.spi} luce={testata.evm.spiLight} />} nota="EV ÷ PV" />
            <Kpi etichetta="EAC" valore={eur(testata.evm.eac)} nota={`optimistic ${eur(testata.evm.eacOptimistic)}`} />
            <Kpi etichetta="VAC" valore={eur(testata.evm.vac)} />
            <Kpi etichetta="TCPI" valore={testata.evm.tcpi === null ? "—" : num(testata.evm.tcpi)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold">S-curve</h3>
              <EChart option={curvaS(vista.punti, vista.bac, testata.data)} className="h-64" />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">CPI / SPI trend</h3>
              <EChart option={trendIndici(vista.punti)} className="h-64" />
            </section>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Top deviations by WBS</h3>
            {Object.keys(testata.perWbs).length === 0 ? (
              <p className="text-sm text-muted-foreground">No WBS node with EVM figures yet.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["WBS", "CV", "SV", "CPI", "SPI"].map((t) => (
                      <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(testata.perWbs)
                    .sort(([, a], [, b]) => Math.abs(b.cv) - Math.abs(a.cv))
                    .slice(0, 10)
                    .map(([codice, e]) => (
                      <tr
                        key={codice}
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => useLayoutStore.getState().openScreen("wbs", "WBS")}
                      >
                        <td className={`${CELLA} tabular-num`}>{codice}</td>
                        <td className={`${CELLA} tabular-num text-right`}>{eur(e.cv)}</td>
                        <td className={`${CELLA} tabular-num text-right`}>{eur(e.sv)}</td>
                        <td className={`${CELLA} text-right`}><Indice valore={e.cpi} luce={e.cpiLight} /></td>
                        <td className={`${CELLA} text-right`}><Indice valore={e.spi} luce={e.spiLight} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {riserve && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Reserves</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi etichetta="Contingency" valore={`${riserve.contingencyPct}%`} nota={`allocated ${eur(riserve.contingenzaAllocata)}`} />
            <Kpi etichetta="Management reserve" valore={`${riserve.mgmtReservePct}%`} />
            <Kpi etichetta="Time buffer" valore={`${riserve.timeBufferDays} days`} />
          </div>
        </section>
      )}

      <EvmWorkbookSezione percorso={percorso} />

      <section>
        <h3 className="mb-2 text-sm font-semibold">Anomalies</h3>
        {d.anomalie.length === 0 ? (
          <p className="text-sm text-muted-foreground">No anomalies detected.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>UID</th>
                <th className={TESTA_TABELLA}>Task</th>
                <th className={TESTA_TABELLA}>Issue</th>
              </tr>
            </thead>
            <tbody>
              {d.anomalie.map((a, i) => (
                <tr key={`${a.uid}-${i}`}>
                  <td className={`${CELLA} tabular-num`}>{a.uid}</td>
                  <td className={CELLA}>{a.nome}</td>
                  <td className={`${CELLA} text-semaforo-giallo`}>{a.messaggio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
