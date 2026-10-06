// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Approvazioni (fase 4-bis): proposte di avanzamento inviate in attesa di
// decisione. Approvare applica il valore allo snapshot; respingere richiede
// una nota che il proponente deve poter leggere.

import * as React from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type RigaApprovazione, chiama } from "@/lib/api";
import { Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, usePercorso, useDati } from "@/lib/schermate";

export function ApprovazioniScreen() {
  const percorso = usePercorso();
  const [coda, ricarica] = useDati<RigaApprovazione[]>("approvazioni_elenco", percorso);
  const [note, setNote] = React.useState<Record<number, string>>({});

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per le approvazioni." />;
  if (!coda) return <Vuoto messaggio="Caricamento…" />;
  if (coda.length === 0) {
    return <Vuoto messaggio="Nessuna proposta in attesa di approvazione." />;
  }

  async function approva(voce: RigaApprovazione) {
    const ok = await esegui("Approvazione non riuscita", () =>
      chiama(percorso!, "approva_voce", { voceId: voce.id }),
      `Avanzamento di ${voce.uid} approvato`,
    );
    if (ok) await ricarica();
  }

  async function respingi(voce: RigaApprovazione) {
    const ok = await esegui("Rifiuto non riuscito", () =>
      chiama(percorso!, "respingi_voce", { voceId: voce.id, nota: note[voce.id] ?? "" }),
      `Proposta per ${voce.uid} respinta`,
    );
    if (ok) await ricarica();
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TESTA_TABELLA}>UID</th>
            <th className={TESTA_TABELLA}>Task</th>
            <th className={`${TESTA_TABELLA} text-right`}>Proposto %</th>
            <th className={TESTA_TABELLA}>Inizio effettivo</th>
            <th className={TESTA_TABELLA}>Fine effettiva</th>
            <th className={`${TESTA_TABELLA} text-right`}>AC (€)</th>
            <th className={TESTA_TABELLA}>Inviato il</th>
            <th className={TESTA_TABELLA}>Decisione</th>
          </tr>
        </thead>
        <tbody>
          {coda.map((v) => (
            <tr key={v.id}>
              <td className={`${CELLA} tabular-num`}>{v.uid}</td>
              <td className={CELLA}>{v.nome}</td>
              <td className={`${CELLA} tabular-num text-right`}>{Math.round(v.pct)} %</td>
              <td className={`${CELLA} tabular-num`}>{v.inizioEffettivo ?? "—"}</td>
              <td className={`${CELLA} tabular-num`}>{v.fineEffettiva ?? "—"}</td>
              <td className={`${CELLA} tabular-num text-right`}>{v.ac === null ? "—" : v.ac.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</td>
              <td className={`${CELLA} text-xs text-muted-foreground`}>{v.inviatoIl}</td>
              <td className={CELLA}>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => approva(v)}>
                    <Check className="size-4" />
                    Approva
                  </Button>
                  <input
                    className={`${CAMPO} w-48`}
                    placeholder="Motivo del rifiuto"
                    value={note[v.id] ?? ""}
                    onChange={(e) => setNote({ ...note, [v.id]: e.target.value })}
                  />
                  <Button size="sm" variant="outline" onClick={() => respingi(v)}>
                    <X className="size-4" />
                    Respingi
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
