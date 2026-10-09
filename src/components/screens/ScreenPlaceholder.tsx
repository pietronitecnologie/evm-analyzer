// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Contenuto delle schermate di sez. 8.5. In questa fase (Fondamenta) le
// schermate di analisi/lavoro sono segnaposto onesti: il guscio (menu,
// schede, pannelli, tabella comune) è completo, il contenuto arriva nelle
// Fasi 2-6 secondo il piano in sez. 9.

import { FolderOpen, Import, Sheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TaskRisorseScreen } from "@/components/screens/TaskRisorseScreen";
import { AvanzamentoScreen } from "@/components/screens/AvanzamentoScreen";
import { ApprovazioniScreen } from "@/components/screens/ApprovazioniScreen";
import { DashboardScreen } from "@/components/screens/DashboardScreen";
import { GanttScreen } from "@/components/screens/GanttScreen";
import { PerimetriUtentiScreen } from "@/components/screens/PerimetriUtentiScreen";
import { RiserveScreen } from "@/components/screens/RiserveScreen";
import { WbsScreen } from "@/components/screens/WbsScreen";
import { CalendariScreen } from "@/components/screens/CalendariScreen";
import { MonitoraggioScreen } from "@/components/screens/MonitoraggioScreen";
import { GovernanceScreen } from "@/components/screens/GovernanceScreen";
import { BaselineCrScreen } from "@/components/screens/BaselineCrScreen";
import { ForecastScreen } from "@/components/screens/ForecastScreen";
import { AgileFlowScreen } from "@/components/screens/AgileFlowScreen";
import { FiloniScreen } from "@/components/screens/FiloniScreen";
import { QualitaDatiScreen } from "@/components/screens/QualitaDatiScreen";
import { ReportScreen } from "@/components/screens/ReportScreen";
import { NAV_ITEMS_BY_ID } from "@/lib/navigation";
import { runCommand } from "@/lib/commands";

function HomeScreen() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-semibold">Recent projects</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        No recent project: import a plan export or an Excel workbook to get
        started.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          onClick={() => runCommand("file.importa-piano")}
        >
          <Import className="size-5" />
          <span className="font-medium">New from MS Project export</span>
          <span className="text-xs text-muted-foreground">XML MSPDI, Excel or CSV</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          onClick={() => runCommand("file.apri")}
        >
          <FolderOpen className="size-5" />
          <span className="font-medium">Open</span>
          <span className="text-xs text-muted-foreground">Existing .evmproj project</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          onClick={() => runCommand("file.importa-workbook")}
        >
          <Sheet className="size-5" />
          <span className="font-medium">Import Excel workbook</span>
          <span className="text-xs text-muted-foreground">Impresa Numerica format</span>
        </Button>
      </div>
    </div>
  );
}

export function ScreenPlaceholder({ screenId, title }: { screenId: string; title: string }) {
  if (screenId === "home") return <HomeScreen />;
  if (screenId === "task-risorse") return <TaskRisorseScreen />;
  if (screenId === "dashboard") return <DashboardScreen />;
  if (screenId === "wbs") return <WbsScreen />;
  if (screenId === "gantt") return <GanttScreen />;
  if (screenId === "avanzamento") return <AvanzamentoScreen />;
  if (screenId === "approvazioni") return <ApprovazioniScreen />;
  if (screenId === "perimetri-utenti") return <PerimetriUtentiScreen />;
  if (screenId === "buffer-riserve") return <RiserveScreen />;
  if (screenId === "calendari") return <CalendariScreen />;
  if (screenId === "monitoraggio") return <MonitoraggioScreen />;
  if (screenId === "governance-costi") return <GovernanceScreen />;
  if (screenId === "baseline-cr") return <BaselineCrScreen />;
  if (screenId === "forecast") return <ForecastScreen />;
  if (screenId === "agile-flow") return <AgileFlowScreen />;
  if (screenId === "filoni") return <FiloniScreen />;
  if (screenId === "qualita-dati") return <QualitaDatiScreen />;
  if (screenId === "report") return <ReportScreen />;

  const Icon = NAV_ITEMS_BY_ID[screenId]?.icon;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
      {Icon && <Icon className="size-8" aria-hidden="true" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs">
        This screen's content arrives in later phases of the development
        plan (sec. 9). The shell (menu, tabs, common table panel) is already
        working.
      </p>
    </div>
  );
}
