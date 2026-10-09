// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Cambio della propria password (todo.md, parte del login reale): richiede sempre
// la password attuale, anche per l'amministratore — un reset senza la password
// attuale è un'azione distinta e riservata (schermata Perimetri e utenti).

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chiama } from "@/lib/api";
import { CAMPO } from "@/lib/schermate";
import { useToastStore } from "@/stores/toast-store";

export function CambiaPasswordDialog({
  percorso,
  userId,
  open,
  onOpenChange,
}: {
  percorso: string;
  userId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [attuale, setAttuale] = React.useState("");
  const [nuova, setNuova] = React.useState("");
  const [conferma, setConferma] = React.useState("");
  const [errore, setErrore] = React.useState<string | null>(null);

  function chiudi() {
    setAttuale("");
    setNuova("");
    setConferma("");
    setErrore(null);
    onOpenChange(false);
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (nuova !== conferma) {
      setErrore("The new password and its confirmation don't match.");
      return;
    }
    try {
      await chiama(percorso, "cambia_password", { userId, attuale, nuova });
      useToastStore.getState().push({ title: "Password changed" });
      chiudi();
    } catch (e) {
      setErrore(String(e));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && chiudi()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(360px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-strong bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border-strong bg-zona-contesto px-4 py-2">
            <Dialog.Title className="text-sm font-semibold">Change password</Dialog.Title>
            <Dialog.Close className="rounded p-1 hover:bg-zona-accento/10" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <form onSubmit={invia} className="flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Current password
              <input className={CAMPO} type="password" required autoFocus value={attuale} onChange={(e) => setAttuale(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              New password
              <input className={CAMPO} type="password" required minLength={4} value={nuova} onChange={(e) => setNuova(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Confirm new password
              <input className={CAMPO} type="password" required minLength={4} value={conferma} onChange={(e) => setConferma(e.target.value)} />
            </label>
            {errore && <p className="text-xs text-semaforo-rosso">{errore}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={chiudi}>Cancel</Button>
              <Button type="submit">Change</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
