// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Forecast (specifica Fase 5, §3.6): schede EAC, Earned Schedule. Nessun calcolo nuovo
// per EAC: l'adattatore già usato da Dashboard/WBS/Task (lib/monitoraggio.ts) porta
// ETC/EAC/EAC ottimistica/VAC/TCPI per ogni data di stato dentro `EvmOutput`. Earned
// Schedule chiama una funzione del motore (`earnedSchedule`) finora esportata ma non
// ancora richiamata da nessuna schermata. La scheda Monte Carlo (e il pannello
// condiviso con Agile) è stata rimossa su richiesta dell'utente: inutilizzata (vedi
// DECISIONS.md).

import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { EChartsOption } from "echarts";
import { diffDays, earnedSchedule } from "@evm-analyzer/engine";

import { EChart } from "@/components/charts/EChart";
import { leggiColoriGrafico } from "@/components/charts/tema";
import type { DatiMonitoraggio, Perimetro } from "@/lib/api";
import { eur, num } from "@/lib/format";
import { coperturaTaskPct, filtraPerPerimetro, puntoTestata, vistaMonitoraggio, type PuntoVista, type VistaMonitoraggio } from "@/lib/monitoraggio";
import { usePercorso, useDati } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Vuoto } from "./comuni";
import { Kpi } from "./kpi";

export function ForecastScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [perimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);

  const codiceRadice = React.useMemo(() => perimetri?.find((p) => p.id === ctx.scopeId)?.codiceWbs ?? null, [perimetri, ctx.scopeId]);
  const vista = React.useMemo(() => (datiMon ? vistaMonitoraggio(filtraPerPerimetro(datiMon, codiceRadice)) : null), [datiMon, codiceRadice]);
  const copertura = React.useMemo(() => (datiMon ? coperturaTaskPct(filtraPerPerimetro(datiMon, codiceRadice)) : 0), [datiMon, codiceRadice]);

  if (!percorso) return <Vuoto messaggio="Open or create a project for forecast." />;
  if (!datiMon || !vista) return <Vuoto messaggio="Loading…" />;

  const testata = puntoTestata(vista, ctx);
  if (!testata) return <Vuoto messaggio="No status date: import a plan or record progress in the Progress screen first." />;

  return (
    <Tabs.Root defaultValue="eac" className="flex h-full flex-col">
      <Tabs.List className="flex gap-1 border-b border-border-strong bg-zona-navigazione px-2">
        {[
          { v: "eac", t: "EAC" },
          { v: "earned-schedule", t: "Earned Schedule" },
        ].map(({ v, t }) => (
          <Tabs.Trigger
            key={v}
            value={v}
            className="rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground"
          >
            {t}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {copertura < 1 && (
        <p className="border-b border-border-strong bg-zona-contesto px-4 py-1.5 text-xs text-semaforo-giallo">
          Provisional — {num(copertura * 100)}% of BAC covered as of {testata.data}.
        </p>
      )}
      <Tabs.Content value="eac" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaEac vista={vista} testata={testata} />
      </Tabs.Content>
      <Tabs.Content value="earned-schedule" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaEarnedSchedule vista={vista} testata={testata} dataInizio={ctx.dataInizio} dataFinePrevista={ctx.dataFinePrevista} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

// ------------------------------------------------------------------- EAC

function graficoEac(punti: PuntoVista[], bac: number): EChartsOption {
  const colori = leggiColoriGrafico();
  return {
    textStyle: { color: colori.testo },
    grid: { left: 56, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: punti.map((p) => p.data), axisLine: { lineStyle: { color: colori.griglia } } },
    yAxis: { type: "value", axisLine: { lineStyle: { color: colori.griglia } }, splitLine: { lineStyle: { color: colori.griglia } } },
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: colori.testo } },
    series: [
      {
        name: "EAC (base)",
        type: "bar",
        data: punti.map((p) => p.evm.eac),
        itemStyle: { color: colori.ac },
        markLine: { symbol: "none", label: { formatter: "BAC" }, lineStyle: { color: colori.testo, type: "dotted" }, data: [{ yAxis: bac }] },
      },
      { name: "EAC (optimistic)", type: "bar", data: punti.map((p) => p.evm.eacOptimistic), itemStyle: { color: colori.ev } },
    ],
  };
}

function SchedaEac({ vista, testata }: { vista: VistaMonitoraggio; testata: PuntoVista }) {
  const e = testata.evm;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi etichetta="BAC" valore={eur(vista.bac)} />
        <Kpi etichetta="ETC" valore={eur(e.etc)} nota="Estimate to complete" />
        <Kpi etichetta="EAC (base)" valore={eur(e.eac)} nota="AC + ETC" />
        <Kpi etichetta="EAC (optimistic)" valore={eur(e.eacOptimistic)} nota="AC + (BAC − EV)" />
        <Kpi etichetta="VAC" valore={eur(e.vac)} nota="BAC − EAC" />
        <Kpi etichetta="TCPI" valore={e.tcpi === null ? "—" : num(e.tcpi)} nota="(BAC−EV) ÷ (BAC−AC)" />
      </div>
      {e.tcpi !== null && e.tcpi > 1.1 && (
        <p className="rounded-md border border-semaforo-giallo bg-semaforo-giallo/10 p-3 text-sm text-semaforo-giallo">
          TCPI &gt; 1.1: the remaining budget requires an efficiency above 110% — consider rescheduling, renegotiating, or correcting the estimate.
        </p>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold">EAC vs BAC</h3>
        <EChart option={graficoEac(vista.punti, vista.bac)} className="h-64" />
      </section>
    </div>
  );
}

// ---------------------------------------------------------- Earned Schedule

/** Il punto della vista la cui distanza da `giorni` (dall'inizio progetto) è minima: usato per
 * ancorare la linea "ES" a un valore esistente sull'asse a categorie (date di stato), che non
 * accetta una data arbitraria non presente tra i tick. */
function dataPiuVicina(punti: PuntoVista[], dataInizio: string, giorni: number): string | undefined {
  let scelto: PuntoVista | undefined;
  let distanzaMin = Infinity;
  for (const p of punti) {
    const distanza = Math.abs(diffDays(dataInizio, p.data) - giorni);
    if (distanza < distanzaMin) {
      distanzaMin = distanza;
      scelto = p;
    }
  }
  return scelto?.data;
}

function graficoEarnedSchedule(punti: PuntoVista[], dataEs?: string): EChartsOption {
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
        markLine: dataEs
          ? { symbol: "none", label: { formatter: "ES" }, lineStyle: { color: colori.testo, type: "dashed" }, data: [{ xAxis: dataEs }] }
          : undefined,
      },
    ],
  };
}

function SchedaEarnedSchedule({
  vista,
  testata,
  dataInizio,
  dataFinePrevista,
}: {
  vista: VistaMonitoraggio;
  testata: PuntoVista;
  dataInizio: string | null;
  dataFinePrevista: string | null;
}) {
  if (!dataInizio || !dataFinePrevista) {
    return (
      <Vuoto messaggio="Earned Schedule requires the project's start and planned end dates, which this project doesn't have yet." />
    );
  }

  const risultato = earnedSchedule({
    pvCurve: vista.punti.map((p) => ({ date: p.data, cumulative: p.pv })),
    ev: testata.ev,
    bac: vista.bac,
    statusDate: testata.data,
    startDate: dataInizio,
    plannedEndDate: dataFinePrevista,
  });
  const dataEs = dataPiuVicina(vista.punti, dataInizio, risultato.es);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi etichetta="ES" valore={`${num(risultato.es)} d`} nota="Earned schedule" />
        <Kpi etichetta="AT" valore={`${num(risultato.at)} d`} nota="Actual time" />
        <Kpi etichetta="SPI(t)" valore={risultato.spiT === null ? "—" : num(risultato.spiT)} nota="ES ÷ AT" />
        <Kpi etichetta="SV(t)" valore={`${risultato.svT > 0 ? "+" : ""}${num(risultato.svT)} d`} nota="ES − AT" />
        <Kpi
          etichetta="Estimated finish"
          valore={risultato.estimatedFinish ?? "—"}
          nota={`planned ${dataFinePrevista}`}
        />
      </div>
      <section>
        <h3 className="mb-2 text-sm font-semibold">PV / EV with Earned Schedule</h3>
        <EChart option={graficoEarnedSchedule(vista.punti, dataEs)} className="h-64" />
      </section>
    </div>
  );
}
