// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Rete di sicurezza contro un errore di rendering non gestito (todo.md "BUG": "il
// progetto si chiude" dopo un inserimento in DB). Senza un error boundary da nessuna
// parte in questa app, un'eccezione in un qualunque componente smontava l'intera
// radice React lasciando uno schermo bianco — indistinguibile, per l'utente, da "il
// progetto si è chiuso": l'unico modo per uscirne era ricaricare la finestra. Questo
// componente non impedisce l'errore (la causa va comunque diagnosticata quando si
// ripresenta: il messaggio ora è visibile invece di sparire nel nulla), ma lo rende
// recuperabile — un pannello con l'errore invece di una pagina bianca, e la
// rassicurazione che il file del progetto su disco non è stato toccato.

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  errore: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { errore: null };

  static getDerivedStateFromError(errore: Error): State {
    return { errore };
  }

  componentDidCatch(errore: Error, info: React.ErrorInfo) {
    console.error("Errore di rendering non gestito:", errore, info.componentStack);
  }

  render() {
    if (!this.state.errore) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <AlertTriangle className="size-8 text-semaforo-rosso" />
        <div>
          <h1 className="text-sm font-semibold">Something went wrong in the interface.</h1>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            The project file on disk hasn&apos;t been touched — only this window needs a fresh start.
            Reload, then reopen the project if it doesn&apos;t come back on its own.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <details className="max-w-lg text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer">Error details</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{String(this.state.errore.stack ?? this.state.errore.message)}</pre>
        </details>
      </div>
    );
  }
}
