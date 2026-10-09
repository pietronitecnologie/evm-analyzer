// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Guida (todo.md, item 8): il manuale utente (MANUALE_UTENTE.md, alla radice del
// repository) reso leggibile dall'applicazione stessa, non solo da un editor di
// testo — "visualizzabile anche da software". Importato come testo grezzo a
// tempo di build (Vite `?raw`): nessuna richiesta di rete, funziona anche offline.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import manuale from "../../../MANUALE_UTENTE.md?raw";

export function GuideScreen() {
  return (
    <div className="h-full overflow-auto">
      <article className="markdown-corpo mx-auto max-w-3xl px-6 py-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{manuale}</ReactMarkdown>
      </article>
    </div>
  );
}
