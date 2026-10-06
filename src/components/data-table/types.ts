// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import type { ColumnFiltersState, SortingState, VisibilityState } from "@tanstack/react-table";

/** Vista salvata (sez. 8.4): colonne, filtri, ordinamento, per utente. */
export interface SavedView {
  id: string;
  name: string;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  columnOrder: string[];
  columnSizing: Record<string, number>;
}

/** Stato di una cella per il codice colore semantico (sez. 8.1). */
export type CellKind = "input" | "calcolato" | "provvisorio" | "conflitto" | "normale";
