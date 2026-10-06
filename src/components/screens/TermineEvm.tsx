// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Sigla EVM con la spiegazione a portata di mano: al passaggio del mouse o con il focus da
// tastiera compare il significato, la lettura del valore e la formula.

import * as React from "react";

import { GLOSSARIO_EVM } from "@/lib/glossario-evm";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Testo della sigla con tooltip di spiegazione. Sigle senza voce restano testo semplice. */
export function TermineEvm({ sigla, children }: { sigla: string; children?: React.ReactNode }) {
  const voce = GLOSSARIO_EVM[sigla];
  if (!voce) return <>{children ?? sigla}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {children ?? sigla}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="z-50 max-w-xs rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
        <p className="font-semibold">
          {sigla} · {voce.nome}
        </p>
        <p className="mt-1">{voce.significato}</p>
        <p className="mt-1 text-muted-foreground">{voce.lettura}</p>
        {voce.formula && <p className="mt-1 font-mono">{voce.formula}</p>}
        <p className="mt-1 text-muted-foreground">Libro {voce.riferimento}</p>
      </TooltipContent>
    </Tooltip>
  );
}
