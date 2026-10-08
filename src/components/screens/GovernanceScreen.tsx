// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Governance costi: budget dei WBS, contingency e riserva di gestione (stanziate e
// consumate), baseline di budget (bloccabile), richieste di variazione con approvazione
// tracciata. Le baseline bloccate non si modificano: serve una variazione approvata.

import * as React from "react";
import { Archive, Lock, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chiama, ETICHETTA_TIPO_CONSUMO, TIPI_CONSUMO, type Governance } from "@/lib/api";
import { CAMPO, CELLA, TESTA_TABELLA, avviso, esegui, useDati, usePercorso } from "@/lib/schermate";
import { Campo, Sezione, Vuoto } from "./comuni";

const eur = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

const ETICHETTA_TIPO_BASELINE: Record<string, string> = { startup: "Startup", stima: "Estimate", altra: "Other" };

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
  const [baseline, setBaseline] = React.useState({ nome: "", tipo: "startup" });
  const [variazione, setVariazione] = React.useState({ motivo: "", costo: "", durata: "" });
  const [approvatore, setApprovatore] = React.useState<Record<number, string>>({});

  if (!percorso) return <Vuoto messaggio="Open or create a project for cost governance." />;
  if (!g) return <Vuoto messaggio="Loading…" />;

  // Percentuali in intero positivo (0..100), come nel database.
  const baselineAttive = g.baseline.filter((b) => !b.archiviata);
  const archiviate = g.baseline.length - baselineAttive.length;
  const contingencyBudget = (g.budgetTotale * g.contingencyPct) / 100;
  const riservaBudget = (g.budgetTotale * g.riservaGestionePct) / 100;
  const numero = (v: string) => (v === "" ? null : Number(v));

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

  async function bloccaBaseline(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Baseline not created", () => chiama(percorso!, "blocca_baseline_budget", { nome: baseline.nome, tipo: baseline.tipo }), "Budget baseline locked");
    if (ok) {
      setBaseline({ nome: "", tipo: "startup" });
      await ricarica();
    }
  }

  async function archivia(id: number) {
    const ok = await esegui("Baseline not archived", () => chiama(percorso!, "archivia_baseline", { id }), "Baseline archived");
    if (ok) await ricarica();
  }

  async function creaVariazione(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Change request not created", () =>
      chiama(percorso!, "crea_change_request", { motivo: variazione.motivo, deltaCosto: numero(variazione.costo), deltaDurata: numero(variazione.durata) }),
      "Change request recorded",
    );
    if (ok) {
      setVariazione({ motivo: "", costo: "", durata: "" });
      await ricarica();
    }
  }

  async function approva(id: number) {
    const nome = (approvatore[id] ?? "").trim();
    if (!nome) {
      avviso("Specify who is approving the change request");
      return;
    }
    const ok = await esegui("Approval failed", () => chiama(percorso!, "approva_change_request", { id, approvatore: nome }), "Change request approved");
    if (ok) await ricarica();
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

      <Sezione titolo="Budget baseline">
        {baselineAttive.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No active baseline: lock one once the WBS budget is defined.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Name</th>
                <th className={TESTA_TABELLA}>Type</th>
                <th className={TESTA_TABELLA}>Created on</th>
                <th className={`${TESTA_TABELLA} text-right`}>BAC</th>
                <th className={TESTA_TABELLA}>Status</th>
                <th className={TESTA_TABELLA} />
              </tr>
            </thead>
            <tbody>
              {baselineAttive.map((b) => (
                <tr key={b.id}>
                  <td className={`${CELLA} font-medium`}>{b.nome}</td>
                  <td className={CELLA}>{ETICHETTA_TIPO_BASELINE[b.tipo] ?? b.tipo}</td>
                  <td className={`${CELLA} tabular-num`}>{b.creataIl.slice(0, 10)}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(b.bacTotale)}</td>
                  <td className={CELLA}>{b.bloccata ? <span className="inline-flex items-center gap-1"><Lock className="size-3" />locked</span> : "editable"}</td>
                  <td className={CELLA}>
                    <Button size="sm" variant="ghost" onClick={() => archivia(b.id)}>
                      <Archive className="size-4" />
                      Archive
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {archiviate > 0 && (
          <p className="mb-4 text-xs text-muted-foreground">{archiviate} archived baselines: they remain in the database with their date and content.</p>
        )}
        <form onSubmit={bloccaBaseline} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Baseline name">
            <input className={CAMPO} required value={baseline.nome} onChange={(e) => setBaseline({ ...baseline, nome: e.target.value })} />
          </Campo>
          <Campo etichetta="Type">
            <select className={CAMPO} value={baseline.tipo} onChange={(e) => setBaseline({ ...baseline, tipo: e.target.value })}>
              <option value="startup">{ETICHETTA_TIPO_BASELINE.startup}</option>
              <option value="stima">{ETICHETTA_TIPO_BASELINE.stima}</option>
              <option value="altra">{ETICHETTA_TIPO_BASELINE.altra}</option>
            </select>
          </Campo>
          <Button type="submit"><Lock className="size-4" />Lock baseline from the WBS budget</Button>
        </form>
      </Sezione>

      <Sezione titolo="Change requests">
        {g.changeRequest.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No change requests. A locked baseline only changes through an approved change request.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>#</th>
                <th className={TESTA_TABELLA}>Requested on</th>
                <th className={TESTA_TABELLA}>Reason</th>
                <th className={`${TESTA_TABELLA} text-right`}>Δ cost</th>
                <th className={`${TESTA_TABELLA} text-right`}>Δ duration (days)</th>
                <th className={TESTA_TABELLA}>Approval</th>
              </tr>
            </thead>
            <tbody>
              {g.changeRequest.map((c) => (
                <tr key={c.id}>
                  <td className={`${CELLA} tabular-num`}>{c.id}</td>
                  <td className={`${CELLA} tabular-num`}>{c.richiestaIl.slice(0, 10)}</td>
                  <td className={CELLA}>{c.motivo}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(c.deltaCosto)}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{c.deltaDurata ?? "—"}</td>
                  <td className={CELLA}>
                    {c.approvataIl ? (
                      <span>approved by {c.approvataDa} on {c.approvataIl.slice(0, 10)}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input className={`${CAMPO} w-40`} placeholder="Who is approving" value={approvatore[c.id] ?? ""} onChange={(e) => setApprovatore({ ...approvatore, [c.id]: e.target.value })} />
                        <Button size="sm" variant="outline" onClick={() => approva(c.id)}>Approve</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={creaVariazione} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Campo etichetta="Reason">
              <input className={CAMPO} required value={variazione.motivo} onChange={(e) => setVariazione({ ...variazione, motivo: e.target.value })} />
            </Campo>
          </div>
          <Campo etichetta="Δ cost (€)">
            <input type="number" step="0.01" className={CAMPO} value={variazione.costo} onChange={(e) => setVariazione({ ...variazione, costo: e.target.value })} />
          </Campo>
          <Campo etichetta="Δ duration (days)">
            <input type="number" step="0.5" className={CAMPO} value={variazione.durata} onChange={(e) => setVariazione({ ...variazione, durata: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />Request change</Button>
        </form>
      </Sezione>
    </div>
  );
}
