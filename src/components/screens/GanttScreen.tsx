// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Gantt di sola lettura: attività a sinistra (fisse durante lo scorrimento), timeline a destra
// con griglia giornaliera, fine settimana e festivi del calendario di progetto evidenziati, frecce
// di precedenza. Scorrimento orizzontale e verticale. Nessuna modifica dei dati.

import * as React from "react";

import type { Calendario, RigaGantt } from "@/lib/api";
import { GIORNO_PX, RIGA_PX, modelloGantt } from "@/lib/gantt";
import { useDati, usePercorso } from "@/lib/schermate";
import { Vuoto } from "./comuni";

const LABEL_PX = 300;
const HEADER_PX = 46;
const BARRA_PX = 12;
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** Segmenti dei mesi per l'intestazione superiore. */
function segmentiMesi(giorni: { iso: string }[]) {
  const segmenti: { etichetta: string; inizio: number; ampiezza: number }[] = [];
  giorni.forEach((g, i) => {
    const mese = Number(g.iso.slice(5, 7)) - 1;
    const anno = g.iso.slice(0, 4);
    const ultimo = segmenti[segmenti.length - 1];
    if (ultimo && ultimo.etichetta === `${MESI[mese]} ${anno}`) {
      ultimo.ampiezza += 1;
    } else {
      segmenti.push({ etichetta: `${MESI[mese]} ${anno}`, inizio: i, ampiezza: 1 });
    }
  });
  return segmenti;
}

export function GanttScreen() {
  const percorso = usePercorso();
  const [righe] = useDati<RigaGantt[]>("gantt_elenco", percorso);
  const [calendari] = useDati<Calendario[]>("calendari_elenco", percorso);

  const calendario = React.useMemo(
    () => (calendari ? calendari.find((c) => c.predefinito) ?? calendari[0] ?? null : null),
    [calendari],
  );
  const modello = React.useMemo(() => (righe ? modelloGantt(righe, calendario) : null), [righe, calendario]);

  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per vedere il Gantt." />;
  if (!righe || !modello) return <Vuoto messaggio="Caricamento…" />;
  if (modello.giorni.length === 0) return <Vuoto messaggio="Nessun task con date pianificate da mostrare." />;

  const altezzaRighe = righe.length * RIGA_PX;
  const mesi = segmentiMesi(modello.giorni);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong bg-zona-contesto px-4 py-2 text-xs text-muted-foreground">
        <span>
          Dal <strong className="text-foreground">{modello.inizio}</strong> al{" "}
          <strong className="text-foreground">{modello.fine}</strong> · {modello.conDate} attività datate
          {calendario ? ` · calendario «${calendario.nome}»` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 bg-zona-accento" />task</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 bg-semaforo-rosso" />critico</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 bg-foreground/50" />riepilogo</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rotate-45 bg-semaforo-rosso" />milestone</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 bg-muted-foreground/25" />fine settimana</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 bg-semaforo-giallo/60" />festivo</span>
          <span>Sola lettura</span>
        </span>
      </div>

      {/* Contenitore unico di scorrimento: intestazione e colonna attività restano fisse nei rispettivi assi. */}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: LABEL_PX + modello.larghezzaPx, height: HEADER_PX + altezzaRighe }}>
          {/* Intestazione: mesi e giorni */}
          <div className="sticky top-0 z-20 flex border-b border-border-strong bg-card" style={{ height: HEADER_PX }}>
            <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-border-strong bg-card px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ width: LABEL_PX }}>
              Attività
            </div>
            <div className="relative" style={{ width: modello.larghezzaPx }}>
              {mesi.map((m) => (
                <div key={`${m.etichetta}-${m.inizio}`} className="absolute top-0 truncate border-l border-border-strong px-1 text-[11px] font-semibold" style={{ left: m.inizio * GIORNO_PX, width: m.ampiezza * GIORNO_PX, height: 20 }}>
                  {m.etichetta}
                </div>
              ))}
              {modello.giorni.map((g, i) => (
                <div
                  key={g.iso}
                  className={`absolute bottom-0 text-center text-[10px] tabular-num ${g.festivo ? "font-semibold text-semaforo-giallo" : g.weekend ? "text-muted-foreground" : ""}`}
                  style={{ left: i * GIORNO_PX, width: GIORNO_PX, height: 22 }}
                  title={`${g.iso}${g.festivo ? " · festivo" : g.weekend ? " · fine settimana" : ""}`}
                >
                  {Number(g.iso.slice(8, 10))}
                </div>
              ))}
            </div>
          </div>

          {/* Fondo della timeline: fine settimana e festivi a colonna intera, griglia giornaliera */}
          <div className="absolute" style={{ left: LABEL_PX, top: HEADER_PX, width: modello.larghezzaPx, height: altezzaRighe, pointerEvents: "none" }}>
            {modello.giorni.map((g, i) =>
              g.weekend || g.festivo ? (
                <div
                  key={`bg-${g.iso}`}
                  className={`absolute top-0 h-full ${g.festivo ? "bg-semaforo-giallo/25" : "bg-muted-foreground/10"}`}
                  style={{ left: i * GIORNO_PX, width: GIORNO_PX }}
                  title={g.festivo ? `${g.iso} · festivo` : g.iso}
                />
              ) : null,
            )}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)",
                backgroundSize: `${GIORNO_PX}px 100%`,
              }}
            />
          </div>

          {/* Righe: etichetta fissa a sinistra, barra sulla timeline */}
          {righe.map((r, indiceRiga) => {
            const barra = modello.barre.find((b) => b.id === r.id);
            return (
              <div key={r.id} className="absolute left-0 flex w-full border-b border-border/60 text-sm" style={{ top: HEADER_PX + indiceRiga * RIGA_PX, height: RIGA_PX }}>
                <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border-strong bg-card px-3" style={{ width: LABEL_PX }} title={r.predecessori.join(", ")}>
                  <span className="tabular-num w-10 shrink-0 text-xs text-muted-foreground">{r.uid}</span>
                  <span className={`truncate ${r.riepilogo ? "font-semibold" : ""}`}>{r.nome}</span>
                  {r.critico && <span className="text-xs font-semibold text-semaforo-rosso">C</span>}
                </div>
                <div className="relative" style={{ width: modello.larghezzaPx }}>
                  {barra && barra.milestone && (
                    <span
                      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-semaforo-rosso"
                      style={{ left: barra.x }}
                      title={`${r.nome}: milestone ${r.inizio}`}
                      aria-label={`milestone ${r.nome}`}
                    />
                  )}
                  {barra && !barra.milestone && (
                    <div
                      className={`absolute top-1/2 overflow-hidden rounded-sm ${barra.critico ? "bg-semaforo-rosso" : barra.riepilogo ? "bg-foreground/50" : "bg-zona-accento"}`}
                      style={{ left: barra.x, width: barra.larghezza, height: BARRA_PX, transform: "translateY(-50%)" }}
                      title={`${r.nome} · ${r.inizio} → ${r.fine} · ${Math.round(r.pct)} %`}
                    >
                      <div className="h-full bg-white/45" style={{ width: `${Math.min(Math.max(r.pct, 0), 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Frecce di precedenza, sopra la timeline */}
          <svg className="pointer-events-none absolute" style={{ left: LABEL_PX, top: HEADER_PX, width: modello.larghezzaPx, height: altezzaRighe }} aria-hidden="true">
            <defs>
              <marker id="gantt-freccia" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
              </marker>
            </defs>
            {modello.frecce.map((f, i) => {
              const y1 = f.da * RIGA_PX + RIGA_PX / 2;
              const y2 = f.a * RIGA_PX + RIGA_PX / 2;
              const mid = f.xDa + GIORNO_PX / 2;
              return (
                <path
                  key={i}
                  d={`M${f.xDa},${y1} H${mid} V${y2} H${f.xA}`}
                  fill="none"
                  strokeWidth="1"
                  className="stroke-muted-foreground"
                  markerEnd="url(#gantt-freccia)"
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
