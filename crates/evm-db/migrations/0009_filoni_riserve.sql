-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Filoni e programma (Fase 5, §3.7): un filone a scope variabile alimenta il
-- controllo dei gate (`workstream.variable_scope`, mancante dalla Fase 1); un gate
-- aveva solo descrizione e buffer, non la propria data (`workstream_gate.due_date`),
-- indispensabile per confrontarla con la consegna prevista.
--
-- Buffer e riserve (§3.8): nessuna colonna segnava se un consumo di riserva fosse
-- approvato — serve a RES_MR_UNAPPROVED (motore, già pronto, non ancora letto da
-- nessun comando).
ALTER TABLE workstream ADD COLUMN variable_scope INTEGER NOT NULL DEFAULT 0 CHECK (variable_scope IN (0, 1));
ALTER TABLE workstream_gate ADD COLUMN due_date TEXT;
ALTER TABLE reserve_usage ADD COLUMN approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1));
