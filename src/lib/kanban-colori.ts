// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Palette fissa per colonne e sotto-task Kanban (todo.md): stesse otto chiavi di
// `kanban.rs::COLORI_VALIDI`, tenute allineate a mano. Classi Tailwind dirette (non
// nuovi token in globals.css): poche voci cosmetiche, non un sistema di colore
// dell'app — bg translucida (leggibile su sfondo chiaro e scuro senza varianti dark:
// dedicate) più un bordo a sinistra pieno per il colpo d'occhio sulla lavagna.

export interface ColoreKanban {
  id: string;
  nome: string;
  classi: string;
  /** Solo lo swatch (selettore di colore): un pallino pieno, non la bg translucida. */
  swatch: string;
}

export const COLORI_KANBAN: ColoreKanban[] = [
  { id: "rosso", nome: "Red", classi: "border-l-4 border-l-red-500 bg-red-500/10", swatch: "bg-red-500" },
  { id: "arancione", nome: "Orange", classi: "border-l-4 border-l-orange-500 bg-orange-500/10", swatch: "bg-orange-500" },
  { id: "giallo", nome: "Yellow", classi: "border-l-4 border-l-yellow-500 bg-yellow-500/10", swatch: "bg-yellow-500" },
  { id: "verde", nome: "Green", classi: "border-l-4 border-l-emerald-500 bg-emerald-500/10", swatch: "bg-emerald-500" },
  { id: "teal", nome: "Teal", classi: "border-l-4 border-l-teal-500 bg-teal-500/10", swatch: "bg-teal-500" },
  { id: "blu", nome: "Blue", classi: "border-l-4 border-l-blue-500 bg-blue-500/10", swatch: "bg-blue-500" },
  { id: "viola", nome: "Purple", classi: "border-l-4 border-l-purple-500 bg-purple-500/10", swatch: "bg-purple-500" },
  { id: "grigio", nome: "Gray", classi: "border-l-4 border-l-slate-500 bg-slate-500/10", swatch: "bg-slate-500" },
];

const PER_ID = new Map(COLORI_KANBAN.map((c) => [c.id, c]));

/** Classi del colore scelto, o un bordo trasparente (stesso spessore, nessun salto di layout) se nessuno. */
export function classiColore(id: string | null): string {
  return (id && PER_ID.get(id)?.classi) || "border-l-4 border-l-transparent";
}
