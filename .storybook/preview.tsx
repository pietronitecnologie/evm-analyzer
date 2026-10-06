// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import type { Preview } from "@storybook/react-vite";
import * as React from "react";

import { applyThemeToDocument } from "../src/stores/theme-store";
import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: "Tema chiaro/scuro",
      toolbar: {
        title: "Tema",
        icon: "mirror",
        items: [
          { value: "chiaro", title: "Chiaro" },
          { value: "scuro", title: "Scuro" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "chiaro" },
  decorators: [
    (Story, context) => {
      applyThemeToDocument(context.globals.theme, 1);
      return React.createElement(Story);
    },
  ],
};

export default preview;
