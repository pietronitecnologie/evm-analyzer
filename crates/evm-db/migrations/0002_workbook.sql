-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Dati di input del workbook Impresa Numerica (sez. 5 della specifica): attività
-- della WBS con i dati di stima, e checkpoint del foglio Monitoraggio EVM.
-- Parametri, rischi e sprint usano le tabelle già presenti (project_params, risk,
-- agile_sprint). Le percentuali sono frazioni 0..1, come nel motore.

CREATE TABLE wbs_attivita (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ordine           INTEGER NOT NULL,
  id_attivita      TEXT NOT NULL,
  attivita         TEXT,
  fase             TEXT,
  risorsa          TEXT,
  costo_orario     REAL,
  o                REAL,
  m                REAL,
  p                REAL,
  ore_giorno       REAL,
  materiali        REAL,
  servizi_esterni  REAL,
  data_inizio      TEXT,
  filone           TEXT,
  UNIQUE (project_id, id_attivita)
);

-- Specifica fase 3: i checkpoint del foglio Monitoraggio EVM sono valori di progetto,
-- non per task, e non generano status_snapshot (vedi DECISIONS.md).
CREATE TABLE project_checkpoint (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  ordine           INTEGER NOT NULL,
  date             TEXT NOT NULL,
  note             TEXT,
  pct_planned      REAL,
  pct_actual       REAL,
  ac               REAL,
  UNIQUE (project_id, date)
);
