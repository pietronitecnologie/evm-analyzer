// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { dirname } from "node:path";
import { fileURLToPath, URL } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
  ],
  framework: getAbsolutePath("@storybook/react-vite"),
  async viteFinal(viteConfig) {
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    viteConfig.plugins ??= [];
    viteConfig.plugins.push(tailwindcss());
    viteConfig.resolve ??= {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    };
    return viteConfig;
  },
};
export default config;
