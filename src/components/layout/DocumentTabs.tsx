// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import {
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
import { ExternalLink, Plus, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_ITEMS_BY_ID } from "@/lib/navigation";
import { type DocumentTab, useLayoutStore } from "@/stores/layout-store";
import { notImplemented } from "@/stores/toast-store";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function detachTab(tab: DocumentTab) {
  if (!isTauriRuntime()) {
    notImplemented(`Stacca "${tab.title}" in una finestra`);
    return;
  }
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `scheda-${tab.screenId}-${Date.now()}`;
    const win = new WebviewWindow(label, {
      url: `index.html?screen=${tab.screenId}&titolo=${encodeURIComponent(tab.title)}`,
      title: tab.title,
      width: 1100,
      height: 720,
    });
    win.once("tauri://error", () => notImplemented(`Stacca "${tab.title}" in una finestra`));
    useLayoutStore.getState().closeTab(tab.id);
  } catch {
    notImplemented(`Stacca "${tab.title}" in una finestra`);
  }
}

function SortableTab({
  tab,
  active,
}: {
  tab: DocumentTab;
  active: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: tab.id });
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const closeTab = useLayoutStore((s) => s.closeTab);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => setActiveTab(tab.id)}
      role="tab"
      aria-selected={active}
      className={cn(
        "group flex max-w-48 shrink-0 cursor-default items-center gap-1.5 border-r border-border-strong border-t-2 px-3 py-1.5 text-sm",
        active
          ? "border-t-zona-accento bg-zona-area font-medium text-foreground"
          : "border-t-transparent bg-zona-schede text-muted-foreground hover:bg-zona-accento/10 hover:text-foreground",
      )}
    >
      <span className="truncate">{tab.title}</span>
      <button
        type="button"
        title="Stacca in una finestra"
        aria-label={`Stacca ${tab.title} in una finestra`}
        onClick={(e) => {
          e.stopPropagation();
          void detachTab(tab);
        }}
        className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
      >
        <ExternalLink className="size-3" />
      </button>
      <button
        type="button"
        title="Chiudi scheda"
        aria-label={`Chiudi ${tab.title}`}
        onClick={(e) => {
          e.stopPropagation();
          closeTab(tab.id);
        }}
        className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function DocumentTabs() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const reorderTabs = useLayoutStore((s) => s.reorderTabs);
  const openScreen = useLayoutStore((s) => s.openScreen);
  const closeAllTabs = useLayoutStore((s) => s.closeAllTabs);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderTabs(String(active.id), String(over.id));
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Schede aperte"
      className="flex h-9 items-stretch overflow-x-auto border-b border-border-strong bg-zona-schede"
    >
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          {tabs.map((tab) => (
            <SortableTab key={tab.id} tab={tab} active={tab.id === activeTabId} />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        aria-label="Apri una nuova scheda (Dashboard)"
        title="Nuova scheda"
        onClick={() => openScreen("dashboard", NAV_ITEMS_BY_ID.dashboard.label)}
        className="flex w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-zona-accento/10 hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
      {tabs.length > 0 && (
        <button
          type="button"
          aria-label="Chiudi tutte le schede"
          title="Chiudi tutte le schede"
          onClick={closeAllTabs}
          className="ml-auto flex shrink-0 items-center gap-1 px-3 text-xs text-muted-foreground hover:bg-zona-accento/10 hover:text-foreground"
        >
          <XCircle className="size-3.5" />
          Chiudi tutte
        </button>
      )}
    </div>
  );
}
