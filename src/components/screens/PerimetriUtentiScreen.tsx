// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Perimetri e utenti (fase 4-ter). Un perimetro è un sottoalbero WBS con i
// suoi task di lavoro; l'elenco dei task è fissato alla creazione. Gli utenti
// portano uno o più ruoli cumulabili (sez. 6-quater.6).

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Perimetro, RUOLI, type Utente, chiama } from "@/lib/api";
import { Campo, Sezione, Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, usePercorso, useDati } from "@/lib/schermate";

export function PerimetriUtentiScreen() {
  const percorso = usePercorso();
  const [perimetri, ricaricaPerimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);
  const [utenti, ricaricaUtenti] = useDati<Utente[]>("utenti_elenco", percorso);

  const [nomePerimetro, setNomePerimetro] = React.useState("");
  const [codiceWbs, setCodiceWbs] = React.useState("");
  const [proprietario, setProprietario] = React.useState("");

  const [uid, setUid] = React.useState("");
  const [nomeUtente, setNomeUtente] = React.useState("");
  const [ruoli, setRuoli] = React.useState<string[]>([]);

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per gestire perimetri e utenti." />;

  async function creaPerimetro(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Perimetro non creato", () =>
      chiama(percorso!, "crea_perimetro", {
        nome: nomePerimetro,
        codiceWbs,
        proprietarioUid: proprietario || null,
      }),
      "Perimetro creato",
    );
    if (ok) {
      setNomePerimetro("");
      setCodiceWbs("");
      await ricaricaPerimetri();
    }
  }

  async function creaUtente(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Utente non creato", () =>
      chiama(percorso!, "crea_utente", { uid, nome: nomeUtente, ruoli }),
      "Utente creato",
    );
    if (ok) {
      setUid("");
      setNomeUtente("");
      setRuoli([]);
      await ricaricaUtenti();
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Perimetri">
        {!perimetri || perimetri.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessun perimetro definito.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Nome</th>
                <th className={TESTA_TABELLA}>WBS</th>
                <th className={`${TESTA_TABELLA} text-right`}>Task</th>
                <th className={TESTA_TABELLA}>Proprietario</th>
              </tr>
            </thead>
            <tbody>
              {perimetri.map((p) => (
                <tr key={p.id}>
                  <td className={`${CELLA} font-medium`}>{p.nome}</td>
                  <td className={`${CELLA} tabular-num`}>{p.codiceWbs ?? "—"}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{p.task}</td>
                  <td className={CELLA}>{p.proprietario ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={creaPerimetro} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
          <Campo etichetta="Nome">
            <input className={CAMPO} required value={nomePerimetro} onChange={(e) => setNomePerimetro(e.target.value)} />
          </Campo>
          <Campo etichetta="Codice WBS (sottoalbero)">
            <input className={CAMPO} required placeholder="es. 1" value={codiceWbs} onChange={(e) => setCodiceWbs(e.target.value)} />
          </Campo>
          <Campo etichetta="Proprietario">
            <select className={CAMPO} value={proprietario} onChange={(e) => setProprietario(e.target.value)}>
              <option value="">— nessuno —</option>
              {(utenti ?? []).map((u) => (
                <option key={u.id} value={u.uid}>{u.nome}</option>
              ))}
            </select>
          </Campo>
          <Button type="submit">
            <Plus className="size-4" />
            Crea perimetro
          </Button>
        </form>
      </Sezione>

      <Sezione titolo="Utenti">
        {!utenti || utenti.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessun utente nel progetto.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Identificativo</th>
                <th className={TESTA_TABELLA}>Nome</th>
                <th className={TESTA_TABELLA}>Ruoli</th>
              </tr>
            </thead>
            <tbody>
              {utenti.map((u) => (
                <tr key={u.id}>
                  <td className={`${CELLA} tabular-num`}>{u.uid}</td>
                  <td className={CELLA}>{u.nome}</td>
                  <td className={`${CELLA} text-xs`}>{u.ruoli.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={creaUtente} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Campo etichetta="Identificativo">
            <input className={CAMPO} required value={uid} onChange={(e) => setUid(e.target.value)} />
          </Campo>
          <Campo etichetta="Nome">
            <input className={CAMPO} required value={nomeUtente} onChange={(e) => setNomeUtente(e.target.value)} />
          </Campo>
          <fieldset className="flex flex-col gap-1 text-xs font-medium">
            <legend className="mb-1">Ruoli</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {RUOLI.map((r) => (
                <label key={r} className="flex items-center gap-1 font-normal">
                  <input
                    type="checkbox"
                    checked={ruoli.includes(r)}
                    onChange={(e) =>
                      setRuoli(e.target.checked ? [...ruoli, r] : ruoli.filter((x) => x !== r))
                    }
                  />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-3 flex justify-end">
            <Button type="submit">
              <Plus className="size-4" />
              Aggiungi utente
            </Button>
          </div>
        </form>
      </Sezione>
    </div>
  );
}
