// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { create } from "zustand";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set({ toasts: [...get().toasts, { ...toast, id }] });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function toast(title: string, description?: string) {
  useToastStore.getState().push({ title, description });
}

export function notImplemented(label: string) {
  useToastStore
    .getState()
    .push({ title: label, description: "Disponibile in una fase successiva dello sviluppo." });
}
