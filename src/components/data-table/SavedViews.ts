// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import type { SavedView } from "@/components/data-table/types";

// Viste salvate per utente (sez. 8.4), non nel file di progetto (sez. 8.7).
function storageKey(tableId: string) {
  return `evm-analyzer.viste-salvate.${tableId}`;
}

export function loadSavedViews(tableId: string): SavedView[] {
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function persistSavedViews(tableId: string, views: SavedView[]) {
  try {
    localStorage.setItem(storageKey(tableId), JSON.stringify(views));
  } catch {
    // localStorage non disponibile: la vista resta solo in memoria.
  }
}
