// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import * as React from "react";

import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScreenPlaceholder } from "@/components/screens/ScreenPlaceholder";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyThemeToDocument, useThemeStore } from "@/stores/theme-store";

function useAppliedTheme() {
  const theme = useThemeStore((s) => s.theme);
  const fontScale = useThemeStore((s) => s.fontScale);
  React.useEffect(() => {
    applyThemeToDocument(theme, fontScale);
  }, [theme, fontScale]);
}

/** Finestra staccata (sez. 8.2): mostra una singola scheda, senza il guscio completo. */
function DetachedWindow({ screenId, title }: { screenId: string; title: string }) {
  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen flex-col">
          <div className="flex h-9 items-center border-b border-border bg-card px-3 text-sm font-medium">
            {title}
          </div>
          <div className="flex-1 overflow-auto">
            <ScreenPlaceholder screenId={screenId} title={title} />
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default function App() {
  useAppliedTheme();

  const params = new URLSearchParams(window.location.search);
  const detachedScreen = params.get("screen");

  if (detachedScreen) {
    return (
      <DetachedWindow
        screenId={detachedScreen}
        title={params.get("titolo") ?? detachedScreen}
      />
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
