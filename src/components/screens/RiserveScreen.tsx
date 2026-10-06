// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Buffer e riserve (fase 5): parametri di contingenza, riserva di gestione e
// buffer di tempo; rischi con la contingenza allocata; consumi delle riserve.

import * as React from "react";
import { Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Riserve, TIPI_CONSUMO, chiama } from "@/lib/api";
import { Campo, Sezione, Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, usePercorso, useDati } from "@/lib/schermate";

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

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per vedere buffer e riserve." />;
  if (!r) return <Vuoto messaggio="Caricamento…" />;

  const numero = (v: string) => (v === "" ? null : Number(v));

  async function salvaParametri(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Parametri non salvati", () =>
      chiama(percorso!, "aggiorna_parametri", {
        contingencyPct: Number(parametri.contingenza || r!.contingencyPct),
        mgmtReservePct: Number(parametri.gestione || r!.mgmtReservePct),
        timeBufferDays: Number(parametri.buffer || r!.timeBufferDays),
      }),
      "Parametri salvati",
    );
    if (ok) {
      setParametri({ contingenza: "", gestione: "", buffer: "" });
      await ricarica();
    }
  }

  async function creaRischio(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Rischio non creato", () =>
      chiama(percorso!, "crea_rischio", {
        descrizione: rischio.descrizione,
        probabilitaPct: numero(rischio.probabilita),
        impatto: numero(rischio.impatto),
        contingenza: numero(rischio.contingenza),
      }),
      "Rischio registrato",
    );
    if (ok) {
      setRischio({ descrizione: "", probabilita: "", impatto: "", contingenza: "" });
      await ricarica();
    }
  }

  async function registraConsumo(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Consumo non registrato", () =>
      chiama(percorso!, "registra_consumo", {
        tipo: consumo.tipo,
        importo: Number(consumo.importo),
        data: consumo.data,
        nota: consumo.nota || null,
      }),
      "Consumo registrato",
    );
    if (ok) {
      setConsumo({ ...consumo, importo: "", data: "", nota: "" });
      await ricarica();
    }
  }

  return (
    <div className="flex flex-col">
      <Sezione titolo="Parametri">
        <div className="mb-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <span>Contingenza: <strong>{r.contingencyPct} %</strong></span>
          <span>Riserva di gestione: <strong>{r.mgmtReservePct} %</strong></span>
          <span>Buffer di tempo: <strong>{r.timeBufferDays} g</strong></span>
          <span>BAC: <strong>{eur(r.bacTotale)}</strong></span>
          <span>Contingenza allocata: <strong>{eur(r.contingenzaAllocata)}</strong></span>
        </div>
        <form onSubmit={salvaParametri} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Contingenza %">
            <input type="number" min="0" max="100" step="0.5" className={CAMPO} placeholder={String(r.contingencyPct)} value={parametri.contingenza} onChange={(e) => setParametri({ ...parametri, contingenza: e.target.value })} />
          </Campo>
          <Campo etichetta="Riserva di gestione %">
            <input type="number" min="0" max="100" step="0.5" className={CAMPO} placeholder={String(r.mgmtReservePct)} value={parametri.gestione} onChange={(e) => setParametri({ ...parametri, gestione: e.target.value })} />
          </Campo>
          <Campo etichetta="Buffer di tempo (giorni)">
            <input type="number" min="0" step="0.5" className={CAMPO} placeholder={String(r.timeBufferDays)} value={parametri.buffer} onChange={(e) => setParametri({ ...parametri, buffer: e.target.value })} />
          </Campo>
          <Button type="submit">
            <Save className="size-4" />
            Salva parametri
          </Button>
        </form>
      </Sezione>

      <Sezione titolo="Rischi">
        {r.rischi.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessun rischio registrato.</p>
        ) : (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>Descrizione</th>
                <th className={`${TESTA_TABELLA} text-right`}>Probabilità</th>
                <th className={`${TESTA_TABELLA} text-right`}>Impatto</th>
                <th className={`${TESTA_TABELLA} text-right`}>Contingenza</th>
                <th className={TESTA_TABELLA}>Stato</th>
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
            <Campo etichetta="Descrizione">
              <input className={CAMPO} required value={rischio.descrizione} onChange={(e) => setRischio({ ...rischio, descrizione: e.target.value })} />
            </Campo>
          </div>
          <Campo etichetta="Probabilità %">
            <input type="number" min="0" max="100" className={CAMPO} value={rischio.probabilita} onChange={(e) => setRischio({ ...rischio, probabilita: e.target.value })} />
          </Campo>
          <Campo etichetta="Impatto (€)">
            <input type="number" min="0" className={CAMPO} value={rischio.impatto} onChange={(e) => setRischio({ ...rischio, impatto: e.target.value })} />
          </Campo>
          <Campo etichetta="Contingenza allocata (€)">
            <input type="number" min="0" className={CAMPO} value={rischio.contingenza} onChange={(e) => setRischio({ ...rischio, contingenza: e.target.value })} />
          </Campo>
          <div className="md:col-span-5 flex justify-end">
            <Button type="submit">
              <Plus className="size-4" />
              Registra rischio
            </Button>
          </div>
        </form>
      </Sezione>

      <Sezione titolo="Consumi delle riserve">
        {r.consumi.length === 0 ? (
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
              {r.consumi.map((c) => (
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
              {TIPI_CONSUMO.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
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
          <Button type="submit">
            <Plus className="size-4" />
            Registra consumo
          </Button>
        </form>
      </Sezione>
    </div>
  );
}
