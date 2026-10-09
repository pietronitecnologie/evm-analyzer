-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Registro unico delle anomalie (Fase 6, §1): le anomalie che il motore calcola già
-- (packages/engine/src) finora comparivano, se comparivano, come liste transitorie
-- per schermata — nessuna persistenza, nessuna accettazione, nessuno storico. Questa
-- tabella le unifica. `UNIQUE` sulla chiave logica rende il ricalcolo idempotente: la
-- stessa anomalia ricalcolata non duplica la riga, così lo stato (`accettata`) non si
-- perde a ogni ricalcolo se la causa non cambia.
CREATE TABLE data_quality_issue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  snapshot_id     INTEGER REFERENCES status_snapshot(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'avviso', 'critico')),
  category        TEXT NOT NULL CHECK (category IN (
                      'baseline', 'metodo_ev', 'costi', 'date', 'perimetro',
                      'import', 'avanzamento', 'riserve', 'agile', 'flusso'
                    )),
  task_id         INTEGER REFERENCES task(id) ON DELETE CASCADE,
  wbs_id          INTEGER REFERENCES wbs(id) ON DELETE CASCADE,
  scope_id        INTEGER REFERENCES scope(id) ON DELETE CASCADE,
  message         TEXT NOT NULL,
  suggestion      TEXT,
  state           TEXT NOT NULL DEFAULT 'aperta' CHECK (state IN ('aperta', 'accettata', 'risolta')),
  accepted_by     TEXT,
  accepted_reason TEXT,
  accepted_at     TEXT,
  resolved_at     TEXT,
  source          TEXT NOT NULL CHECK (source IN ('motore', 'import_workbook', 'import_piano', 'avanzamento', 'resync')),
  created_at      TEXT NOT NULL,
  UNIQUE (project_id, snapshot_id, code, task_id, wbs_id)
);

CREATE INDEX idx_data_quality_issue_project ON data_quality_issue(project_id, state);

-- Stato del punto di stato: una data di stato "finale" non si può più marcare se
-- esistono anomalie critiche aperte (§1.3), salvo un'approvazione esplicita del
-- coordinatore del piano con motivo.
ALTER TABLE status_snapshot ADD COLUMN state TEXT NOT NULL DEFAULT 'provvisorio'
  CHECK (state IN ('bozza', 'provvisorio', 'finale'));
ALTER TABLE status_snapshot ADD COLUMN final_override_by TEXT;
ALTER TABLE status_snapshot ADD COLUMN final_override_reason TEXT;
