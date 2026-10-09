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
    label: "Work",
    items: [
      { id: "avanzamento", label: "Progress", icon: ClipboardCheck },
      { id: "approvazioni", label: "Approvals", icon: ShieldCheck },
    ],
  },
  {
    id: "analisi",
    label: "Analysis",
    items: [
      { id: "dashboard", label: "Dashboard", icon: Gauge },
      { id: "wbs", label: "WBS", icon: Network },
      { id: "task-risorse", label: "Tasks and resources", icon: Table2 },
      { id: "gantt", label: "Gantt", icon: Calendar },
      { id: "forecast", label: "Forecast", icon: BarChart3 },
      { id: "filoni", label: "Workstreams and schedule", icon: GitBranch },
      { id: "agile-flow", label: "Agile/Flow", icon: Waves },
      { id: "buffer-riserve", label: "Buffer and reserves", icon: Database },
      { id: "monitoraggio", label: "EVM Monitoring", icon: Activity },
    ],
  },
  {
    id: "governo",
    label: "Governance",
    items: [
      { id: "baseline-cr", label: "Baseline and change requests", icon: GitCompare },
      { id: "governance-costi", label: "Cost governance", icon: Wallet },
      { id: "qualita-dati", label: "Data quality", icon: AlertTriangle },
      { id: "report", label: "Report", icon: FileText },
    ],
  },
  {
    id: "coordinamento",
    label: "Coordination",
    items: [
      { id: "perimetri-utenti", label: "User scopes", icon: Users },
    ],
  },
];

export const NAV_ITEMS_BY_ID: Record<string, NavItem> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).map((item) => [item.id, item]),
);
