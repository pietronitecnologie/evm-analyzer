// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Procedura guidata di importazione del piano (specifica fase 4, §5): file e
// formato, anteprima, baseline e riconciliazione del BAC, data di stato,
// conferma. Nessuna scrittura prima dell'ultimo passo (commit_plan_import).

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CAMPO } from "@/lib/schermate";
import {
  commitPlanImport,
  inspectPlanFile,
  pickPlanFile,
  previewPlanImport,
  type CommitOptions,
  type PlanInspection,
  type PlanPreview,
} from "@/lib/progetto";
import { formatCurrencyIt } from "@/lib/format";
import { useLayoutStore } from "@/stores/layout-store";

const eur = (v: number | null | undefined) => formatCurrencyIt(v);

type Step = "file" | "preview" | "baseline" | "status" | "confirm";
const STEPS: { id: Step; label: string }[] = [
  { id: "file", label: "File & format" },
  { id: "preview", label: "Preview" },
  { id: "baseline", label: "Baseline & BAC" },
  { id: "status", label: "Status date" },
  { id: "confirm", label: "Confirm" },
];

function statoIniziale() {
  return {
    step: "file" as Step,
    origine: null as string | null,
    inspection: null as PlanInspection | null,
    preview: null as PlanPreview | null,
    errore: null as string | null,
    caricando: false,
    baselineKind: "startup" as CommitOptions["baselineKind"],
    lockBaseline: false,
    applyOverhead: false,
    overheadPct: 0,
    applyContingency: false,
    contingencyPct: 0,
    statusDate: "",
  };
}

export function ImportPlanWizard() {
  const open = useLayoutStore((s) => s.importWizardOpen);
  const setOpen = useLayoutStore((s) => s.setImportWizardOpen);
  const [s, setS] = React.useState(statoIniziale());

  function patch(parziale: Partial<ReturnType<typeof statoIniziale>>) {
    setS((prev) => ({ ...prev, ...parziale }));
  }

  /** Chiude la finestra e azzera lo stato, pronta per la prossima apertura. */
  function chiudi() {
    setOpen(false);
    setS(statoIniziale());
  }

  async function sceglieFileEAnalizza() {
    const file = await pickPlanFile();
    if (!file) return;
    patch({ errore: null, caricando: true });
    try {
      const inspection = await inspectPlanFile(file);
      patch({ origine: file, inspection, caricando: false, step: "preview" });
      const preview = await previewPlanImport(file);
      patch({ preview });
    } catch (e) {
      patch({ errore: String(e), caricando: false });
    }
  }

  async function conferma() {
    if (!s.origine) return;
    patch({ caricando: true, errore: null });
    const opzioni: CommitOptions = {
      bac: {
        overheadPct: s.overheadPct,
        applyOverhead: s.applyOverhead,
        contingencyPct: s.contingencyPct,
        applyContingency: s.applyContingency,
      },
      baselineKind: s.baselineKind,
      lockBaseline: s.lockBaseline,
      statusDate: s.statusDate || null,
    };
    const esito = await commitPlanImport(s.origine, opzioni);
    if (esito) {
      chiudi();
    } else {
      patch({ caricando: false });
    }
  }

  const direct = s.preview?.bacEstimate ?? 0;
  const indirect = s.applyOverhead ? direct * (s.overheadPct / 100) : 0;
  const contingency = s.applyContingency ? (direct + indirect) * (s.contingencyPct / 100) : 0;
  const total = direct + indirect + contingency;

  const stepIndex = STEPS.findIndex((st) => st.id === s.step);

  function vaiA(step: Step) {
    patch({ step });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && chiudi()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(760px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Import plan from MS Project export</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            {STEPS.map((st, i) => (
              <span key={st.id} className={i === stepIndex ? "font-semibold text-foreground" : ""}>
                {i > 0 && <span className="mx-1">→</span>}
                {st.label}
              </span>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
            {s.errore && (
              <p className="mb-3 rounded border border-semaforo-rosso p-2 text-xs text-semaforo-rosso">{s.errore}</p>
            )}

            {s.step === "file" && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-muted-foreground">
                  Choose an MS Project export file (XML MSPDI, Excel or CSV). Nothing is written until the last step.
                </p>
                <Button onClick={() => void sceglieFileEAnalizza()} disabled={s.caricando}>
                  {s.caricando ? "Reading…" : "Choose file…"}
                </Button>
                {s.inspection && (
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                    <dt>Format</dt><dd className="text-right">{s.inspection.format}</dd>
                    <dt>Size</dt><dd className="text-right">{Math.round(s.inspection.sizeBytes / 1024)} KB</dd>
                    <dt>Estimated tasks</dt><dd className="tabular-num text-right">{s.inspection.estimatedTaskCount}</dd>
                    {s.inspection.detectedColumns.length > 0 && (
                      <>
                        <dt>Detected columns</dt>
                        <dd className="text-right">{s.inspection.detectedColumns.join(", ")}</dd>
                      </>
                    )}
                  </dl>
                )}
              </div>
            )}

            {s.step === "preview" && (
              <div className="flex flex-col gap-3">
                {!s.preview ? (
                  <p className="text-muted-foreground">Analyzing the file…</p>
                ) : (
                  <>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                      <dt>Tasks</dt><dd className="tabular-num text-right">{s.preview.taskCount}</dd>
                      <dt>Resources</dt><dd className="tabular-num text-right">{s.preview.resourceCount}</dd>
                      <dt>Assignments</dt><dd className="tabular-num text-right">{s.preview.assignmentCount}</dd>
                      <dt>BAC estimate</dt><dd className="text-right">{eur(s.preview.bacEstimate)}</dd>
                    </dl>
                    {s.preview.warnings.length > 0 && (
                      <div className="rounded border border-border p-2 text-xs">
                        <p className="mb-1 font-medium">Warnings</p>
                        <ul className="list-inside list-disc text-muted-foreground">
                          {s.preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {s.step === "baseline" && (
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-xs font-medium">
                  Baseline type
                  <select
                    className={CAMPO}
                    value={s.baselineKind}
                    onChange={(e) => patch({ baselineKind: e.target.value as CommitOptions["baselineKind"] })}
                  >
                    <option value="startup">Startup</option>
                    <option value="stima">Estimate</option>
                    <option value="altra">Other</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={s.lockBaseline} onChange={(e) => patch({ lockBaseline: e.target.checked })} />
                  Lock this baseline immediately
                </label>

                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1">Source baseline direct cost</th>
                      <th className="py-1">Overhead to apply</th>
                      <th className="py-1">Contingency to apply</th>
                      <th className="py-1">Resulting BAC</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1 tabular-num">{eur(direct)}</td>
                      <td className="py-1">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={s.applyOverhead} onChange={(e) => patch({ applyOverhead: e.target.checked })} />
                          <input
                            type="number"
                            className={`${CAMPO} h-7 w-16`}
                            value={s.overheadPct}
                            onChange={(e) => patch({ overheadPct: Number(e.target.value) })}
                            disabled={!s.applyOverhead}
                          />
                          %
                        </label>
                      </td>
                      <td className="py-1">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={s.applyContingency} onChange={(e) => patch({ applyContingency: e.target.checked })} />
                          <input
                            type="number"
                            className={`${CAMPO} h-7 w-16`}
                            value={s.contingencyPct}
                            onChange={(e) => patch({ contingencyPct: Number(e.target.value) })}
                            disabled={!s.applyContingency}
                          />
                          %
                        </label>
                      </td>
                      <td className="py-1 tabular-num font-medium">{eur(total)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground">
                  Indirect: {eur(indirect)} · Contingency: {eur(contingency)}
                </p>
              </div>
            )}

            {s.step === "status" && (
              <label className="flex flex-col gap-1 text-xs font-medium">
                Status date
                <input
                  type="date"
                  className={CAMPO}
                  value={s.statusDate}
                  onChange={(e) => patch({ statusDate: e.target.value })}
                />
                <span className="text-muted-foreground">Leave empty to use today's date.</span>
              </label>
            )}

            {s.step === "confirm" && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                <dt>Tasks</dt><dd className="tabular-num text-right">{s.preview?.taskCount ?? 0}</dd>
                <dt>Baseline type</dt><dd className="text-right">{s.baselineKind}</dd>
                <dt>Locked</dt><dd className="text-right">{s.lockBaseline ? "Yes" : "No"}</dd>
                <dt>BAC total</dt><dd className="text-right">{eur(total)}</dd>
                <dt>Status date</dt><dd className="text-right">{s.statusDate || "Today"}</dd>
              </dl>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border-strong px-4 py-3">
            <Button variant="ghost" onClick={chiudi}>Cancel</Button>
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <Button variant="outline" onClick={() => vaiA(STEPS[stepIndex - 1].id)} disabled={s.caricando}>
                  Back
                </Button>
              )}
              {s.step !== "confirm" ? (
                <Button
                  onClick={() => vaiA(STEPS[stepIndex + 1].id)}
                  disabled={s.caricando || (s.step === "file" ? !s.inspection : s.step === "preview" && !s.preview)}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={() => void conferma()} disabled={s.caricando}>
                  {s.caricando ? "Importing…" : "Import"}
                </Button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
