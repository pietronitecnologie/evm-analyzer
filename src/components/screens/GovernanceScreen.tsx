// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Governance costi: budget dei WBS, contingency e riserva di gestione (stanziate e
// consumate). Baseline di budget e change request si gestiscono ora nella schermata
// dedicata "Baseline and change requests" (BaselineCrScreen, specifica Fase 5 §3.5).

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chiama, ETICHETTA_TIPO_CONSUMO, TIPI_CONSUMO, type Governance } from "@/lib/api";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, useDati, usePercorso } from "@/lib/schermate";
import { Campo, Sezione, Vuoto } from "./comuni";

const eur = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

function Kpi({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="rounded-md border border-border-strong bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <p className="tabular-num mt-1 text-lg font-semibold">{valore}</p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

export function GovernanceScreen() {
  const percorso = usePercorso();
  const [g, ricarica] = useDati<Governance>("governance", percorso);
  const [consumo, setConsumo] = React.useState({ tipo: TIPI_CONSUMO[0] as string, importo: "", data: "", nota: "" });

  if (!percorso) return <Vuoto messaggio="Open or create a project for cost governance." />;
  if (!g) return <Vuoto messaggio="Loading…" />;

  // Percentuali in intero positivo (0..100), come nel database.
  const contingencyBudget = (g.budgetTotale * g.contingencyPct) / 100;
  const riservaBudget = (g.budgetTotale * g.riservaGestionePct) / 100;

  async function registraConsumo(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Consumption not recorded", () =>
      chiama(percorso!, "registra_consumo", { tipo: consumo.tipo, importo: Number(consumo.importo), data: consumo.data, nota: consumo.nota || null }),
      "Consumption recorded",
    );
    if (ok) {
      setConsumo({ ...consumo, importo: "", data: "", nota: "" });
      await ricarica();
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Budget and reserves">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi etichetta="WBS budget" valore={eur(g.budgetTotale)} nota={`${g.wbsConBudget} nodes with budget`} />
          <Kpi etichetta="Contingency" valore={eur(contingencyBudget)} nota={`${g.contingencyPct}% of budget`} />
          <Kpi etichetta="Allocated contingency" valore={eur(g.contingencyStanziata)} nota={`used ${eur(g.contingencyUsata)}`} />
          <Kpi etichetta="Management reserve" valore={eur(riservaBudget)} nota={`${g.riservaGestionePct}% — used ${eur(g.riservaGestioneUsata)}`} />
        </div>
        {g.wbsConBudget === 0 && (
          <p className="mt-3 text-sm text-semaforo-giallo">No budget assigned to the WBS: assign it in the WBS screen to get the BAC.</p>
        )}
      </Sezione>

      <Sezione titolo="Reserve consumption">
        {g.consumi.length === 0 ? (
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
              {g.consumi.map((c) => (
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
              {TIPI_CONSUMO.map((t) => <option key={t} value={t}>{ETICHETTA_TIPO_CONSUMO[t] ?? t}</option>)}
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
          <Button type="submit"><Plus className="size-4" />Record consumption</Button>
        </form>
      </Sezione>
    </div>
  );
}
