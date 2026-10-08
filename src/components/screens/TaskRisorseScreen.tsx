// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Task e risorse (specifica Fase 5, §3.3): tre schede — Task (con indici EVM
// per task, lib/monitoraggio.ts), Risorse, Assegnazioni — su DataTable
// (src/components/data-table). Ore/costo reale per risorsa/assegnazione sono
// rimandati: l'avanzamento in ore non sopravvive oggi all'approvazione (vedi
// DECISIONS.md), quindi qui restano solo le ore/il costo pianificati.

import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { checkQ007, checkQ013, costoPianificatoAssegnazione, isoToDays, type QResource } from "@evm-analyzer/engine";
import { Plus, Trash2 } from "lucide-react";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type QuickFilter } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import type { AssegnazioneRiga, DatiMonitoraggio, Perimetro, RisorsaRiga, TaskEvmRiga } from "@/lib/api";
import { chiama } from "@/lib/api";
import { Indice, Kpi } from "./kpi";
import { eur, num } from "@/lib/format";
import { coperturaTaskPct, filtraPerPerimetro, puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { CAMPO, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Campo, Sezione, Vuoto } from "./comuni";

/** Ore per giorno di lavoro del calendario standard (come nell'import MS Project). */
const ORE_PER_GIORNO = 8;

export function TaskRisorseScreen() {
  const percorso = usePercorso();
  if (!percorso) return <Vuoto messaggio="Open or create a project to manage tasks." />;
  return (
    <Tabs.Root defaultValue="task" className="flex h-full flex-col">
      <Tabs.List className="flex gap-1 border-b border-border-strong bg-zona-navigazione px-2">
        {[
          { v: "task", t: "Task" },
          { v: "risorse", t: "Resources" },
          { v: "assegnazioni", t: "Assignments" },
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
      <Tabs.Content value="task" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaTask percorso={percorso} />
      </Tabs.Content>
      <Tabs.Content value="risorse" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaRisorse percorso={percorso} />
      </Tabs.Content>
      <Tabs.Content value="assegnazioni" className="min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
        <SchedaAssegnazioni percorso={percorso} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

// --------------------------------------------------------------- Task

interface RigaTaskVista {
  id: string;
  uid: string;
  nome: string;
  wbs: string | null;
  filone: string | null;
  metodoEv: string | null;
  inizioPianificato: string | null;
  finePianificata: string | null;
  inizioBaseline: string | null;
  fineBaseline: string | null;
  deltaFineGiorni: number | null;
  pctReale: number | null;
  bac: number | null;
  pv: number | null;
  ev: number | null;
  ac: number | null;
  cv: number | null;
  sv: number | null;
  cpi: number | null;
  spi: number | null;
  cpiLight: "verde" | "giallo" | "rosso" | "nd";
  spiLight: "verde" | "giallo" | "rosso" | "nd";
  floatDays: number | null;
  critico: boolean;
}

function deltaGiorni(pianificata: string | null, baseline: string | null): number | null {
  if (!pianificata || !baseline) return null;
  return isoToDays(pianificata) - isoToDays(baseline);
}

const COLONNE_TASK: ColumnDef<RigaTaskVista, unknown>[] = [
  { id: "uid", accessorKey: "uid", header: "UID", size: 70 },
  { id: "wbs", accessorKey: "wbs", header: "WBS", size: 80, cell: (c) => c.getValue<string | null>() ?? "—" },
  { id: "nome", accessorKey: "nome", header: "Name", size: 220 },
  { id: "filone", accessorKey: "filone", header: "Workstream", cell: (c) => c.getValue<string | null>() ?? "—" },
  { id: "metodoEv", accessorKey: "metodoEv", header: "EV method", cell: (c) => c.getValue<string | null>() ?? "—" },
  { id: "inizioPianificato", accessorKey: "inizioPianificato", header: "Planned start", cell: (c) => c.getValue<string | null>() ?? "—" },
  { id: "finePianificata", accessorKey: "finePianificata", header: "Planned finish", cell: (c) => c.getValue<string | null>() ?? "—" },
  { id: "inizioBaseline", accessorKey: "inizioBaseline", header: "Baseline start", cell: (c) => c.getValue<string | null>() ?? "—" },
  { id: "fineBaseline", accessorKey: "fineBaseline", header: "Baseline finish", cell: (c) => c.getValue<string | null>() ?? "—" },
  {
    id: "deltaFineGiorni",
    accessorKey: "deltaFineGiorni",
    header: "Δ finish (d)",
    meta: { align: "right" },
    cell: (c) => {
      const v = c.getValue<number | null>();
      return v === null ? "—" : `${v > 0 ? "+" : ""}${v}`;
    },
  },
  {
    id: "pctReale",
    accessorKey: "pctReale",
    header: "% actual",
    meta: { align: "right" },
    cell: (c) => {
      const v = c.getValue<number | null>();
      return v === null ? "—" : `${num(v * 100)}%`;
    },
  },
  { id: "bac", accessorKey: "bac", header: "BAC", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
  { id: "pv", accessorKey: "pv", header: "PV", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
  { id: "ev", accessorKey: "ev", header: "EV", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
  { id: "ac", accessorKey: "ac", header: "AC", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
  { id: "cv", accessorKey: "cv", header: "CV", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
  { id: "sv", accessorKey: "sv", header: "SV", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
  {
    id: "cpi",
    accessorKey: "cpi",
    header: "CPI",
    meta: { align: "right" },
    cell: (c) => <Indice valore={c.getValue<number | null>()} luce={c.row.original.cpiLight} />,
  },
  {
    id: "spi",
    accessorKey: "spi",
    header: "SPI",
    meta: { align: "right" },
    cell: (c) => <Indice valore={c.getValue<number | null>()} luce={c.row.original.spiLight} />,
  },
  {
    id: "floatDays",
    accessorKey: "floatDays",
    header: "Float",
    meta: { align: "right" },
    cell: (c) => c.getValue<number | null>() ?? "—",
  },
  {
    id: "critico",
    accessorKey: "critico",
    header: "Critical",
    cell: (c) => (c.getValue<boolean>() ? "Yes" : "—"),
  },
];

const FILTRI_TASK: QuickFilter<RigaTaskVista>[] = [
  { id: "fuori-soglia", label: "Off-threshold", predicate: (r) => r.cpiLight === "rosso" || r.cpiLight === "giallo" || r.spiLight === "rosso" || r.spiLight === "giallo" },
  { id: "critici", label: "Critical", predicate: (r) => r.critico },
  { id: "milestone", label: "Milestones", predicate: (r) => r.wbs !== null && r.pctReale === 1 },
];

function SchedaTask({ percorso }: { percorso: string }) {
  const ctx = useProjectContextStore();
  const [task, ricaricaTask] = useDati<TaskEvmRiga[]>("task_evm_elenco", percorso);
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [perimetri] = useDati<Perimetro[]>("perimetri_elenco", percorso);
  const [modulo, setModulo] = React.useState({ nome: "", codiceWbs: "", inizio: "", fine: "", durata: "", milestone: false });

  const codiceRadice = React.useMemo(() => perimetri?.find((p) => p.id === ctx.scopeId)?.codiceWbs ?? null, [perimetri, ctx.scopeId]);
  const vista = React.useMemo(() => (datiMon ? vistaMonitoraggio(filtraPerPerimetro(datiMon, codiceRadice)) : null), [datiMon, codiceRadice]);
  const testata = vista ? puntoTestata(vista, ctx) : undefined;
  const copertura = React.useMemo(() => (datiMon ? coperturaTaskPct(filtraPerPerimetro(datiMon, codiceRadice)) : 0), [datiMon, codiceRadice]);

  const righe: RigaTaskVista[] = React.useMemo(() => {
    const ambito = codiceRadice
      ? (task ?? []).filter((t) => t.wbs !== null && (t.wbs === codiceRadice || t.wbs.startsWith(`${codiceRadice}.`)))
      : (task ?? []);
    return ambito.map((t): RigaTaskVista => {
      const voce = testata?.perTask[t.uid];
      const misura = testata?.perTaskMisure[t.uid];
      return {
        id: String(t.id),
        uid: t.uid,
        nome: t.nome,
        wbs: t.wbs,
        filone: t.filone,
        metodoEv: t.metodoEv,
        inizioPianificato: t.inizioPianificato,
        finePianificata: t.finePianificata,
        inizioBaseline: t.inizioBaseline,
        fineBaseline: t.fineBaseline,
        deltaFineGiorni: deltaGiorni(t.finePianificata, t.fineBaseline),
        pctReale: t.pctReale,
        bac: misura?.bac ?? null,
        pv: misura?.pv ?? null,
        ev: misura?.ev ?? null,
        ac: misura?.ac ?? null,
        cv: voce?.cv ?? null,
        sv: voce?.sv ?? null,
        cpi: voce?.cpi ?? null,
        spi: voce?.spi ?? null,
        cpiLight: voce?.cpiLight ?? "nd",
        spiLight: voce?.spiLight ?? "nd",
        floatDays: t.floatDays,
        critico: t.critico,
      };
    });
  }, [task, testata, codiceRadice]);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Task not created", async () => {
      const creato = await chiama<{ uid: string }>(percorso, "crea_task", {
        input: {
          nome: modulo.nome,
          codiceWbs: modulo.codiceWbs || null,
          inizio: modulo.inizio || null,
          fine: modulo.fine || null,
          durataGiorni: modulo.durata ? Number(modulo.durata) : null,
          milestone: modulo.milestone,
        },
      });
      return creato;
    }, "Task created");
    if (ok) {
      setModulo({ nome: "", codiceWbs: "", inizio: "", fine: "", durata: "", milestone: false });
      await ricaricaTask();
    }
  }

  if (!task || !datiMon) return <Vuoto messaggio="Loading…" />;

  return (
    <div className="flex flex-col gap-4 p-4">
      {testata && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Kpi etichetta="BAC" valore={eur(vista!.bac)} nota={copertura < 1 ? `${num(copertura * 100)}% covered` : undefined} />
          <Kpi etichetta="PV" valore={eur(testata.pv)} />
          <Kpi etichetta="EV" valore={eur(testata.ev)} />
          <Kpi etichetta="AC" valore={eur(testata.ac)} />
          <Kpi etichetta="CPI" valore={<Indice valore={testata.evm.cpi} luce={testata.evm.cpiLight} />} />
          <Kpi etichetta="SPI" valore={<Indice valore={testata.evm.spi} luce={testata.evm.spiLight} />} />
          <Kpi etichetta="Tasks" valore={String(righe.length)} />
        </div>
      )}

      <div className="h-[560px]">
        <DataTable
          tableId="task-evm"
          columns={COLONNE_TASK}
          data={righe}
          quickFilters={FILTRI_TASK}
          pinnedColumnIds={["uid", "wbs", "nome"]}
          emptyMessage="No task. Fill in the form below or import a plan."
        />
      </div>

      <Sezione titolo="New task">
        <form onSubmit={aggiungi} className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <div className="col-span-2">
            <Campo etichetta="Name">
              <input className={CAMPO} required value={modulo.nome} onChange={(e) => setModulo({ ...modulo, nome: e.target.value })} />
            </Campo>
          </div>
          <Campo etichetta="WBS">
            <input className={CAMPO} placeholder="e.g. 1.2" value={modulo.codiceWbs} onChange={(e) => setModulo({ ...modulo, codiceWbs: e.target.value })} />
          </Campo>
          <Campo etichetta="Start">
            <input type="date" className={CAMPO} value={modulo.inizio} onChange={(e) => setModulo({ ...modulo, inizio: e.target.value })} />
          </Campo>
          <Campo etichetta="Finish">
            <input type="date" className={CAMPO} value={modulo.fine} onChange={(e) => setModulo({ ...modulo, fine: e.target.value })} />
          </Campo>
          <Campo etichetta="Duration (days)">
            <input type="number" min="0" step="0.5" className={CAMPO} value={modulo.durata} onChange={(e) => setModulo({ ...modulo, durata: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={modulo.milestone} onChange={(e) => setModulo({ ...modulo, milestone: e.target.checked })} />
            Milestone
          </label>
          <div className="col-span-2 flex justify-end md:col-span-6">
            <Button type="submit"><Plus className="size-4" />New task</Button>
          </div>
        </form>
      </Sezione>
    </div>
  );
}

// --------------------------------------------------------------- Risorse

interface RigaRisorsaVista {
  id: string;
  nome: string;
  tipo: string | null;
  tariffa: number | null;
  costoOrarioReale: number | null;
  fonte: string;
  task: number;
  unita: number;
  costoPianificato: number | null;
}

function SchedaRisorse({ percorso }: { percorso: string }) {
  const [risorse, ricaricaRisorse] = useDati<RisorsaRiga[]>("risorse_elenco", percorso);
  const [assegnazioni] = useDati<AssegnazioneRiga[]>("assegnazioni_elenco", percorso);
  const [task] = useDati<TaskEvmRiga[]>("task_evm_elenco", percorso);
  const [nuova, setNuova] = React.useState({ nome: "", tipo: "lavoro", tariffa: "", straordinario: "" });

  const avvisi = React.useMemo(() => {
    if (!risorse) return [];
    const q: QResource[] = risorse.map((r) => ({ name: r.nome, rate: r.tariffa, realHourlyCost: r.costoOrarioReale }));
    return [...checkQ007(q), ...checkQ013(q)];
  }, [risorse]);

  const righe: RigaRisorsaVista[] = React.useMemo(() => {
    return (risorse ?? []).map((r): RigaRisorsaVista => {
      const tariffa = r.costoOrarioReale ?? r.tariffa ?? null;
      const costoPianificato = (assegnazioni ?? [])
        .filter((a) => a.risorsaId === r.id)
        .reduce((somma, a) => {
          const t = (task ?? []).find((t) => t.uid === a.taskUid);
          const giorni = t && t.inizioPianificato && t.finePianificata ? isoToDays(t.finePianificata) - isoToDays(t.inizioPianificato) + 1 : null;
          const ore = giorni === null ? null : giorni * ORE_PER_GIORNO;
          if (ore === null || tariffa === null) return somma;
          return somma + costoPianificatoAssegnazione(a.unita, ore, tariffa);
        }, 0);
      return {
        id: String(r.id),
        nome: r.nome,
        tipo: r.tipo,
        tariffa: r.tariffa,
        costoOrarioReale: r.costoOrarioReale,
        fonte: r.fonte === "costo_reale" ? "verified real cost" : "imported rate",
        task: r.task,
        unita: r.unita,
        costoPianificato,
      };
    });
  }, [risorse, assegnazioni, task]);

  async function onCellEdit(rowId: string, columnId: string, value: string) {
    const id = Number(rowId);
    const numero = value.trim() === "" ? null : Number(value.replace(",", "."));
    if (columnId === "tariffa") {
      const ok = await esegui("Rate not saved", () => chiama(percorso, "imposta_tariffa", { id, tariffa: numero }));
      if (ok) await ricaricaRisorse();
    } else if (columnId === "costoOrarioReale") {
      const ok = await esegui("Real cost not saved", () => chiama(percorso, "imposta_costo_reale", { id, costo: numero }));
      if (ok) await ricaricaRisorse();
    }
  }

  async function creaRisorsa(e: React.FormEvent) {
    e.preventDefault();
    const numero = (v: string) => (v.trim() === "" ? null : Number(v));
    const ok = await esegui("Resource not created", () =>
      chiama(percorso, "crea_risorsa", { nome: nuova.nome, tipo: nuova.tipo || null, tariffa: numero(nuova.tariffa), tariffaStraordinario: numero(nuova.straordinario) }),
      "Resource created",
    );
    if (ok) {
      setNuova({ nome: "", tipo: "lavoro", tariffa: "", straordinario: "" });
      await ricaricaRisorse();
    }
  }

  const colonne: ColumnDef<RigaRisorsaVista, unknown>[] = [
    { id: "nome", accessorKey: "nome", header: "Name", size: 180 },
    { id: "tipo", accessorKey: "tipo", header: "Type", cell: (c) => c.getValue<string | null>() ?? "—" },
    { id: "tariffa", accessorKey: "tariffa", header: "Imported rate", meta: { align: "right", editable: true }, cell: (c) => eur(c.getValue<number | null>()) },
    { id: "costoOrarioReale", accessorKey: "costoOrarioReale", header: "Real hourly cost", meta: { align: "right", editable: true }, cell: (c) => eur(c.getValue<number | null>()) },
    { id: "fonte", accessorKey: "fonte", header: "Rate source", size: 150 },
    { id: "task", accessorKey: "task", header: "Tasks", meta: { align: "right" } },
    { id: "unita", accessorKey: "unita", header: "Units", meta: { align: "right" } },
    { id: "costoPianificato", accessorKey: "costoPianificato", header: "Planned cost", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
  ];

  if (!risorse) return <Vuoto messaggio="Loading…" />;

  return (
    <div className="flex flex-col gap-4 p-4">
      {avvisi.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-semaforo-giallo">
          {avvisi.map((a, i) => <li key={i}>{a.message}</li>)}
        </ul>
      )}
      <div className="h-[480px]">
        <DataTable
          tableId="risorse"
          columns={colonne}
          data={righe}
          pinnedColumnIds={["nome"]}
          getCellKind={(_, columnId) => (columnId === "tariffa" || columnId === "costoOrarioReale" ? "input" : columnId === "costoPianificato" ? "calcolato" : "normale")}
          onCellEdit={onCellEdit}
          emptyMessage="No resource: it comes from the imported plan or is created below."
        />
      </div>

      <Sezione titolo="New resource">
        <form onSubmit={creaRisorsa} className="grid grid-cols-1 items-end gap-3 md:grid-cols-5">
          <Campo etichetta="Name">
            <input className={CAMPO} required value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })} />
          </Campo>
          <Campo etichetta="Type">
            <input className={CAMPO} value={nuova.tipo} onChange={(e) => setNuova({ ...nuova, tipo: e.target.value })} />
          </Campo>
          <Campo etichetta="Rate (€/h)">
            <input type="number" min="0" step="0.01" className={CAMPO} value={nuova.tariffa} onChange={(e) => setNuova({ ...nuova, tariffa: e.target.value })} />
          </Campo>
          <Campo etichetta="Overtime (€/h)">
            <input type="number" min="0" step="0.01" className={CAMPO} value={nuova.straordinario} onChange={(e) => setNuova({ ...nuova, straordinario: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />New resource</Button>
        </form>
      </Sezione>
    </div>
  );
}

// ----------------------------------------------------------- Assegnazioni

interface RigaAssegnazioneVista {
  id: string;
  taskUid: string;
  taskNome: string;
  risorsaId: number;
  risorsaNome: string;
  unita: number;
  orePianificate: number | null;
  costoPianificato: number | null;
}

function SchedaAssegnazioni({ percorso }: { percorso: string }) {
  const [assegnazioni, ricaricaAssegnazioni] = useDati<AssegnazioneRiga[]>("assegnazioni_elenco", percorso);
  const [risorse, ricaricaRisorse] = useDati<RisorsaRiga[]>("risorse_elenco", percorso);
  const [task] = useDati<TaskEvmRiga[]>("task_evm_elenco", percorso);
  const [assegna, setAssegna] = React.useState({ task: "", risorsa: "", unita: "1" });

  const righe: RigaAssegnazioneVista[] = React.useMemo(() => {
    return (assegnazioni ?? []).map((a): RigaAssegnazioneVista => {
      const risorsa = risorse?.find((r) => r.id === a.risorsaId);
      const tariffa = risorsa?.costoOrarioReale ?? risorsa?.tariffa ?? null;
      const t = task?.find((t) => t.uid === a.taskUid);
      const giorni = t && t.inizioPianificato && t.finePianificata ? isoToDays(t.finePianificata) - isoToDays(t.inizioPianificato) + 1 : null;
      const orePianificate = giorni === null ? null : giorni * ORE_PER_GIORNO;
      const costoPianificato = orePianificate === null || tariffa === null ? null : costoPianificatoAssegnazione(a.unita, orePianificate, tariffa);
      return {
        id: String(a.id),
        taskUid: a.taskUid,
        taskNome: a.taskNome,
        risorsaId: a.risorsaId,
        risorsaNome: a.risorsaNome,
        unita: a.unita,
        orePianificate,
        costoPianificato,
      };
    });
  }, [assegnazioni, risorse, task]);

  async function onCellEdit(rowId: string, columnId: string, value: string) {
    if (columnId !== "unita") return;
    const unita = Number(value.replace(",", "."));
    if (!Number.isFinite(unita) || unita <= 0) return;
    const ok = await esegui("Units not saved", () => chiama(percorso, "imposta_unita_assegnazione", { id: Number(rowId), unita }));
    if (ok) await ricaricaAssegnazioni();
  }

  async function eliminaAssegnazione(id: number) {
    const ok = await esegui("Assignment not removed", () => chiama(percorso, "elimina_assegnazione", { id }), "Assignment removed");
    if (ok) {
      await ricaricaAssegnazioni();
      await ricaricaRisorse();
    }
  }

  async function creaAssegnazione(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui("Assignment not created", () =>
      chiama(percorso, "crea_assegnazione", { taskUid: assegna.task, risorsaId: Number(assegna.risorsa), unita: Number(assegna.unita) }),
      "Resource assigned",
    );
    if (ok) {
      await ricaricaAssegnazioni();
      await ricaricaRisorse();
    }
  }

  const colonne: ColumnDef<RigaAssegnazioneVista, unknown>[] = [
    { id: "taskUid", accessorKey: "taskUid", header: "UID", size: 70 },
    { id: "taskNome", accessorKey: "taskNome", header: "Task", size: 200 },
    { id: "risorsaNome", accessorKey: "risorsaNome", header: "Resource", size: 160 },
    { id: "unita", accessorKey: "unita", header: "Units %", meta: { align: "right", editable: true } },
    { id: "orePianificate", accessorKey: "orePianificate", header: "Planned hours", meta: { align: "right" }, cell: (c) => c.getValue<number | null>() ?? "—" },
    { id: "costoPianificato", accessorKey: "costoPianificato", header: "Planned cost", meta: { align: "right" }, cell: (c) => eur(c.getValue<number | null>()) },
    {
      id: "azioni",
      header: "",
      size: 60,
      cell: (c) => (
        <Button size="sm" variant="ghost" aria-label={`Remove assignment ${c.row.original.id}`} onClick={() => eliminaAssegnazione(Number(c.row.original.id))}>
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  if (!assegnazioni || !risorse) return <Vuoto messaggio="Loading…" />;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="h-[480px]">
        <DataTable
          tableId="assegnazioni"
          columns={colonne}
          data={righe}
          pinnedColumnIds={["taskUid"]}
          getCellKind={(_, columnId) => (columnId === "unita" ? "input" : columnId === "orePianificate" || columnId === "costoPianificato" ? "calcolato" : "normale")}
          onCellEdit={onCellEdit}
          emptyMessage="No assignment."
        />
      </div>

      <Sezione titolo="New assignment">
        <form onSubmit={creaAssegnazione} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
          <Campo etichetta="Task">
            <select className={CAMPO} required value={assegna.task} onChange={(e) => setAssegna({ ...assegna, task: e.target.value })}>
              <option value="">— choose —</option>
              {(task ?? []).map((t) => <option key={t.uid} value={t.uid}>{t.uid} · {t.nome}</option>)}
            </select>
          </Campo>
          <Campo etichetta="Resource">
            <select className={CAMPO} required value={assegna.risorsa} onChange={(e) => setAssegna({ ...assegna, risorsa: e.target.value })}>
              <option value="">— choose —</option>
              {risorse.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </Campo>
          <Campo etichetta="Units (1 = 100%)">
            <input type="number" min="0.01" step="0.05" required className={CAMPO} value={assegna.unita} onChange={(e) => setAssegna({ ...assegna, unita: e.target.value })} />
          </Campo>
          <Button type="submit"><Plus className="size-4" />Assign</Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">Actual hours/cost columns aren't available yet (see DECISIONS.md); each task's AC is entered in the Progress screen.</p>
      </Sezione>
    </div>
  );
}
