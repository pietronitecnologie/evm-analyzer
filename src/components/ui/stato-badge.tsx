// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Badge di stato semantico (sez. 8.1): il colore non è mai l'unico segnale,
// ogni stato porta sempre anche un'icona e un'etichetta testuale.

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  GitMerge,
  type LucideIcon,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type StatoSemantico =
  | "verde"
  | "giallo"
  | "rosso"
  | "provvisorio"
  | "conflitto"
  | "neutro";

const STATO_STYLE: Record<StatoSemantico, string> = {
  verde: "bg-semaforo-verde/15 text-semaforo-verde border-semaforo-verde/30",
  giallo: "bg-semaforo-giallo/15 text-semaforo-giallo border-semaforo-giallo/30",
  rosso: "bg-semaforo-rosso/15 text-semaforo-rosso border-semaforo-rosso/30",
  provvisorio:
    "bg-cell-provvisorio text-cell-provvisorio-border border-cell-provvisorio-border",
  conflitto:
    "bg-cell-conflitto text-cell-conflitto-border border-cell-conflitto-border",
  neutro: "bg-muted text-muted-foreground border-border",
};

const STATO_ICON: Record<StatoSemantico, LucideIcon> = {
  verde: CheckCircle2,
  giallo: AlertTriangle,
  rosso: XCircle,
  provvisorio: CircleDashed,
  conflitto: GitMerge,
  neutro: CircleDashed,
};

export interface StatoBadgeProps {
  stato: StatoSemantico;
  label: string;
  className?: string;
}

export function StatoBadge({ stato, label, className }: StatoBadgeProps) {
  const Icon = STATO_ICON[stato];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        STATO_STYLE[stato],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
