// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Colori dei grafici ECharts, letti dai design token dell'app (src/styles/globals.css)
// così i grafici seguono il tema chiaro/scuro senza un tema ECharts separato.

function hsl(variabile: string, elemento: Element): string {
  const valore = getComputedStyle(elemento).getPropertyValue(variabile).trim();
  return valore ? `hsl(${valore})` : "currentColor";
}

export interface ColoriGrafico {
  testo: string;
  griglia: string;
  verde: string;
  giallo: string;
  rosso: string;
  /** PV, EV, AC: grigio tratteggiato, teal, arancione (sez. 3.1 della specifica). */
  pv: string;
  ev: string;
  ac: string;
}

export function leggiColoriGrafico(): ColoriGrafico {
  const root = document.documentElement;
  return {
    testo: hsl("--muted-foreground", root),
    griglia: hsl("--border", root),
    verde: hsl("--semaforo-verde", root),
    giallo: hsl("--semaforo-giallo", root),
    rosso: hsl("--semaforo-rosso", root),
    pv: hsl("--muted-foreground", root),
    ev: "#0d9488",
    ac: "#ea580c",
  };
}
