// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import * as React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ContextBar } from "@/components/layout/ContextBar";
import { DetailPanel } from "@/components/layout/DetailPanel";
import { DocumentTabs } from "@/components/layout/DocumentTabs";
import { EsitoImportazione } from "@/components/layout/EsitoImportazione";
import { MenuBar } from "@/components/layout/MenuBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ScreenPlaceholder } from "@/components/screens/ScreenPlaceholder";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { runCommand } from "@/lib/commands";
import { useLayoutStore } from "@/stores/layout-store";

const SHORTCUT_COMMANDS: Record<string, string> = {
  b: "vista.sidebar",
  i: "vista.dettaglio",
};

export function AppShell() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const detailPanelOpen = useLayoutStore((s) => s.detailPanelOpen);
  const openScreen = useLayoutStore((s) => s.openScreen);

  React.useEffect(() => {
    if (tabs.length === 0) openScreen("home", "Home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) {
        if (event.key === "F11") {
          event.preventDefault();
          runCommand("vista.schermo-intero");
        }
        return;
      }
      const commandId = SHORTCUT_COMMANDS[event.key.toLowerCase()];
      if (commandId) {
        event.preventDefault();
        runCommand(commandId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden">
        <MenuBar />
        <ContextBar />
        <div className="flex-1 overflow-hidden">
          <Group orientation="horizontal" style={{ height: "100%" }}>
            <Panel id="workspace" minSize={15} defaultSize={detailPanelOpen ? 78 : 100}>
              <div className="flex h-full">
                <Sidebar />
                <div className="flex flex-1 flex-col overflow-hidden">
                  <DocumentTabs />
                  <div className="flex-1 overflow-auto bg-zona-area" role="tabpanel">
                    {activeTab ? (
                      <ScreenPlaceholder
                        screenId={activeTab.screenId}
                        title={activeTab.title}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Nessuna scheda aperta. Usa Ctrl+K per aprire una schermata.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
            {detailPanelOpen && (
              <>
                <Separator className="w-px bg-border hover:bg-ring" />
                <Panel id="dettaglio" minSize={15} defaultSize={22}>
                  <DetailPanel />
                </Panel>
              </>
            )}
          </Group>
        </div>
        <StatusBar />
      </div>
      <CommandPalette />
      <EsitoImportazione />
      <Toaster />
    </TooltipProvider>
  );
}
