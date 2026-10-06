// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Contenuto delle schermate di sez. 8.5. In questa fase (Fondamenta) le
// schermate di analisi/lavoro sono segnaposto onesti: il guscio (menu,
// schede, pannelli, tabella comune) è completo, il contenuto arriva nelle
// Fasi 2-6 secondo il piano in sez. 9.

import { FolderOpen, Import, PackagePlus, Sheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TaskScreen } from "@/components/screens/TaskScreen";
import { AvanzamentoScreen } from "@/components/screens/AvanzamentoScreen";
import { ApprovazioniScreen } from "@/components/screens/ApprovazioniScreen";
import { DashboardScreen } from "@/components/screens/DashboardScreen";
import { GanttScreen } from "@/components/screens/GanttScreen";
import { PerimetriUtentiScreen } from "@/components/screens/PerimetriUtentiScreen";
import { RiserveScreen } from "@/components/screens/RiserveScreen";
import { WbsScreen } from "@/components/screens/WbsScreen";
import { CalendariScreen } from "@/components/screens/CalendariScreen";
import { NAV_ITEMS_BY_ID } from "@/lib/navigation";
import { runCommand } from "@/lib/commands";

function HomeScreen() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-lg font-semibold">Progetti recenti</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Nessun progetto recente: importa un export del piano o un workbook
        Excel per iniziare.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          onClick={() => runCommand("file.importa-piano")}
        >
          <Import className="size-5" />
          <span className="font-medium">Nuovo da export di MS Project</span>
          <span className="text-xs text-muted-foreground">XML MSPDI, Excel o CSV</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          onClick={() => runCommand("file.apri")}
        >
          <FolderOpen className="size-5" />
          <span className="font-medium">Apri</span>
          <span className="text-xs text-muted-foreground">Progetto .evmproj esistente</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          onClick={() => runCommand("file.importa-workbook")}
        >
          <Sheet className="size-5" />
          <span className="font-medium">Importa workbook Excel</span>
          <span className="text-xs text-muted-foreground">Formato Impresa Numerica</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          onClick={() => runCommand("file.importa-pacchetto")}
        >
          <PackagePlus className="size-5" />
          <span className="font-medium">Importa pacchetto</span>
          <span className="text-xs text-muted-foreground">.evmwork / .evmprog</span>
        </Button>
      </div>
    </div>
  );
}

export function ScreenPlaceholder({ screenId, title }: { screenId: string; title: string }) {
  if (screenId === "home") return <HomeScreen />;
  if (screenId === "task-risorse") return <TaskScreen />;
  if (screenId === "dashboard") return <DashboardScreen />;
  if (screenId === "wbs") return <WbsScreen />;
  if (screenId === "gantt") return <GanttScreen />;
  if (screenId === "avanzamento") return <AvanzamentoScreen />;
  if (screenId === "approvazioni") return <ApprovazioniScreen />;
  if (screenId === "perimetri-utenti") return <PerimetriUtentiScreen />;
  if (screenId === "buffer-riserve") return <RiserveScreen />;
  if (screenId === "calendari") return <CalendariScreen />;

  const Icon = NAV_ITEMS_BY_ID[screenId]?.icon;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
      {Icon && <Icon className="size-8" aria-hidden="true" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs">
        Il contenuto di questa schermata arriva nelle fasi successive del
        piano di sviluppo (sez. 9). Il guscio (menu, schede, pannello di
        dettaglio, tabella comune) è già operativo.
      </p>
    </div>
  );
}
