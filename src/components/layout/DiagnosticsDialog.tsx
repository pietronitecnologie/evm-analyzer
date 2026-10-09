// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Diagnostica (specifica fase 6, §3): versione app e dimensione del progetto aperto,
// utile per capire se un rallentamento segnalato dall'utente è dovuto alla scala del
// progetto (vedi bench/ per le soglie misurate alle stesse scale).

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";

import type { Dashboard, NodoWbs, SnapshotRiga } from "@/lib/api";
import { chiama } from "@/lib/api";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";

interface Diagnostica {
  versioneApp: string;
  taskTotali: number;
  nodiWbs: number;
  snapshot: number;
}

export function DiagnosticsDialog() {
  const open = useLayoutStore((s) => s.diagnosticsDialogOpen);
  const setOpen = useLayoutStore((s) => s.setDiagnosticsDialogOpen);
  const percorso = useProjectContextStore((s) => s.percorso);
  const [dati, setDati] = React.useState<Diagnostica | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let annullato = false;
    (async () => {
      const versioneApp = await invoke<string>("versione_app").catch(() => "—");
      if (!percorso) {
        if (!annullato) setDati({ versioneApp, taskTotali: 0, nodiWbs: 0, snapshot: 0 });
        return;
      }
      const [dashboard, wbs, snapshot] = await Promise.all([
        chiama<Dashboard>(percorso, "dashboard"),
        chiama<NodoWbs[]>(percorso, "wbs_elenco"),
        chiama<SnapshotRiga[]>(percorso, "snapshot_elenco"),
      ]);
      if (!annullato) {
        setDati({ versioneApp, taskTotali: dashboard.taskTotali, nodiWbs: wbs.length, snapshot: snapshot.length });
      }
    })();
    return () => {
      annullato = true;
    };
  }, [open, percorso]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Diagnostics</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="p-4 text-sm">
            {!dati ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                <dt>App version</dt><dd className="tabular-num text-right">{dati.versioneApp}</dd>
                {percorso && (
                  <>
                    <dt>Tasks</dt><dd className="tabular-num text-right">{dati.taskTotali}</dd>
                    <dt>WBS nodes</dt><dd className="tabular-num text-right">{dati.nodiWbs}</dd>
                    <dt>Status snapshots</dt><dd className="tabular-num text-right">{dati.snapshot}</dd>
                  </>
                )}
                {!percorso && (
                  <dd className="col-span-2 text-muted-foreground">Open a project to see its size.</dd>
                )}
              </dl>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
