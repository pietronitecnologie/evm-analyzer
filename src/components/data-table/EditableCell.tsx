// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { Lock } from "lucide-react";
import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CellKind } from "@/components/data-table/types";

const KIND_CLASS: Record<CellKind, string> = {
  // Blu chiaro = input modificabile; grigio = calcolato; arancione =
  // provvisorio/non approvato; viola = conflitto (sez. 8.1).
  input: "bg-cell-input/60 focus-within:ring-1 focus-within:ring-cell-input-border",
  calcolato: "bg-cell-calcolato text-cell-calcolato-fg",
  provvisorio: "bg-cell-provvisorio",
  conflitto: "bg-cell-conflitto",
  normale: "",
};

export interface EditableCellProps {
  value: string;
  kind: CellKind;
  editable: boolean;
  align?: "left" | "right";
  isActive: boolean;
  isEditing: boolean;
  lockedReason?: string;
  onActivate: () => void;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onCancelEdit: () => void;
  onNavigate: (key: string, withCtrl: boolean) => void;
}

export function EditableCell({
  value,
  kind,
  editable,
  align = "left",
  isActive,
  isEditing,
  lockedReason,
  onActivate,
  onStartEdit,
  onCommit,
  onCancelEdit,
  onNavigate,
}: EditableCellProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isEditing]);

  // Input non controllato (defaultValue + key): evita di tenere una copia
  // del valore in uno state locale aggiornato da un effetto.
  const content = isEditing ? (
    <input
      key={value}
      ref={inputRef}
      defaultValue={value}
      onBlur={() => onCommit(inputRef.current?.value ?? "")}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(inputRef.current?.value ?? "");
          onNavigate("ArrowDown", false);
        } else if (e.key === "Tab") {
          e.preventDefault();
          onCommit(inputRef.current?.value ?? "");
          onNavigate(e.shiftKey ? "ArrowLeft" : "ArrowRight", false);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancelEdit();
        }
      }}
      className={cn(
        "h-full w-full bg-transparent px-2 text-sm outline-none",
        align === "right" && "text-right tabular-num",
      )}
    />
  ) : (
    <span
      className={cn(
        "block truncate px-2 text-sm",
        align === "right" && "text-right tabular-num",
      )}
    >
      {value}
    </span>
  );

  const cell = (
    <div
      role="gridcell"
      tabIndex={-1}
      onClick={onActivate}
      onDoubleClick={() => editable && onStartEdit()}
      onKeyDown={(e) => {
        if (isEditing) return;
        if (e.key === "F2" || e.key === "Enter") {
          if (editable) {
            e.preventDefault();
            onStartEdit();
          }
        } else if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
          e.preventDefault();
          onNavigate(e.key, e.ctrlKey || e.metaKey);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
          e.preventDefault();
          onNavigate("FillDown", true);
        }
      }}
      className={cn(
        "flex h-full items-center border border-transparent",
        KIND_CLASS[kind],
        isActive && "border-ring",
        !editable && kind === "calcolato" && "cursor-not-allowed",
      )}
    >
      {content}
      {!editable && lockedReason && (
        <Lock className="mr-1.5 size-3 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  if (!editable && lockedReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent>{lockedReason}</TooltipContent>
      </Tooltip>
    );
  }

  return cell;
}
