// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// WBS e control account (specifica Fase 5, §3.2): albero con indici EVM per
// nodo (ricalcolati dai totali, non medie — lib/monitoraggio.ts), livello
// massimo, filtro "solo fuori soglia", ordinamento per scostamento, riga dei
// totali, espandi/comprimi da mouse e tastiera (→/←).

import * as React from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { TrafficLight } from "@evm-analyzer/engine";

import { Button } from "@/components/ui/button";
import { StatoBadge, type StatoSemantico } from "@/components/ui/stato-badge";
import { type DatiMonitoraggio, type NodoWbs, type Perimetro, chiama } from "@/lib/api";
import { Indice } from "./kpi";
import { eur, num } from "@/lib/format";
import { coperturaTaskPct, evmPerNodoWbs, filtraPerPerimetro, puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { appiattisciVisibile, codiciConFigli, costruisciAlbero, type RigaVisibile } from "@/lib/wbs-albero";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Campo, Sezione, Vuoto } from "./comuni";
import { CAMPO, CELLA, TESTA_TABELLA, esegui, usePercorso, useDati } from "@/lib/schermate";

const RANGO_LUCE: Record<TrafficLight, number> = { rosso: 0, giallo: 1, nd: 2, verde: 3 };
const peggiore = (a: TrafficLight, b: TrafficLight) => (RANGO_LUCE[a] <= RANGO_LUCE[b] ? a : b);
const SEMANTICA_LUCE: Record<TrafficLight, StatoSemantico> = { verde: "verde", giallo: "giallo", rosso: "rosso", nd: "neutro" };
const ETICHETTA_LUCE: Record<TrafficLight, string> = { verde: "on track", giallo: "warning", rosso: "critical", nd: "n/a" };

const COLONNE = ["Code", "Name", "BAC", "PV", "EV", "AC", "CV", "SV", "CPI", "SPI", "EAC", "VAC", "% plan", "% actual", "Coverage", "Task", ""];

export function WbsScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [nodi, ricarica] = useDati<NodoWbs[]>("wbs_elenco", percorso);
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [perimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);
  const [codice, setCodice] = React.useState("");
  const [nome, setNome] = React.useState("");
  // `null` = ancora nessuna scelta manuale: tutto espanso (comportamento di oggi).
  const [espansiManuali, setEspansiManuali] = React.useState<Set<string> | null>(null);
  const [livelloMax, setLivelloMax] = React.useState<number | null>(null);
  const [soloFuoriSoglia, setSoloFuoriSoglia] = React.useState(false);
  const [ordinaPerScostamento, setOrdinaPerScostamento] = React.useState(false);
  const righeRef = React.useRef(new Map<string, HTMLTableRowElement>());

  const codiceRadice = React.useMemo(
    () => perimetri?.find((p) => p.id === ctx.scopeId)?.codiceWbs ?? null,
    [perimetri, ctx.scopeId],
  );
  const nodiAmbito = React.useMemo(
    () => (nodi ?? []).filter((n) => !codiceRadice || n.codice === codiceRadice || n.codice.startsWith(`${codiceRadice}.`)),
    [nodi, codiceRadice],
  );
  const vista = React.useMemo(
    () => (datiMon ? vistaMonitoraggio(filtraPerPerimetro(datiMon, codiceRadice)) : null),
    [datiMon, codiceRadice],
  );
  const testata = vista ? puntoTestata(vista, ctx) : undefined;
  const indici = React.useMemo(
    () => (testata ? evmPerNodoWbs(testata, nodiAmbito.map((n) => n.codice)) : {}),
    [testata, nodiAmbito],
  );
  // Finché l'utente non ha espanso/compresso nulla, tutto ciò che ha figli è aperto.
  const espansi = React.useMemo(
    () => espansiManuali ?? new Set(codiciConFigli(nodiAmbito)),
    [espansiManuali, nodiAmbito],
  );
  const albero = React.useMemo(() => costruisciAlbero(nodiAmbito), [nodiAmbito]);
  const righeAlbero = React.useMemo(() => appiattisciVisibile(albero, espansi), [albero, espansi]);

  if (!percorso) return <Vuoto messaggio="Open or create a project to see the WBS." />;

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!percorso) return;
    const ok = await esegui("WBS node not created", () => chiama(percorso, "crea_wbs", { codice, nome }));
    if (ok) {
      setCodice("");
      setNome("");
      await ricarica();
    }
  }

  function commuta(codiceNodo: string) {
    setEspansiManuali((prev) => {
      const base = prev ?? new Set(codiciConFigli(nodiAmbito));
      const next = new Set(base);
      if (next.has(codiceNodo)) next.delete(codiceNodo);
      else next.add(codiceNodo);
      return next;
    });
  }

  function alGenitore(codiceNodo: string) {
    const i = codiceNodo.lastIndexOf(".");
    if (i < 0) return;
    righeRef.current.get(codiceNodo.slice(0, i))?.focus();
  }

  function tastiera(e: React.KeyboardEvent<HTMLTableRowElement>, riga: RigaVisibile) {
    if (e.key === "ArrowRight") {
      if (riga.haFigli && !espansi.has(riga.nodo.codice)) commuta(riga.nodo.codice);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      if (espansi.has(riga.nodo.codice)) commuta(riga.nodo.codice);
      else alGenitore(riga.nodo.codice);
      e.preventDefault();
    }
  }

  function apriTaskERisorse() {
    useLayoutStore.getState().openScreen("task-risorse", "Tasks and resources");
  }

  const fuoriSoglia = (codiceNodo: string) => {
    const o = indici[codiceNodo]?.output;
    return !o || o.cpiLight === "rosso" || o.cpiLight === "giallo" || o.spiLight === "rosso" || o.spiLight === "giallo";
  };

  const righe: RigaVisibile[] = ordinaPerScostamento
    ? nodiAmbito
        .map((nodo) => ({ nodo, profondita: 0, haFigli: false }))
        .sort((a, b) => Math.abs(indici[b.nodo.codice]?.output.cv ?? 0) - Math.abs(indici[a.nodo.codice]?.output.cv ?? 0))
    : righeAlbero.filter((r) => livelloMax === null || r.profondita < livelloMax);
  const righeFiltrate = soloFuoriSoglia ? righe.filter((r) => fuoriSoglia(r.nodo.codice)) : righe;

  return (
    <div className="flex flex-col">
      <Sezione
        titolo="Work breakdown structure (WBS)"
        azioni={
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              Max level
              <select
                className="h-7 rounded-md border border-input bg-background px-1"
                value={livelloMax ?? ""}
                onChange={(e) => setLivelloMax(e.target.value === "" ? null : Number(e.target.value))}
                disabled={ordinaPerScostamento}
              >
                <option value="">All</option>
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={soloFuoriSoglia} onChange={(e) => setSoloFuoriSoglia(e.target.checked)} />
              Off-threshold only
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={ordinaPerScostamento} onChange={(e) => setOrdinaPerScostamento(e.target.checked)} />
              Sort by deviation
            </label>
          </div>
        }
      >
        {!nodi ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : nodiAmbito.length === 0 ? (
          <p className="text-sm text-muted-foreground">No WBS node in the project.</p>
        ) : (
          <>
            {ordinaPerScostamento && (
              <p className="mb-2 text-xs text-muted-foreground">Sorted by deviation — hierarchy hidden.</p>
            )}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <thead>
                <tr>
                  {COLONNE.map((t, i) => (
                    <th key={t || i} className={`${TESTA_TABELLA} ${i > 1 ? "text-right" : ""}`}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {righeFiltrate.map((riga) => {
                  const { nodo, profondita, haFigli } = riga;
                  const voce = indici[nodo.codice];
                  const o = voce?.output;
                  const input = voce?.input;
                  const copertura = testata ? coperturaTaskPct(filtraPerPerimetro(datiMon!, codiceRadice), nodo.codice) : null;
                  const luce = o ? peggiore(o.cpiLight, o.spiLight) : "nd";
                  return (
                    <tr
                      key={nodo.id}
                      ref={(el) => {
                        if (el) righeRef.current.set(nodo.codice, el);
                        else righeRef.current.delete(nodo.codice);
                      }}
                      tabIndex={0}
                      onKeyDown={(e) => tastiera(e, riga)}
                      className="cursor-pointer outline-none focus-visible:bg-accent hover:bg-accent"
                      onClick={apriTaskERisorse}
                    >
                      <td className={`${CELLA} tabular-num`}>
                        <span style={{ paddingLeft: `${profondita * 16}px` }} className="inline-flex items-center gap-1">
                          {haFigli && !ordinaPerScostamento ? (
                            <button
                              type="button"
                              aria-label={espansi.has(nodo.codice) ? `Collapse ${nodo.codice}` : `Expand ${nodo.codice}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                commuta(nodo.codice);
                              }}
                              className="rounded hover:bg-accent"
                            >
                              {espansi.has(nodo.codice) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                            </button>
                          ) : (
                            <span className="inline-block size-3.5" />
                          )}
                          {nodo.codice}
                        </span>
                      </td>
                      <td className={`${CELLA} ${nodo.genitore ? "" : "font-semibold"}`}>{nodo.nome}</td>
                      <td className={CELLA} onClick={(e) => e.stopPropagation()}>
                        <BudgetCella key={`${nodo.codice}-${nodo.budget ?? ""}`} nodo={nodo} percorso={percorso} onSalvato={ricarica} />
                      </td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(input?.pv ?? null)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(input?.ev ?? null)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(input?.ac ?? null)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(o?.cv ?? null)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(o?.sv ?? null)}</td>
                      <td className={`${CELLA} text-right`}><Indice valore={o?.cpi ?? null} luce={o?.cpiLight ?? "nd"} /></td>
                      <td className={`${CELLA} text-right`}><Indice valore={o?.spi ?? null} luce={o?.spiLight ?? "nd"} /></td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(o?.eac ?? null)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{eur(o?.vac ?? null)}</td>
                      <td className={`${CELLA} tabular-num text-right`}>
                        {input && input.bac > 0 ? `${num((input.pv / input.bac) * 100)}%` : "—"}
                      </td>
                      <td className={`${CELLA} tabular-num text-right`}>
                        {input && input.bac > 0 ? `${num((input.ev / input.bac) * 100)}%` : "—"}
                      </td>
                      <td className={`${CELLA} text-right`}>{copertura === null ? "—" : `${num(copertura * 100)}%`}</td>
                      <td className={`${CELLA} tabular-num text-right`}>{nodo.task}</td>
                      <td className={CELLA}>
                        {o && <StatoBadge stato={SEMANTICA_LUCE[luce]} label={ETICHETTA_LUCE[luce]} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {testata && (
                <tfoot>
                  <tr className="border-t-2 border-border-strong font-semibold">
                    <td className={CELLA} colSpan={2}>Total</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(vista!.bac)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(testata.pv)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(testata.ev)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(testata.ac)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(testata.evm.cv)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(testata.evm.sv)}</td>
                    <td className={`${CELLA} text-right`}><Indice valore={testata.evm.cpi} luce={testata.evm.cpiLight} /></td>
                    <td className={`${CELLA} text-right`}><Indice valore={testata.evm.spi} luce={testata.evm.spiLight} /></td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(testata.evm.eac)}</td>
                    <td className={`${CELLA} tabular-num text-right`}>{eur(testata.evm.vac)}</td>
                    <td className={CELLA} colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
            </div>
          </>
        )}
      </Sezione>

      <Sezione titolo="New node">
        <form onSubmit={aggiungi} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Code (e.g. 1.2 under 1)">
            <input className={CAMPO} required value={codice} onChange={(e) => setCodice(e.target.value)} />
          </Campo>
          <div className="md:col-span-2">
            <Campo etichetta="Name">
              <input className={CAMPO} required value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
          </div>
          <Button type="submit">
            <Plus className="size-4" />
            Add
          </Button>
        </form>
      </Sezione>
    </div>
  );
}

/** Budget di un nodo WBS: modificabile, salvato con il comando `imposta_budget_wbs`. */
function BudgetCella({ nodo, percorso, onSalvato }: { nodo: NodoWbs; percorso: string; onSalvato: () => Promise<void> }) {
  const [valore, setValore] = React.useState(nodo.budget === null ? "" : String(nodo.budget));
  async function salva() {
    const ok = await esegui("Budget not saved", () =>
      chiama(percorso, "imposta_budget_wbs", { codice: nodo.codice, budget: valore.trim() === "" ? null : Number(valore) }),
      `Budget for ${nodo.codice} saved`,
    );
    if (ok) await onSalvato();
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <input
        type="number"
        min="0"
        step="0.01"
        className={`${CAMPO} w-28 text-right`}
        aria-label={`Budget for node ${nodo.codice}`}
        value={valore}
        onChange={(e) => setValore(e.target.value)}
      />
      <Button size="sm" variant="ghost" onClick={salva} disabled={valore === (nodo.budget === null ? "" : String(nodo.budget))}>
        Save
      </Button>
    </div>
  );
}
