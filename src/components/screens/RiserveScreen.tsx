// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Buffer e riserve (fase 5): parametri di contingenza, riserva di gestione e
// buffer di tempo; rischi con la contingenza allocata; consumi delle riserve.

import * as React from "react";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ETICHETTA_TIPO_CONSUMO, type Riserve, TIPI_CONSUMO, chiama } from "@/lib/api";
import { Campo, Sezione, Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";

const eur = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function RiserveScreen() {
  const percorso = usePercorso();
  const [r, ricarica] = useDati<Riserve>("riserve_dati", percorso);

  const [parametri, setParametri] = React.useState({ contingenza: "", gestione: "", buffer: "" });
  const [rischio, setRischio] = React.useState({ descrizione: "", probabilita: "", impatto: "", contingenza: "" });
  const [consumo, setConsumo] = React.useState({ tipo: TIPI_CONSUMO[0] as string, importo: "", data: "", nota: "" });

  if (!percorso) return <Vuoto messaggio="Open or create a project to see buffers and reserves." />;
  if (!r) return <Vuoto messaggio="Loading…" />;

  const numero = (v: string) => (v === "" ? null : Number(v));
  // Le percentuali sono interi (0..100): niente decimali.
  const intero = (v: string) => (v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);

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

  async function creaRischio(e: React.FormEvent) {
    e.preventDefault();
    const probabilita = intero(rischio.probabilita);
    if (Number.isNaN(probabilita)) {
      avviso("Invalid probability", "use an integer between 0 and 100");
      return;
    }
    const ok = await esegui("Risk not created", () =>
      chiama(percorso!, "crea_rischio", {
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

  async function registraConsumo(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Consumption not recorded", () =>
      chiama(percorso!, "registra_consumo", {
        tipo: consumo.tipo,
        importo: Number(consumo.importo),
        data: consumo.data,
        nota: consumo.nota || null,
      }),
      "Consumption recorded",
    );
    if (ok) {
      setConsumo({ ...consumo, importo: "", data: "", nota: "" });
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
          <span>Allocated contingency: <strong>{eur(r.contingenzaAllocata)}</strong></span>
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

      <Sezione titolo="Risks">
        {r.rischi.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No risk recorded.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Description</th>
                <th className={`${TESTA_TABELLA} text-right`}>Probability</th>
                <th className={`${TESTA_TABELLA} text-right`}>Impact</th>
                <th className={`${TESTA_TABELLA} text-right`}>Contingency</th>
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
      </Sezione>

      <Sezione titolo="Reserve consumption">
        {r.consumi.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No consumption recorded.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Date</th>
                <th className={TESTA_TABELLA}>Reserve</th>
                <th className={`${TESTA_TABELLA} text-right`}>Amount</th>
                <th className={TESTA_TABELLA}>Note</th>
              </tr>
            </thead>
            <tbody>
              {r.consumi.map((c) => (
                <tr key={c.id}>
                  <td className={`${CELLA} tabular-num`}>{c.data}</td>
                  <td className={CELLA}>{ETICHETTA_TIPO_CONSUMO[c.tipo] ?? c.tipo}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(c.importo)}</td>
                  <td className={CELLA}>{c.nota ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={registraConsumo} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
          <Campo etichetta="Reserve">
            <select className={CAMPO} value={consumo.tipo} onChange={(e) => setConsumo({ ...consumo, tipo: e.target.value })}>
              {TIPI_CONSUMO.map((t) => (
                <option key={t} value={t}>{ETICHETTA_TIPO_CONSUMO[t] ?? t}</option>
              ))}
            </select>
          </Campo>
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
    </div>
  );
}
