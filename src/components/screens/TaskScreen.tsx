// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Schermata "Task e risorse": elenco dei task del progetto aperto e modulo
// per crearne di nuovi. Usa i comandi Tauri elenca_task e crea_task.

import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RisorseSezione } from "@/components/screens/RisorseSezione";
import { useProjectContextStore } from "@/stores/project-context-store";
import { useToastStore } from "@/stores/toast-store";

interface TaskRiga {
  id: number;
  uid: string;
  nome: string;
  wbs: string | null;
  inizio: string | null;
  fine: string | null;
  durataGiorni: number | null;
  milestone: boolean;
  riepilogo: boolean;
}

interface ModuloTask {
  nome: string;
  codiceWbs: string;
  inizio: string;
  fine: string;
  durata: string;
  milestone: boolean;
}

const MODULO_VUOTO: ModuloTask = {
  nome: "",
  codiceWbs: "",
  inizio: "",
  fine: "",
  durata: "",
  milestone: false,
};

const CAMPO =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function mostraErrore(titolo: string, errore: unknown) {
  useToastStore.getState().push({
    title: titolo,
    description: String(errore),
    variant: "destructive",
  });
}

function tipoRiga(t: TaskRiga): string {
  if (t.riepilogo) return "Summary";
  if (t.milestone) return "Milestone";
  return "Task";
}

export function TaskScreen() {
  const percorso = useProjectContextStore((s) => s.percorso);
  const nomeProgetto = useProjectContextStore((s) => s.projectName);
  const [task, setTask] = React.useState<TaskRiga[]>([]);
  const [modulo, setModulo] = React.useState<ModuloTask>(MODULO_VUOTO);
  const [inviando, setInviando] = React.useState(false);

  const caricaTask = React.useCallback(async () => {
    if (!percorso) return;
    try {
      setTask(await invoke<TaskRiga[]>("elenca_task", { percorso }));
    } catch (e) {
      mostraErrore("Task list unavailable", e);
    }
  }, [percorso]);

  // Caricamento iniziale: la risposta è ignorata se nel frattempo cambia progetto.
  React.useEffect(() => {
    if (!percorso) return;
    let annullato = false;
    invoke<TaskRiga[]>("elenca_task", { percorso })
      .then((elenco) => {
        if (!annullato) setTask(elenco);
      })
      .catch((e) => {
        if (!annullato) mostraErrore("Task list unavailable", e);
      });
    return () => {
      annullato = true;
    };
  }, [percorso]);

  if (!percorso) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Open or create a project to manage tasks.
      </div>
    );
  }

  async function creaTask(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setInviando(true);
    try {
      const creato = await invoke<TaskRiga>("crea_task", {
        percorso,
        input: {
          nome: modulo.nome,
          codiceWbs: modulo.codiceWbs || null,
          inizio: modulo.inizio || null,
          fine: modulo.fine || null,
          durataGiorni: modulo.durata ? Number(modulo.durata) : null,
          milestone: modulo.milestone,
        },
      });
      setModulo(MODULO_VUOTO);
      await caricaTask();
      useToastStore.getState().push({
        title: `Task ${creato.uid} created`,
        description: creato.nome,
      });
    } catch (e) {
      mostraErrore("Task not created", e);
    } finally {
      setInviando(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border-strong bg-zona-contesto px-4 py-2 text-sm">
        <span className="font-medium">{nomeProgetto}</span>
        <span className="ml-2 text-muted-foreground">· {task.length} task</span>
      </div>

      <form
        onSubmit={creaTask}
        aria-label="New task"
        className="grid grid-cols-2 gap-3 border-b border-border-strong bg-zona-navigazione p-4 md:grid-cols-6"
      >
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium md:col-span-2">
          Name
          <input
            className={CAMPO}
            required
            value={modulo.nome}
            onChange={(e) => setModulo({ ...modulo, nome: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          WBS
          <input
            className={CAMPO}
            placeholder="e.g. 1.2"
            value={modulo.codiceWbs}
            onChange={(e) => setModulo({ ...modulo, codiceWbs: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Start
          <input
            type="date"
            className={CAMPO}
            value={modulo.inizio}
            onChange={(e) => setModulo({ ...modulo, inizio: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Finish
          <input
            type="date"
            className={CAMPO}
            value={modulo.fine}
            onChange={(e) => setModulo({ ...modulo, fine: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Duration (days)
          <input
            type="number"
            min="0"
            step="0.5"
            className={CAMPO}
            value={modulo.durata}
            onChange={(e) => setModulo({ ...modulo, durata: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={modulo.milestone}
            onChange={(e) => setModulo({ ...modulo, milestone: e.target.checked })}
          />
          Milestone
        </label>
        <div className="col-span-2 flex justify-end md:col-span-6">
          <Button type="submit" disabled={inviando}>
            <Plus className="size-4" />
            New task
          </Button>
        </div>
      </form>

      <div className="flex-1 overflow-auto">
        <RisorseSezione />
        {task.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No task. Fill in the form above or import a plan.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-zona-schede text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">UID</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">WBS</th>
                <th className="px-3 py-2 font-semibold">Start</th>
                <th className="px-3 py-2 font-semibold">Finish</th>
                <th className="px-3 py-2 text-right font-semibold">Duration (days)</th>
                <th className="px-3 py-2 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {task.map((t, i) => (
                <tr
                  key={t.id}
                  className={i % 2 === 0 ? "bg-zona-area" : "bg-zona-dettaglio"}
                >
                  <td className="tabular-num border-b border-border px-3 py-1.5">{t.uid}</td>
                  <td className="border-b border-border px-3 py-1.5 font-medium">{t.nome}</td>
                  <td className="border-b border-border px-3 py-1.5">{t.wbs ?? "—"}</td>
                  <td className="tabular-num border-b border-border px-3 py-1.5">{t.inizio ?? "—"}</td>
                  <td className="tabular-num border-b border-border px-3 py-1.5">{t.fine ?? "—"}</td>
                  <td className="tabular-num border-b border-border px-3 py-1.5 text-right">
                    {t.durataGiorni ?? "—"}
                  </td>
                  <td className="border-b border-border px-3 py-1.5">{tipoRiga(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
