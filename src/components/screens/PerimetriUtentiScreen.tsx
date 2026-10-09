// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Perimetri e utenti (fase 4-ter). Un perimetro è un sottoalbero WBS con i
// suoi task di lavoro; l'elenco dei task è fissato alla creazione. Gli utenti
// portano uno o più ruoli cumulabili (sez. 6-quater.6).

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ETICHETTA_RUOLO, type Perimetro, RUOLI, type Utente, chiama } from "@/lib/api";
import { Campo, Sezione, Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { useToastStore } from "@/stores/toast-store";

export function PerimetriUtentiScreen() {
  const percorso = usePercorso();
  const [perimetri, ricaricaPerimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);
  const [utenti, ricaricaUtenti] = useDati<Utente[]>("utenti_elenco", percorso);

  const [nomePerimetro, setNomePerimetro] = React.useState("");
  const [codiceWbs, setCodiceWbs] = React.useState("");
  const [proprietario, setProprietario] = React.useState("");

  const [uid, setUid] = React.useState("");
  const [nomeUtente, setNomeUtente] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [ruoli, setRuoli] = React.useState<string[]>([]);
  const [resetPer, setResetPer] = React.useState<number | null>(null);
  const [nuovaPassword, setNuovaPassword] = React.useState("");
  const attoreId = useProjectContextStore((s) => s.attoreId);

  if (!percorso) return <Vuoto messaggio="Open or create a project to manage scopes and users." />;

  async function creaPerimetro(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Scope not created", () =>
      chiama(percorso!, "crea_perimetro", {
        nome: nomePerimetro,
        codiceWbs,
        proprietarioUid: proprietario || null,
      }),
      "Scope created",
    );
    if (ok) {
      setNomePerimetro("");
      setCodiceWbs("");
      await ricaricaPerimetri();
    }
  }

  async function creaUtente(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("User not created", () =>
      chiama(percorso!, "crea_utente", { uid, nome: nomeUtente, password, ruoli }),
      "User created",
    );
    if (ok) {
      setUid("");
      setNomeUtente("");
      setPassword("");
      setRuoli([]);
      await ricaricaUtenti();
    }
  }

  async function reimpostaPassword(e: React.FormEvent, userId: number) {
    e.preventDefault();
    try {
      await chiama(percorso!, "reimposta_password", { attoreId, userId, nuova: nuovaPassword });
      useToastStore.getState().push({ title: "Password reset" });
      setResetPer(null);
      setNuovaPassword("");
    } catch (e) {
      avviso("Password not reset", e);
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Scopes">
        {!perimetri || perimetri.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No scope defined.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Name</th>
                <th className={TESTA_TABELLA}>WBS</th>
                <th className={`${TESTA_TABELLA} text-right`}>Task</th>
                <th className={TESTA_TABELLA}>Owner</th>
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
          <Campo etichetta="Name">
            <input className={CAMPO} required value={nomePerimetro} onChange={(e) => setNomePerimetro(e.target.value)} />
          </Campo>
          <Campo etichetta="WBS code (subtree)">
            <input className={CAMPO} required placeholder="e.g. 1" value={codiceWbs} onChange={(e) => setCodiceWbs(e.target.value)} />
          </Campo>
          <Campo etichetta="Owner">
            <select className={CAMPO} value={proprietario} onChange={(e) => setProprietario(e.target.value)}>
              <option value="">— none —</option>
              {(utenti ?? []).map((u) => (
                <option key={u.id} value={u.uid}>{u.nome}</option>
              ))}
            </select>
          </Campo>
          <Button type="submit">
            <Plus className="size-4" />
            Create scope
          </Button>
        </form>
      </Sezione>

      <Sezione titolo="Users">
        {!utenti || utenti.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">No user in the project.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Identifier</th>
                <th className={TESTA_TABELLA}>Name</th>
                <th className={TESTA_TABELLA}>Roles</th>
                <th className={TESTA_TABELLA} />
              </tr>
            </thead>
            <tbody>
              {utenti.map((u) => (
                <tr key={u.id}>
                  <td className={`${CELLA} tabular-num`}>{u.uid}</td>
                  <td className={CELLA}>{u.nome}</td>
                  <td className={`${CELLA} text-xs`}>{u.ruoli.map((r) => ETICHETTA_RUOLO[r] ?? r).join(", ")}</td>
                  <td className={CELLA}>
                    {resetPer === u.id ? (
                      <form onSubmit={(e) => void reimpostaPassword(e, u.id)} className="flex items-center gap-1">
                        <input
                          className={`${CAMPO} w-32`}
                          type="password"
                          required
                          minLength={4}
                          autoFocus
                          placeholder="New password"
                          value={nuovaPassword}
                          onChange={(e) => setNuovaPassword(e.target.value)}
                        />
                        <Button size="sm" type="submit">Save</Button>
                        <Button size="sm" type="button" variant="ghost" onClick={() => { setResetPer(null); setNuovaPassword(""); }}>Cancel</Button>
                      </form>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setResetPer(u.id)}>Reset password…</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={creaUtente} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Campo etichetta="Identifier">
            <input className={CAMPO} required value={uid} onChange={(e) => setUid(e.target.value)} />
          </Campo>
          <Campo etichetta="Name">
            <input className={CAMPO} required value={nomeUtente} onChange={(e) => setNomeUtente(e.target.value)} />
          </Campo>
          <Campo etichetta="Password">
            <input className={CAMPO} type="password" required minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Campo>
          <fieldset className="flex flex-col gap-1 text-xs font-medium">
            <legend className="mb-1">Roles</legend>
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
                  {ETICHETTA_RUOLO[r] ?? r}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-4 flex justify-end">
            <Button type="submit">
              <Plus className="size-4" />
              Add user
            </Button>
          </div>
        </form>
      </Sezione>
    </div>
  );
}
