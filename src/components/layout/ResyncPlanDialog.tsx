// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Ri-sincronizzazione del piano con un nuovo export (specifica fase 4, §6):
// scelta del file aggiornato, diff dei task, nuovo status_snapshot.

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pickResyncFile, resyncPlan, type ResyncReport } from "@/lib/progetto";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";

export function ResyncPlanDialog() {
  const open = useLayoutStore((s) => s.resyncDialogOpen);
  const setOpen = useLayoutStore((s) => s.setResyncDialogOpen);
  const percorso = useProjectContextStore((s) => s.percorso);
  const [origine, setOrigine] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ResyncReport | null>(null);
  const [caricando, setCaricando] = React.useState(false);

  /** Chiude la finestra e azzera lo stato, pronta per la prossima apertura. */
  function chiudi() {
    setOpen(false);
    setOrigine(null);
    setReport(null);
  }

  async function sceglieFile() {
    const file = await pickResyncFile();
    if (!file) return;
    setOrigine(file);
    setCaricando(true);
    const esito = await resyncPlan(percorso ?? "", file, null);
    setReport(esito);
    setCaricando(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && chiudi()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(640px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Re-sync plan</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
            {!percorso ? (
              <p className="text-muted-foreground">Open a project before re-syncing it.</p>
            ) : !origine ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-muted-foreground">
                  Choose a new export of the same plan. Only read-only fields (dates, float, critical path) and
                  progress read from the file are updated; progress entered in the app is never overwritten.
                </p>
                <Button onClick={() => void sceglieFile()}>Choose updated file…</Button>
              </div>
            ) : caricando ? (
              <p className="text-muted-foreground">Comparing with the open project…</p>
            ) : report ? (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                <dt>Added tasks</dt><dd className="tabular-num text-right">{report.added.length}</dd>
                <dt>Removed tasks</dt><dd className="tabular-num text-right">{report.removed.length}</dd>
                <dt>Moved tasks</dt><dd className="tabular-num text-right">{report.moved.length}</dd>
                {report.baselineChangedLocked && (
                  <dd className="col-span-2 rounded border border-semaforo-rosso p-2 text-semaforo-rosso">
                    The locked baseline's cost differs from the new export on at least one task — check Baseline &amp;
                    change request.
                  </dd>
                )}
                {report.warnings.length > 0 && (
                  <dd className="col-span-2 text-muted-foreground">{report.warnings.length} warnings from the file.</dd>
                )}
              </dl>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-strong px-4 py-3">
            <Button variant="ghost" onClick={chiudi}>
              {report ? "Close" : "Cancel"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
