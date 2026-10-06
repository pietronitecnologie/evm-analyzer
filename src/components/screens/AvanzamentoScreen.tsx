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
  inviato: "in approvazione",
  applicato: "approvato",
  respinto: "respinto",
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

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per registrare l'avanzamento." />;
  if (!righe) return <Vuoto messaggio="Caricamento…" />;

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
    const ok = await esegui("Avanzamento non registrato", () =>
      chiama(percorso!, "registra_avanzamento", {
        uid: r.uid,
        pct: Number(b.pct),
        inizio: b.inizio || null,
        fine: b.fine || null,
        ac: b.ac === "" ? acDaOreTask(r.uid, b.ore === "" ? null : Number(b.ore)) : Number(b.ac),
        ore: b.ore === "" ? null : Number(b.ore),
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
          L&apos;AC si calcola dalle ore consuntive se non lo inserisci a mano (vedi l&apos;icona accanto a «Ore consuntive»).
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
              <th className={`${TESTA_TABELLA} text-right`}>
                <span className="inline-flex items-center gap-1">
                  Ore consuntive
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} aria-label="Come funzionano le ore consuntive e l'AC" className="cursor-help rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Info className="size-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-50 max-w-sm rounded-md border border-border bg-popover p-3 text-left text-xs font-normal normal-case tracking-normal text-popover-foreground shadow-lg">
                      <p className="font-semibold">Ore consuntive e AC</p>
                      <p className="mt-1">Sono le ore di lavoro cumulate del task fino alla data di stato.</p>
                      <p className="mt-1">
                        Se non inserisci l&apos;AC a mano, il sistema lo calcola: <strong>AC = ore × tariffa media</strong>.
                      </p>
                      <p className="mt-1">
                        La tariffa media è ponderata per le unità delle risorse assegnate al task: Σ(unità × tariffa) ÷ Σ unità.
                        Per ogni risorsa si usa il costo orario reale se verificato, altrimenti la tariffa importata.
                      </p>
                      <p className="mt-1">
                        Senza ore o senza risorse assegnate al task, l&apos;AC resta quello inserito a mano (o zero).
                        Il valore inserito a mano ha sempre la precedenza.
                      </p>
                      <p className="mt-1 text-muted-foreground">Il suggerimento grigio nel campo AC mostra il valore calcolato.</p>
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
              <th className={`${TESTA_TABELLA} text-right`}>AC cumulato (€)</th>
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
                  <td className={CELLA}>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className={`${CAMPO} w-28 text-right`}
                      value={b.ore}
                      aria-label={`Ore consuntive di ${r.uid}`}
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
                      aria-label={`AC cumulato di ${r.uid}`}
                      onChange={(e) => modifica(r.uid, r, "ac", e.target.value)}
                    />
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
