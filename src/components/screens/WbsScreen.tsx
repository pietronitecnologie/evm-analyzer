// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type NodoWbs, chiama } from "@/lib/api";
import { Campo, Sezione, Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, usePercorso, useDati } from "@/lib/schermate";

export function WbsScreen() {
  const percorso = usePercorso();
  const [nodi, ricarica] = useDati<NodoWbs[]>("wbs_elenco", percorso);
  const [codice, setCodice] = React.useState("");
  const [nome, setNome] = React.useState("");

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per vedere la WBS." />;

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!percorso) return;
    const ok = await esegui("Nodo WBS non creato", () =>
      chiama(percorso, "crea_wbs", { codice, nome }),
    );
    if (ok) {
      setCodice("");
      setNome("");
      await ricarica();
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Struttura di scomposizione (WBS)">
        {!nodi ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : nodi.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun nodo WBS nel progetto.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Codice</th>
                <th className={TESTA_TABELLA}>Nome</th>
                <th className={`${TESTA_TABELLA} text-right`}>Task</th>
                <th className={`${TESTA_TABELLA} text-right`}>Budget (€)</th>
              </tr>
            </thead>
            <tbody>
              {nodi.map((n) => (
                <tr key={n.id}>
                  <td className={`${CELLA} tabular-num`}>
                    <span style={{ paddingLeft: `${(n.codice.split(".").length - 1) * 16}px` }}>
                      {n.codice}
                    </span>
                  </td>
                  <td className={`${CELLA} ${n.genitore ? "" : "font-semibold"}`}>{n.nome}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{n.task}</td>
                  <td className={CELLA}>
                    <BudgetCella key={`${n.codice}-${n.budget ?? ""}`} nodo={n} percorso={percorso} onSalvato={ricarica} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sezione>

      <Sezione titolo="Nuovo nodo">
        <form onSubmit={aggiungi} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Codice (es. 1.2 sotto la 1)">
            <input className={CAMPO} required value={codice} onChange={(e) => setCodice(e.target.value)} />
          </Campo>
          <div className="md:col-span-2">
            <Campo etichetta="Nome">
              <input className={CAMPO} required value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
          </div>
          <Button type="submit">
            <Plus className="size-4" />
            Aggiungi
          </Button>
        </form>
      </Sezione>
    </div>
  );
}

/** Budget di un nodo WBS: modificabile, salvato con il comando `imposta_budget_wbs`. */
function BudgetCella({ nodo, percorso, onSalvato }: { nodo: NodoWbs; percorso: string; onSalvato: () => Promise<void> }) {
  const [valore, setValore] = React.useState(nodo.budget === null ? "" : String(nodo.budget));
  async function salva() {
    const ok = await esegui("Budget non salvato", () =>
      chiama(percorso, "imposta_budget_wbs", { codice: nodo.codice, budget: valore.trim() === "" ? null : Number(valore) }),
      `Budget di ${nodo.codice} salvato`,
    );
    if (ok) await onSalvato();
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <input
        type="number"
        min="0"
        step="0.01"
        className={`${CAMPO} w-32 text-right`}
        aria-label={`Budget del nodo ${nodo.codice}`}
        value={valore}
        onChange={(e) => setValore(e.target.value)}
      />
      <Button size="sm" variant="ghost" onClick={salva} disabled={valore === (nodo.budget === null ? "" : String(nodo.budget))}>
        Salva
      </Button>
    </div>
  );
}
