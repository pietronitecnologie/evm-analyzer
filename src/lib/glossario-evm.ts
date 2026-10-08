// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Glossario degli indicatori EVM mostrati nel monitoraggio: per ogni sigla, il nome, cosa
// misura, come si legge il valore e il paragrafo del libro. Testi in inglese.

export interface TermineEvm {
  nome: string;
  /** Cosa misura, in una frase. */
  significato: string;
  /** Come leggere il valore. */
  lettura: string;
  /** Formula, se utile. */
  formula?: string;
  riferimento: string;
}

export const GLOSSARIO_EVM: Record<string, TermineEvm> = {
  BAC: {
    nome: "Budget At Completion",
    significato: "The project's total approved budget: how much it was planned to spend in all.",
    lettura: "It is the reference for all other values: PV, EV and AC are measured within this budget.",
    formula: "sum of the WBS node budgets",
    riferimento: "§3.2",
  },
  PV: {
    nome: "Planned Value",
    significato: "The value of the work that should have been completed by the status date, according to the plan.",
    lettura: "It is the target: if PV grows faster than EV, the project is behind.",
    formula: "task budget × fraction of planned duration elapsed",
    riferimento: "§3.5",
  },
  EV: {
    nome: "Earned Value",
    significato: "The value of the work actually completed, valued at the planned budget.",
    lettura: "It is the work done expressed in budget euros: EV higher than PV means ahead of plan.",
    formula: "task budget × % physically completed",
    riferimento: "§3.5",
  },
  AC: {
    nome: "Actual Cost",
    significato: "The cost actually incurred up to the status date (actuals).",
    lettura: "Compare with EV: if AC exceeds EV, more is being spent than the work produced.",
    formula: "sum of the actual costs recorded per task",
    riferimento: "§3.5",
  },
  CV: {
    nome: "Cost Variance",
    significato: "Cost deviation: how much the work done (EV) is worth more or less than what was spent (AC).",
    lettura: "Negative: more is spent than the value produced. Positive: less is spent.",
    formula: "EV − AC",
    riferimento: "§3.6",
  },
  SV: {
    nome: "Schedule Variance",
    significato: "Schedule deviation: how much work done (EV) is ahead of or behind the plan (PV).",
    lettura: "Negative: the project is late. Positive: it is ahead.",
    formula: "EV − PV",
    riferimento: "§3.6",
  },
  CPI: {
    nome: "Cost Performance Index",
    significato: "Cost efficiency: how much value is obtained for every euro spent.",
    lettura: "1 is in line with the budget. Below 1, more is being spent than planned. Undefined if EV or AC is zero.",
    formula: "EV ÷ AC",
    riferimento: "§3.6",
  },
  SPI: {
    nome: "Schedule Performance Index",
    significato: "Schedule efficiency: how much work is completed compared to what was planned.",
    lettura: "1 is in line with the plan. Below 1, the project is behind schedule. Undefined if PV is zero.",
    formula: "EV ÷ PV",
    riferimento: "§3.6",
  },
  ETC: {
    nome: "Estimate To Complete",
    significato: "The cost still to be incurred to finish the work.",
    lettura: "If CPI is undefined, it is estimated at the planned rate: the remaining work costs as planned.",
    formula: "(BAC − EV) ÷ CPI",
    riferimento: "§3.7",
  },
  EAC: {
    nome: "Estimate At Completion",
    significato: "The project's forecast final cost, at the current spending rate.",
    lettura: "Compare it with the BAC: if EAC exceeds BAC, the project will finish over budget.",
    formula: "AC + ETC",
    riferimento: "§3.7",
  },
  "EAC ottimistica": {
    nome: "Optimistic EAC",
    significato: "The final cost if the remaining work proceeds at the planned rate, with no efficiency recovery.",
    lettura: "It is a reasonable lower bound for the final cost.",
    formula: "AC + (BAC − EV)",
    riferimento: "§3.7",
  },
  VAC: {
    nome: "Variance At Completion",
    significato: "The forecast deviation at project completion compared to the budget.",
    lettura: "Negative: the project will cost more than the budget. Positive: it will cost less.",
    formula: "BAC − EAC",
    riferimento: "§3.8",
  },
  TCPI: {
    nome: "To-Complete Performance Index",
    significato: "The efficiency needed on the remaining work to stay within budget.",
    lettura: "1 is sustainable. Above 1, more efficiency is needed than now. Undefined if BAC − AC is not positive.",
    formula: "(BAC − EV) ÷ (BAC − AC)",
    riferimento: "§3.8",
  },
};
