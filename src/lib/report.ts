// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Report (specifica Fase 6, §2): genera un documento HTML autosufficiente — CSS di stampa
// inline, SVG inline (ECharts in modalità SSR: `renderToSVGString`, nessun canvas/DOM),
// nessuna classe Tailwind né variabile CSS dell'app — così l'anteprima (in un <iframe
// srcDoc>, isolato dallo stile dell'app), l'esportazione HTML e la stampa/PDF sono
// esattamente lo stesso documento, non tre resi diversi da mantenere sincronizzati.
//
// Fuori da questo giro (vedi DECISIONS.md): logo caricato dall'utente (solo il nome
// azienda in testo); paginazione
// "Pagina x di y" interattiva nell'anteprima a schermo (i numeri di pagina corretti
// escono solo nella stampa/PDF, via contatori CSS — l'anteprima scorre senza spezzare in
// pagine finte).

import type { AgileResult, ProgramResult } from "@evm-analyzer/engine";
import * as echarts from "echarts";

import type { ConteggioProblemi, FiloneRiga, ProblemaRiga, Riserve } from "@/lib/api";
import { formatDateIt } from "@/lib/format";
import { GLOSSARIO_EVM } from "@/lib/glossario-evm";
import type { PuntoVista, VistaMonitoraggio } from "@/lib/monitoraggio";
import { bufferTempoResiduo, giorniBufferConsumati, saluteBufferTempo, statoContingency, statoRiservaGestione } from "@/lib/riserve";

export interface SezioniReport {
  riepilogo: boolean;
  curvaS: boolean;
  trendIndici: boolean;
  topScostamenti: boolean;
  wbs: boolean;
  anomalie: boolean;
  riserve: boolean;
  filoni: boolean;
  agile: boolean;
  glossario: boolean;
}

export const SEZIONI_DEFAULT: SezioniReport = {
  riepilogo: true,
  curvaS: true,
  trendIndici: true,
  topScostamenti: true,
  wbs: true,
  anomalie: true,
  riserve: true,
  filoni: true,
  agile: true,
  glossario: true,
};

export interface OpzioniReport {
  sezioni: SezioniReport;
  nomeAzienda: string;
  autore: string;
}

export interface DatiReport {
  nomeProgetto: string;
  statusDate: string;
  statusDateState: string;
  perimetro: string;
  baseline: string;
  evBaseMode: string;
  copertura: number;
  versioneApp: string;
  vista: VistaMonitoraggio;
  testata: PuntoVista | undefined;
  riserve: Riserve | null;
  filoni: FiloneRiga[];
  programma: ProgramResult | null;
  metricheAgili: AgileResult | null;
  pctCompletatoBuffer: number;
  problemi: ProblemaRiga[];
  conteggioProblemi: ConteggioProblemi;
}

const eurStat = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numStat = (v: number | null | undefined, decimali = 2) =>
  v === null || v === undefined ? "—" : v.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
const COLORE_SEMAFORO: Record<string, string> = { verde: "#16a34a", giallo: "#ca8a04", rosso: "#dc2626", nd: "#6b7280" };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Grafico come stringa SVG (ECharts in modalità SSR: nessun canvas, nessun DOM). */
function renderSvg(option: echarts.EChartsOption, larghezza = 760, altezza = 300): string {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: larghezza, height: altezza });
  chart.setOption(option);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

function graficoCurvaS(vista: VistaMonitoraggio, statusDate: string): string {
  const punti = vista.punti;
  return renderSvg({
    grid: { left: 56, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: punti.map((p) => p.data) },
    yAxis: { type: "value" },
    legend: { bottom: 0 },
    series: [
      { name: "PV", type: "line", data: punti.map((p) => p.pv), lineStyle: { color: "#6b7280", type: "dashed" }, symbol: "none" },
      { name: "EV", type: "line", data: punti.map((p) => p.ev), lineStyle: { color: "#0d9488", type: "solid" }, symbol: "none", markLine: { symbol: "none", data: [{ xAxis: statusDate }], lineStyle: { color: "#111827" } } },
      { name: "AC", type: "line", data: punti.map((p) => p.ac), lineStyle: { color: "#ea580c", type: "dotted" }, symbol: "none", markLine: { symbol: "none", label: { formatter: "BAC" }, lineStyle: { color: "#111827", type: "dashed" }, data: [{ yAxis: vista.bac }] } },
    ],
  });
}

function graficoTrendIndici(vista: VistaMonitoraggio): string {
  const punti = vista.punti;
  return renderSvg({
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: punti.map((p) => p.data) },
    yAxis: { type: "value" },
    legend: { bottom: 0 },
    series: [
      { name: "CPI", type: "line", data: punti.map((p) => p.evm.cpi), lineStyle: { color: "#0d9488", type: "solid" }, symbol: "none" },
      { name: "SPI", type: "line", data: punti.map((p) => p.evm.spi), lineStyle: { color: "#ea580c", type: "dashed" }, symbol: "none" },
    ],
  });
}

function sezioneRiepilogo(d: DatiReport): string {
  if (!d.testata) return "";
  const e = d.testata.evm;
  const riga = (sigla: string, valore: string, luce?: string) => {
    const voce = GLOSSARIO_EVM[sigla];
    const colore = luce ? COLORE_SEMAFORO[luce] : "#111827";
    return `<div class="kpi-card"><p class="kpi-sigla">${sigla}</p><p class="kpi-valore" style="color:${colore}">${valore}</p>${voce ? `<p class="kpi-lettura">${escapeHtml(voce.lettura)}</p>` : ""}</div>`;
  };
  return `
    <section class="sezione">
      <h2>Executive summary</h2>
      <div class="kpi-grid">
        ${riga("BAC", eurStat(d.vista.bac))}
        ${riga("PV", eurStat(d.testata.pv))}
        ${riga("EV", eurStat(d.testata.ev))}
        ${riga("AC", eurStat(d.testata.ac))}
        ${riga("CV", eurStat(e.cv))}
        ${riga("SV", eurStat(e.sv))}
        ${riga("CPI", e.cpi === null ? "—" : numStat(e.cpi), e.cpiLight)}
        ${riga("SPI", e.spi === null ? "—" : numStat(e.spi), e.spiLight)}
        ${riga("ETC", eurStat(e.etc))}
        ${riga("EAC", eurStat(e.eac))}
        ${riga("VAC", eurStat(e.vac))}
        ${riga("TCPI", e.tcpi === null ? "—" : numStat(e.tcpi))}
      </div>
    </section>`;
}

function sezioneCurvaS(d: DatiReport): string {
  return `<section class="sezione"><h2>S-curve</h2><div class="grafico">${graficoCurvaS(d.vista, d.testata?.data ?? d.statusDate)}</div></section>`;
}

function sezioneTrend(d: DatiReport): string {
  return `<section class="sezione"><h2>CPI / SPI trend</h2><div class="grafico">${graficoTrendIndici(d.vista)}</div></section>`;
}

function sezioneTopScostamenti(d: DatiReport): string {
  if (!d.testata) return "";
  const righe = Object.entries(d.testata.perWbs)
    .sort(([, a], [, b]) => Math.abs(b.cv) - Math.abs(a.cv))
    .slice(0, 10);
  return `
    <section class="sezione">
      <h2>Top deviations by WBS</h2>
      <table><thead><tr><th>WBS</th><th class="num">CV</th><th class="num">SV</th><th class="num">CPI</th><th class="num">SPI</th></tr></thead>
      <tbody>${righe.map(([codice, e]) => `<tr><td>${escapeHtml(codice)}</td><td class="num">${eurStat(e.cv)}</td><td class="num">${eurStat(e.sv)}</td><td class="num" style="color:${COLORE_SEMAFORO[e.cpiLight]}">${e.cpi === null ? "—" : numStat(e.cpi)}</td><td class="num" style="color:${COLORE_SEMAFORO[e.spiLight]}">${e.spi === null ? "—" : numStat(e.spi)}</td></tr>`).join("")}</tbody></table>
    </section>`;
}

function sezioneWbs(d: DatiReport): string {
  if (!d.testata) return "";
  const righe = Object.entries(d.testata.perWbsMisure).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `
    <section class="sezione">
      <h2>WBS</h2>
      <table><thead><tr><th>WBS</th><th class="num">BAC</th><th class="num">PV</th><th class="num">EV</th><th class="num">AC</th><th class="num">CPI</th><th class="num">SPI</th></tr></thead>
      <tbody>${righe.map(([codice, m]) => {
        const out = d.testata!.perWbs[codice];
        return `<tr><td>${escapeHtml(codice)}</td><td class="num">${eurStat(m.bac)}</td><td class="num">${eurStat(m.pv)}</td><td class="num">${eurStat(m.ev)}</td><td class="num">${eurStat(m.ac)}</td><td class="num" style="color:${COLORE_SEMAFORO[out.cpiLight]}">${out.cpi === null ? "—" : numStat(out.cpi)}</td><td class="num" style="color:${COLORE_SEMAFORO[out.spiLight]}">${out.spi === null ? "—" : numStat(out.spi)}</td></tr>`;
      }).join("")}</tbody></table>
    </section>`;
}

function sezioneRiserve(d: DatiReport): string {
  if (!d.riserve) return "";
  const cont = statoContingency(d.riserve);
  const mr = statoRiservaGestione(d.riserve);
  const salute = saluteBufferTempo(d.riserve, d.pctCompletatoBuffer);
  return `
    <section class="sezione">
      <h2>Reserves and buffers</h2>
      <table><tbody>
        <tr><td>Contingency allocated / used / residual</td><td class="num">${eurStat(cont.allocatedTotal)} / ${eurStat(cont.used)} / ${eurStat(cont.residual)}</td></tr>
        <tr><td>Management reserve consumed / residual</td><td class="num">${eurStat(mr.consumed)} / ${eurStat(mr.residual)}</td></tr>
        <tr><td>Time buffer consumed / residual (days)</td><td class="num">${numStat(giorniBufferConsumati(d.riserve), 1)} / ${numStat(bufferTempoResiduo(d.riserve), 1)}</td></tr>
        <tr><td>Buffer health index</td><td class="num" style="color:${COLORE_SEMAFORO[salute.light]}">${salute.ratio === null ? "—" : numStat(salute.ratio)}</td></tr>
      </tbody></table>
      ${[...cont.warnings, ...mr.warnings, ...salute.warnings].map((w) => `<p class="avviso">${escapeHtml(w.message)}</p>`).join("")}
    </section>`;
}

function sezioneFiloni(d: DatiReport): string {
  if (!d.programma || d.programma.workstreams.length === 0) return "";
  const p = d.programma;
  return `
    <section class="sezione">
      <h2>Workstreams and program</h2>
      <table><thead><tr><th>Workstream</th><th>Type</th><th class="num">BAC</th><th class="num">EV</th><th class="num">AC</th><th class="num">CPI</th><th class="num">SPI</th></tr></thead>
      <tbody>
        ${p.workstreams.map((w) => `<tr><td>${escapeHtml(w.name)}</td><td>${escapeHtml(w.kind)}</td><td class="num">${eurStat(w.bac)}</td><td class="num">${eurStat(w.ev)}</td><td class="num">${eurStat(w.ac)}</td><td class="num" style="color:${COLORE_SEMAFORO[w.cpiLight]}">${w.cpi === null ? "—" : numStat(w.cpi)}</td><td class="num" style="color:${COLORE_SEMAFORO[w.spiLight]}">${w.spi === null ? "—" : numStat(w.spi)}</td></tr>`).join("")}
        <tr class="totale"><td colspan="2">Program</td><td class="num">${eurStat(p.bacProgram)}</td><td class="num">${eurStat(p.evProgram)}</td><td class="num">${eurStat(p.acProgram)}</td><td class="num">${p.cpiProgram === null ? "—" : numStat(p.cpiProgram)}</td><td class="num">${p.spiProgram === null ? "—" : numStat(p.spiProgram)}</td></tr>
      </tbody></table>
    </section>`;
}

function sezioneAgile(d: DatiReport): string {
  if (!d.metricheAgili) return "";
  const m = d.metricheAgili;
  return `
    <section class="sezione">
      <h2>Agile / Flow</h2>
      <table><tbody>
        <tr><td>Average velocity</td><td class="num">${m.velocityAvg === null ? "—" : numStat(m.velocityAvg)} SP/sprint</td></tr>
        <tr><td>Cost/SP (baseline)</td><td class="num">${eurStat(m.costPerSp)}${m.costPerSpDerived ? " (derived)" : ""}</td></tr>
        <tr><td>Sprints remaining</td><td class="num">${m.sprintRemainingCeil ?? "—"}</td></tr>
        <tr><td>EAC time / cost</td><td class="num">${m.eacTimeDays === null ? "—" : `${numStat(m.eacTimeDays, 0)} d`} / ${eurStat(m.eacCost)}</td></tr>
      </tbody></table>
    </section>`;
}

function sezioneAnomalie(d: DatiReport): string {
  const rilevanti = d.problemi.filter((p) => (p.state === "aperta" && p.severity !== "info") || p.state === "accettata");
  if (rilevanti.length === 0) return `<section class="sezione"><h2>Data quality</h2><p>No open critical issue or warning.</p></section>`;
  return `
    <section class="sezione">
      <h2>Data quality</h2>
      <table><thead><tr><th>Severity</th><th>Rule</th><th>Task/WBS</th><th>Description</th><th>Status</th></tr></thead>
      <tbody>${rilevanti.map((p) => `<tr><td style="color:${COLORE_SEMAFORO[p.severity === "critico" ? "rosso" : p.severity === "avviso" ? "giallo" : "nd"]}">${escapeHtml(p.severity)}</td><td>${escapeHtml(p.code)}</td><td>${escapeHtml(p.taskUid ?? p.wbsCodice ?? "—")}</td><td>${escapeHtml(p.message)}</td><td>${escapeHtml(p.state)}${p.acceptedReason ? ` — ${escapeHtml(p.acceptedReason)}` : ""}</td></tr>`).join("")}</tbody></table>
    </section>`;
}

function sezioneGlossario(): string {
  const voci = Object.entries(GLOSSARIO_EVM);
  return `
    <section class="sezione">
      <h2>KPI glossary</h2>
      <table><thead><tr><th>KPI</th><th>Meaning</th><th>Reading</th><th>Ref.</th></tr></thead>
      <tbody>${voci.map(([sigla, v]) => `<tr><td>${escapeHtml(sigla)} — ${escapeHtml(v.nome)}</td><td>${escapeHtml(v.significato)}</td><td>${escapeHtml(v.lettura)}</td><td>${escapeHtml(v.riferimento)}</td></tr>`).join("")}</tbody></table>
    </section>`;
}

async function hashContenuto(testo: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

const STILE = `
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; margin: 0; background: #e5e7eb; }
  .pagina { background: #fff; width: 210mm; min-height: 297mm; margin: 8mm auto; padding: 18mm; position: relative; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin-top: 20px; }
  .intestazione { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 12px; }
  .intestazione .meta { font-size: 11px; color: #4b5563; text-align: right; }
  .provvisorio { position: fixed; top: 40%; left: 10%; font-size: 48px; color: rgba(220,38,38,0.25); transform: rotate(-20deg); font-weight: bold; pointer-events: none; }
  .sezione { break-inside: avoid; margin-bottom: 8px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi-card { border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 8px; break-inside: avoid; }
  .kpi-sigla { font-size: 10px; text-transform: uppercase; color: #6b7280; margin: 0; }
  .kpi-valore { font-size: 15px; font-weight: 600; margin: 2px 0; }
  .kpi-lettura { font-size: 9px; color: #6b7280; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; break-inside: avoid; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 3px 6px; text-align: left; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.totale { font-weight: 600; border-top: 2px solid #111827; }
  .avviso { color: #92400e; font-size: 11px; }
  .grafico svg { max-width: 100%; }
  .piede { position: running(footer); }
  footer.piede-pagina { font-size: 9px; color: #6b7280; text-align: center; margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 4px; }
  @media print {
    body { background: #fff; }
    .pagina { margin: 0; box-shadow: none; width: auto; min-height: auto; }
    @page { size: A4; margin: 18mm; }
  }
`;

/** Genera il documento HTML autosufficiente del report (anteprima, export HTML e stampa/PDF sono questo stesso testo). */
export async function generaReportHtml(d: DatiReport, opz: OpzioniReport): Promise<string> {
  const sez = opz.sezioni;
  const corpo = [
    sez.riepilogo ? sezioneRiepilogo(d) : "",
    sez.curvaS && d.vista.punti.length > 0 ? sezioneCurvaS(d) : "",
    sez.trendIndici && d.vista.punti.length > 0 ? sezioneTrend(d) : "",
    sez.topScostamenti ? sezioneTopScostamenti(d) : "",
    sez.wbs ? sezioneWbs(d) : "",
    sez.filoni ? sezioneFiloni(d) : "",
    sez.agile ? sezioneAgile(d) : "",
    sez.riserve ? sezioneRiserve(d) : "",
    sez.anomalie ? sezioneAnomalie(d) : "",
    sez.glossario ? sezioneGlossario() : "",
  ].join("\n");

  const statoEtichetta: Record<string, string> = { bozza: "Draft", provvisorio: "Provisional", finale: "Final" };
  const hash = await hashContenuto(corpo);
  const generato = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(d.nomeProgetto)} — Report</title>
<style>${STILE}</style>
</head>
<body>
<div class="pagina">
  ${d.statusDateState === "provvisorio" ? `<div class="provvisorio">PROVISIONAL — ${Math.round(d.copertura * 100)}% of BAC</div>` : ""}
  <div class="intestazione">
    <div>
      <h1>${escapeHtml(d.nomeProgetto)}</h1>
      <p>Status date ${escapeHtml(d.statusDate)} · Scope ${escapeHtml(d.perimetro)} · Baseline ${escapeHtml(d.baseline)}</p>
      <p>${statoEtichetta[d.statusDateState] ?? d.statusDateState} — ${numStat(d.copertura * 100, 0)}% of BAC covered</p>
    </div>
    <div class="meta">
      ${opz.nomeAzienda ? `<p>${escapeHtml(opz.nomeAzienda)}</p>` : ""}
      <p>By ${escapeHtml(opz.autore)}<br/>${formatDateIt(generato)}</p>
      <p>App ${escapeHtml(d.versioneApp)}</p>
    </div>
  </div>
  ${corpo}
  <footer class="piede-pagina">Report hash ${hash} · app ${escapeHtml(d.versioneApp)} · generated ${formatDateIt(generato)}</footer>
</div>
</body>
</html>`;
}
