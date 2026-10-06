// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Glossario degli indicatori EVM mostrati nel monitoraggio: per ogni sigla, il nome, cosa
// misura, come si legge il valore e il paragrafo del libro. Testi in italiano.

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
    significato: "Il budget totale approvato del progetto: quanto si è previsto di spendere in tutto.",
    lettura: "È il riferimento di tutti gli altri valori: PV, EV e AC si misurano dentro questo budget.",
    formula: "somma dei budget dei nodi WBS",
    riferimento: "§3.2",
  },
  PV: {
    nome: "Planned Value",
    significato: "Il valore del lavoro che doveva essere completato entro la data di stato, secondo il piano.",
    lettura: "È l'obiettivo: se PV cresce più in fretta di EV, il progetto è indietro.",
    formula: "budget del task × frazione della durata pianificata trascorsa",
    riferimento: "§3.5",
  },
  EV: {
    nome: "Earned Value",
    significato: "Il valore del lavoro effettivamente completato, valorizzato al budget previsto.",
    lettura: "È il lavoro fatto in euro di budget: EV più alto di PV vuol dire avanti rispetto al piano.",
    formula: "budget del task × % fisica completata",
    riferimento: "§3.5",
  },
  AC: {
    nome: "Actual Cost",
    significato: "Il costo effettivamente sostenuto fino alla data di stato (consuntivo).",
    lettura: "Confronta con EV: se AC supera EV, si sta spendendo più del lavoro prodotto.",
    formula: "somma dei costi consuntivi registrati per task",
    riferimento: "§3.5",
  },
  CV: {
    nome: "Cost Variance",
    significato: "Scostamento di costo: quanto il lavoro fatto (EV) vale più o meno di quanto speso (AC).",
    lettura: "Negativo: si spende più del valore prodotto. Positivo: si spende meno.",
    formula: "EV − AC",
    riferimento: "§3.6",
  },
  SV: {
    nome: "Schedule Variance",
    significato: "Scostamento di tempo: quanto lavoro fatto (EV) è avanti o indietro rispetto al piano (PV).",
    lettura: "Negativo: il progetto è in ritardo. Positivo: è avanti.",
    formula: "EV − PV",
    riferimento: "§3.6",
  },
  CPI: {
    nome: "Cost Performance Index",
    significato: "Efficienza di costo: quanto valore si ottiene per ogni euro speso.",
    lettura: "1 è in linea con il budget. Sotto 1 si spende più del previsto. Non è definito se EV o AC sono zero.",
    formula: "EV ÷ AC",
    riferimento: "§3.6",
  },
  SPI: {
    nome: "Schedule Performance Index",
    significato: "Efficienza di tempo: quanto lavoro si completa rispetto a quello previsto.",
    lettura: "1 è in linea con il piano. Sotto 1 il progetto è in ritardo. Non è definito se PV è zero.",
    formula: "EV ÷ PV",
    riferimento: "§3.6",
  },
  ETC: {
    nome: "Estimate To Complete",
    significato: "Il costo che resta da sostenere per finire il lavoro.",
    lettura: "Se il CPI non è definito, si stima a ritmo di piano: il residuo costa quanto previsto.",
    formula: "(BAC − EV) ÷ CPI",
    riferimento: "§3.7",
  },
  EAC: {
    nome: "Estimate At Completion",
    significato: "Il costo finale previsto del progetto, al ritmo attuale di spesa.",
    lettura: "Confrontalo con il BAC: se EAC supera BAC, il progetto finirà sopra budget.",
    formula: "AC + ETC",
    riferimento: "§3.7",
  },
  "EAC ottimistica": {
    nome: "EAC ottimistica",
    significato: "Il costo finale se il residuo procede al ritmo di piano, senza recuperi di efficienza.",
    lettura: "È un limite inferiore ragionevole del costo finale.",
    formula: "AC + (BAC − EV)",
    riferimento: "§3.7",
  },
  VAC: {
    nome: "Variance At Completion",
    significato: "Lo scostamento previsto a fine progetto rispetto al budget.",
    lettura: "Negativo: il progetto costerà più del budget. Positivo: costerà meno.",
    formula: "BAC − EAC",
    riferimento: "§3.8",
  },
  TCPI: {
    nome: "To-Complete Performance Index",
    significato: "L'efficienza che serve sul lavoro residuo per restare nel budget.",
    lettura: "1 è sostenibile. Sopra 1 bisogna essere più efficienti di adesso. Non è definito se BAC − AC non è positivo.",
    formula: "(BAC − EV) ÷ (BAC − AC)",
    riferimento: "§3.8",
  },
};
