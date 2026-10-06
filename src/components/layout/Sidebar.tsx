// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/lib/navigation";
import { useLayoutStore } from "@/stores/layout-store";

export function Sidebar() {
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const openScreen = useLayoutStore((s) => s.openScreen);

  const activeScreenId = tabs.find((t) => t.id === activeTabId)?.screenId;

  return (
    <aside
      aria-label="Barra laterale di navigazione"
      className={cn(
        "flex flex-col border-r border-border bg-card transition-[width] duration-150",
        collapsed ? "w-12" : "w-56",
      )}
    >
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-3">
            {!collapsed && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
            )}
            <ul>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeScreenId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      title={collapsed ? item.label : undefined}
                      onClick={() => openScreen(item.id, item.label)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-card-foreground hover:bg-accent",
                        collapsed && "justify-center px-0",
                        active && "bg-accent font-medium text-accent-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Espandi barra laterale" : "Comprimi barra laterale"}
        className="flex items-center justify-center border-t border-border py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {collapsed ? (
          <ChevronsRight className="size-4" />
        ) : (
          <ChevronsLeft className="size-4" />
        )}
      </button>
    </aside>
  );
}
