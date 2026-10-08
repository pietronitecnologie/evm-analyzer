// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Baseline e change request (specifica Fase 5, §3.5): quattro schede — Baseline
// (blocco/archiviazione), Confronto (Δ costo/durata/date tra due baseline per WBS),
// Change request (richiesta/approvazione/rigetto, crea la baseline collegata quando
// approvata) e Scope (WBS inclusi/esclusi in `baseline_scope`). Le azioni di gestione
// (blocco/archiviazione baseline, decisione sulla CR, modifica dello scope) sono
// riservate a chi agisce con il ruolo coordinatore_piano (selettore "Acting as" nella
// barra di contesto, DECISIONS.md): la richiesta di una variazione resta invece aperta
// a chiunque, come l'invio di un avanzamento rispetto alla sua approvazione.

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Archive, Check, Lock, Plus, X } from "lucide-react";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { chiama, type BaselineRiga, type ChangeRequestRiga, type Governance, type RigaBaselineScope, type RigaConfrontoBaseline } from "@/lib/api";
import { eur, num } from "@/lib/format";
import { CAMPO, avviso, esegui, usePercorso, useDati, useDatiCon } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Campo, Sezione, Vuoto } from "./comuni";

const ETICHETTA_TIPO_BASELINE: Record<string, string> = { startup: "Startup", stima: "Estimate", altra: "Other" };
const ETICHETTA_STATO_CR: Record<string, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

export function BaselineCrScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [g, ricarica] = useDati<Governance>("governance", percorso);
  const puoGestire = ctx.userRuoli.includes("coordinatore_piano");

  if (!percorso) return <Vuoto messaggio="Open or create a project for baseline and change requests." />;
  if (!g) return <Vuoto messaggio="Loading…" />;

  return (
    <Tabs.Root defaultValue="baseline" className="flex h-full flex-col">
      <Tabs.List className="flex gap-1 border-b border-border-strong bg-zona-navigazione px-2">
        {[
          { v: "baseline", t: "Baseline" },
          { v: "confronto", t: "Comparison" },
          { v: "change-request", t: "Change request" },
          { v: "scope", t: "Scope" },
        ].map(({ v, t }) => (
          <Tabs.Trigger
            key={v}
            value={v}
            className="rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground"
          >
            {t}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {!puoGestire && (
        <p className="border-b border-border-strong bg-zona-contesto px-4 py-1.5 text-xs text-muted-foreground">
          Read-only: management actions on this screen (lock/archive a baseline, decide a change request, edit scope) require
          the plan coordinator role. Pick a user with that role in "Acting as" (top bar) to manage them.
        </p>
      )}
      <Tabs.Content value="baseline" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaBaseline percorso={percorso} g={g} ricarica={ricarica} puoGestire={puoGestire} attoreId={ctx.attoreId} budgetWbs={g.budgetTotale} />
      </Tabs.Content>
      <Tabs.Content value="confronto" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaConfronto percorso={percorso} baseline={g.baseline} />
      </Tabs.Content>
      <Tabs.Content value="change-request" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaChangeRequest percorso={percorso} changeRequest={g.changeRequest} ricarica={ricarica} puoGestire={puoGestire} attoreId={ctx.attoreId} nomeAttore={ctx.userName} />
      </Tabs.Content>
      <Tabs.Content value="scope" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaScope percorso={percorso} baseline={g.baseline} puoGestire={puoGestire} attoreId={ctx.attoreId} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

// ------------------------------------------------------------- Baseline

interface RigaBaselineVista {
  id: string;
  baselineId: number;
  nome: string;
  tipo: string;
  creataIl: string;
  creataDa: string | null;
  bloccata: boolean;
  bacDiretto: number | null;
  bacIndiretto: number | null;
  bacContingency: number | null;
  bacTotale: number | null;
}

function SchedaBaseline({
  percorso,
  g,
  ricarica,
  puoGestire,
  attoreId,
  budgetWbs,
}: {
  percorso: string;
  g: Governance;
  ricarica: () => Promise<void>;
  puoGestire: boolean;
  attoreId: number | null;
  budgetWbs: number;
}) {
  const [modulo, setModulo] = React.useState({ nome: "", tipo: "startup", indiretto: "0", contingency: "0" });
  const [confermaAperta, setConfermaAperta] = React.useState(false);

  const attive = g.baseline.filter((b) => !b.archiviata);
  const archiviate = g.baseline.length - attive.length;

  const righe: RigaBaselineVista[] = attive.map((b) => ({
    id: String(b.id),
    baselineId: b.id,
    nome: b.nome,
    tipo: b.tipo,
    creataIl: b.creataIl,
    creataDa: b.creataDa,
    bloccata: b.bloccata,
    bacDiretto: b.bacDiretto,
    bacIndiretto: b.bacIndiretto,
    bacContingency: b.bacContingency,
    bacTotale: b.bacTotale,
  }));

  async function confermaBlocco() {
    setConfermaAperta(false);
    const ok = await esegui(
      "Baseline not created",
      () =>
        chiama(percorso, "blocca_baseline_budget", {
          attoreId,
          nome: modulo.nome,
          tipo: modulo.tipo,
          bacIndiretto: Number(modulo.indiretto) || 0,
          bacContingency: Number(modulo.contingency) || 0,
        }),
      "Budget baseline locked",
    );
    if (ok) {
      setModulo({ nome: "", tipo: "startup", indiretto: "0", contingency: "0" });
      await ricarica();
    }
  }

  async function archivia(baselineId: number) {
    const ok = await esegui("Baseline not archived", () => chiama(percorso, "archivia_baseline", { attoreId, id: baselineId }), "Baseline archived");
    if (ok) await ricarica();
  }

  const colonne: ColumnDef<RigaBaselineVista, unknown>[] = [
    { id: "nome", accessorKey: "nome", header: "Name", size: 180 },
    { id: "tipo", accessorKey: "tipo", header: "Type", cell: (c) => ETICHETTA_TIPO_BASELINE[c.getValue<string>()] ?? c.getValue<string>() },
    { id: "creataIl", accessorKey: "creataIl", header: "Created on", cell: (c) => c.getValue<string>().slice(0, 10) },
    { id: "creataDa", accessorKey: "creataDa", header: "Created by", cell: (c) => c.getValue<string | null>() ?? "—" },
    { id: "bloccata", accessorKey: "bloccata", header: "Locked", cell: (c) => (c.getValue<boolean>() ? <span className="inline-flex items-center gap-1"><Lock className="size-3" />locked</span> : "editable") },
    { id: "bacDiretto", accessorKey: "bacDiretto", header: "Direct BAC", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
    { id: "bacIndiretto", accessorKey: "bacIndiretto", header: "Indirect BAC", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
    { id: "bacContingency", accessorKey: "bacContingency", header: "Contingency", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
    { id: "bacTotale", accessorKey: "bacTotale", header: "Total BAC", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
    {
      id: "azioni",
      header: "",
      size: 90,
      cell: (c) => (
        <Button size="sm" variant="ghost" disabled={!puoGestire} onClick={() => archivia(c.row.original.baselineId)}>
          <Archive className="size-4" />
          Archive
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="h-[420px]">
        <DataTable tableId="baseline" columns={colonne} data={righe} pinnedColumnIds={["nome"]} emptyMessage="No active baseline: lock one once the WBS budget is defined." />
      </div>
      {archiviate > 0 && <p className="text-xs text-muted-foreground">{archiviate} archived baseline(s): they remain in the database with their date and content.</p>}

      <Sezione titolo="Lock a new budget baseline">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfermaAperta(true);
          }}
          className="grid grid-cols-1 items-end gap-3 md:grid-cols-5"
        >
          <Campo etichetta="Baseline name">
            <input className={CAMPO} required disabled={!puoGestire} value={modulo.nome} onChange={(e) => setModulo({ ...modulo, nome: e.target.value })} />
          </Campo>
          <Campo etichetta="Type">
            <select className={CAMPO} disabled={!puoGestire} value={modulo.tipo} onChange={(e) => setModulo({ ...modulo, tipo: e.target.value })}>
              <option value="startup">{ETICHETTA_TIPO_BASELINE.startup}</option>
              <option value="stima">{ETICHETTA_TIPO_BASELINE.stima}</option>
              <option value="altra">{ETICHETTA_TIPO_BASELINE.altra}</option>
            </select>
          </Campo>
          <Campo etichetta="Indirect BAC (€)">
            <input type="number" min="0" step="0.01" className={CAMPO} disabled={!puoGestire} value={modulo.indiretto} onChange={(e) => setModulo({ ...modulo, indiretto: e.target.value })} />
          </Campo>
          <Campo etichetta="Contingency (€)">
            <input type="number" min="0" step="0.01" className={CAMPO} disabled={!puoGestire} value={modulo.contingency} onChange={(e) => setModulo({ ...modulo, contingency: e.target.value })} />
          </Campo>
          <Button type="submit" disabled={!puoGestire}>
            <Lock className="size-4" />
            Lock baseline
          </Button>
          <p className="text-xs text-muted-foreground md:col-span-5">Direct BAC is computed from the WBS budget: {eur(budgetWbs)}.</p>
        </form>
      </Sezione>

      <Dialog.Root open={confermaAperta} onOpenChange={setConfermaAperta}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-strong bg-card p-4 shadow-lg">
            <Dialog.Title className="text-sm font-semibold">Confirm baseline lock</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              "{modulo.nome}" will be locked with total BAC {eur(budgetWbs + (Number(modulo.indiretto) || 0) + (Number(modulo.contingency) || 0))}. A locked
              baseline is immutable: changing it afterwards requires an approved change request.
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfermaAperta(false)}>Cancel</Button>
              <Button onClick={() => void confermaBlocco()}>Confirm lock</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

// ------------------------------------------------------------- Confronto

function classeScostamento(pct: number | null): string {
  if (pct === null) return "";
  const a = Math.abs(pct);
  if (a > 30) return "text-semaforo-rosso";
  if (a > 20) return "text-semaforo-giallo";
  return "";
}

interface RigaConfrontoVista extends RigaConfrontoBaseline {
  id: string;
}

function SchedaConfronto({ percorso, baseline }: { percorso: string; baseline: BaselineRiga[] }) {
  const [baselineA, setBaselineA] = React.useState<string>("");
  const [baselineB, setBaselineB] = React.useState<string>("");
  const argomenti = baselineA && baselineB ? { baselineA: Number(baselineA), baselineB: Number(baselineB) } : null;
  const [righeConfronto] = useDatiCon<RigaConfrontoBaseline[]>("confronta_baseline", percorso, argomenti);

  const righe: RigaConfrontoVista[] = (righeConfronto ?? []).map((r) => ({ ...r, id: r.codice }));

  const colonne: ColumnDef<RigaConfrontoVista, unknown>[] = [
    { id: "codice", accessorKey: "codice", header: "WBS", size: 80 },
    { id: "nome", accessorKey: "nome", header: "Name", size: 200 },
    { id: "costoA", accessorKey: "costoA", header: "Cost A", meta: { align: "right" }, cell: (c) => eur(c.getValue<number>()) },
    { id: "costoB", accessorKey: "costoB", header: "Cost B", meta: { align: "right" }, cell: (c) => eur(c.getValue<number>()) },
    { id: "deltaCosto", accessorKey: "deltaCosto", header: "Δ cost", meta: { align: "right" }, cell: (c) => eur(c.getValue<number>()) },
    {
      id: "deltaCostoPct",
      accessorKey: "deltaCostoPct",
      header: "Δ %",
      meta: { align: "right" },
      cell: (c) => {
        const v = c.getValue<number | null>();
        return <span className={classeScostamento(v)}>{v === null ? "—" : `${num(v)}%`}</span>;
      },
    },
    { id: "deltaDurata", accessorKey: "deltaDurata", header: "Δ duration (d)", meta: { align: "right" }, cell: (c) => c.getValue<number | null>() ?? "—" },
    { id: "deltaInizio", accessorKey: "deltaInizio", header: "Δ start (d)", meta: { align: "right" }, cell: (c) => c.getValue<number | null>() ?? "—" },
    { id: "deltaFine", accessorKey: "deltaFine", header: "Δ finish (d)", meta: { align: "right" }, cell: (c) => c.getValue<number | null>() ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Campo etichetta="Baseline A">
          <select className={CAMPO} value={baselineA} onChange={(e) => setBaselineA(e.target.value)}>
            <option value="">— choose —</option>
            {baseline.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </Campo>
        <Campo etichetta="Baseline B">
          <select className={CAMPO} value={baselineB} onChange={(e) => setBaselineB(e.target.value)}>
            <option value="">— choose —</option>
            {baseline.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </Campo>
      </div>
      {!argomenti ? (
        <Vuoto messaggio="Choose two baselines to compare them by WBS." />
      ) : (
        <div className="h-[480px]">
          <DataTable
            tableId="confronto-baseline"
            columns={colonne}
            data={righe}
            pinnedColumnIds={["codice"]}
            emptyMessage="No comparable data: this pair of baselines has no task-level baseline data (budget-only baselines compare at zero)."
          />
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------- Change request

interface RigaCrVista {
  id: string;
  crId: number;
  richiestaIl: string;
  richiestaDa: string | null;
  motivo: string;
  deltaCosto: number | null;
  deltaDurata: number | null;
  deltaScope: string | null;
  stato: string;
  approvataIl: string | null;
  approvataDa: string | null;
}

function SchedaChangeRequest({
  percorso,
  changeRequest,
  ricarica,
  puoGestire,
  attoreId,
  nomeAttore,
}: {
  percorso: string;
  changeRequest: ChangeRequestRiga[];
  ricarica: () => Promise<void>;
  puoGestire: boolean;
  attoreId: number | null;
  nomeAttore: string;
}) {
  const [modulo, setModulo] = React.useState(() => ({ richiedente: nomeAttore === "—" ? "" : nomeAttore, motivo: "", costo: "", durata: "", scope: "" }));

  const righe: RigaCrVista[] = changeRequest.map((c) => ({
    id: String(c.id),
    crId: c.id,
    richiestaIl: c.richiestaIl,
    richiestaDa: c.richiestaDa,
    motivo: c.motivo,
    deltaCosto: c.deltaCosto,
    deltaDurata: c.deltaDurata,
    deltaScope: c.deltaScope,
    stato: c.stato,
    approvataIl: c.approvataIl,
    approvataDa: c.approvataDa,
  }));

  async function creaVariazione(e: React.FormEvent) {
    e.preventDefault();
    const numero = (v: string) => (v === "" ? null : Number(v));
    const ok = await esegui(
      "Change request not created",
      () =>
        chiama(percorso, "crea_change_request", {
          richiedente: modulo.richiedente,
          motivo: modulo.motivo,
          deltaCosto: numero(modulo.costo),
          deltaDurata: numero(modulo.durata),
          deltaScope: modulo.scope || null,
        }),
      "Change request recorded",
    );
    if (ok) {
      setModulo({ richiedente: nomeAttore === "—" ? "" : nomeAttore, motivo: "", costo: "", durata: "", scope: "" });
      await ricarica();
    }
  }

  async function approva(id: number) {
    if (!puoGestire) {
      avviso("Approving requires the plan coordinator role");
      return;
    }
    const ok = await esegui("Approval failed", () => chiama(percorso, "approva_change_request", { attoreId, id }), "Change request approved: new baseline created");
    if (ok) await ricarica();
  }

  async function rifiuta(id: number) {
    if (!puoGestire) {
      avviso("Rejecting requires the plan coordinator role");
      return;
    }
    const ok = await esegui("Rejection failed", () => chiama(percorso, "rifiuta_change_request", { attoreId, id }), "Change request rejected");
    if (ok) await ricarica();
  }

  const colonne: ColumnDef<RigaCrVista, unknown>[] = [
    { id: "crId", accessorKey: "crId", header: "#", size: 50 },
    { id: "richiestaIl", accessorKey: "richiestaIl", header: "Requested on", cell: (c) => c.getValue<string>().slice(0, 10) },
    { id: "richiestaDa", accessorKey: "richiestaDa", header: "Requester", cell: (c) => c.getValue<string | null>() ?? "—" },
    { id: "motivo", accessorKey: "motivo", header: "Reason", size: 200 },
    { id: "deltaCosto", accessorKey: "deltaCosto", header: "Δ cost", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
    { id: "deltaDurata", accessorKey: "deltaDurata", header: "Δ duration (d)", meta: { align: "right" }, cell: (c) => c.getValue<number | null>() ?? "—" },
    { id: "deltaScope", accessorKey: "deltaScope", header: "Δ scope", cell: (c) => c.getValue<string | null>() ?? "—" },
    { id: "stato", accessorKey: "stato", header: "Status", cell: (c) => ETICHETTA_STATO_CR[c.getValue<string>()] ?? c.getValue<string>() },
    {
      id: "approvazione",
      header: "Decision",
      size: 200,
      cell: (c) => {
        const r = c.row.original;
        if (r.stato !== "pending") return r.approvataDa ? <span>{r.approvataDa} on {r.approvataIl?.slice(0, 10)}</span> : "—";
        return (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!puoGestire} onClick={() => approva(r.crId)}>
              <Check className="size-3.5" />
              Approve
            </Button>
            <Button size="sm" variant="ghost" disabled={!puoGestire} onClick={() => rifiuta(r.crId)}>
              <X className="size-3.5" />
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="h-[420px]">
        <DataTable
          tableId="change-request"
          columns={colonne}
          data={righe}
          pinnedColumnIds={["crId"]}
          emptyMessage="No change request. A locked baseline only changes through an approved change request."
        />
      </div>

      <Sezione titolo="Request a change">
        <form onSubmit={creaVariazione} className="grid grid-cols-1 items-end gap-3 md:grid-cols-6">
          <Campo etichetta="Requester">
            <input className={CAMPO} required value={modulo.richiedente} onChange={(e) => setModulo({ ...modulo, richiedente: e.target.value })} />
          </Campo>
          <div className="md:col-span-2">
            <Campo etichetta="Reason">
              <input className={CAMPO} required value={modulo.motivo} onChange={(e) => setModulo({ ...modulo, motivo: e.target.value })} />
            </Campo>
          </div>
          <Campo etichetta="Δ cost (€)">
            <input type="number" step="0.01" className={CAMPO} value={modulo.costo} onChange={(e) => setModulo({ ...modulo, costo: e.target.value })} />
          </Campo>
          <Campo etichetta="Δ duration (days)">
            <input type="number" step="0.5" className={CAMPO} value={modulo.durata} onChange={(e) => setModulo({ ...modulo, durata: e.target.value })} />
          </Campo>
          <Campo etichetta="Δ scope">
            <input className={CAMPO} value={modulo.scope} onChange={(e) => setModulo({ ...modulo, scope: e.target.value })} />
          </Campo>
          <div className="md:col-span-6 flex justify-end">
            <Button type="submit"><Plus className="size-4" />Request change</Button>
          </div>
        </form>
      </Sezione>
    </div>
  );
}

// ------------------------------------------------------------------ Scope

interface RigaScopeVista {
  id: string;
  wbsId: number;
  codice: string;
  nome: string;
  incluso: boolean;
  nota: string | null;
}

function SchedaScope({
  percorso,
  baseline,
  puoGestire,
  attoreId,
}: {
  percorso: string;
  baseline: BaselineRiga[];
  puoGestire: boolean;
  attoreId: number | null;
}) {
  const [baselineIdScelta, setBaselineIdScelta] = React.useState<string>("");
  const baselineId = baselineIdScelta || (baseline.length > 0 ? String(baseline[0].id) : "");
  const argomenti = baselineId ? { baselineId: Number(baselineId) } : null;
  const [elenco, ricarica] = useDatiCon<RigaBaselineScope[]>("baseline_scope_elenco", percorso, argomenti);

  async function alterna(wbsId: number, incluso: boolean, nota: string | null) {
    if (!puoGestire || !baselineId) return;
    const ok = await esegui("Scope not updated", () => chiama(percorso, "imposta_baseline_scope", { attoreId, baselineId: Number(baselineId), wbsId, incluso, nota }));
    if (ok) await ricarica();
  }

  async function onCellEdit(rowId: string, columnId: string, value: string) {
    if (columnId !== "nota") return;
    const riga = (elenco ?? []).find((r) => String(r.wbsId) === rowId);
    if (!riga) return;
    await alterna(riga.wbsId, riga.incluso, value);
  }

  const righe: RigaScopeVista[] = (elenco ?? []).map((r) => ({ id: String(r.wbsId), wbsId: r.wbsId, codice: r.codice, nome: r.nome, incluso: r.incluso, nota: r.nota }));

  const colonne: ColumnDef<RigaScopeVista, unknown>[] = [
    { id: "codice", accessorKey: "codice", header: "WBS", size: 90 },
    { id: "nome", accessorKey: "nome", header: "Name", size: 220 },
    {
      id: "incluso",
      accessorKey: "incluso",
      header: "Included",
      cell: (c) => {
        const r = c.row.original;
        return (
          <Button size="sm" variant={r.incluso ? "outline" : "ghost"} disabled={!puoGestire} onClick={() => alterna(r.wbsId, !r.incluso, r.nota)}>
            {r.incluso ? "Included" : "Excluded"}
          </Button>
        );
      },
    },
    { id: "nota", accessorKey: "nota", header: "Note", size: 260, meta: { editable: puoGestire }, cell: (c) => c.getValue<string | null>() ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <Campo etichetta="Baseline">
        <select className={`${CAMPO} max-w-xs`} value={baselineId} onChange={(e) => setBaselineIdScelta(e.target.value)}>
          {baseline.length === 0 && <option value="">No baseline yet</option>}
          {baseline.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
      </Campo>
      <div className="h-[480px]">
        <DataTable
          tableId="baseline-scope"
          columns={colonne}
          data={righe}
          pinnedColumnIds={["codice"]}
          getCellKind={(_, columnId) => (columnId === "nota" ? "input" : "normale")}
          onCellEdit={onCellEdit}
          emptyMessage="No WBS node yet."
        />
      </div>
    </div>
  );
}
