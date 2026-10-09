-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Gestione completa degli sprint Agile dall'app (todo.md, non solo lettura da import)
-- e lavagna Kanban. Un task appartiene a UNO sprint Agile O alla lavagna Kanban, mai
-- entrambi: il vincolo di esclusività si applica in Rust (agile.rs), non con un CHECK
-- multi-colonna qui — SQLite non lo applica retroattivamente sulle righe già esistenti
-- quando la colonna si aggiunge con ALTER TABLE.
ALTER TABLE task ADD COLUMN sprint_id INTEGER REFERENCES agile_sprint(id) ON DELETE SET NULL;
ALTER TABLE task ADD COLUMN kanban INTEGER NOT NULL DEFAULT 0 CHECK (kanban IN (0, 1));

-- Le colonne della lavagna sono per progetto (una lavagna sola), non per task: "crea le
-- colonne" nella richiesta è sul tabellone nel suo complesso.
CREATE TABLE kanban_column (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  UNIQUE (project_id, position)
);

-- Le "sotto-task-kanban" sono unità di lavoro sotto un task assegnato alla lavagna
-- (task.kanban = 1): il punteggio (effort_points) è l'unità di sforzo tracciata; una
-- sotto-task in una colonna segnata is_done conta come effort completato — nessuna
-- colonna "completed_at" separata da mantenere in sincrono con lo spostamento.
CREATE TABLE kanban_subtask (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  task_id       INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  column_id     INTEGER NOT NULL REFERENCES kanban_column(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  effort_points REAL NOT NULL DEFAULT 0 CHECK (effort_points >= 0),
  position      INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_kanban_subtask_task ON kanban_subtask(task_id);
CREATE INDEX idx_kanban_subtask_column ON kanban_subtask(column_id);
