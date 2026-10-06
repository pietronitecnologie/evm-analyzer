// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Avanzamento (fase 4-bis): "Invia per approvazione" trasforma la modifica in
// una proposta che compare subito nella schermata Approvazioni. Il valore
// vigente resta quello approvato finché la proposta non viene applicata.

import * as React from "react";

import { Button } from "@/components/ui/button";
import { type RigaAvanzamento, chiama } from "@/lib/api";
import { Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, usePercorso, useDati } from "@/lib/schermate";

interface Bozza {
  pct: string;
  inizio: string;
  fine: string;
}

const ETICHETTE_STATO: Record<string, string> = {
  inviato: "in approvazione",
  applicato: "approvato",
  respinto: "respinto",
};

export function AvanzamentoScreen() {
  const percorso = usePercorso();
  const [righe, ricarica] = useDati<RigaAvanzamento[]>("avanzamento_elenco", percorso);
  const [bozze, setBozze] = React.useState<Record<string, Bozza>>({});

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per registrare l'avanzamento." />;
  if (!righe) return <Vuoto messaggio="Caricamento…" />;

  const valore = (r: RigaAvanzamento): Bozza =>
    bozze[r.uid] ?? {
      pct: String(Math.round(r.pct)),
      inizio: r.inizioEffettivo ?? "",
      fine: r.fineEffettiva ?? "",
    };

  function modifica(uid: string, r: RigaAvanzamento, campo: keyof Bozza, v: string) {
    setBozze((prev) => ({ ...prev, [uid]: { ...valore(r), ...prev[uid], [campo]: v } }));
  }

  async function registra(r: RigaAvanzamento) {
    const b = valore(r);
    const ok = await esegui("Avanzamento non registrato", () =>
      chiama(percorso!, "registra_avanzamento", {
        uid: r.uid,
        pct: Number(b.pct),
        inizio: b.inizio || null,
        fine: b.fine || null,
      }),
      `Inviato per approvazione: ${r.uid}`,
    );
    if (ok) {
      setBozze((prev) => {
        const next = { ...prev };
        delete next[r.uid];
        return next;
      });
      await ricarica();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
        <span className="text-sm text-muted-foreground">
          Ogni proposta va in approvazione subito; il valore vigente cambia solo quando viene approvata.
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TESTA_TABELLA}>UID</th>
              <th className={TESTA_TABELLA}>Task</th>
              <th className={`${TESTA_TABELLA} text-right`}>Vigente</th>
              <th className={TESTA_TABELLA}>Nuovo %</th>
              <th className={TESTA_TABELLA}>Inizio effettivo</th>
              <th className={TESTA_TABELLA}>Fine effettiva</th>
              <th className={TESTA_TABELLA}>Stato ultima proposta</th>
              <th className={TESTA_TABELLA} />
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const b = valore(r);
              const modificata = Boolean(bozze[r.uid]);
              return (
                <tr key={r.uid} className={modificata ? "bg-semaforo-giallo/10" : ""}>
                  <td className={`${CELLA} tabular-num`}>{r.uid}</td>
                  <td className={CELLA}>{r.nome}</td>
                  <td className={`${CELLA} tabular-num text-right`}>{Math.round(r.pct)} %</td>
                  <td className={CELLA}>
                    <input
                      className={`${CAMPO} w-24`}
                      type="number"
                      min="0"
                      max="100"
                      value={b.pct}
                      onChange={(e) => modifica(r.uid, r, "pct", e.target.value)}
                    />
                  </td>
                  <td className={CELLA}>
                    <input type="date" className={CAMPO} value={b.inizio} onChange={(e) => modifica(r.uid, r, "inizio", e.target.value)} />
                  </td>
                  <td className={CELLA}>
                    <input type="date" className={CAMPO} value={b.fine} onChange={(e) => modifica(r.uid, r, "fine", e.target.value)} />
                  </td>
                  <td className={`${CELLA} text-xs`}>
                    <span className="text-muted-foreground">
                      {r.statoUltimaVoce ? ETICHETTE_STATO[r.statoUltimaVoce] ?? r.statoUltimaVoce : "—"}
                    </span>
                    {r.statoUltimaVoce === "respinto" && r.notaUltimaVoce && (
                      <p className="mt-0.5 text-semaforo-rosso">Motivo: {r.notaUltimaVoce}</p>
                    )}
                  </td>
                  <td className={CELLA}>
                    <Button size="sm" variant="ghost" disabled={!modificata} onClick={() => registra(r)}>
                      Invia per approvazione
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
