// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DocumentTab {
  id: string;
  screenId: string;
  title: string;
}

interface LayoutState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  tabs: DocumentTab[];
  activeTabId: string | null;

  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  openScreen: (screenId: string, title: string) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (activeId: string, overId: string) => void;
}

// Schede e layout si ricordano all'apertura successiva del progetto
// (sez. 8.2); sono preferenze per utente, non dati di progetto.
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      tabs: [],
      activeTabId: null,

      toggleSidebar: () =>
        set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      openScreen: (screenId, title) => {
        const existing = get().tabs.find((t) => t.screenId === screenId);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        const id = `${screenId}-${Date.now()}`;
        set({
          tabs: [...get().tabs, { id, screenId, title }],
          activeTabId: id,
        });
      },

      closeTab: (id) => {
        const tabs = get().tabs.filter((t) => t.id !== id);
        const wasActive = get().activeTabId === id;
        set({
          tabs,
          activeTabId: wasActive
            ? (tabs[tabs.length - 1]?.id ?? null)
            : get().activeTabId,
        });
      },

      closeAllTabs: () => set({ tabs: [], activeTabId: null }),

      setActiveTab: (id) => set({ activeTabId: id }),

      reorderTabs: (activeId, overId) => {
        const tabs = [...get().tabs];
        const from = tabs.findIndex((t) => t.id === activeId);
        const to = tabs.findIndex((t) => t.id === overId);
        if (from === -1 || to === -1) return;
        const [moved] = tabs.splice(from, 1);
        tabs.splice(to, 0, moved);
        set({ tabs });
      },
    }),
    {
      name: "evm-analyzer.layout",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    },
  ),
);
