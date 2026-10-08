// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Hook e costanti condivise dalle schermate di lavoro (caricamento dei dati
// del progetto aperto, scritture con avviso, stili dei campi). I componenti
// di presentazione stanno in components/screens/comuni.tsx.

import * as React from "react";

import { chiama } from "@/lib/api";
import { useProjectContextStore } from "@/stores/project-context-store";
import { useToastStore } from "@/stores/toast-store";

export const CAMPO =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const TESTA_TABELLA =
  "sticky top-0 bg-zona-schede px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export const CELLA = "border-b border-border px-3 py-1.5 align-middle";

/** Percorso del progetto aperto, o null se nessun progetto è aperto. */
export function usePercorso(): string | null {
  return useProjectContextStore((s) => s.percorso);
}

export function avviso(titolo: string, descrizione?: unknown) {
  useToastStore.getState().push({
    title: titolo,
    description: descrizione === undefined ? undefined : String(descrizione),
    variant: "destructive",
  });
}

/**
 * Carica i dati di un comando sul progetto aperto. Restituisce i dati e la
 * funzione per ricaricarli dopo una scrittura. La risposta arrivata dopo un
 * cambio di progetto è ignorata.
 */
export function useDati<T>(
  comando: string,
  percorso: string | null,
): [T | null, () => Promise<void>] {
  const [dati, setDati] = React.useState<T | null>(null);

  const ricarica = React.useCallback(async () => {
    if (!percorso) return;
    try {
      setDati(await chiama<T>(percorso, comando));
    } catch (e) {
      avviso(`Loading failed (${comando})`, e);
    }
  }, [comando, percorso]);

  React.useEffect(() => {
    if (!percorso) return;
    let annullato = false;
    chiama<T>(percorso, comando)
      .then((d) => {
        if (!annullato) setDati(d);
      })
      .catch((e) => {
        if (!annullato) avviso(`Loading failed (${comando})`, e);
      });
    return () => {
      annullato = true;
    };
  }, [comando, percorso]);

  return [dati, ricarica];
}

/** Esegue una scrittura: mostra l'esito e restituisce true se è andata a buon fine. */
export async function esegui(
  titolo: string,
  azione: () => Promise<unknown>,
  esito?: string,
): Promise<boolean> {
  try {
    await azione();
    if (esito) {
      useToastStore.getState().push({ title: esito });
    }
    return true;
  } catch (e) {
    avviso(titolo, e);
    return false;
  }
}
