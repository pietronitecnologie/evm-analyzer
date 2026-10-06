// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { Command as CommandPrimitive } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import * as React from "react";

import { COMMANDS } from "@/lib/commands";
import { useLayoutStore } from "@/stores/layout-store";

export function CommandPalette() {
  const open = useLayoutStore((s) => s.commandPaletteOpen);
  const setOpen = useLayoutStore((s) => s.setCommandPaletteOpen);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!useLayoutStore.getState().commandPaletteOpen);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  const groups = React.useMemo(() => {
    const byGroup = new Map<string, typeof COMMANDS>();
    for (const command of COMMANDS) {
      const list = byGroup.get(command.group) ?? [];
      list.push(command);
      byGroup.set(command.group, list);
    }
    return byGroup;
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-[18%] z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-popover shadow-xl"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Palette comandi</Dialog.Title>
          <CommandPrimitive label="Palette comandi" className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden="true" />
              <CommandPrimitive.Input
                autoFocus
                placeholder="Cerca un comando, una schermata o un task…"
                className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandPrimitive.List className="max-h-80 overflow-y-auto p-1">
              <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nessun risultato.
              </CommandPrimitive.Empty>
              {[...groups.entries()].map(([group, items]) => (
                <CommandPrimitive.Group
                  key={group}
                  heading={group}
                  className="px-2 py-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
                >
                  {items.map((command) => (
                    <CommandPrimitive.Item
                      key={command.id}
                      value={`${command.label} ${command.group}`}
                      onSelect={() => {
                        command.run();
                        setOpen(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    >
                      <span>{command.label}</span>
                      {command.shortcut && (
                        <kbd className="text-xs text-muted-foreground">
                          {command.shortcut}
                        </kbd>
                      )}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
