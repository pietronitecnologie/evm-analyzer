// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Componenti condivisi per le card KPI EVM (Monitoraggio e Dashboard, Fase 5).

import * as React from "react";
import type { EvmOutput } from "@evm-analyzer/engine";

import { classeSemaforo } from "@/lib/evm-workbook";
import { num } from "@/lib/format";

const ETICHETTA_LUCE: Record<EvmOutput["cpiLight"], string> = {
  verde: "green",
  giallo: "yellow",
  rosso: "red",
  nd: "n/a",
};

export function Indice({ valore, luce, motivo }: { valore: number | null; luce: EvmOutput["cpiLight"]; motivo?: string }) {
  if (valore === null) return <span className="text-muted-foreground" title={motivo ?? "not defined"}>—</span>;
  return (
    <span className={`tabular-num font-medium ${classeSemaforo(luce)}`} title={motivo}>
      {num(valore)} <span className="text-xs">({ETICHETTA_LUCE[luce]})</span>
    </span>
  );
}

export function Kpi({ etichetta, valore, nota }: { etichetta: React.ReactNode; valore: React.ReactNode; nota?: string }) {
  return (
    <div className="rounded-md border border-border-strong bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <p className="tabular-num mt-1 text-lg font-semibold">{valore}</p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}
