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
  percorso: string | null;
  statusDate: string;
  statusDateState: StatoStatusDate;
  /** Null = latest status date (no explicit selection). */
  snapshotId: number | null;
  perimetro: string;
  /** Null = whole project (no scope selected). */
  scopeId: number | null;
  baseline: string;
  /** Null = no explicit baseline selected (figures use the default "startup" baseline). */
  baselineId: number | null;
  evBaseMode: BaseEvMode;
  userName: string;
  userRole: string;
  notificationCount: number;
  coveragePct: number | null;
  planSynced: boolean;
  planSyncHash: string | null;
  anomalyCount: number;
  saved: boolean;
  impostaProgetto: (progetto: {
    projectName: string;
    percorso: string;
    statusDate: string;
  }) => void;
  setSnapshot: (id: number | null, label: string, stato?: StatoStatusDate) => void;
  setScope: (id: number | null, label: string) => void;
  setBaseline: (id: number | null, label: string) => void;
  setEvBaseMode: (mode: BaseEvMode) => void;
}

export const useProjectContextStore = create<ProjectContextState>()((set) => ({
  projectName: "No project open",
  percorso: null,
  impostaProgetto: (progetto) =>
    set({ ...progetto, snapshotId: null, scopeId: null, baselineId: null, perimetro: "Whole project", baseline: "Startup" }),
  statusDate: "—",
  statusDateState: "bozza",
  snapshotId: null,
  perimetro: "Whole project",
  scopeId: null,
  baseline: "Startup",
  baselineId: null,
  evBaseMode: "bac_senza_contingency",
  userName: "—",
  userRole: "—",
  notificationCount: 0,
  coveragePct: null,
  planSynced: true,
  planSyncHash: null,
  anomalyCount: 0,
  saved: true,
  setSnapshot: (snapshotId, statusDate, statusDateState) =>
    set({ snapshotId, statusDate, ...(statusDateState ? { statusDateState } : {}) }),
  setScope: (scopeId, perimetro) => set({ scopeId, perimetro }),
  setBaseline: (baselineId, baseline) => set({ baselineId, baseline }),
  setEvBaseMode: (evBaseMode) => set({ evBaseMode }),
}));
