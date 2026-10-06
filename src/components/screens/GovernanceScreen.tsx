// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Governance costi: budget dei WBS, contingency e riserva di gestione (stanziate e
// consumate), baseline di budget (bloccabile), richieste di variazione con approvazione
// tracciata. Le baseline bloccate non si modificano: serve una variazione approvata.

import * as React from "react";
import { Archive, Lock, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chiama, TIPI_CONSUMO, type Governance } from "@/lib/api";
import { CAMPO, CELLA, TESTA_TABELLA, avviso, esegui, useDati, usePercorso } from "@/lib/schermate";
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
  const [baseline, setBaseline] = React.useState({ nome: "", tipo: "startup" });
  const [variazione, setVariazione] = React.useState({ motivo: "", costo: "", durata: "" });
  const [approvatore, setApprovatore] = React.useState<Record<number, string>>({});

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per la governance dei costi." />;
  if (!g) return <Vuoto messaggio="Caricamento…" />;

  // Percentuali in intero positivo (0..100), come nel database.
  const baselineAttive = g.baseline.filter((b) => !b.archiviata);
  const archiviate = g.baseline.length - baselineAttive.length;
  const contingencyBudget = (g.budgetTotale * g.contingencyPct) / 100;
  const riservaBudget = (g.budgetTotale * g.riservaGestionePct) / 100;
  const numero = (v: string) => (v === "" ? null : Number(v));

  async function registraConsumo(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Consumo non registrato", () =>
      chiama(percorso!, "registra_consumo", { tipo: consumo.tipo, importo: Number(consumo.importo), data: consumo.data, nota: consumo.nota || null }),
      "Consumo registrato",
    );
    if (ok) {
      setConsumo({ ...consumo, importo: "", data: "", nota: "" });
      await ricarica();
    }
  }

  async function bloccaBaseline(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Baseline non creata", () => chiama(percorso!, "blocca_baseline_budget", { nome: baseline.nome, tipo: baseline.tipo }), "Baseline di budget bloccata");
    if (ok) {
      setBaseline({ nome: "", tipo: "startup" });
      await ricarica();
    }
  }

  async function archivia(id: number) {
    const ok = await esegui("Baseline non archiviata", () => chiama(percorso!, "archivia_baseline", { id }), "Baseline archiviata");
    if (ok) await ricarica();
  }

  async function creaVariazione(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Variazione non creata", () =>
      chiama(percorso!, "crea_change_request", { motivo: variazione.motivo, deltaCosto: numero(variazione.costo), deltaDurata: numero(variazione.durata) }),
      "Richiesta di variazione registrata",
    );
    if (ok) {
      setVariazione({ motivo: "", costo: "", durata: "" });
      await ricarica();
    }
  }

  async function approva(id: number) {
    const nome = (approvatore[id] ?? "").trim();
    if (!nome) {
      avviso("Indica chi approva la variazione");
      return;
    }
    const ok = await esegui("Approvazione non riuscita", () => chiama(percorso!, "approva_change_request", { id, approvatore: nome }), "Variazione approvata");
    if (ok) await ricarica();
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Budget e riserve">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi etichetta="Budget dei WBS" valore={eur(g.budgetTotale)} nota={`${g.wbsConBudget} nodi con budget`} />
          <Kpi etichetta="Contingency" valore={eur(contingencyBudget)} nota={`${g.contingencyPct} % del budget`} />
          <Kpi etichetta="Contingency stanziata" valore={eur(g.contingencyStanziata)} nota={`usata ${eur(g.contingencyUsata)}`} />
          <Kpi etichetta="Riserva di gestione" valore={eur(riservaBudget)} nota={`${g.riservaGestionePct} % — usata ${eur(g.riservaGestioneUsata)}`} />
        </div>
        {g.wbsConBudget === 0 && (
          <p className="mt-3 text-sm text-semaforo-giallo">Nessun budget assegnato ai WBS: assegnalo nella schermata WBS per avere il BAC.</p>
        )}
      </Sezione>

      <Sezione titolo="Consumi delle riserve">
        {g.consumi.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessun consumo registrato.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Data</th>
                <th className={TESTA_TABELLA}>Riserva</th>
                <th className={`${TESTA_TABELLA} text-right`}>Importo</th>
                <th className={TESTA_TABELLA}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {g.consumi.map((c) => (
                <tr key={c.id}>
                  <td className={`${CELLA} tabular-num`}>{c.data}</td>
                  <td className={CELLA}>{c.tipo}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(c.importo)}</td>
                  <td className={CELLA}>{c.nota ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={registraConsumo} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
          <Campo etichetta="Riserva">
            <select className={CAMPO} value={consumo.tipo} onChange={(e) => setConsumo({ ...consumo, tipo: e.target.value })}>
              {TIPI_CONSUMO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo etichetta="Importo (€)">
            <input type="number" min="0" step="0.01" required className={CAMPO} value={consumo.importo} onChange={(e) => setConsumo({ ...consumo, importo: e.target.value })} />
          </Campo>
          <Campo etichetta="Data">
            <input type="date" required className={CAMPO} value={consumo.data} onChange={(e) => setConsumo({ ...consumo, data: e.target.value })} />
          </Campo>
          <Campo etichetta="Nota">
            <input className={CAMPO} value={consumo.nota} onChange={(e) => setConsumo({ ...consumo, nota: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />Registra consumo</Button>
        </form>
      </Sezione>

      <Sezione titolo="Baseline di budget">
        {baselineAttive.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessuna baseline attiva: bloccane una quando il budget dei WBS è definito.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Nome</th>
                <th className={TESTA_TABELLA}>Tipo</th>
                <th className={TESTA_TABELLA}>Creata il</th>
                <th className={`${TESTA_TABELLA} text-right`}>BAC</th>
                <th className={TESTA_TABELLA}>Stato</th>
                <th className={TESTA_TABELLA} />
              </tr>
            </thead>
            <tbody>
              {baselineAttive.map((b) => (
                <tr key={b.id}>
                  <td className={`${CELLA} font-medium`}>{b.nome}</td>
                  <td className={CELLA}>{b.tipo}</td>
                  <td className={`${CELLA} tabular-num`}>{b.creataIl.slice(0, 10)}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{eur(b.bacTotale)}</td>
                  <td className={CELLA}>{b.bloccata ? <span className="inline-flex items-center gap-1"><Lock className="size-3" />bloccata</span> : "modificabile"}</td>
                  <td className={CELLA}>
                    <Button size="sm" variant="ghost" onClick={() => archivia(b.id)}>
                      <Archive className="size-4" />
                      Archivia
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {archiviate > 0 && (
          <p className="mb-4 text-xs text-muted-foreground">{archiviate} baseline archiviate: restano nel database con la loro data e il loro contenuto.</p>
        )}
        <form onSubmit={bloccaBaseline} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Nome della baseline">
            <input className={CAMPO} required value={baseline.nome} onChange={(e) => setBaseline({ ...baseline, nome: e.target.value })} />
          </Campo>
          <Campo etichetta="Tipo">
            <select className={CAMPO} value={baseline.tipo} onChange={(e) => setBaseline({ ...baseline, tipo: e.target.value })}>
              <option value="startup">startup</option>
              <option value="stima">stima</option>
              <option value="altra">altra</option>
            </select>
          </Campo>
          <Button type="submit"><Lock className="size-4" />Blocca baseline dal budget dei WBS</Button>
        </form>
      </Sezione>

      <Sezione titolo="Richieste di variazione">
        {g.changeRequest.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessuna variazione. Una baseline bloccata cambia solo con una variazione approvata.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>#</th>
                <th className={TESTA_TABELLA}>Richiesta il</th>
                <th className={TESTA_TABELLA}>Motivo</th>
                <th className={`${TESTA_TABELLA} text-right`}>Δ costo</th>
                <th className={`${TESTA_TABELLA} text-right`}>Δ durata (gg)</th>
                <th className={TESTA_TABELLA}>Approvazione</th>
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
                      <span>approvata da {c.approvataDa} il {c.approvataIl.slice(0, 10)}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input className={`${CAMPO} w-40`} placeholder="Chi approva" value={approvatore[c.id] ?? ""} onChange={(e) => setApprovatore({ ...approvatore, [c.id]: e.target.value })} />
                        <Button size="sm" variant="outline" onClick={() => approva(c.id)}>Approva</Button>
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
            <Campo etichetta="Motivo">
              <input className={CAMPO} required value={variazione.motivo} onChange={(e) => setVariazione({ ...variazione, motivo: e.target.value })} />
            </Campo>
          </div>
          <Campo etichetta="Δ costo (€)">
            <input type="number" step="0.01" className={CAMPO} value={variazione.costo} onChange={(e) => setVariazione({ ...variazione, costo: e.target.value })} />
          </Campo>
          <Campo etichetta="Δ durata (gg)">
            <input type="number" step="0.5" className={CAMPO} value={variazione.durata} onChange={(e) => setVariazione({ ...variazione, durata: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />Richiedi variazione</Button>
        </form>
      </Sezione>
    </div>
  );
}
