// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatoBadge } from "@/components/ui/stato-badge";

const meta: Meta<typeof StatoBadge> = {
  title: "UI/StatoBadge",
  component: StatoBadge,
};
export default meta;

type Story = StoryObj<typeof StatoBadge>;

export const Verde: Story = { args: { stato: "verde", label: "On track" } };
export const Giallo: Story = { args: { stato: "giallo", label: "Warning" } };
export const Rosso: Story = { args: { stato: "rosso", label: "Critical" } };
export const Provvisorio: Story = {
  args: { stato: "provvisorio", label: "Provisional" },
};
export const Conflitto: Story = { args: { stato: "conflitto", label: "Conflicting" } };

export const TuttiGliStati: StoryObj = {
  render: () => (
    <div className="flex gap-2">
      <StatoBadge stato="verde" label="On track" />
      <StatoBadge stato="giallo" label="Warning" />
      <StatoBadge stato="rosso" label="Critical" />
      <StatoBadge stato="provvisorio" label="Provisional" />
      <StatoBadge stato="conflitto" label="Conflicting" />
    </div>
  ),
};
