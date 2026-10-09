// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Filoni e programma (specifica Fase 5, §3.7): tabella dei filoni con indici EVM e peso
// sul programma (lib/filoni.ts::costruisciProgramma, motore programRollup), riga
// Programma come striscia di Kpi sopra la tabella (decisione 83), ed elenco dei gate.
// Workstream/gate sono CRUD manuale qui (nessun import li popola, vedi DECISIONS.md);
// GATE_NO_BUFFER non si calcola — nessuna data di consegna prevista per filone esiste
// ancora — l'elenco si mostra comunque, solo senza l'avviso automatico.

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { light, type TrafficLight } from "@evm-analyzer/engine";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { chiama, type DatiMonitoraggio, type FiloneRiga, type GateRiga, type TaskEvmRiga } from "@/lib/api";
import { classeSemaforo } from "@/lib/evm-workbook";
import { costruisciProgramma } from "@/lib/filoni";
import { eur, num } from "@/lib/format";
import { PARAMETRI, puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { CAMPO, esegui, usePercorso, useDati } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Campo, Sezione, Vuoto } from "./comuni";
import { Indice, Kpi } from "./kpi";

const ETICHETTA_TIPO: Record<string, string> = { costruzione: "Construction", automazione: "Automation", software: "Software", altro: "Other" };
const ETICHETTA_METODO: Record<string, string> = {
  unita_fisiche: "Physical units",
  milestone_pesate: "Weighted milestones",
  story_point: "Story points",
  flusso: "Flow",
};
const ETICHETTA_SEMAFORO: Record<TrafficLight, string> = { verde: "On track", giallo: "At risk", rosso: "Critical", nd: "—" };
const RANGO_SEMAFORO: Record<TrafficLight, number> = { nd: -1, verde: 0, giallo: 1, rosso: 2 };
const peggiore = (a: TrafficLight, b: TrafficLight): TrafficLight => (RANGO_SEMAFORO[a] >= RANGO_SEMAFORO[b] ? a : b);

export function FiloniScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [filoni, ricaricaFiloni] = useDati<FiloneRiga[]>("elenco_filoni", percorso);
  const [gate, ricaricaGate] = useDati<GateRiga[]>("elenco_gate", percorso);
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [task, ricaricaTask] = useDati<TaskEvmRiga[]>("task_evm_elenco", percorso);

  if (!percorso) return <Vuoto messaggio="Open or create a project for workstreams and the program." />;
  if (!filoni || !gate || !datiMon || !task) return <Vuoto messaggio="Loading…" />;

  const vista = vistaMonitoraggio(datiMon);
  const testata = puntoTestata(vista, ctx);
  const programma = testata && filoni.length > 0 ? costruisciProgramma(filoni, testata) : null;

  async function ricaricaTutto() {
    await Promise.all([ricaricaFiloni(), ricaricaTask()]);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {!testata ? (
        <Vuoto messaggio="No status date: import a plan or record progress first." />
      ) : filoni.length === 0 ? (
        <Vuoto messaggio="No workstream yet: create one below and assign tasks to it." />
      ) : (
        programma && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Kpi etichetta="Program BAC" valore={eur(programma.bacProgram)} />
              <Kpi etichetta="Program PV" valore={eur(programma.pvProgram)} />
              <Kpi etichetta="Program EV" valore={eur(programma.evProgram)} />
              <Kpi etichetta="Program AC" valore={eur(programma.acProgram)} />
              <Kpi etichetta="Program CPI" valore={<Indice valore={programma.cpiProgram} luce={light(programma.cpiProgram, PARAMETRI)} />} />
              <Kpi etichetta="Program SPI" valore={<Indice valore={programma.spiProgram} luce={light(programma.spiProgram, PARAMETRI)} />} />
            </div>
            <SchedaFiloni filoni={programma.workstreams} />
          </>
        )
      )}

      <Sezione titolo="New workstream">
        <ModuloNuovoFilone percorso={percorso} ricarica={ricaricaFiloni} />
      </Sezione>

      <Sezione titolo="Assign a task to a workstream">
        <ModuloAssegnaTask percorso={percorso} filoni={filoni} task={task} ricarica={ricaricaTutto} />
      </Sezione>

      <Sezione titolo="Gates">
        <SchedaGate percorso={percorso} filoni={filoni} gate={gate} ricarica={ricaricaGate} />
      </Sezione>
    </div>
  );
}

// ------------------------------------------------------------------ Tabella

interface RigaFiloneVista {
  id: string;
  nome: string;
  tipo: string;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  cpi: number | null;
  spi: number | null;
  cpiLight: TrafficLight;
  spiLight: TrafficLight;
  peso: number;
  semaforo: TrafficLight;
}

function SchedaFiloni({ filoni }: { filoni: ReturnType<typeof costruisciProgramma>["workstreams"] }) {
  const righe: RigaFiloneVista[] = filoni.map((f) => ({
    id: f.name,
    nome: f.name,
    tipo: ETICHETTA_TIPO[f.kind] ?? f.kind,
    bac: f.bac,
    pv: f.pv,
    ev: f.ev,
    ac: f.ac,
    cpi: f.cpi,
    spi: f.spi,
    cpiLight: f.cpiLight,
    spiLight: f.spiLight,
    peso: f.evShare,
    semaforo: peggiore(f.cpiLight, f.spiLight),
  }));

  const colonne: ColumnDef<RigaFiloneVista, unknown>[] = [
    { id: "nome", accessorKey: "nome", header: "Workstream", size: 180 },
    { id: "tipo", accessorKey: "tipo", header: "Type" },
    { id: "bac", accessorKey: "bac", header: "BAC", meta: { align: "right" }, cell: (c) => eur(c.getValue<number>()) },
    { id: "pv", accessorKey: "pv", header: "PV", meta: { align: "right" }, cell: (c) => eur(c.getValue<number>()) },
    { id: "ev", accessorKey: "ev", header: "EV", meta: { align: "right" }, cell: (c) => eur(c.getValue<number>()) },
    { id: "ac", accessorKey: "ac", header: "AC", meta: { align: "right" }, cell: (c) => eur(c.getValue<number>()) },
    { id: "cpi", accessorKey: "cpi", header: "CPI", meta: { align: "right" }, cell: (c) => <Indice valore={c.getValue<number | null>()} luce={c.row.original.cpiLight} /> },
    { id: "spi", accessorKey: "spi", header: "SPI", meta: { align: "right" }, cell: (c) => <Indice valore={c.getValue<number | null>()} luce={c.row.original.spiLight} /> },
    { id: "peso", accessorKey: "peso", header: "Weight (EV)", meta: { align: "right" }, cell: (c) => `${num(c.getValue<number>() * 100)}%` },
    {
      id: "semaforo",
      accessorKey: "semaforo",
      header: "Status",
      cell: (c) => <span className={classeSemaforo(c.getValue<TrafficLight>())}>{ETICHETTA_SEMAFORO[c.getValue<TrafficLight>()]}</span>,
    },
  ];

  return (
    <div className="h-[420px]">
      <DataTable tableId="filoni" columns={colonne} data={righe} pinnedColumnIds={["nome"]} emptyMessage="No workstream with EVM figures yet." />
    </div>
  );
}

// -------------------------------------------------------------------- Forms

function ModuloNuovoFilone({ percorso, ricarica }: { percorso: string; ricarica: () => Promise<void> }) {
  const [modulo, setModulo] = React.useState({ nome: "", tipo: "software", metodo: "story_point", valoreUnita: "", scopeVariabile: false });

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui(
      "Workstream not created",
      () =>
        chiama(percorso, "crea_filone", {
          nome: modulo.nome,
          tipo: modulo.tipo,
          metodoMisura: modulo.metodo,
          plannedUnitValue: modulo.valoreUnita.trim() === "" ? null : Number(modulo.valoreUnita),
          scopeVariabile: modulo.scopeVariabile,
        }),
      "Workstream created",
    );
    if (ok) {
      setModulo({ nome: "", tipo: "software", metodo: "story_point", valoreUnita: "", scopeVariabile: false });
      await ricarica();
    }
  }

  return (
    <form onSubmit={crea} className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Campo etichetta="Name">
        <input className={CAMPO} required value={modulo.nome} onChange={(e) => setModulo({ ...modulo, nome: e.target.value })} />
      </Campo>
      <Campo etichetta="Type">
        <select className={CAMPO} value={modulo.tipo} onChange={(e) => setModulo({ ...modulo, tipo: e.target.value })}>
          {Object.entries(ETICHETTA_TIPO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </Campo>
      <Campo etichetta="Measure method">
        <select className={CAMPO} value={modulo.metodo} onChange={(e) => setModulo({ ...modulo, metodo: e.target.value })}>
          {Object.entries(ETICHETTA_METODO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </Campo>
      <Campo etichetta="Planned value/unit (optional)">
        <input type="number" min="0" step="0.01" className={CAMPO} value={modulo.valoreUnita} onChange={(e) => setModulo({ ...modulo, valoreUnita: e.target.value })} />
      </Campo>
      <label className="flex items-center gap-2 text-xs font-medium">
        <input type="checkbox" checked={modulo.scopeVariabile} onChange={(e) => setModulo({ ...modulo, scopeVariabile: e.target.checked })} />
        Variable scope
      </label>
      <div className="col-span-2 flex justify-end md:col-span-5">
        <Button type="submit"><Plus className="size-4" />New workstream</Button>
      </div>
    </form>
  );
}

function ModuloAssegnaTask({
  percorso,
  filoni,
  task,
  ricarica,
}: {
  percorso: string;
  filoni: FiloneRiga[];
  task: TaskEvmRiga[];
  ricarica: () => Promise<void>;
}) {
  const [modulo, setModulo] = React.useState({ taskUid: "", filoneId: "" });

  async function assegna(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui(
      "Assignment not saved",
      () => chiama(percorso, "assegna_task_a_filone", { taskUid: modulo.taskUid, filoneId: modulo.filoneId === "" ? null : Number(modulo.filoneId) }),
      "Workstream assigned",
    );
    if (ok) await ricarica();
  }

  return (
    <form onSubmit={assegna} className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
      <Campo etichetta="Task">
        <select className={CAMPO} required value={modulo.taskUid} onChange={(e) => setModulo({ ...modulo, taskUid: e.target.value })}>
          <option value="">— choose —</option>
          {task.map((t) => <option key={t.uid} value={t.uid}>{t.uid} · {t.nome} {t.filone ? `(currently: ${t.filone})` : ""}</option>)}
        </select>
      </Campo>
      <Campo etichetta="Workstream">
        <select className={CAMPO} value={modulo.filoneId} onChange={(e) => setModulo({ ...modulo, filoneId: e.target.value })}>
          <option value="">— none —</option>
          {filoni.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </Campo>
      <Button type="submit">Assign</Button>
    </form>
  );
}

function SchedaGate({
  percorso,
  filoni,
  gate,
  ricarica,
}: {
  percorso: string;
  filoni: FiloneRiga[];
  gate: GateRiga[];
  ricarica: () => Promise<void>;
}) {
  const [modulo, setModulo] = React.useState({ da: "", a: "", data: "", buffer: "0", descrizione: "" });

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    const ok = await esegui(
      "Gate not created",
      () =>
        chiama(percorso, "crea_gate", {
          daFiloneId: Number(modulo.da),
          aFiloneId: Number(modulo.a),
          descrizione: modulo.descrizione || null,
          dataGate: modulo.data || null,
          bufferGiorni: Number(modulo.buffer) || 0,
        }),
      "Gate created",
    );
    if (ok) {
      setModulo({ da: "", a: "", data: "", buffer: "0", descrizione: "" });
      await ricarica();
    }
  }

  return (
    <div>
      {gate.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No gate recorded. GATE_NO_BUFFER isn't computed yet (no per-workstream delivery forecast exists): gates are shown for tracking only.</p>
      ) : (
        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              {["From", "To", "Gate date", "Buffer (d)", "Description"].map((t) => (
                <th key={t} className="sticky top-0 bg-zona-schede px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gate.map((g) => (
              <tr key={g.id}>
                <td className="border-b border-border px-3 py-1.5">{g.daFilone}</td>
                <td className="border-b border-border px-3 py-1.5">{g.aFilone}</td>
                <td className="border-b border-border px-3 py-1.5 tabular-num">{g.dataGate ?? "—"}</td>
                <td className="border-b border-border px-3 py-1.5 tabular-num">{g.bufferGiorni}</td>
                <td className="border-b border-border px-3 py-1.5">{g.descrizione ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={crea} className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Campo etichetta="From workstream">
          <select className={CAMPO} required value={modulo.da} onChange={(e) => setModulo({ ...modulo, da: e.target.value })}>
            <option value="">— choose —</option>
            {filoni.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
        <Campo etichetta="To workstream">
          <select className={CAMPO} required value={modulo.a} onChange={(e) => setModulo({ ...modulo, a: e.target.value })}>
            <option value="">— choose —</option>
            {filoni.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
        <Campo etichetta="Gate date">
          <input type="date" className={CAMPO} value={modulo.data} onChange={(e) => setModulo({ ...modulo, data: e.target.value })} />
        </Campo>
        <Campo etichetta="Buffer (days)">
          <input type="number" min="0" step="1" className={CAMPO} value={modulo.buffer} onChange={(e) => setModulo({ ...modulo, buffer: e.target.value })} />
        </Campo>
        <Campo etichetta="Description">
          <input className={CAMPO} value={modulo.descrizione} onChange={(e) => setModulo({ ...modulo, descrizione: e.target.value })} />
        </Campo>
        <div className="col-span-2 flex justify-end md:col-span-5">
          <Button type="submit"><Plus className="size-4" />New gate</Button>
        </div>
      </form>
    </div>
  );
}
