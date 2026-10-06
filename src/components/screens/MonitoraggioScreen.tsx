// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Monitoraggio EVM: PV, EV, AC e indici per data di stato, per il progetto aperto. Ogni
// valore arriva dal motore (lib/monitoraggio.ts). Mostra anche i checkpoint del workbook.

import * as React from "react";
import type { EvmOutput } from "@evm-analyzer/engine";

import { classeSemaforo } from "@/lib/evm-workbook";
import { vistaMonitoraggio, type PuntoVista } from "@/lib/monitoraggio";
import type { DatiMonitoraggio } from "@/lib/api";
import { CELLA, TESTA_TABELLA, usePercorso, useDati } from "@/lib/schermate";
import { Sezione, Vuoto } from "./comuni";

const eur = (v: number | null) => (v === null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Indice({ valore, luce, motivo }: { valore: number | null; luce: EvmOutput["cpiLight"]; motivo?: string }) {
  if (valore === null) return <span className="text-muted-foreground" title={motivo ?? "non definito"}>—</span>;
  return (
    <span className={`tabular-num font-medium ${classeSemaforo(luce)}`} title={motivo}>
      {num(valore)} <span className="text-xs">({luce})</span>
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

function Ultimo({ p, bac }: { p: PuntoVista; bac: number }) {
  const motivo = p.evm.warnings.map((w) => w.message).join("; ");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Kpi etichetta="BAC" valore={eur(bac)} nota="budget dei WBS" />
      <Kpi etichetta="PV" valore={eur(p.pv)} nota={`al ${p.data}`} />
      <Kpi etichetta="EV" valore={eur(p.ev)} />
      <Kpi etichetta="AC" valore={eur(p.ac)} />
      <Kpi etichetta="CV / SV" valore={`${eur(p.evm.cv)} / ${eur(p.evm.sv)}`} />
      <Kpi etichetta="CPI" valore={<Indice valore={p.evm.cpi} luce={p.evm.cpiLight} motivo={motivo} />} nota="EV ÷ AC" />
      <Kpi etichetta="SPI" valore={<Indice valore={p.evm.spi} luce={p.evm.spiLight} motivo={motivo} />} nota="EV ÷ PV" />
      <Kpi etichetta="EAC" valore={eur(p.evm.eac)} nota={`ottimistica ${eur(p.evm.eacOptimistic)}`} />
      <Kpi etichetta="VAC" valore={eur(p.evm.vac)} />
      <Kpi etichetta="TCPI" valore={p.evm.tcpi === null ? "—" : num(p.evm.tcpi)} nota="efficienza richiesta sul residuo" />
    </div>
  );
}

export function MonitoraggioScreen() {
  const percorso = usePercorso();
  const [dati] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const vista = React.useMemo(() => (dati ? vistaMonitoraggio(dati) : null), [dati]);
  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per vedere il monitoraggio EVM." />;
  if (!dati || !vista) return <Vuoto messaggio="Caricamento…" />;

  const ultimo = vista.punti[vista.punti.length - 1];
  const nessunDato = vista.punti.length === 0 && dati.checkpoint.length === 0;
  if (nessunDato) {
    return (
      <Vuoto messaggio="Nessuna data di stato: registra un avanzamento nella schermata Avanzamento, oppure importa un workbook con il monitoraggio." />
    );
  }

  return (
    <div className="flex flex-col">
      {ultimo ? (
        <Sezione titolo={`Ultima data di stato: ${ultimo.data}`}>
          <Ultimo p={ultimo} bac={vista.bac} />
        </Sezione>
      ) : (
        <Sezione titolo="Monitoraggio">
          <p className="text-sm text-muted-foreground">Nessuna data di stato dall'app: per ora mostro solo i checkpoint del workbook.</p>
        </Sezione>
      )}

      <Sezione titolo="Serie per data di stato (dal registro dell'app)">
        {vista.punti.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun avanzamento registrato.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Data", "Origine", "PV", "EV", "AC", "CPI", "SPI", "EAC", "VAC", "TCPI"].map((t) => (
                    <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}>{t}</th>
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
        <Sezione titolo={`Per nodo WBS alla data ${ultimo.data}`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["WBS", "Budget", "PV", "EV", "AC", "CV", "SV", "CPI", "SPI"].map((t) => (
                  <th key={t} className={`${TESTA_TABELLA} text-right first:text-left`}>{t}</th>
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

      <Sezione titolo="Checkpoint del workbook">
        {dati.checkpoint.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun checkpoint importato dal workbook.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Data", "Nota", "% pianificato", "% reale", "AC"].map((t) => (
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
        <Sezione titolo="Avvisi">
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
