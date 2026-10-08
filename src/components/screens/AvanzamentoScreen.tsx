// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Avanzamento (fase 4-bis): "Invia per approvazione" trasforma la modifica in
// una proposta che compare subito nella schermata Approvazioni. Il valore
// vigente resta quello approvato finché la proposta non viene applicata.

import * as React from "react";

import { acDaOre } from "@evm-analyzer/engine";

import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type AssegnazioneRiga, type RigaAvanzamento, type RisorsaRiga, chiama } from "@/lib/api";
import { Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, usePercorso, useDati } from "@/lib/schermate";

interface Bozza {
  pct: string;
  inizio: string;
  fine: string;
  /** AC cumulato a oggi (€), stringa vuota se non inserito: in quel caso si calcola dalle ore. */
  ac: string;
  /** Ore consuntive cumulate del task, stringa vuota se non inserite. */
  ore: string;
}

const ETICHETTE_STATO: Record<string, string> = {
  inviato: "pending approval",
  applicato: "approved",
  respinto: "rejected",
};

export function AvanzamentoScreen() {
  const percorso = usePercorso();
  const [righe, ricarica] = useDati<RigaAvanzamento[]>("avanzamento_elenco", percorso);
  const [bozze, setBozze] = React.useState<Record<string, Bozza>>({});
  const [risorse] = useDati<RisorsaRiga[]>("risorse_elenco", percorso);
  const [assegnazioni] = useDati<AssegnazioneRiga[]>("assegnazioni_elenco", percorso);

  /** AC da ore consuntive: ore × tariffa media delle risorse assegnate al task (motore). */
  function acDaOreTask(uid: string, ore: number | null): number | null {
    if (ore === null || !risorse || !assegnazioni) return null;
    const costi = assegnazioni
      .filter((a) => a.taskUid === uid)
      .map((a) => {
        const r = risorse.find((x) => x.id === a.risorsaId);
        return { unita: a.unita, tariffa: r?.costoOrarioReale ?? r?.tariffa ?? 0 };
      });
    return acDaOre(ore, costi);
  }

  if (!percorso) return <Vuoto messaggio="Open or create a project to record progress." />;
  if (!righe) return <Vuoto messaggio="Loading…" />;

  const valore = (r: RigaAvanzamento): Bozza =>
    bozze[r.uid] ?? {
      pct: String(Math.round(r.pct)),
      inizio: r.inizioEffettivo ?? "",
      fine: r.fineEffettiva ?? "",
      ac: r.ac ? String(r.ac) : "",
      ore: "",
    };

  function modifica(uid: string, r: RigaAvanzamento, campo: keyof Bozza, v: string) {
    setBozze((prev) => ({ ...prev, [uid]: { ...valore(r), ...prev[uid], [campo]: v } }));
  }

  async function registra(r: RigaAvanzamento) {
    const b = valore(r);
    const ok = await esegui("Progress not recorded", () =>
      chiama(percorso!, "registra_avanzamento", {
        uid: r.uid,
        pct: Number(b.pct),
        inizio: b.inizio || null,
        fine: b.fine || null,
        ac: b.ac === "" ? acDaOreTask(r.uid, b.ore === "" ? null : Number(b.ore)) : Number(b.ac),
        ore: b.ore === "" ? null : Number(b.ore),
      }),
      `Submitted for approval: ${r.uid}`,
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
          Every proposal goes to approval immediately; the current value changes only once it is approved.
          AC is calculated from actual hours if you don&apos;t enter it by hand (see the icon next to &quot;Actual hours&quot;).
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TESTA_TABELLA}>UID</th>
              <th className={TESTA_TABELLA}>Task</th>
              <th className={`${TESTA_TABELLA} text-right`}>Current</th>
              <th className={TESTA_TABELLA}>New %</th>
              <th className={TESTA_TABELLA}>Actual start</th>
              <th className={TESTA_TABELLA}>Actual finish</th>
              <th className={`${TESTA_TABELLA} text-right`}>
                <span className="inline-flex items-center gap-1">
                  Actual hours
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} aria-label="How actual hours and AC work" className="cursor-help rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Info className="size-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-50 max-w-sm rounded-md border border-border bg-popover p-3 text-left text-xs font-normal normal-case tracking-normal text-popover-foreground shadow-lg">
                      <p className="font-semibold">Actual hours and AC</p>
                      <p className="mt-1">These are the task&apos;s cumulative work hours up to the status date.</p>
                      <p className="mt-1">
                        If you don&apos;t enter AC by hand, the system calculates it: <strong>AC = hours × average rate</strong>.
                      </p>
                      <p className="mt-1">
                        The average rate is weighted by the units of the resources assigned to the task: Σ(units × rate) ÷ Σ units.
                        For each resource, the verified real hourly cost is used if available, otherwise the imported rate.
                      </p>
                      <p className="mt-1">
                        Without hours or without resources assigned to the task, AC remains whatever was entered by hand (or zero).
                        A manually entered value always takes precedence.
                      </p>
                      <p className="mt-1 text-muted-foreground">The grey placeholder in the AC field shows the calculated value.</p>
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
              <th className={`${TESTA_TABELLA} text-right`}>Cumulative AC (€)</th>
              <th className={TESTA_TABELLA}>Latest proposal status</th>
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
                  <td className={CELLA}>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className={`${CAMPO} w-28 text-right`}
                      value={b.ore}
                      aria-label={`Actual hours for ${r.uid}`}
                      onChange={(e) => modifica(r.uid, r, "ore", e.target.value)}
                    />
                  </td>
                  <td className={CELLA}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${CAMPO} w-32 text-right`}
                      placeholder={
                        acDaOreTask(r.uid, b.ore === "" ? null : Number(b.ore))?.toFixed(2) ?? (r.ac ? String(r.ac) : "0,00")
                      }
                      value={b.ac}
                      aria-label={`Cumulative AC for ${r.uid}`}
                      onChange={(e) => modifica(r.uid, r, "ac", e.target.value)}
                    />
                  </td>
                  <td className={`${CELLA} text-xs`}>
                    <span className="text-muted-foreground">
                      {r.statoUltimaVoce ? ETICHETTE_STATO[r.statoUltimaVoce] ?? r.statoUltimaVoce : "—"}
                    </span>
                    {r.statoUltimaVoce === "respinto" && r.notaUltimaVoce && (
                      <p className="mt-0.5 text-semaforo-rosso">Reason: {r.notaUltimaVoce}</p>
                    )}
                  </td>
                  <td className={CELLA}>
                    <Button size="sm" variant="ghost" disabled={!modificata} onClick={() => registra(r)}>
                      Submit for approval
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
