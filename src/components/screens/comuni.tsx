// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Componenti di presentazione condivisi dalle schermate di lavoro.

import * as React from "react";

export function Vuoto({ messaggio }: { messaggio: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      {messaggio}
    </div>
  );
}

export function Sezione({
  titolo,
  azioni,
  children,
}: {
  titolo: string;
  azioni?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col border-b border-border-strong">
      <header className="flex items-center justify-between bg-zona-contesto px-4 py-2">
        <h2 className="text-sm font-semibold">{titolo}</h2>
        {azioni}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Campo({
  etichetta,
  children,
}: {
  etichetta: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {etichetta}
      {children}
    </label>
  );
}
