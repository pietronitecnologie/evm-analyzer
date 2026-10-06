// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

import { DataTable, type QuickFilter } from "@/components/data-table/DataTable";
import type { CellKind } from "@/components/data-table/types";
import { formatCurrencyIt, formatIndexIt, formatPercentIt } from "@/lib/format";

interface RigaDemo {
  id: string;
  wbs: string;
  nome: string;
  metodoEv: string;
  pctFisica: number;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
}

function generaRighe(n: number): RigaDemo[] {
  const metodi = ["0/100", "50/50", "Unità fisiche", "Milestone pesate", "LOE"];
  return Array.from({ length: n }, (_, i) => {
    const bac = 1000 + (i % 37) * 450;
    const pctFisica = [0, 25, 50, 75, 90, 100][i % 6];
    const ev = Math.round((bac * pctFisica) / 100);
    const ac = Math.round(ev * (0.8 + ((i % 5) * 0.1)));
    return {
      id: `t-${i + 1}`,
      wbs: `1.${Math.floor(i / 10) + 1}.${(i % 10) + 1}`,
      nome: `Attività ${i + 1}`,
      metodoEv: metodi[i % metodi.length],
      pctFisica,
      bac,
      pv: Math.round(bac * 0.6),
      ev,
      ac,
    };
  });
}

function cpiOf(row: RigaDemo) {
  return row.ac === 0 ? null : row.ev / row.ac;
}
function spiOf(row: RigaDemo) {
  return row.pv === 0 ? null : row.ev / row.pv;
}

const columns: ColumnDef<RigaDemo, unknown>[] = [
  { id: "wbs", header: "WBS", accessorKey: "wbs", size: 90 },
  { id: "nome", header: "Attività", accessorKey: "nome", size: 200 },
  { id: "metodoEv", header: "Metodo EV", accessorKey: "metodoEv", size: 140, meta: { filterable: false } },
  {
    id: "pctFisica",
    header: "% fisica",
    accessorKey: "pctFisica",
    size: 100,
    meta: { align: "right", editable: true },
    cell: (ctx) => formatPercentIt(ctx.getValue() as number, 0),
  },
  {
    id: "bac",
    header: "BAC",
    accessorKey: "bac",
    size: 110,
    meta: { align: "right" },
    cell: (ctx) => formatCurrencyIt(ctx.getValue() as number),
  },
  {
    id: "pv",
    header: "PV",
    accessorKey: "pv",
    size: 110,
    meta: { align: "right" },
    cell: (ctx) => formatCurrencyIt(ctx.getValue() as number),
  },
  {
    id: "ev",
    header: "EV",
    accessorKey: "ev",
    size: 110,
    meta: { align: "right" },
    cell: (ctx) => formatCurrencyIt(ctx.getValue() as number),
  },
  {
    id: "ac",
    header: "AC",
    accessorKey: "ac",
    size: 110,
    meta: { align: "right" },
    cell: (ctx) => formatCurrencyIt(ctx.getValue() as number),
  },
  {
    id: "cpi",
    header: "CPI",
    accessorFn: (row) => cpiOf(row),
    size: 90,
    meta: { align: "right" },
    cell: (ctx) => formatIndexIt(ctx.getValue() as number | null),
  },
  {
    id: "spi",
    header: "SPI",
    accessorFn: (row) => spiOf(row),
    size: 90,
    meta: { align: "right" },
    cell: (ctx) => formatIndexIt(ctx.getValue() as number | null),
  },
];

const quickFilters: QuickFilter<RigaDemo>[] = [
  {
    id: "fuori-soglia",
    label: "Fuori soglia",
    predicate: (row) => {
      const cpi = cpiOf(row);
      const spi = spiOf(row);
      return (cpi !== null && cpi < 0.95) || (spi !== null && spi < 0.95);
    },
  },
  {
    id: "non-aggiornati",
    label: "Non aggiornati",
    predicate: (row) => row.pctFisica === 0,
  },
  {
    id: "completati",
    label: "Completati",
    predicate: (row) => row.pctFisica === 100,
  },
];

function getCellKind(_row: RigaDemo, columnId: string): CellKind {
  if (columnId === "pctFisica") return "input";
  if (["bac", "pv", "ev", "ac", "cpi", "spi"].includes(columnId)) return "calcolato";
  return "normale";
}

function DemoTable() {
  const [data, setData] = React.useState(() => generaRighe(500));

  function onCellEdit(rowId: string, columnId: string, value: string) {
    if (columnId !== "pctFisica") return;
    setData((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const parsed = Number(value.replace(",", "."));
        const pctFisica = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : row.pctFisica;
        return { ...row, pctFisica, ev: Math.round((row.bac * pctFisica) / 100) };
      }),
    );
  }

  return (
    <div style={{ height: 480 }}>
      <DataTable
        tableId="demo-wbs"
        columns={columns}
        data={data}
        pinnedColumnIds={["wbs"]}
        quickFilters={quickFilters}
        getCellKind={getCellKind}
        onCellEdit={onCellEdit}
      />
    </div>
  );
}

const meta: Meta<typeof DemoTable> = {
  title: "DataTable/DataTable",
  component: DemoTable,
};
export default meta;

type Story = StoryObj<typeof DemoTable>;

export const Esempio500Righe: Story = {};
