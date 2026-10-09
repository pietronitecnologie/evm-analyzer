// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import * as React from "react";
import { Group, Panel, Separator, useDefaultLayout, type PanelImperativeHandle } from "react-resizable-panels";

import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ContextBar } from "@/components/layout/ContextBar";
import { DiagnosticsDialog } from "@/components/layout/DiagnosticsDialog";
import { DocumentTabs } from "@/components/layout/DocumentTabs";
import { EsitoImportazione } from "@/components/layout/EsitoImportazione";
import { ImportPlanWizard } from "@/components/layout/ImportPlanWizard";
import { MenuBar } from "@/components/layout/MenuBar";
import { ResyncPlanDialog } from "@/components/layout/ResyncPlanDialog";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { LoginScreen } from "@/components/screens/LoginScreen";
import { ScreenPlaceholder } from "@/components/screens/ScreenPlaceholder";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { runCommand } from "@/lib/commands";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectContextStore } from "@/stores/project-context-store";

const SHORTCUT_COMMANDS: Record<string, string> = {
  b: "vista.sidebar",
};

export function AppShell() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const openScreen = useLayoutStore((s) => s.openScreen);
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const percorso = useProjectContextStore((s) => s.percorso);
  const projectName = useProjectContextStore((s) => s.projectName);
  const attoreId = useProjectContextStore((s) => s.attoreId);

  // Larghezza della barra laterale ridimensionabile trascinando il separatore: ricordata
  // da react-resizable-panels stesso (localStorage), non dallo store di layout — solo le
  // vere trascinature dell'utente si salvano (onlySaveAfterUserInteractions), non le
  // collassate/espanse programmatiche sotto, che restano un concetto separato
  // (sidebarCollapsed, già persistito a parte).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "app-shell", onlySaveAfterUserInteractions: true });
  const sidebarPanelRef = React.useRef<PanelImperativeHandle>(null);

  React.useEffect(() => {
    if (sidebarCollapsed) sidebarPanelRef.current?.collapse();
    else sidebarPanelRef.current?.expand();
  }, [sidebarCollapsed]);

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

  if (percorso && attoreId === null) {
    return (
      <TooltipProvider delayDuration={300}>
        <LoginScreen percorso={percorso} nomeProgetto={projectName} />
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden">
        <MenuBar />
        <ContextBar />
        <div className="flex-1 overflow-hidden">
          <Group orientation="horizontal" style={{ height: "100%" }} defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
            <Panel id="sidebar" panelRef={sidebarPanelRef} collapsible collapsedSize={48} defaultSize={224} minSize={180} maxSize={420}>
              <Sidebar />
            </Panel>
            <Separator className="w-1 shrink-0 cursor-col-resize bg-border-strong hover:bg-accent" />
            <Panel id="workspace" minSize={300}>
              <div className="flex h-full flex-1 flex-col overflow-hidden">
                <DocumentTabs />
                <div className="flex-1 overflow-auto bg-zona-area" role="tabpanel">
                  {activeTab ? (
                    <ScreenPlaceholder
                      screenId={activeTab.screenId}
                      title={activeTab.title}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No tab open. Use Ctrl+K to open a screen.
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </Group>
        </div>
        <StatusBar />
      </div>
      <CommandPalette />
      <EsitoImportazione />
      <ImportPlanWizard />
      <ResyncPlanDialog />
      <DiagnosticsDialog />
      <Toaster />
    </TooltipProvider>
  );
}
