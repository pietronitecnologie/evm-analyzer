// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import {
  AlertTriangle,
  BarChart3,
  Calendar,
  ClipboardCheck,
  Database,
  FileText,
  Gauge,
  Activity,
  Wallet,
  GitBranch,
  GitCompare,
  type LucideIcon,
  Network,
  PackageCheck,
  Repeat,
  Settings,
  ShieldCheck,
  Table2,
  Users,
  Waves,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// Sidebar sinistra (sez. 8.2): gruppi Lavoro, Analisi, Governo,
// Coordinamento, Sistema. Ogni voce apre/attiva una scheda documento.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "lavoro",
    label: "Lavoro",
    items: [
      { id: "avanzamento", label: "Avanzamento", icon: ClipboardCheck },
      { id: "approvazioni", label: "Approvazioni", icon: ShieldCheck },
      { id: "feed-msproject", label: "Feed MS Project", icon: Repeat },
    ],
  },
  {
    id: "analisi",
    label: "Analisi",
    items: [
      { id: "dashboard", label: "Dashboard", icon: Gauge },
      { id: "wbs", label: "WBS", icon: Network },
      { id: "task-risorse", label: "Task e risorse", icon: Table2 },
      { id: "gantt", label: "Gantt", icon: Calendar },
      { id: "forecast", label: "Forecast", icon: BarChart3 },
      { id: "filoni", label: "Filoni e programma", icon: GitBranch },
      { id: "agile-flow", label: "Agile/Flow", icon: Waves },
      { id: "buffer-riserve", label: "Buffer e riserve", icon: Database },
      { id: "monitoraggio", label: "Monitoraggio EVM", icon: Activity },
    ],
  },
  {
    id: "governo",
    label: "Governo",
    items: [
      { id: "baseline-cr", label: "Baseline e change request", icon: GitCompare },
      { id: "governance-costi", label: "Governance costi", icon: Wallet },
      { id: "qualita-dati", label: "Qualità dati", icon: AlertTriangle },
      { id: "report", label: "Report", icon: FileText },
    ],
  },
  {
    id: "coordinamento",
    label: "Coordinamento",
    items: [
      { id: "perimetri-utenti", label: "Perimetri e utenti", icon: Users },
      { id: "consolidamento", label: "Consolidamento pacchetti", icon: PackageCheck },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      { id: "importa-esporta", label: "Importa/Esporta", icon: Repeat },
      { id: "impostazioni", label: "Impostazioni", icon: Settings },
    ],
  },
];

export const NAV_ITEMS_BY_ID: Record<string, NavItem> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((item) => [item.id, item]),
);
