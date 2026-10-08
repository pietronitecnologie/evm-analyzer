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

  if (!percorso) return <Vuoto messaggio="Open or create a project to see approvals." />;
  if (!coda) return <Vuoto messaggio="Loading…" />;
  if (coda.length === 0) {
    return <Vuoto messaggio="No proposal waiting for approval." />;
  }

  async function approva(voce: RigaApprovazione) {
    const ok = await esegui("Approval failed", () =>
      chiama(percorso!, "approva_voce", { voceId: voce.id }),
      `Progress update for ${voce.uid} approved`,
    );
    if (ok) await ricarica();
  }

  async function respingi(voce: RigaApprovazione) {
    const ok = await esegui("Rejection failed", () =>
      chiama(percorso!, "respingi_voce", { voceId: voce.id, nota: note[voce.id] ?? "" }),
      `Proposal for ${voce.uid} rejected`,
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
            <th className={`${TESTA_TABELLA} text-right`}>Proposed %</th>
            <th className={TESTA_TABELLA}>Actual start</th>
            <th className={TESTA_TABELLA}>Actual finish</th>
            <th className={`${TESTA_TABELLA} text-right`}>AC (€)</th>
            <th className={TESTA_TABELLA}>Submitted on</th>
            <th className={TESTA_TABELLA}>Decision</th>
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
                    Approve
                  </Button>
                  <input
                    className={`${CAMPO} w-48`}
                    placeholder="Reason for rejection"
                    value={note[v.id] ?? ""}
                    onChange={(e) => setNote({ ...note, [v.id]: e.target.value })}
                  />
                  <Button size="sm" variant="outline" onClick={() => respingi(v)}>
                    <X className="size-4" />
                    Reject
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
