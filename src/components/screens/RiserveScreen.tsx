// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Buffer e riserve (specifica Fase 5, §3.8): schede Contingency, Management reserve,
// Buffer di tempo, ognuna con stato/avvisi dal motore (buffers.ts, finora scritto ma non
// richiamato da nessuna schermata: lib/riserve.ts adatta Riserve a RiskRow/
// ContingencyStatus/ManagementReserveStatus/BufferHealth). L'indice di salute del buffer
// si applica solo al buffer di tempo (consumo del buffer contro % di progetto
// completata); contingency/management reserve hanno il loro stato invece di un indice.

import * as React from "react";
import { Check, Plus, Save } from "lucide-react";

import { chiama, type DatiMonitoraggio, type Riserve } from "@/lib/api";
import { classeSemaforo } from "@/lib/evm-workbook";
import { eur, num } from "@/lib/format";
import { puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { bufferTempoResiduo, giorniBufferConsumati, saluteBufferTempo, statoContingency, statoRiservaGestione } from "@/lib/riserve";
import { CAMPO, CELLA, TESTA_TABELLA, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Button } from "@/components/ui/button";
import { Campo, Sezione, Vuoto } from "./comuni";
import { Kpi } from "./kpi";

export function RiserveScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [r, ricarica] = useDati<Riserve>("riserve_dati", percorso);
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const puoGestire = ctx.userRuoli.includes("coordinatore_piano");

  const [parametri, setParametri] = React.useState({ contingenza: "", gestione: "", buffer: "" });

  if (!percorso) return <Vuoto messaggio="Open or create a project to see buffers and reserves." />;
  if (!r || !datiMon) return <Vuoto messaggio="Loading…" />;

  const intero = (v: string) => (v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);
  const vista = vistaMonitoraggio(datiMon);
  const testata = puntoTestata(vista, ctx);
  const pctCompletato = testata && vista.bac > 0 ? (testata.ev / vista.bac) * 100 : 0;

  async function salvaParametri(e: React.FormEvent) {
    e.preventDefault();
    const contingenza = intero(parametri.contingenza);
    const gestione = intero(parametri.gestione);
    if (Number.isNaN(contingenza) || Number.isNaN(gestione)) {
      avviso("Invalid percentage", "use an integer between 0 and 100");
      return;
    }
    const ok = await esegui("Parameters not saved", () =>
      chiama(percorso!, "aggiorna_parametri", {
        contingencyPct: contingenza ?? r!.contingencyPct,
        mgmtReservePct: gestione ?? r!.mgmtReservePct,
        timeBufferDays: Number(parametri.buffer || r!.timeBufferDays),
      }),
      "Parameters saved",
    );
    if (ok) {
      setParametri({ contingenza: "", gestione: "", buffer: "" });
      await ricarica();
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Parameters">
        <div className="mb-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <span>Contingency: <strong>{r.contingencyPct} %</strong></span>
          <span>Management reserve: <strong>{r.mgmtReservePct} %</strong></span>
          <span>Time buffer: <strong>{r.timeBufferDays} days</strong></span>
          <span>BAC: <strong>{eur(r.bacTotale)}</strong></span>
          <span>Project completed: <strong>{num(pctCompletato)}%</strong></span>
        </div>
        <form onSubmit={salvaParametri} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Contingency %">
            <input type="number" min="0" max="100" step="1" className={CAMPO} placeholder={String(r.contingencyPct)} value={parametri.contingenza} onChange={(e) => setParametri({ ...parametri, contingenza: e.target.value })} />
          </Campo>
          <Campo etichetta="Management reserve %">
            <input type="number" min="0" max="100" step="1" className={CAMPO} placeholder={String(r.mgmtReservePct)} value={parametri.gestione} onChange={(e) => setParametri({ ...parametri, gestione: e.target.value })} />
          </Campo>
          <Campo etichetta="Time buffer (days)">
            <input type="number" min="0" step="0.5" className={CAMPO} placeholder={String(r.timeBufferDays)} value={parametri.buffer} onChange={(e) => setParametri({ ...parametri, buffer: e.target.value })} />
          </Campo>
          <Button type="submit">
            <Save className="size-4" />
            Save parameters
          </Button>
        </form>
      </Sezione>

      <SchedaContingency percorso={percorso} r={r} ricarica={ricarica} />
      <SchedaRiservaGestione percorso={percorso} r={r} ricarica={ricarica} puoGestire={puoGestire} attoreId={ctx.attoreId} />
      <SchedaBufferTempo percorso={percorso} r={r} ricarica={ricarica} pctCompletato={pctCompletato} />
    </div>
  );
}

function Avvisi({ avvisi }: { avvisi: { message: string }[] }) {
  if (avvisi.length === 0) return null;
  return (
    <ul className="mb-3 list-disc pl-5 text-sm text-semaforo-giallo">
      {avvisi.map((a, i) => <li key={i}>{a.message}</li>)}
    </ul>
  );
}

// ------------------------------------------------------------- Contingency

function SchedaContingency({ percorso, r, ricarica }: { percorso: string; r: Riserve; ricarica: () => Promise<void> }) {
  const [rischio, setRischio] = React.useState({ descrizione: "", probabilita: "", impatto: "", contingenza: "" });
  const stato = statoContingency(r);
  const intero = (v: string) => (v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);
  const numero = (v: string) => (v === "" ? null : Number(v));

  async function creaRischio(e: React.FormEvent) {
    e.preventDefault();
    const probabilita = intero(rischio.probabilita);
    if (Number.isNaN(probabilita)) {
      avviso("Invalid probability", "use an integer between 0 and 100");
      return;
    }
    const ok = await esegui("Risk not created", () =>
      chiama(percorso, "crea_rischio", {
        descrizione: rischio.descrizione,
        probabilitaPct: probabilita,
        impatto: numero(rischio.impatto),
        contingenza: numero(rischio.contingenza),
      }),
      "Risk recorded",
    );
    if (ok) {
      setRischio({ descrizione: "", probabilita: "", impatto: "", contingenza: "" });
      await ricarica();
    }
  }

  return (
    <Sezione titolo="Contingency">
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etichetta="Allocated" valore={eur(stato.allocatedTotal)} />
        <Kpi etichetta="Used" valore={eur(stato.used)} />
        <Kpi etichetta="Residual" valore={eur(stato.residual)} />
      </div>
      <Avvisi avvisi={stato.warnings} />
      {r.rischi.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No risk recorded.</p>
      ) : (
        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TESTA_TABELLA}>Description</th>
              <th className={`${TESTA_TABELLA} text-right`}>Probability</th>
              <th className={`${TESTA_TABELLA} text-right`}>Impact</th>
              <th className={`${TESTA_TABELLA} text-right`}>Allocated</th>
              <th className={`${TESTA_TABELLA} text-right`}>Used</th>
              <th className={`${TESTA_TABELLA} text-right`}>Residual</th>
              <th className={TESTA_TABELLA}>Status</th>
            </tr>
          </thead>
          <tbody>
            {r.rischi.map((x) => (
              <tr key={x.id}>
                <td className={CELLA}>{x.descrizione}</td>
                <td className={`${CELLA} tabular-num text-right`}>{x.probabilitaPct ?? "—"} %</td>
                <td className={`${CELLA} tabular-num text-right`}>{eur(x.impatto)}</td>
                <td className={`${CELLA} tabular-num text-right`}>{eur(x.contingenza)}</td>
                <td className={`${CELLA} tabular-num text-right`}>{eur(x.utilizzato)}</td>
                <td className={`${CELLA} tabular-num text-right`}>{eur(x.contingenza !== null ? x.contingenza - (x.utilizzato ?? 0) : null)}</td>
                <td className={CELLA}>{x.stato}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={creaRischio} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <Campo etichetta="Description">
            <input className={CAMPO} required value={rischio.descrizione} onChange={(e) => setRischio({ ...rischio, descrizione: e.target.value })} />
          </Campo>
        </div>
        <Campo etichetta="Probability %">
          <input type="number" min="0" max="100" className={CAMPO} value={rischio.probabilita} onChange={(e) => setRischio({ ...rischio, probabilita: e.target.value })} />
        </Campo>
        <Campo etichetta="Impact (€)">
          <input type="number" min="0" className={CAMPO} value={rischio.impatto} onChange={(e) => setRischio({ ...rischio, impatto: e.target.value })} />
        </Campo>
        <Campo etichetta="Allocated contingency (€)">
          <input type="number" min="0" className={CAMPO} value={rischio.contingenza} onChange={(e) => setRischio({ ...rischio, contingenza: e.target.value })} />
        </Campo>
        <div className="md:col-span-5 flex justify-end">
          <Button type="submit">
            <Plus className="size-4" />
            Record risk
          </Button>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Risk usage (and its date) is recorded directly on the risk — ask for a dedicated field if you need to edit it after creation; for now contingency consumption below covers the budget-level ledger.</p>
    </Sezione>
  );
}

// ------------------------------------------------------ Management reserve

function SchedaRiservaGestione({
  percorso,
  r,
  ricarica,
  puoGestire,
  attoreId,
}: {
  percorso: string;
  r: Riserve;
  ricarica: () => Promise<void>;
  puoGestire: boolean;
  attoreId: number | null;
}) {
  const [consumo, setConsumo] = React.useState({ importo: "", data: "", nota: "" });
  const stato = statoRiservaGestione(r);
  const consumi = r.consumi.filter((c) => c.tipo === "management_reserve");

  async function registraConsumo(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Consumption not recorded", () =>
      chiama(percorso, "registra_consumo", { tipo: "management_reserve", importo: Number(consumo.importo), data: consumo.data, nota: consumo.nota || null }),
      "Consumption recorded",
    );
    if (ok) {
      setConsumo({ importo: "", data: "", nota: "" });
      await ricarica();
    }
  }

  async function approva(id: number) {
    if (!puoGestire) {
      avviso("Approving requires the plan coordinator role");
      return;
    }
    const ok = await esegui("Approval failed", () => chiama(percorso, "approva_consumo_riserva", { attoreId, id }), "Consumption approved");
    if (ok) await ricarica();
  }

  return (
    <Sezione titolo="Management reserve">
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etichetta="Consumed" valore={eur(stato.consumed)} />
        <Kpi etichetta="Residual" valore={eur(stato.residual)} />
      </div>
      <Avvisi avvisi={stato.warnings} />
      {consumi.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No consumption recorded.</p>
      ) : (
        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TESTA_TABELLA}>Date</th>
              <th className={`${TESTA_TABELLA} text-right`}>Amount</th>
              <th className={TESTA_TABELLA}>Note</th>
              <th className={TESTA_TABELLA}>Approval</th>
            </tr>
          </thead>
          <tbody>
            {consumi.map((c) => (
              <tr key={c.id}>
                <td className={`${CELLA} tabular-num`}>{c.data}</td>
                <td className={`${CELLA} tabular-num text-right`}>{eur(c.importo)}</td>
                <td className={CELLA}>{c.nota ?? "—"}</td>
                <td className={CELLA}>
                  {c.approvato ? (
                    "approved"
                  ) : (
                    <Button size="sm" variant="outline" disabled={!puoGestire} onClick={() => approva(c.id)}>
                      <Check className="size-3.5" />
                      Approve
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={registraConsumo} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
        <Campo etichetta="Amount (€)">
          <input type="number" min="0" step="0.01" required className={CAMPO} value={consumo.importo} onChange={(e) => setConsumo({ ...consumo, importo: e.target.value })} />
        </Campo>
        <Campo etichetta="Date">
          <input type="date" required className={CAMPO} value={consumo.data} onChange={(e) => setConsumo({ ...consumo, data: e.target.value })} />
        </Campo>
        <Campo etichetta="Note">
          <input className={CAMPO} value={consumo.nota} onChange={(e) => setConsumo({ ...consumo, nota: e.target.value })} />
        </Campo>
        <Button type="submit">
          <Plus className="size-4" />
          Record consumption
        </Button>
      </form>
    </Sezione>
  );
}

// ------------------------------------------------------------- Buffer di tempo

function SchedaBufferTempo({
  percorso,
  r,
  ricarica,
  pctCompletato,
}: {
  percorso: string;
  r: Riserve;
  ricarica: () => Promise<void>;
  pctCompletato: number;
}) {
  const [consumo, setConsumo] = React.useState({ giorni: "", data: "", nota: "" });
  const residuo = bufferTempoResiduo(r);
  const consumato = giorniBufferConsumati(r);
  const salute = saluteBufferTempo(r, pctCompletato);
  const consumi = r.consumi.filter((c) => c.tipo === "buffer_tempo");

  async function registraConsumo(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Consumption not recorded", () =>
      chiama(percorso, "registra_consumo", { tipo: "buffer_tempo", importo: Number(consumo.giorni), data: consumo.data, nota: consumo.nota || null }),
      "Consumption recorded",
    );
    if (ok) {
      setConsumo({ giorni: "", data: "", nota: "" });
      await ricarica();
    }
  }

  return (
    <Sezione titolo="Time buffer">
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etichetta="Consumed (days)" valore={num(consumato)} />
        <Kpi etichetta="Residual (days)" valore={num(residuo)} />
        <Kpi
          etichetta="Health index"
          valore={salute.ratio === null ? "—" : <span className={classeSemaforo(salute.light)}>{num(salute.ratio)}</span>}
          nota="consumed ÷ completed"
        />
      </div>
      <Avvisi avvisi={salute.warnings} />
      {consumi.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No consumption recorded.</p>
      ) : (
        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TESTA_TABELLA}>Date</th>
              <th className={`${TESTA_TABELLA} text-right`}>Days</th>
              <th className={TESTA_TABELLA}>Note</th>
            </tr>
          </thead>
          <tbody>
            {consumi.map((c) => (
              <tr key={c.id}>
                <td className={`${CELLA} tabular-num`}>{c.data}</td>
                <td className={`${CELLA} tabular-num text-right`}>{num(c.importo)}</td>
                <td className={CELLA}>{c.nota ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={registraConsumo} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
        <Campo etichetta="Days">
          <input type="number" min="0" step="0.5" required className={CAMPO} value={consumo.giorni} onChange={(e) => setConsumo({ ...consumo, giorni: e.target.value })} />
        </Campo>
        <Campo etichetta="Date">
          <input type="date" required className={CAMPO} value={consumo.data} onChange={(e) => setConsumo({ ...consumo, data: e.target.value })} />
        </Campo>
        <Campo etichetta="Note">
          <input className={CAMPO} value={consumo.nota} onChange={(e) => setConsumo({ ...consumo, nota: e.target.value })} />
        </Campo>
        <Button type="submit">
          <Plus className="size-4" />
          Record consumption
        </Button>
      </form>
    </Sezione>
  );
}
