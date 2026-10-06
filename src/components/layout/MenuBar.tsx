// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { COMMANDS, runCommand } from "@/lib/commands";
import { MENUS } from "@/lib/menu-config";

const COMMANDS_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export function MenuBar() {
  return (
    <nav
      aria-label="Barra dei menu"
      className="flex h-8 items-center gap-0.5 border-b border-border bg-card px-2"
    >
      {MENUS.map((menu) => (
        <DropdownMenu.Root key={menu.id}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="rounded px-2 py-1 text-sm text-card-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
            >
              {menu.label}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-56 rounded-md border border-border bg-popover p-1 shadow-lg"
            >
              {menu.entries.map((entry, index) => {
                if ("separator" in entry) {
                  return (
                    <DropdownMenu.Separator
                      key={`sep-${index}`}
                      className="my-1 h-px bg-border"
                    />
                  );
                }
                const command = COMMANDS_BY_ID.get(entry.commandId);
                if (!command) return null;
                return (
                  <DropdownMenu.Item
                    key={command.id}
                    onSelect={() => runCommand(command.id)}
                    className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  >
                    <span>{command.label}</span>
                    {command.shortcut && (
                      <kbd className="text-xs text-muted-foreground">
                        {command.shortcut}
                      </kbd>
                    )}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ))}
    </nav>
  );
}
