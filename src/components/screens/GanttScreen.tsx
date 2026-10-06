// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Gantt in sola lettura (fase 5). Ogni barra è una posizione percentuale
// sull'intervallo di date del progetto; l'avanzamento è sovrapposto in
// chiaro. Il colore non è l'unico segnale: i riepiloghi e le milestone hanno
// forma diversa, e il task critico è anche marcato con "C".

import { type RigaGantt } from "@/lib/api";
import { Vuoto } from "./comuni";
import { useDati, usePercorso } from "@/lib/schermate";

const GIORNO_MS = 86_400_000;

function numeroGiorno(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / GIORNO_MS;
}

function formato(giorno: number): string {
  return new Date(giorno * GIORNO_MS).toISOString().slice(0, 10);
}

export function GanttScreen() {
  const percorso = usePercorso();
  const [righe] = useDati<RigaGantt[]>("gantt_elenco", percorso);

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per vedere il Gantt." />;
  if (!righe) return <Vuoto messaggio="Caricamento…" />;

  const datati = righe.filter((r) => r.inizio && r.fine);
  if (datati.length === 0) {
    return <Vuoto messaggio="Nessun task con date pianificate da mostrare." />;
  }
  const inizio = Math.min(...datati.map((r) => numeroGiorno(r.inizio!)));
  const fine = Math.max(...datati.map((r) => numeroGiorno(r.fine!)));
  const span = Math.max(fine - inizio + 1, 1);
  const pos = (g: number) => ((g - inizio) / span) * 100;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2 text-xs text-muted-foreground">
        <span>Dal {formato(inizio)} al {formato(fine)}</span>
        <span>
          <span className="mr-3">■ critico (C)</span>
          <span className="mr-3">■ task</span>
          <span className="mr-3">▬ riepilogo</span>
          <span>◆ milestone</span>
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {righe.map((r) => {
          const ha = r.inizio && r.fine;
          const sx = ha ? pos(numeroGiorno(r.inizio!)) : 0;
          const dx = ha ? pos(numeroGiorno(r.fine!) + 1) : 0;
          const larghezza = Math.max(dx - sx, 0.4);
          const colore = r.critico
            ? "bg-semaforo-rosso"
            : r.riepilogo
              ? "bg-foreground/50"
              : "bg-zona-accento";
          return (
            <div key={r.id} className="flex items-center border-b border-border text-sm hover:bg-zona-accento/5">
              <div className="flex w-72 shrink-0 items-center gap-2 px-3 py-1" title={r.predecessori.join(", ")}>
                <span className="tabular-num w-10 shrink-0 text-xs text-muted-foreground">{r.uid}</span>
                <span className={`truncate ${r.riepilogo ? "font-semibold" : ""}`}>{r.nome}</span>
                {r.critico && <span className="text-xs font-semibold text-semaforo-rosso">C</span>}
              </div>
              <div className="relative h-7 flex-1 min-w-[320px]">
                {ha && r.milestone && (
                  <span
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-semaforo-rosso"
                    style={{ left: `${sx}%` }}
                    aria-label="milestone"
                  />
                )}
                {ha && !r.milestone && (
                  <div
                    className={`absolute top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-sm ${colore}`}
                    style={{ left: `${sx}%`, width: `${larghezza}%` }}
                  >
                    <div className="h-full bg-white/45" style={{ width: `${r.pct}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
