-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Note e allegati sulle voci di avanzamento (todo.md): `note` su progress_entry è già
-- occupata dal motivo di rifiuto (schermate.rs::respingi) — author_note è la nota di
-- chi registra l'avanzamento, un campo distinto per non perderla a un rifiuto
-- successivo. Gli allegati sono blob nello stesso file .evmproj (non percorsi su
-- disco): il progetto resta un file solo, copiabile/spostabile senza lasciare
-- allegati orfani altrove — stesso principio del resto del progetto (sez. 2).
ALTER TABLE progress_entry ADD COLUMN author_note TEXT;

CREATE TABLE progress_entry_attachment (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  progress_entry_id INTEGER NOT NULL REFERENCES progress_entry(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  mime_type         TEXT,
  size_bytes        INTEGER NOT NULL,
  content           BLOB NOT NULL,
  uploaded_at       TEXT NOT NULL
);

CREATE INDEX idx_progress_entry_attachment_entry ON progress_entry_attachment(progress_entry_id);
