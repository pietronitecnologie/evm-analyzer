// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Tabella comune (sez. 8.4): virtualizzata, intestazione fissa, colonne
// congelabili/ridimensionabili/riordinabili, filtro per colonna, filtri
// rapidi a chip, modifica in cella, viste salvate. Tutte le schermate con
// tabelle (WBS, Task, Avanzamento, ...) si costruiscono su questo componente.

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Save } from "lucide-react";
import * as React from "react";

import * as Popover from "@radix-ui/react-popover";

import { EditableCell } from "@/components/data-table/EditableCell";
import {
  loadSavedViews,
  persistSavedViews,
} from "@/components/data-table/SavedViews";
import type { CellKind, SavedView } from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DataTableColumnMeta {
  align?: "left" | "right";
  editable?: boolean;
  filterable?: boolean;
}

export interface QuickFilter<TData> {
  id: string;
  label: string;
  predicate: (row: TData) => boolean;
}

export interface DataTableProps<TData extends { id: string }> {
  tableId: string;
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  quickFilters?: QuickFilter<TData>[];
  pinnedColumnIds?: string[];
  getCellKind?: (row: TData, columnId: string) => CellKind;
  getLockedReason?: (row: TData, columnId: string) => string | undefined;
  onCellEdit?: (rowId: string, columnId: string, value: string) => void;
  rowHeight?: number;
  emptyMessage?: string;
}

function DraggableHeader({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      {...attributes}
      {...listeners}
      className="flex h-full w-full cursor-grab items-center select-none"
    >
      {children}
    </div>
  );
}

export function DataTable<TData extends { id: string }>({
  tableId,
  columns,
  data,
  quickFilters = [],
  pinnedColumnIds = [],
  getCellKind,
  getLockedReason,
  onCellEdit,
  rowHeight = 32,
  emptyMessage = "No rows to show.",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(
    columns.map((c) => c.id as string),
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [activeQuickFilters, setActiveQuickFilters] = React.useState<Set<string>>(
    new Set(),
  );
  const [activeCell, setActiveCell] = React.useState<{ rowId: string; columnId: string } | null>(
    null,
  );
  const [editingCell, setEditingCell] = React.useState<{ rowId: string; columnId: string } | null>(
    null,
  );
  const [savedViews, setSavedViews] = React.useState<SavedView[]>(() =>
    loadSavedViews(tableId),
  );

  const filteredData = React.useMemo(() => {
    if (activeQuickFilters.size === 0) return data;
    const filters = quickFilters.filter((f) => activeQuickFilters.has(f.id));
    return data.filter((row) => filters.every((f) => f.predicate(row)));
  }, [data, quickFilters, activeQuickFilters]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, columnVisibility, columnOrder, columnSizing },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    enableMultiSort: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: { minSize: 60, size: 140 },
  });

  const leafColumns = table.getAllLeafColumns();
  const rows = table.getRowModel().rows;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onHeaderDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const order = [...columnOrder];
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    setColumnOrder(order);
  }

  function toggleQuickFilter(id: string) {
    setActiveQuickFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function saveCurrentView(name: string) {
    const view: SavedView = {
      id: `vista-${Date.now()}`,
      name,
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnSizing,
    };
    const next = [...savedViews, view];
    setSavedViews(next);
    persistSavedViews(tableId, next);
  }

  function applyView(view: SavedView) {
    setSorting(view.sorting);
    setColumnFilters(view.columnFilters);
    setColumnVisibility(view.columnVisibility);
    setColumnOrder(view.columnOrder);
    setColumnSizing(view.columnSizing);
  }

  function deleteView(id: string) {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    persistSavedViews(tableId, next);
  }

  function moveActiveCell(key: string, withCtrl: boolean) {
    if (!activeCell) return;
    const rowIds = rows.map((r) => r.id);
    const colIds = leafColumns.map((c) => c.id);
    const rowIdx = rowIds.indexOf(activeCell.rowId);
    const colIdx = colIds.indexOf(activeCell.columnId);
    if (rowIdx === -1 || colIdx === -1) return;

    if (key === "FillDown" && withCtrl) {
      const sourceRow = rows[rowIdx]?.original as TData | undefined;
      const targetRow = rows[rowIdx + 1]?.original as TData | undefined;
      if (sourceRow && targetRow && onCellEdit) {
        const value = (sourceRow as Record<string, unknown>)[activeCell.columnId];
        onCellEdit(targetRow.id, activeCell.columnId, String(value ?? ""));
      }
      return;
    }

    let nextRowIdx = rowIdx;
    let nextColIdx = colIdx;
    if (key === "ArrowDown") nextRowIdx = Math.min(rowIdx + 1, rowIds.length - 1);
    if (key === "ArrowUp") nextRowIdx = Math.max(rowIdx - 1, 0);
    if (key === "ArrowRight") nextColIdx = Math.min(colIdx + 1, colIds.length - 1);
    if (key === "ArrowLeft") nextColIdx = Math.max(colIdx - 1, 0);

    setActiveCell({ rowId: rowIds[nextRowIdx], columnId: colIds[nextColIdx] });
    virtualizer.scrollToIndex(nextRowIdx);
  }

  function onPaste(event: React.ClipboardEvent) {
    if (!activeCell || !onCellEdit) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const rowIds = rows.map((r) => r.id);
    const colIds = leafColumns.map((c) => c.id);
    const startRow = rowIds.indexOf(activeCell.rowId);
    const startCol = colIds.indexOf(activeCell.columnId);
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
    lines.forEach((line, rOffset) => {
      const cells = line.split("\t");
      cells.forEach((cellValue, cOffset) => {
        const rowId = rowIds[startRow + rOffset];
        const columnId = colIds[startCol + cOffset];
        if (rowId && columnId) onCellEdit(rowId, columnId, cellValue);
      });
    });
  }

  return (
    <div className="flex h-full flex-col">
      {quickFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-2 py-1.5">
          {quickFilters.map((f) => {
            const active = activeQuickFilters.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleQuickFilter(f.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {f.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1">
            <ColumnVisibilityPopover table={table} />
            <SavedViewsPopover
              views={savedViews}
              onSave={saveCurrentView}
              onApply={applyView}
              onDelete={deleteView}
            />
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        role="grid"
        aria-rowcount={rows.length}
        tabIndex={0}
        onPaste={onPaste}
        className="relative flex-1 overflow-auto"
        style={{ width: table.getTotalSize() ? undefined : "100%" }}
      >
        <div style={{ width: table.getTotalSize(), minWidth: "100%" }}>
          {/* Intestazione fissa */}
          <div className="sticky top-0 z-10 bg-card">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onHeaderDragEnd}
            >
              <SortableContext
                items={columnOrder}
                strategy={horizontalListSortingStrategy}
              >
                {table.getHeaderGroups().map((headerGroup) => (
                  <div key={headerGroup.id} className="flex border-b border-border">
                    {headerGroup.headers.map((header) => {
                      const pinned = pinnedColumnIds.includes(header.column.id);
                      const sorted = header.column.getIsSorted();
                      const meta = header.column.columnDef.meta as
                        | DataTableColumnMeta
                        | undefined;
                      return (
                        <div
                          key={header.id}
                          style={{ width: header.getSize() }}
                          className={cn(
                            "relative flex h-8 shrink-0 items-center border-r border-border px-2 text-xs font-semibold text-muted-foreground",
                            pinned && "sticky left-0 z-20 bg-card",
                          )}
                        >
                          <DraggableHeader id={header.column.id}>
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cn(
                                "flex flex-1 items-center gap-1 truncate text-left",
                                meta?.align === "right" && "justify-end",
                              )}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === "asc" && <ArrowUp className="size-3" />}
                              {sorted === "desc" && <ArrowDown className="size-3" />}
                              {header.column.getCanSort() && !sorted && (
                                <ArrowUpDown className="size-3 opacity-30" />
                              )}
                            </button>
                          </DraggableHeader>
                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-ring"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
            {/* Riga di filtro per colonna */}
            <div className="flex border-b border-border bg-background">
              {table.getVisibleLeafColumns().map((column) => {
                const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
                const pinned = pinnedColumnIds.includes(column.id);
                return (
                  <div
                    key={column.id}
                    style={{ width: column.getSize() }}
                    className={cn(
                      "shrink-0 border-r border-border px-1 py-1",
                      pinned && "sticky left-0 z-20 bg-background",
                    )}
                  >
                    {meta?.filterable !== false && column.getCanFilter() && (
                      <input
                        value={(column.getFilterValue() as string) ?? ""}
                        onChange={(e) => column.setFilterValue(e.target.value)}
                        placeholder="Filter…"
                        className="h-5 w-full rounded border border-border bg-transparent px-1 text-xs outline-none focus:border-ring"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <div
                    key={row.id}
                    role="row"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex border-b border-border hover:bg-accent/40"
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | DataTableColumnMeta
                        | undefined;
                      const pinned = pinnedColumnIds.includes(cell.column.id);
                      const kind: CellKind =
                        getCellKind?.(row.original, cell.column.id) ?? "normale";
                      const isActive =
                        activeCell?.rowId === row.id && activeCell.columnId === cell.column.id;
                      const isEditing =
                        editingCell?.rowId === row.id && editingCell.columnId === cell.column.id;
                      const editable = Boolean(meta?.editable) && kind !== "calcolato";

                      if (!meta?.editable) {
                        return (
                          <div
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className={cn(
                              "flex shrink-0 items-center border-r border-border px-2 text-sm",
                              meta?.align === "right" && "justify-end tabular-num",
                              pinned && "sticky left-0 z-10 bg-background",
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={cn(
                            "shrink-0 border-r border-border",
                            pinned && "sticky left-0 z-10 bg-background",
                          )}
                        >
                          <EditableCell
                            value={String(cell.getValue() ?? "")}
                            kind={kind}
                            editable={editable}
                            align={meta?.align}
                            isActive={isActive}
                            isEditing={isEditing}
                            lockedReason={getLockedReason?.(row.original, cell.column.id)}
                            onActivate={() =>
                              setActiveCell({ rowId: row.id, columnId: cell.column.id })
                            }
                            onStartEdit={() =>
                              setEditingCell({ rowId: row.id, columnId: cell.column.id })
                            }
                            onCancelEdit={() => setEditingCell(null)}
                            onCommit={(value) => {
                              setEditingCell(null);
                              onCellEdit?.(row.id, cell.column.id, value);
                            }}
                            onNavigate={(key, withCtrl) => {
                              setActiveCell({ rowId: row.id, columnId: cell.column.id });
                              moveActiveCell(key, withCtrl);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ColumnVisibilityPopover<TData>({
  table,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="size-3.5" />
          Columns
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-56 rounded-md border border-border bg-popover p-2 shadow-lg"
        >
          <ul className="max-h-64 overflow-y-auto">
            {table.getAllLeafColumns().map((column) => (
              <li key={column.id}>
                <label className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                  />
                  {String(column.columnDef.header)}
                </label>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SavedViewsPopover({
  views,
  onSave,
  onApply,
  onDelete,
}: {
  views: SavedView[];
  onSave: (name: string) => void;
  onApply: (view: SavedView) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = React.useState("");
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <Save className="size-3.5" />
          Views
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-md border border-border bg-popover p-2 shadow-lg"
        >
          <div className="flex gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="View name…"
              className="h-7 flex-1 rounded border border-border bg-transparent px-2 text-sm outline-none"
            />
            <Button
              size="sm"
              disabled={!name.trim()}
              onClick={() => {
                onSave(name.trim());
                setName("");
              }}
            >
              Save
            </Button>
          </div>
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {views.length === 0 && (
              <li className="px-1.5 py-1 text-xs text-muted-foreground">
                No saved view.
              </li>
            )}
            {views.map((view) => (
              <li
                key={view.id}
                className="flex items-center justify-between rounded px-1.5 py-1 text-sm hover:bg-accent"
              >
                <button type="button" onClick={() => onApply(view)} className="flex-1 text-left">
                  {view.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(view.id)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
