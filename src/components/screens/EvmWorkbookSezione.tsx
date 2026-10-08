// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Sezione EVM del workbook nella Dashboard: stima, monitoraggio per checkpoint, agile,
// riserve. Tutti i valori vengono dal motore (vista in lib/evm-workbook.ts).

import * as React from "react";

import type { TrafficLight } from "@evm-analyzer/engine";

import { classeSemaforo, vistaEvmWorkbook, type RigaCheckpoint, type VistaEvmWorkbook } from "@/lib/evm-workbook";
import type { WorkbookImportato } from "@/stores/esito-importazione-store";
import { CELLA, TESTA_TABELLA, useDati } from "@/lib/schermate";
import { Sezione } from "./comuni";

const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const num = (v: number, d = 2) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => `${(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })} %`;

const ETICHETTA_LUCE: Record<TrafficLight, string> = {
  verde: "green",
  giallo: "yellow",
  rosso: "red",
  nd: "n/a",
};

/** Indice con semaforo: `—` con il motivo nel tooltip se non definito. */
function Indice({ valore, luce, motivi }: { valore: number | null; luce: TrafficLight; motivi: string[] }) {
  if (valore === null) {
    return <span className="text-muted-foreground" title={motivi.join("; ") || "not defined"}>—</span>;
  }
  return (
    <span className={`tabular-num font-medium ${classeSemaforo(luce)}`}>
      {num(valore)} <span className="text-xs">({ETICHETTA_LUCE[luce]})</span>
    </span>
  );
}

function Kpi({ etichetta, valore, nota }: { etichetta: string; valore: React.ReactNode; nota?: string }) {
  return (
    <div className="rounded-md border border-border-strong bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <p className="tabular-num mt-1 text-lg font-semibold">{valore}</p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function UltimoCheckpoint({ r }: { r: RigaCheckpoint }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Kpi etichetta="PV" valore={eur(r.pv)} nota={`as of ${r.data}`} />
      <Kpi etichetta="EV" valore={eur(r.ev)} />
      <Kpi etichetta="AC" valore={eur(r.ac)} />
      <Kpi etichetta="CPI" valore={<Indice valore={r.cpi} luce={r.cpiLight} motivi={r.motivi} />} nota="EV ÷ AC" />
      <Kpi etichetta="SPI" valore={<Indice valore={r.spi} luce={r.spiLight} motivi={r.motivi} />} nota="EV ÷ PV" />
      <Kpi etichetta="CV / SV" valore={`${eur(r.cv)} / ${eur(r.sv)}`} />
      <Kpi etichetta="EAC" valore={eur(r.eac)} nota={`optimistic ${eur(r.eacOttimistica)}`} />
      <Kpi etichetta="VAC" valore={eur(r.vac)} />
      <Kpi etichetta="TCPI" valore={r.tcpi === null ? "—" : num(r.tcpi)} nota="efficiency required on the remainder" />
      <Kpi etichetta="ETC" valore={eur(r.etc)} />
    </div>
  );
}

function Stima({ v }: { v: VistaEvmWorkbook }) {
  const s = v.stima;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi etichetta={`BAC (${v.etichettaBase})`} valore={eur(v.baseMisura)} />
        <Kpi etichetta="BAC with contingency" valore={eur(s.bacTotal)} />
        <Kpi etichetta="BAC without contingency" valore={eur(s.direct + s.indirect)} />
        <Kpi etichetta="Approved budget" valore={eur(s.budgetApproved)} nota="BAC + management reserve" />
        <Kpi etichetta="Effort" valore={`${num(s.effortDays)} person-days`} nota={`project σ ${num(s.sigmaProject)} days`} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <span>Direct: <strong className="tabular-num">{eur(s.direct)}</strong></span>
        <span>Indirect: <strong className="tabular-num">{eur(s.indirect)}</strong></span>
        <span>Contingency: <strong className="tabular-num">{eur(s.contingency)}</strong></span>
        <span>Management reserve: <strong className="tabular-num">{eur(s.mgmtReserve)}</strong></span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-sm">
        <span>BAC range ±1σ: <span className="tabular-num">{eur(s.bacRange.low1)} – {eur(s.bacRange.high1)}</span> <span className="text-xs text-muted-foreground">(68%)</span></span>
        <span>BAC range ±2σ: <span className="tabular-num">{eur(s.bacRange.low2)} – {eur(s.bacRange.high2)}</span> <span className="text-xs text-muted-foreground">(95%)</span></span>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TESTA_TABELLA}>ID</th>
              <th className={TESTA_TABELLA}>Activity</th>
              <th className={`${TESTA_TABELLA} text-right`}>PERT (days)</th>
              <th className={`${TESTA_TABELLA} text-right`}>σ (days)</th>
              <th className={`${TESTA_TABELLA} text-right`}>Direct cost</th>
            </tr>
          </thead>
          <tbody>
            {s.activities.map((a, i) => (
              <tr key={a.id}>
                <td className={`${CELLA} tabular-num`}>{a.id}</td>
                <td className={CELLA}>{v.nomi[i]}</td>
                <td className={`${CELLA} tabular-num text-right`}>{num(a.pert)}</td>
                <td className={`${CELLA} tabular-num text-right`}>{num(a.sigma)}</td>
                <td className={`${CELLA} tabular-num text-right`}>{eur(a.directCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EvmWorkbookSezione({ percorso }: { percorso: string | null }) {
  const [dati] = useDati<WorkbookImportato>("input_workbook", percorso);
  const vista = React.useMemo(() => (dati ? vistaEvmWorkbook(dati) : null), [dati]);
  if (!vista || !dati) return null;

  return (
    <div className="flex flex-col gap-6">
      <Sezione titolo="Workbook EVM — estimate and budget">
        <Stima v={vista} />
      </Sezione>

      <Sezione titolo="Checkpoint monitoring">
        {vista.checkpoint.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checkpoint in monitoring.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <UltimoCheckpoint r={vista.checkpoint[vista.checkpoint.length - 1]} />
            <div className="max-h-80 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Date", "% plan.", "% actual", "PV", "EV", "AC", "CPI", "SPI", "EAC", "VAC", "TCPI"].map((t) => (
                      <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vista.checkpoint.map((r) => (
                    <tr key={r.data}>
                      <td className={`${CELLA} tabular-num`}>{r.data}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{pct(r.pctPianificato)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{pct(r.pctReale)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(r.pv)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(r.ev)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(r.ac)}</td>
                      <td className={`${CELLA} text-right`}><Indice valore={r.cpi} luce={r.cpiLight} motivi={r.motivi} /></td>
                      <td className={`${CELLA} text-right`}><Indice valore={r.spi} luce={r.spiLight} motivi={r.motivi} /></td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(r.eac)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(r.vac)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{r.tcpi === null ? "—" : num(r.tcpi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Sezione>

      {vista.sprint.length > 0 && (
        <Sezione titolo="Agile — baseline cost per SP (non-circular)">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Sprint", "Cost per SP", "Agile EV", "Agile PV", "AC", "Agile CPI", "Agile SPI"].map((t) => (
                  <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vista.sprint.map((s) => (
                <tr key={s.numero}>
                  <td className={CELLA}>Sprint {s.numero}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(s.costoPerSp)}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(s.ev)}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(s.pv)}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(s.ac)}</td>
                  <td className={`${CELLA} text-right`}><Indice valore={s.cpi} luce={s.cpiLight} motivi={[]} /></td>
                  <td className={`${CELLA} text-right`}><Indice valore={s.spi} luce={s.spiLight} motivi={[]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sezione>
      )}

      <Sezione titolo="Reserves">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi etichetta="Budgeted contingency" valore={eur(vista.stima.contingency)} />
          <Kpi etichetta="Allocated contingency" valore={eur(vista.contingenza.allocatedTotal)} nota="sum per risk" />
          <Kpi etichetta="Used contingency" valore={eur(vista.contingenza.used)} nota={`remaining ${eur(vista.contingenza.residual)}`} />
          <Kpi etichetta="Management reserve" valore={eur(vista.riservaGestione.residual)} nota="available" />
        </div>
        {vista.avvisi.length > 0 && (
          <ul className="mt-4 list-disc pl-5 text-sm text-semaforo-giallo">
            {vista.avvisi.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
      </Sezione>
    </div>
  );
}
