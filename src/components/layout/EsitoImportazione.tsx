// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Pannello «Esito importazione» (specifica fase 3, §4): riepilogo e avvisi del workbook
// prima di scrivere nel progetto. Gli avvisi critici disabilitano «Importa comunque».

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confermaImportazione, esportaLogCsv } from "@/lib/workbook";
import { useEsitoStore, type GravitaAvviso } from "@/stores/esito-importazione-store";

const ETICHETTA: Record<GravitaAvviso, string> = { critico: "Critical", avviso: "Warning", info: "Info" };

export function EsitoImportazione() {
  const aperto = useEsitoStore((s) => s.aperto);
  const dati = useEsitoStore((s) => s.dati);
  const origine = useEsitoStore((s) => s.origine);
  const chiudi = useEsitoStore((s) => s.chiudi);
  const [filtro, setFiltro] = React.useState<GravitaAvviso | "tutti">("tutti");

  if (!dati) return null;
  const critici = dati.avvisi.some((a) => a.gravita === "critico");
  const visibili = dati.avvisi.filter((a) => filtro === "tutti" || a.gravita === filtro);
  const schema = dati.meta?.schemaVersion ? `schema ${dati.meta.schemaVersion}` : "manual template";

  return (
    <Dialog.Root open={aperto} onOpenChange={(v) => !v && chiudi()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(1100px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Import result</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-0 overflow-hidden">
            <aside className="flex flex-col gap-3 border-r border-border-strong bg-zona-navigazione p-4 text-sm">
              <p className="truncate text-xs text-muted-foreground" title={origine ?? ""}>File: {origine?.split(/[\\/]/).pop()}</p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1">
                <dt>WBS activities</dt><dd className="tabular-num text-right">{dati.attivita.length}</dd>
                <dt>Risks</dt><dd className="tabular-num text-right">{dati.rischi.length}</dd>
                <dt>Checkpoint</dt><dd className="tabular-num text-right">{dati.checkpoint.length}</dd>
                <dt>Sprint</dt><dd className="tabular-num text-right">{dati.sprint.length}</dd>
                <dt>Schema</dt><dd className="text-right">{schema}</dd>
              </dl>
              <div className="mt-2 flex flex-col gap-1 text-xs">
                <span className="font-medium">Warnings</span>
                {(["critico", "avviso", "info"] as GravitaAvviso[]).map((g) => (
                  <span key={g}>
                    {ETICHETTA[g]}: <strong>{dati.avvisi.filter((a) => a.gravita === g).length}</strong>
                  </span>
                ))}
              </div>
              {critici && (
                <p className="rounded border border-semaforo-rosso p-2 text-xs text-semaforo-rosso">
                  There are critical warnings: fix the workbook before importing it.
                </p>
              )}
            </aside>

            <section className="flex min-h-0 flex-col">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
                <label className="flex items-center gap-2">
                  Severity
                  <select className="h-7 rounded-md border border-input bg-background px-2" value={filtro} onChange={(e) => setFiltro(e.target.value as GravitaAvviso | "tutti")}>
                    <option value="tutti">All</option>
                    <option value="critico">Critical</option>
                    <option value="avviso">Warnings</option>
                    <option value="info">Information</option>
                  </select>
                </label>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {visibili.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No warnings in this category.</p>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-zona-schede text-left">
                      <tr>
                        {["Severity", "Sheet", "Cell", "Code", "Message", "Suggestion"].map((t) => (
                          <th key={t} className="px-2 py-1.5 font-semibold">{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibili.map((a, i) => (
                        <tr key={`${a.codice}-${i}`} className="align-top">
                          <td className="border-b border-border px-2 py-1">{ETICHETTA[a.gravita]}</td>
                          <td className="border-b border-border px-2 py-1">{a.foglio}</td>
                          <td className="border-b border-border px-2 py-1 tabular-num">{a.cella}</td>
                          <td className="border-b border-border px-2 py-1 font-mono">{a.codice}</td>
                          <td className="border-b border-border px-2 py-1">{a.messaggio}</td>
                          <td className="border-b border-border px-2 py-1 text-muted-foreground">{a.suggerimento}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border-strong px-4 py-3">
            <Button variant="outline" onClick={() => esportaLogCsv(dati.avvisi)} disabled={dati.avvisi.length === 0}>
              <Download className="size-4" />
              Export log (CSV)
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={chiudi}>Cancel</Button>
              <Button onClick={() => void confermaImportazione()} disabled={critici}>Import anyway</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
