-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Colore facoltativo per colonne e sotto-task della lavagna Kanban (todo.md): una
-- delle chiavi di `src/lib/kanban-colori.ts` (rosso/arancione/giallo/verde/teal/blu/
-- viola/grigio), `NULL` = nessun colore. Validato anche lato Rust (kanban.rs), non
-- solo in UI: il valore arriva qui anche dalla palette comandi/test, non solo dal
-- selettore.
ALTER TABLE kanban_column ADD COLUMN color TEXT;
ALTER TABLE kanban_subtask ADD COLUMN color TEXT;
