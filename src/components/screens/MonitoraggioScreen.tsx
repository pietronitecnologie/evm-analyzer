// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Monitoraggio EVM: PV, EV, AC e indici per data di stato, per il progetto aperto. Ogni
// valore arriva dal motore (lib/monitoraggio.ts). Mostra anche i checkpoint del workbook.

import * as React from "react";

import { vistaMonitoraggio, type PuntoVista } from "@/lib/monitoraggio";
import type { DatiMonitoraggio } from "@/lib/api";
import { CELLA, TESTA_TABELLA, usePercorso, useDati } from "@/lib/schermate";
import { Sezione, Vuoto } from "./comuni";
import { Indice, Kpi } from "./kpi";
import { eur, num } from "@/lib/format";
import { TermineEvm } from "./TermineEvm";

function Ultimo({ p, bac }: { p: PuntoVista; bac: number }) {
  const motivo = p.evm.warnings.map((w) => w.message).join("; ");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Kpi etichetta={<TermineEvm sigla="BAC" />} valore={eur(bac)} nota="WBS budget" />
      <Kpi etichetta={<TermineEvm sigla="PV" />} valore={eur(p.pv)} nota={`as of ${p.data}`} />
      <Kpi etichetta={<TermineEvm sigla="EV" />} valore={eur(p.ev)} />
      <Kpi etichetta={<TermineEvm sigla="AC" />} valore={eur(p.ac)} />
      <Kpi etichetta={<><TermineEvm sigla="CV" /> / <TermineEvm sigla="SV" /></>} valore={`${eur(p.evm.cv)} / ${eur(p.evm.sv)}`} />
      <Kpi etichetta={<TermineEvm sigla="CPI" />} valore={<Indice valore={p.evm.cpi} luce={p.evm.cpiLight} motivo={motivo} />} nota="EV ÷ AC" />
      <Kpi etichetta={<TermineEvm sigla="SPI" />} valore={<Indice valore={p.evm.spi} luce={p.evm.spiLight} motivo={motivo} />} nota="EV ÷ PV" />
      <Kpi etichetta={<TermineEvm sigla="EAC" />} valore={eur(p.evm.eac)} nota={`optimistic ${eur(p.evm.eacOptimistic)}`} />
      <Kpi etichetta={<TermineEvm sigla="VAC" />} valore={eur(p.evm.vac)} />
      <Kpi etichetta={<TermineEvm sigla="TCPI" />} valore={p.evm.tcpi === null ? "—" : num(p.evm.tcpi)} nota="efficiency required on the remainder" />
    </div>
  );
}

export function MonitoraggioScreen() {
  const percorso = usePercorso();
  const [dati] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const vista = React.useMemo(() => (dati ? vistaMonitoraggio(dati) : null), [dati]);
  if (!percorso) return <Vuoto messaggio="Open or create a project to see EVM monitoring." />;
  if (!dati || !vista) return <Vuoto messaggio="Loading…" />;

  const ultimo = vista.punti[vista.punti.length - 1];
  const nessunDato = vista.punti.length === 0 && dati.checkpoint.length === 0;
  if (nessunDato) {
    return (
      <Vuoto messaggio="No status date: record progress in the Progress screen, or import a workbook with monitoring data." />
    );
  }

  return (
    <div className="flex flex-col">
      {ultimo ? (
        <Sezione titolo={`Latest status date: ${ultimo.data}`}>
          <Ultimo p={ultimo} bac={vista.bac} />
        </Sezione>
      ) : (
        <Sezione titolo="Monitoring">
          <p className="text-sm text-muted-foreground">No status date from the app: for now only the workbook checkpoints are shown.</p>
        </Sezione>
      )}

      <Sezione titolo="Series by status date (from the app's log)">
        {vista.punti.length === 0 ? (
          <p className="text-sm text-muted-foreground">No progress recorded.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Date", "Source", "PV", "EV", "AC", "CPI", "SPI", "EAC", "VAC", "TCPI"].map((t) => (
                    <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}><TermineEvm sigla={t} /></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vista.punti.map((p) => (
                  <tr key={`${p.data}-${p.sorgente}`}>
                    <td className={`${CELLA} tabular-num`}>{p.data}</td>
                    <td className={CELLA}>{p.etichetta ?? p.sorgente}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(p.pv)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(p.ev)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(p.ac)}</td>
                    <td className={`${CELLA} text-right`}><Indice valore={p.evm.cpi} luce={p.evm.cpiLight} /></td>
                    <td className={`${CELLA} text-right`}><Indice valore={p.evm.spi} luce={p.evm.spiLight} /></td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(p.evm.eac)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(p.evm.vac)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{p.evm.tcpi === null ? "—" : num(p.evm.tcpi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sezione>

      {ultimo && (
        <Sezione titolo={`By WBS node as of ${ultimo.data}`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["WBS", "Budget", "PV", "EV", "AC", "CV", "SV", "CPI", "SPI"].map((t) => (
                  <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}><TermineEvm sigla={t} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(ultimo.perWbs).map(([codice, e]) => {
                const m = ultimo.perWbsMisure[codice];
                return (
                  <tr key={codice}>
                    <td className={`${CELLA} tabular-num`}>{codice}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(vista.budgetPerWbs[codice] ?? null)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(m.pv)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(m.ev)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(m.ac)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(e.cv)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(e.sv)}</td>
                    <td className={`${CELLA} text-right`}><Indice valore={e.cpi} luce={e.cpiLight} /></td>
                    <td className={`${CELLA} text-right`}><Indice valore={e.spi} luce={e.spiLight} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Sezione>
      )}

      <Sezione titolo="Workbook checkpoints">
        {dati.checkpoint.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checkpoint imported from the workbook.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Date", "Note", "% planned", "% actual", "AC"].map((t) => (
                  <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dati.checkpoint.map((c) => (
                <tr key={c.data}>
                  <td className={`${CELLA} tabular-num`}>{c.data}</td>
                  <td className={CELLA}>{c.nota ?? "—"}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{c.pctPianificato === null ? "—" : `${num(c.pctPianificato * 100)} %`}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{c.pctReale === null ? "—" : `${num(c.pctReale * 100)} %`}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(c.ac)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sezione>

      {vista.avvisi.length > 0 && (
        <Sezione titolo="Warnings">
          <ul className="list-disc pl-5 text-sm text-semaforo-giallo">
            {vista.avvisi.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
        </Sezione>
      )}
    </div>
  );
}
