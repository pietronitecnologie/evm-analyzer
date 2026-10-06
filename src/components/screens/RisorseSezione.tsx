// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Risorse e assegnazioni: tariffe importate e costo orario reale (Cap. 2, §6-bis.7),
// assegnazioni task-risorsa con unità (1 = 100%). Gli avvisi di qualità (Q007 tariffa
// mancante, Q013 costo reale non verificato) vengono dal motore.

import * as React from "react";
import { checkQ007, checkQ013, type QResource } from "@evm-analyzer/engine";
import { Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chiama, type AssegnazioneRiga, type RisorsaRiga } from "@/lib/api";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, useDati, usePercorso } from "@/lib/schermate";
import { Campo, Sezione } from "./comuni";

interface TaskScelta {
  uid: string;
  nome: string;
}


export function RisorseSezione() {
  const percorso = usePercorso();
  const [risorse, ricaricaRisorse] = useDati<RisorsaRiga[]>("risorse_elenco", percorso);
  const [assegnazioni, ricaricaAssegnazioni] = useDati<AssegnazioneRiga[]>("assegnazioni_elenco", percorso);
  const [task] = useDati<TaskScelta[]>("elenca_task", percorso);
  const [nuova, setNuova] = React.useState({ nome: "", tipo: "lavoro", tariffa: "", straordinario: "" });
  const [assegna, setAssegna] = React.useState({ task: "", risorsa: "", unita: "1" });
  const [modifiche, setModifiche] = React.useState<Record<number, { tariffa: string; costo: string }>>({});

  const avvisi = React.useMemo(() => {
    if (!risorse) return [];
    const q: QResource[] = risorse.map((r) => ({ name: r.nome, rate: r.tariffa, realHourlyCost: r.costoOrarioReale }));
    return [...checkQ007(q), ...checkQ013(q)];
  }, [risorse]);

  if (!percorso || !risorse) return null;

  const numero = (v: string) => (v.trim() === "" ? null : Number(v));

  async function creaRisorsa(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Risorsa non creata", () =>
      chiama(percorso!, "crea_risorsa", {
        nome: nuova.nome,
        tipo: nuova.tipo || null,
        tariffa: numero(nuova.tariffa),
        tariffaStraordinario: numero(nuova.straordinario),
      }),
      "Risorsa creata",
    );
    if (ok) {
      setNuova({ nome: "", tipo: "lavoro", tariffa: "", straordinario: "" });
      await ricaricaRisorse();
    }
  }

  async function salvaTariffe(r: RisorsaRiga) {
    const m = modifiche[r.id] ?? { tariffa: r.tariffa?.toString() ?? "", costo: r.costoOrarioReale?.toString() ?? "" };
    const ok = await esegui("Tariffe non salvate", async () => {
      await chiama(percorso!, "imposta_tariffa", { id: r.id, tariffa: numero(m.tariffa) });
      await chiama(percorso!, "imposta_costo_reale", { id: r.id, costo: numero(m.costo) });
    }, `Tariffe di ${r.nome} salvate`);
    if (ok) {
      setModifiche((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
      await ricaricaRisorse();
    }
  }

  async function creaAssegnazione(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Assegnazione non creata", () =>
      chiama(percorso!, "crea_assegnazione", { taskUid: assegna.task, risorsaId: Number(assegna.risorsa), unita: Number(assegna.unita) }),
      "Risorsa assegnata",
    );
    if (ok) {
      await ricaricaAssegnazioni();
      await ricaricaRisorse();
    }
  }

  async function eliminaAssegnazione(id: number) {
    const ok = await esegui("Assegnazione non rimossa", () => chiama(percorso!, "elimina_assegnazione", { id }), "Assegnazione rimossa");
    if (ok) {
      await ricaricaAssegnazioni();
      await ricaricaRisorse();
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Risorse">
        {avvisi.length > 0 && (
          <ul className="mb-4 list-disc pl-5 text-sm text-semaforo-giallo">
            {avvisi.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
        )}
        {risorse.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessuna risorsa: viene dal piano importato o si crea qui sotto.</p>
        ) : (
          <div className="mb-4 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TESTA_TABELLA}>Nome</th>
                  <th className={TESTA_TABELLA}>Tipo</th>
                  <th className={`${TESTA_TABELLA} text-right`}>Tariffa (€/h)</th>
                  <th className={`${TESTA_TABELLA} text-right`}>Costo reale (€/h)</th>
                  <th className={TESTA_TABELLA}>Fonte</th>
                  <th className={`${TESTA_TABELLA} text-right`}>Task</th>
                  <th className={`${TESTA_TABELLA} text-right`}>Unità</th>
                  <th className={TESTA_TABELLA} />
                </tr>
              </thead>
              <tbody>
                {risorse.map((r) => {
                  const m = modifiche[r.id] ?? { tariffa: r.tariffa?.toString() ?? "", costo: r.costoOrarioReale?.toString() ?? "" };
                  return (
                    <tr key={r.id}>
                      <td className={`${CELLA} font-medium`}>{r.nome}</td>
                      <td className={CELLA}>{r.tipo ?? "—"}</td>
                      <td className={CELLA}>
                        <input type="number" min="0" step="0.01" className={`${CAMPO} w-28 text-right`} aria-label={`Tariffa di ${r.nome}`} value={m.tariffa} onChange={(e) => setModifiche({ ...modifiche, [r.id]: { ...m, tariffa: e.target.value } })} />
                      </td>
                      <td className={CELLA}>
                        <input type="number" min="0" step="0.01" className={`${CAMPO} w-28 text-right`} aria-label={`Costo reale di ${r.nome}`} value={m.costo} onChange={(e) => setModifiche({ ...modifiche, [r.id]: { ...m, costo: e.target.value } })} />
                      </td>
                      <td className={`${CELLA} text-xs`}>{r.fonte === "costo_reale" ? "costo reale verificato" : "tariffa importata"}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{r.task}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{r.unita}</td>
                      <td className={CELLA}>
                        <Button size="sm" variant="ghost" onClick={() => salvaTariffe(r)}><Save className="size-4" />Salva</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <form onSubmit={creaRisorsa} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
          <Campo etichetta="Nome">
            <input className={CAMPO} required value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })} />
          </Campo>
          <Campo etichetta="Tipo">
            <input className={CAMPO} value={nuova.tipo} onChange={(e) => setNuova({ ...nuova, tipo: e.target.value })} />
          </Campo>
          <Campo etichetta="Tariffa (€/h)">
            <input type="number" min="0" step="0.01" className={CAMPO} value={nuova.tariffa} onChange={(e) => setNuova({ ...nuova, tariffa: e.target.value })} />
          </Campo>
          <Campo etichetta="Straordinario (€/h)">
            <input type="number" min="0" step="0.01" className={CAMPO} value={nuova.straordinario} onChange={(e) => setNuova({ ...nuova, straordinario: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />Nuova risorsa</Button>
        </form>
      </Sezione>

      <Sezione titolo="Assegnazioni task-risorsa">
        {!assegnazioni || assegnazioni.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessuna assegnazione.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>UID</th>
                <th className={TESTA_TABELLA}>Task</th>
                <th className={TESTA_TABELLA}>Risorsa</th>
                <th className={`${TESTA_TABELLA} text-right`}>Unità</th>
                <th className={TESTA_TABELLA} />
              </tr>
            </thead>
            <tbody>
              {assegnazioni.map((a) => (
                <tr key={a.id}>
                  <td className={`${CELLA} tabular-num`}>{a.taskUid}</td>
                  <td className={CELLA}>{a.taskNome}</td>
                  <td className={CELLA}>{a.risorsaNome}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{a.unita}</td>
                  <td className={CELLA}>
                    <Button size="sm" variant="ghost" aria-label={`Rimuovi assegnazione ${a.id}`} onClick={() => eliminaAssegnazione(a.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={creaAssegnazione} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Task">
            <select className={CAMPO} required value={assegna.task} onChange={(e) => setAssegna({ ...assegna, task: e.target.value })}>
              <option value="">— scegli —</option>
              {(task ?? []).map((t) => <option key={t.uid} value={t.uid}>{t.uid} · {t.nome}</option>)}
            </select>
          </Campo>
          <Campo etichetta="Risorsa">
            <select className={CAMPO} required value={assegna.risorsa} onChange={(e) => setAssegna({ ...assegna, risorsa: e.target.value })}>
              <option value="">— scegli —</option>
              {risorse.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </Campo>
          <Campo etichetta="Unità (1 = 100%)">
            <input type="number" min="0.01" step="0.05" required className={CAMPO} value={assegna.unita} onChange={(e) => setAssegna({ ...assegna, unita: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />Assegna</Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">Il costo consuntivo (AC) di ogni task si inserisce nella schermata Avanzamento.</p>
      </Sezione>
    </div>
  );
}
