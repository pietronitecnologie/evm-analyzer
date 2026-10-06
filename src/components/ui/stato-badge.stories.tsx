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

export const Verde: Story = { args: { stato: "verde", label: "In linea" } };
export const Giallo: Story = { args: { stato: "giallo", label: "Attenzione" } };
export const Rosso: Story = { args: { stato: "rosso", label: "Critico" } };
export const Provvisorio: Story = {
  args: { stato: "provvisorio", label: "Provvisorio" },
};
export const Conflitto: Story = { args: { stato: "conflitto", label: "In conflitto" } };

export const TuttiGliStati: StoryObj = {
  render: () => (
    <div className="flex gap-2">
      <StatoBadge stato="verde" label="In linea" />
      <StatoBadge stato="giallo" label="Attenzione" />
      <StatoBadge stato="rosso" label="Critico" />
      <StatoBadge stato="provvisorio" label="Provvisorio" />
      <StatoBadge stato="conflitto" label="In conflitto" />
    </div>
  ),
};
