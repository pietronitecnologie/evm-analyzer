// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Formattazione numerica/data in italiano (sez. 8.1 del prompt di sviluppo).
// Nessun valore calcolato deve mai apparire come #VALUE!/NaN: un valore non
// calcolabile si mostra come NON_CALCOLABILE, con il motivo in tooltip.

export const NON_CALCOLABILE = "—";

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = (decimals: number) =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const indexFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatCurrencyIt(value: number | null | undefined): string {
  if (!isFinite(value)) return NON_CALCOLABILE;
  return currencyFormatter.format(value);
}

export function formatPercentIt(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!isFinite(value)) return NON_CALCOLABILE;
  return `${percentFormatter(decimals).format(value)}%`;
}

/** Indici come CPI/SPI: sempre 2 decimali, — se non definiti (es. EV = 0). */
export function formatIndexIt(value: number | null | undefined): string {
  if (!isFinite(value)) return NON_CALCOLABILE;
  return indexFormatter.format(value);
}

export function formatDateIt(value: string | Date | null | undefined): string {
  if (!value) return NON_CALCOLABILE;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return NON_CALCOLABILE;
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
