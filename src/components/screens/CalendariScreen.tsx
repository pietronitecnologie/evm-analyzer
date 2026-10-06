// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Calendari di lavoro: schemi con giorni lavorativi della settimana e
// festivi. Lo schema predefinito del progetto fissa le durate dei task, che si
// contano solo sui giorni lavorativi.

import * as React from "react";
import { Plus, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Calendario, GIORNI_SETTIMANA, chiama, giorniDi } from "@/lib/api";
import { useToastStore } from "@/stores/toast-store";
import { CAMPO, CELLA, TESTA_TABELLA, avviso, esegui, usePercorso, useDati } from "@/lib/schermate";
import { Campo, Sezione, Vuoto } from "./comuni";

const LUN_VEN = 0b001_1111;

export function CalendariScreen() {
  const percorso = usePercorso();
  const [schemi, ricarica] = useDati<Calendario[]>("calendari_elenco", percorso);

  const [nome, setNome] = React.useState("");
  const [maschera, setMaschera] = React.useState(LUN_VEN);
  const [festivi, setFestivi] = React.useState<string[]>([]);
  const [nuovoFestivo, setNuovoFestivo] = React.useState("");

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per gestire i calendari di lavoro." />;
  if (!schemi) return <Vuoto messaggio="Caricamento…" />;

  function aggiungiFestivo() {
    if (!nuovoFestivo || festivi.includes(nuovoFestivo)) return;
    setFestivi([...festivi, nuovoFestivo].sort());
    setNuovoFestivo("");
  }

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Schema non creato", () =>
      chiama(percorso!, "crea_calendario", { nome, maschera, festivi }),
      "Schema di calendario creato",
    );
    if (ok) {
      setNome("");
      setMaschera(LUN_VEN);
      setFestivi([]);
      await ricarica();
    }
  }

  async function imposta(id: number) {
    const ok = await esegui("Schema non assegnato", () =>
      chiama(percorso!, "imposta_calendario_predefinito", { calendarioId: id }),
      "Schema assegnato al progetto",
    );
    if (ok) await ricarica();
  }

  async function ricalcola() {
    try {
      const n = await chiama<number>(percorso!, "ricalcola_durate");
      useToastStore.getState().push({ title: `Durate ricalcolate per ${n} task` });
      await ricarica();
    } catch (e) {
      avviso("Ricalcolo non riuscito", e);
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione
        titolo="Schemi di calendario"
        azioni={
          <Button variant="outline" size="sm" onClick={ricalcola}>
            <RefreshCw className="size-4" />
            Ricalcola durate dei task
          </Button>
        }
      >
        {schemi.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuno schema: il progetto usa lun–ven senza festivi.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Nome</th>
                <th className={TESTA_TABELLA}>Giorni lavorativi</th>
                <th className={TESTA_TABELLA}>Festivi</th>
                <th className={TESTA_TABELLA}>Stato</th>
              </tr>
            </thead>
            <tbody>
              {schemi.map((s) => (
                <tr key={s.id}>
                  <td className={`${CELLA} font-medium`}>{s.nome}</td>
                  <td className={CELLA}>{giorniDi(s.maschera)}</td>
                  <td className={`${CELLA} text-xs`}>
                    {s.festivi.length === 0 ? "—" : s.festivi.join(", ")}
                  </td>
                  <td className={CELLA}>
                    {s.predefinito ? (
                      <span className="font-semibold text-semaforo-verde">predefinito del progetto</span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => imposta(s.id)}>
                        Usa per il progetto
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sezione>

      <Sezione titolo="Nuovo schema">
        <form onSubmit={crea} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Campo etichetta="Nome dello schema">
              <input className={CAMPO} required value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <fieldset className="flex flex-col gap-1 text-xs font-medium md:col-span-2">
              <legend className="mb-1">Giorni lavorativi</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {GIORNI_SETTIMANA.map((g, i) => (
                  <label key={g} className="flex items-center gap-1 font-normal">
                    <input
                      type="checkbox"
                      checked={(maschera & (1 << i)) !== 0}
                      onChange={(e) =>
                        setMaschera(e.target.checked ? maschera | (1 << i) : maschera & ~(1 << i))
                      }
                    />
                    {g}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">Festivi (giorni non lavorativi anche se feriali)</span>
            <div className="flex items-end gap-2">
              <input
                type="date"
                className={`${CAMPO} w-48`}
                value={nuovoFestivo}
                onChange={(e) => setNuovoFestivo(e.target.value)}
                aria-label="Data del festivo"
              />
              <Button type="button" variant="outline" size="sm" onClick={aggiungiFestivo}>
                <Plus className="size-4" />
                Aggiungi festivo
              </Button>
            </div>
            {festivi.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {festivi.map((f) => (
                  <li key={f} className="flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 text-xs">
                    <span className="tabular-num">{f}</span>
                    <button
                      type="button"
                      aria-label={`Rimuovi ${f}`}
                      onClick={() => setFestivi(festivi.filter((x) => x !== f))}
                      className="rounded p-0.5 hover:bg-zona-accento/10"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit">
              <Plus className="size-4" />
              Crea schema
            </Button>
          </div>
        </form>
      </Sezione>
    </div>
  );
}
