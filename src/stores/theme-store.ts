// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "chiaro" | "scuro";

interface ThemeState {
  theme: Theme;
  fontScale: number;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setFontScale: (scale: number) => void;
}

// Le preferenze di aspetto si salvano per utente (localStorage), non nel
// file di progetto (sez. 8.7).
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "chiaro",
      fontScale: 1,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({ theme: get().theme === "chiaro" ? "scuro" : "chiaro" }),
      setFontScale: (fontScale) =>
        set({ fontScale: Math.min(1.4, Math.max(0.8, fontScale)) }),
    }),
    { name: "evm-analyzer.preferenze-aspetto" },
  ),
);

export function applyThemeToDocument(theme: Theme, fontScale: number) {
  document.documentElement.dataset.theme = theme === "scuro" ? "dark" : "light";
  document.documentElement.style.fontSize = `${fontScale * 100}%`;
}
