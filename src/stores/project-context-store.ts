// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { create } from "zustand";

// Stato del contesto di progetto mostrato nella barra superiore (sez. 8.2).
// In questa fase (guscio UI) i valori sono segnaposto statici: l'aggancio
// al progetto SQLite reale arriva con le Fasi 2-4.

export type StatoStatusDate = "bozza" | "provvisorio" | "finale";
export type BaseEvMode = "bac_con_contingency" | "bac_senza_contingency";

interface ProjectContextState {
  projectName: string;
  statusDate: string;
  statusDateState: StatoStatusDate;
  perimetro: string;
  baseline: string;
  evBaseMode: BaseEvMode;
  userName: string;
  userRole: string;
  notificationCount: number;
  coveragePct: number | null;
  planSynced: boolean;
  planSyncHash: string | null;
  anomalyCount: number;
  saved: boolean;
}

export const useProjectContextStore = create<ProjectContextState>(() => ({
  projectName: "Nessun progetto aperto",
  statusDate: "—",
  statusDateState: "bozza",
  perimetro: "Tutto il progetto",
  baseline: "Startup",
  evBaseMode: "bac_senza_contingency",
  userName: "—",
  userRole: "—",
  notificationCount: 0,
  coveragePct: null,
  planSynced: true,
  planSyncHash: null,
  anomalyCount: 0,
  saved: true,
}));
