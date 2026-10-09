// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "storybook-static",
      "target",
      "src-tauri",
      "crates",
      "fixtures",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Motore EVM (specifica fase 2, regola 1): funzioni pure, nessun Date né Math.random.
    files: ["packages/engine/src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", { name: "Date", message: "Il motore non usa Date: date ISO e giorni via dates.ts" }],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Il motore non usa Math.random: il seme è un parametro" },
        { object: "Date", property: "now", message: "Il motore non legge l'orologio: la data è un parametro" },
      ],
    },
  },
  {
    // Script Node (benchmark, non build dell'app): nessun plugin React.
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      // Il progetto non usa il React Compiler (nessun babel-plugin-react-compiler):
      // la regola presume la sua presenza e segnala falsi positivi su librerie
      // come TanStack Table che restituiscono nuove funzioni a ogni render.
      "react-hooks/incompatible-library": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
