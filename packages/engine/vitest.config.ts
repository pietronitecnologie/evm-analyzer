// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 85,
        functions: 90,
      },
    },
  },
});
