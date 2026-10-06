// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppShell } from "@/components/layout/AppShell";

const meta: Meta<typeof AppShell> = {
  title: "Layout/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof AppShell>;

export const Guscio: Story = {};
