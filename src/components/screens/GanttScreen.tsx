// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Gantt di sola lettura (specifica Fase 5 §3.4): due pannelli ridimensionabili —
// tabella (WBS | Nome | Inizio | Fine | % reale) a sinistra, timeline a destra — con
// scorrimento verticale sincronizzato (un solo useVirtualizer, stesso pattern di
// DataTable.tsx) e virtualizzazione delle righe per le 20.000 righe del test di
// specifica. Barra attuale blu con riempimento scuro = % reale, contorno rosso per i
// task critici, baseline sottile grigia sotto, milestone a rombo, riepiloghi a
// parentesi, linea della data di stato, frecce di precedenza disattivabili,
// evidenza del perimetro. Nessuna modifica: niente trascinamento.

import * as React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isoToDays, pvLineareTask } from "@evm-analyzer/engine";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Calendario, DatiMonitoraggio, Perimetro, RigaGantt } from "@/lib/api";
import { num } from "@/lib/format";
import { LIVELLI_ZOOM, RIGA_PX, modelloGantt, type LivelloZoom } from "@/lib/gantt";
import { puntoTestata, sottoalbero, vistaMonitoraggio } from "@/lib/monitoraggio";
import { useDati, useDatiCon, usePercorso } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Vuoto } from "./comuni";

const HEADER_PX = 46;
const BARRA_PX = 12;
const MESI = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLONNE_TABELLA = [
  { id: "wbs", etichetta: "WBS", defaultPx: 56, minPx: 40 },
  { id: "nome", etichetta: "Name", defaultPx: 230, minPx: 120 },
  { id: "inizio", etichetta: "Start", defaultPx: 80, minPx: 56 },
  { id: "fine", etichetta: "Finish", defaultPx: 80, minPx: 56 },
  { id: "pct", etichetta: "%", defaultPx: 48, minPx: 36 },
] as const;

const CHIAVE_LARGHEZZE = "evm-analyzer.gantt-colonne";

function caricaLarghezzeColonne(): Record<string, number> {
  const base = Object.fromEntries(COLONNE_TABELLA.map((c) => [c.id, c.defaultPx]));
  try {
    const raw = localStorage.getItem(CHIAVE_LARGHEZZE);
    return raw ? { ...base, ...(JSON.parse(raw) as Record<string, number>) } : base;
  } catch {
    return base;
  }
}

function persistiLarghezzeColonne(larghezze: Record<string, number>) {
  try {
    localStorage.setItem(CHIAVE_LARGHEZZE, JSON.stringify(larghezze));
  } catch {
    // localStorage non disponibile: le larghezze restano solo in memoria.
  }
}

/** Larghezze delle colonne della tabella task, ridimensionabili trascinando il bordo destro di ciascuna. */
function useColonneRidimensionabili() {
  const [larghezze, setLarghezze] = React.useState<Record<string, number>>(caricaLarghezzeColonne);
  const trascinamento = React.useRef<{ id: string; xIniziale: number; larghezzaIniziale: number } | null>(null);

  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      const t = trascinamento.current;
      if (!t) return;
      const minPx = COLONNE_TABELLA.find((c) => c.id === t.id)?.minPx ?? 40;
      setLarghezze((prev) => ({ ...prev, [t.id]: Math.max(minPx, t.larghezzaIniziale + (e.clientX - t.xIniziale)) }));
    }
    function onUp() {
      if (!trascinamento.current) return;
      trascinamento.current = null;
      setLarghezze((attuali) => {
        persistiLarghezzeColonne(attuali);
        return attuali;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const iniziaTrascinamento = React.useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      trascinamento.current = { id, xIniziale: e.clientX, larghezzaIniziale: larghezze[id] };
    },
    [larghezze],
  );

  return { larghezze, iniziaTrascinamento };
}

/** Segmenti dei mesi per l'intestazione superiore. */
function segmentiMesi(giorni: { iso: string }[], pxPerGiorno: number) {
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
  return segmenti.map((s) => ({ ...s, left: s.inizio * pxPerGiorno, width: s.ampiezza * pxPerGiorno }));
}

export function GanttScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [livelloZoom, setLivelloZoom] = React.useState<LivelloZoom>("giorno");
  const [mostraFrecce, setMostraFrecce] = React.useState(true);
  const { larghezze, iniziaTrascinamento } = useColonneRidimensionabili();
  const labelPx = COLONNE_TABELLA.reduce((s, c) => s + larghezze[c.id], 0);
  const pxPerGiorno = LIVELLI_ZOOM.find((l) => l.id === livelloZoom)!.pxPerGiorno;

  const [righe] = useDatiCon<RigaGantt[]>("gantt_elenco", percorso, { baselineId: ctx.baselineId });
  const [calendari] = useDati<Calendario[]>("calendari_elenco", percorso);
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [perimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);

  const calendario = React.useMemo(
    () => (calendari ? calendari.find((c) => c.predefinito) ?? calendari[0] ?? null : null),
    [calendari],
  );
  const modello = React.useMemo(() => (righe ? modelloGantt(righe, calendario, pxPerGiorno) : null), [righe, calendario, pxPerGiorno]);
  const vista = React.useMemo(() => (datiMon ? vistaMonitoraggio(datiMon) : null), [datiMon]);
  const testata = vista ? puntoTestata(vista, ctx) : undefined;
  const codiceRadice = React.useMemo(
    () => perimetri?.find((p) => p.id === ctx.scopeId)?.codiceWbs ?? null,
    [perimetri, ctx.scopeId],
  );

  const leftRef = React.useRef<HTMLDivElement>(null);
  const rightRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: righe?.length ?? 0,
    getScrollElement: () => leftRef.current,
    estimateSize: () => RIGA_PX,
    overscan: 12,
  });

  // Il pannello sinistro guida lo scorrimento verticale (è lui l'elemento del
  // virtualizer): il destro lo segue qui. Scorrendo sopra il destro (onWheelRight)
  // si muove invece il sinistro, che richiama questo stesso handler di riflesso —
  // nessun ping-pong possibile: il destro non ha un proprio listener di scorrimento
  // che retroagisca sul sinistro.
  function onScrollLeft(e: React.UIEvent<HTMLDivElement>) {
    if (rightRef.current) rightRef.current.scrollTop = e.currentTarget.scrollTop;
  }

  function onWheelRight(e: React.WheelEvent<HTMLDivElement>) {
    if (e.ctrlKey) {
      e.preventDefault();
      const indice = LIVELLI_ZOOM.findIndex((l) => l.id === livelloZoom);
      const prossimo = e.deltaY < 0 ? Math.max(0, indice - 1) : Math.min(LIVELLI_ZOOM.length - 1, indice + 1);
      setLivelloZoom(LIVELLI_ZOOM[prossimo].id);
      return;
    }
    if (leftRef.current && e.deltaY !== 0) {
      e.preventDefault();
      leftRef.current.scrollTop += e.deltaY;
    }
  }

  if (!percorso) return <Vuoto messaggio="Open or create a project to see the Gantt chart." />;
  if (!righe || !modello) return <Vuoto messaggio="Loading…" />;
  if (modello.giorni.length === 0) return <Vuoto messaggio="No task with planned dates to show." />;

  const altezzaTotale = righe.length * RIGA_PX;
  const mesi = segmentiMesi(modello.giorni, pxPerGiorno);
  const items = virtualizer.getVirtualItems();
  const primoIndice = items[0]?.index ?? 0;
  const ultimoIndice = items[items.length - 1]?.index ?? primoIndice;

  const primoGiorno = isoToDays(modello.giorni[0].iso);
  const statusDateX = ctx.statusDate && ctx.statusDate !== "—" ? (isoToDays(ctx.statusDate) - primoGiorno) * pxPerGiorno : null;

  const freccevisibili = mostraFrecce
    ? modello.frecce.filter((f) => f.da >= primoIndice - 1 && f.da <= ultimoIndice + 1 && f.a >= primoIndice - 1 && f.a <= ultimoIndice + 1)
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong bg-zona-contesto px-4 py-2 text-xs text-muted-foreground">
        <span>
          From <strong className="text-foreground">{modello.inizio}</strong> to{" "}
          <strong className="text-foreground">{modello.fine}</strong> · {modello.conDate} dated activities
          {calendario ? ` · calendar "${calendario.nome}"` : ""} · baseline "{ctx.baseline}"
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-md border border-border-strong p-0.5">
            {LIVELLI_ZOOM.map((l) => (
              <Button key={l.id} size="sm" variant={l.id === livelloZoom ? "outline" : "ghost"} onClick={() => setLivelloZoom(l.id)}>
                {l.etichetta}
              </Button>
            ))}
          </span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={mostraFrecce} onChange={(e) => setMostraFrecce(e.target.checked)} />
            Dependencies
          </label>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 bg-zona-accento" />task</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 border-2 border-semaforo-rosso bg-zona-accento" />critical</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-3 border-y-2 border-foreground/60" />summary</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rotate-45 bg-zona-accento" />milestone</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-3 bg-muted-foreground/60" />baseline</span>
          <span>Read-only: the plan can only be modified in the planning software.</span>
        </span>
      </div>

      <Group orientation="horizontal" style={{ height: "100%", flex: 1, minHeight: 0 }}>
        <Panel id="gantt-tabella" defaultSize={32} minSize={20}>
          <div ref={leftRef} onScroll={onScrollLeft} className="h-full overflow-auto">
            <div style={{ width: labelPx, height: HEADER_PX + altezzaTotale, position: "relative" }}>
              <div className="sticky top-0 z-20 flex items-center border-b border-border-strong bg-card pl-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ height: HEADER_PX }}>
                {COLONNE_TABELLA.map((c) => (
                  <span key={c.id} className={`relative h-full shrink-0 truncate pr-2 ${c.id === "nome" ? "" : "text-right"}`} style={{ width: larghezze[c.id] }}>
                    <span style={{ lineHeight: `${HEADER_PX}px` }}>{c.etichetta}</span>
                    <span
                      onMouseDown={iniziaTrascinamento(c.id)}
                      className="absolute -right-1 top-0 h-full w-2 cursor-col-resize select-none hover:bg-ring"
                      aria-hidden="true"
                    />
                  </span>
                ))}
              </div>
              {items.map((item) => {
                const r = righe[item.index];
                const dentro = codiceRadice === null || sottoalbero(r.wbs, codiceRadice);
                return (
                  <div
                    key={r.id}
                    className={`absolute left-0 flex w-full items-center border-b border-border/60 pl-3 text-sm ${dentro ? "" : "opacity-40"}`}
                    style={{ top: HEADER_PX, height: item.size, transform: `translateY(${item.start}px)` }}
                  >
                    <span className="tabular-num shrink-0 truncate pr-2 text-xs text-muted-foreground" style={{ width: larghezze.wbs }}>{r.wbs ?? "—"}</span>
                    <span className={`shrink-0 truncate pr-2 ${r.riepilogo ? "font-semibold" : ""}`} style={{ width: larghezze.nome }}>{r.nome}</span>
                    <span className="tabular-num shrink-0 truncate pr-2 text-right text-xs" style={{ width: larghezze.inizio }}>{r.inizio ?? "—"}</span>
                    <span className="tabular-num shrink-0 truncate pr-2 text-right text-xs" style={{ width: larghezze.fine }}>{r.fine ?? "—"}</span>
                    <span className="tabular-num shrink-0 truncate pr-2 text-right text-xs" style={{ width: larghezze.pct }}>{Math.round(r.pct)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
        <Separator className="w-1.5 shrink-0 cursor-col-resize bg-border-strong hover:bg-accent" />
        <Panel id="gantt-timeline" defaultSize={68} minSize={30}>
          <div ref={rightRef} className="h-full overflow-auto" onWheel={onWheelRight}>
            <div className="relative" style={{ width: modello.larghezzaPx, height: HEADER_PX + altezzaTotale }}>
              <div className="sticky top-0 z-20 border-b border-border-strong bg-card" style={{ height: HEADER_PX }}>
                {mesi.map((m) => (
                  <div key={`${m.etichetta}-${m.inizio}`} className="absolute top-0 truncate border-l border-border-strong px-1 text-[11px] font-semibold" style={{ left: m.left, width: m.width, height: 20 }}>
                    {m.etichetta}
                  </div>
                ))}
                {pxPerGiorno >= 8 &&
                  modello.giorni.map((g, i) => (
                    <div
                      key={g.iso}
                      className={`absolute bottom-0 text-center text-[10px] tabular-num ${g.festivo ? "font-semibold text-semaforo-giallo" : g.weekend ? "text-muted-foreground" : ""}`}
                      style={{ left: i * pxPerGiorno, width: pxPerGiorno, height: 22 }}
                    >
                      {Number(g.iso.slice(8, 10))}
                    </div>
                  ))}
              </div>

              <div className="absolute" style={{ left: 0, top: HEADER_PX, width: modello.larghezzaPx, height: altezzaTotale, pointerEvents: "none" }}>
                {modello.giorni.map((g, i) =>
                  g.weekend || g.festivo ? (
                    <div
                      key={`bg-${g.iso}`}
                      className={`absolute top-0 h-full ${g.festivo ? "bg-semaforo-giallo/25" : "bg-muted-foreground/10"}`}
                      style={{ left: i * pxPerGiorno, width: pxPerGiorno }}
                    />
                  ) : null,
                )}
                {pxPerGiorno >= 4 && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundImage: "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)", backgroundSize: `${pxPerGiorno}px 100%` }}
                  />
                )}
                {statusDateX !== null && statusDateX >= 0 && statusDateX <= modello.larghezzaPx && (
                  <div className="absolute top-0 h-full w-px bg-semaforo-rosso" style={{ left: statusDateX }} title={`Status date: ${ctx.statusDate}`} />
                )}
              </div>

              {items.map((item) => {
                const r = righe[item.index];
                const barra = modello.barre.find((b) => b.id === r.id);
                const dentro = codiceRadice === null || sottoalbero(r.wbs, codiceRadice);
                const voceEvm = testata?.perTask[r.uid];
                const pctPianificata = r.inizio && r.fine && ctx.statusDate !== "—" ? pvLineareTask(1, r.inizio, r.fine, ctx.statusDate) * 100 : null;
                const contenutoTooltip = (
                  <div className="flex flex-col gap-0.5">
                    <p className="font-semibold">{r.nome}</p>
                    <p>Planned: {r.inizio ?? "—"} → {r.fine ?? "—"}</p>
                    {r.inizioBaseline && r.fineBaseline && <p>Baseline: {r.inizioBaseline} → {r.fineBaseline}</p>}
                    <p>Duration: {r.durataGiorni ?? "—"} d</p>
                    <p>% planned vs actual: {pctPianificata === null ? "—" : num(pctPianificata)} / {num(r.pct)}</p>
                    {voceEvm && <p>SPI: {voceEvm.spi === null ? "—" : num(voceEvm.spi)}</p>}
                  </div>
                );
                if (!barra) return null;
                return (
                  <div
                    key={r.id}
                    className={`absolute left-0 ${dentro ? "" : "opacity-40"}`}
                    style={{ top: HEADER_PX, height: item.size, transform: `translateY(${item.start}px)` }}
                  >
                    {barra.milestone ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 ${barra.critico ? "bg-semaforo-rosso" : "bg-zona-accento"}`}
                            style={{ left: barra.x }}
                            aria-label={`milestone ${r.nome}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">{contenutoTooltip}</TooltipContent>
                      </Tooltip>
                    ) : r.riepilogo ? (
                      <div className="absolute top-1/2 -translate-y-1/2" style={{ left: barra.xInizio, width: barra.larghezza, height: 8 }} aria-label={`summary ${r.nome}`}>
                        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-foreground/70" />
                        <div className="absolute left-0 top-0 h-full w-0.5 bg-foreground/70" />
                        <div className="absolute right-0 top-0 h-full w-0.5 bg-foreground/70" />
                      </div>
                    ) : (
                      <>
                        {barra.baseline && (
                          <div
                            className="absolute top-1/2 bg-muted-foreground/60"
                            style={{ left: barra.baseline.x, width: barra.baseline.larghezza, height: 4, transform: "translateY(-2px)" }}
                          />
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute top-1/2 overflow-hidden rounded-sm bg-zona-accento/35 ${barra.critico ? "border-2 border-semaforo-rosso" : ""}`}
                              style={{ left: barra.x, width: barra.larghezza, height: BARRA_PX, transform: "translateY(calc(-50% + 3px))" }}
                            >
                              <div className="h-full bg-zona-accento" style={{ width: `${Math.min(Math.max(r.pct, 0), 100)}%` }} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">{contenutoTooltip}</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>
                );
              })}

              {mostraFrecce && (
                <svg className="pointer-events-none absolute" style={{ left: 0, top: HEADER_PX, width: modello.larghezzaPx, height: altezzaTotale }} aria-hidden="true">
                  <defs>
                    <marker id="gantt-freccia" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
                    </marker>
                  </defs>
                  {freccevisibili.map((f, i) => {
                    const y1 = f.da * RIGA_PX + RIGA_PX / 2;
                    const y2 = f.a * RIGA_PX + RIGA_PX / 2;
                    const mid = f.xDa + pxPerGiorno / 2;
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
              )}
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
