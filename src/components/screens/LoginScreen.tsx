// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Pagina di login (todo.md, oltre le Fasi 5/6): sostituisce il selettore libero
// "Acting as" (decisione 88) con un'identità autenticata. I profili utente sono
// per-progetto (stessa tabella user_profile di Fase 4-ter, non un account globale):
// il login vale per l'apertura corrente — `impostaProgetto` reimposta attoreId a
// null a ogni apertura/creazione di progetto (project-context-store.ts), quindi
// questa schermata ricompare automaticamente ogni volta, senza bisogno di un
// "log out" esplicito lato store.

import * as React from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UtenteAutenticato } from "@/lib/api";
import { chiama } from "@/lib/api";
import { apriProgetto } from "@/lib/progetto";
import { CAMPO } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";

export function LoginScreen({ percorso, nomeProgetto }: { percorso: string; nomeProgetto: string }) {
  const setAttore = useProjectContextStore((s) => s.setAttore);
  const [uid, setUid] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errore, setErrore] = React.useState<string | null>(null);
  const [inCorso, setInCorso] = React.useState(false);

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setInCorso(true);
    setErrore(null);
    try {
      const utente = await chiama<UtenteAutenticato>(percorso, "accedi", { userUid: uid.trim(), password });
      setAttore(utente.id, utente.nome, utente.ruoli);
    } catch (e) {
      setErrore(String(e));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-zona-schede">
      <form onSubmit={accedi} className="flex w-[min(360px,90vw)] flex-col gap-4 rounded-lg border border-border-strong bg-card p-6 shadow-lg">
        <div className="flex flex-col items-center gap-1 text-center">
          <LogIn className="size-6 text-zona-accento" />
          <h1 className="text-sm font-semibold">{nomeProgetto}</h1>
          <p className="text-xs text-muted-foreground">Sign in to continue.</p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Identifier
          <input className={CAMPO} autoFocus required value={uid} onChange={(e) => setUid(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Password
          <input className={CAMPO} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {errore && <p className="text-xs text-semaforo-rosso">{errore}</p>}
        <Button type="submit" disabled={inCorso}>
          Sign in
        </Button>
        <button
          type="button"
          className="text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => void apriProgetto()}
        >
          Open a different project…
        </button>
      </form>
    </div>
  );
}
