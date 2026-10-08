-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Ri-sincronizzazione del piano (Fase 4, §6): uno status_snapshot generato da
-- resync_plan ha source = 'resync', distinto da 'import_piano' (il primo
-- import) e da 'manuale'/'feeder' (avanzamento inserito nell'app). SQLite non
-- permette di alterare un CHECK esistente: la tabella si ricrea.
CREATE TABLE status_snapshot_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  status_date TEXT NOT NULL,
  label       TEXT,
  source      TEXT NOT NULL CHECK (source IN ('import_piano', 'feeder', 'manuale', 'resync'))
);

INSERT INTO status_snapshot_new (id, project_id, status_date, label, source)
  SELECT id, project_id, status_date, label, source FROM status_snapshot;

DROP TABLE status_snapshot;
ALTER TABLE status_snapshot_new RENAME TO status_snapshot;
