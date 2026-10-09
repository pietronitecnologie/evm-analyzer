// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Storico degli avanzamenti di un task (todo.md): tutte le voci passate (non solo la
// vigente), con la nota di chi l'ha registrata, il motivo di un eventuale rifiuto e
// gli allegati — aggiungibili anche a una voce già passata, non solo al momento
// dell'invio (AvanzamentoScreen.tsx copre già quel percorso rapido).

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AllegatoRiga, VoceStorico } from "@/lib/api";
import { chiama } from "@/lib/api";
import { eur, num } from "@/lib/format";
import { avviso } from "@/lib/schermate";

const ETICHETTE_STATO: Record<string, string> = {
  bozza: "draft",
  inviato: "pending approval",
  approvato: "approved",
  applicato: "approved",
  respinto: "rejected",
};

function dimensioneLeggibile(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}

export function AvanzamentoStorico({
  percorso,
  uid,
  nome,
  onClose,
}: {
  percorso: string;
  uid: string;
  nome: string;
  onClose: () => void;
}) {
  const [storico, setStorico] = React.useState<VoceStorico[] | null>(null);
  const [allegati, setAllegati] = React.useState<Record<number, AllegatoRiga[]>>({});

  async function elencaConAllegati(): Promise<[VoceStorico[], Record<number, AllegatoRiga[]>]> {
    const voci = await chiama<VoceStorico[]>(percorso, "storico_avanzamento", { uid });
    const coppie = await Promise.all(
      voci.map(async (v) => [v.id, await chiama<AllegatoRiga[]>(percorso, "allegati_elenco", { voceId: v.id })] as const),
    );
    return [voci, Object.fromEntries(coppie)];
  }

  /** Ricarica dopo un'azione (allegare/scaricare/rimuovere): fuori da un effetto, nessun vincolo sul setState. */
  async function ricarica() {
    try {
      const [voci, mappa] = await elencaConAllegati();
      setStorico(voci);
      setAllegati(mappa);
    } catch (e) {
      avviso("History not available", e);
    }
  }

  React.useEffect(() => {
    let annullato = false;
    chiama<VoceStorico[]>(percorso, "storico_avanzamento", { uid })
      .then(async (voci) => {
        const coppie = await Promise.all(
          voci.map(async (v) => [v.id, await chiama<AllegatoRiga[]>(percorso, "allegati_elenco", { voceId: v.id })] as const),
        );
        if (!annullato) {
          setStorico(voci);
          setAllegati(Object.fromEntries(coppie));
        }
      })
      .catch((e) => {
        if (!annullato) avviso("History not available", e);
      });
    return () => {
      annullato = true;
    };
  }, [percorso, uid]);

  async function allega(voceId: number) {
    const file = await open({ title: "Attach file", multiple: false, directory: false });
    if (!file) return;
    try {
      await chiama(percorso, "allegato_aggiungi", { voceId, percorsoFile: file });
      await ricarica();
    } catch (e) {
      avviso("Attachment not added", e);
    }
  }

  async function scarica(a: AllegatoRiga) {
    const destinazione = await save({ title: "Save attachment", defaultPath: a.nomeFile });
    if (!destinazione) return;
    try {
      await chiama(percorso, "allegato_salva", { allegatoId: a.id, percorsoDestinazione: destinazione });
    } catch (e) {
      avviso("Download failed", e);
    }
  }

  async function rimuovi(a: AllegatoRiga) {
    try {
      await chiama(percorso, "allegato_rimuovi", { allegatoId: a.id });
      await ricarica();
    } catch (e) {
      avviso("Removal failed", e);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(760px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Progress history — {uid} {nome}</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
            {!storico ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : storico.length === 0 ? (
              <p className="text-muted-foreground">No progress entry recorded yet for this task.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {storico.map((v) => (
                  <li key={v.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        Status date <strong className="text-foreground">{v.statusDate}</strong> · recorded {v.registratoIl} ·{" "}
                        {ETICHETTE_STATO[v.stato] ?? v.stato}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => void allega(v.id)}>
                        <Paperclip className="size-3.5" /> Attach file…
                      </Button>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <dt className="text-muted-foreground">%</dt><dd className="tabular-num">{num(v.pct)}</dd>
                      <dt className="text-muted-foreground">Actual start</dt><dd>{v.inizioEffettivo ?? "—"}</dd>
                      <dt className="text-muted-foreground">Actual finish</dt><dd>{v.fineEffettiva ?? "—"}</dd>
                      <dt className="text-muted-foreground">AC</dt><dd className="tabular-num">{eur(v.ac)}</dd>
                      <dt className="text-muted-foreground">Actual hours</dt><dd className="tabular-num">{v.ore === null ? "—" : num(v.ore)}</dd>
                    </dl>
                    {v.notaAutore && (
                      <p className="mt-2 text-xs"><span className="text-muted-foreground">Note: </span>{v.notaAutore}</p>
                    )}
                    {v.notaRifiuto && (
                      <p className="mt-1 text-xs text-semaforo-rosso"><span className="text-muted-foreground">Rejection reason: </span>{v.notaRifiuto}</p>
                    )}
                    {(allegati[v.id]?.length ?? 0) > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {allegati[v.id].map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 rounded bg-zona-schede px-2 py-1 text-xs">
                            <span className="truncate">
                              {a.nomeFile} <span className="text-muted-foreground">({dimensioneLeggibile(a.dimensione)})</span>
                            </span>
                            <span className="flex shrink-0 gap-1">
                              <Button size="sm" variant="ghost" onClick={() => void scarica(a)}>Download</Button>
                              <Button size="sm" variant="ghost" onClick={() => void rimuovi(a)}>Remove</Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
