-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Baseline e change request (Fase 5, §3.5): traccia chi crea una baseline
-- ("Creata da") e chi richiede una variazione ("Richiedente"); stato
-- esplicito della change request (in attesa/approvata/respinta) oltre al
-- solo approved_at/approved_by già presenti, che ora valgono per entrambe le
-- decisioni (chi/quando ha deciso, approvando o respingendo).
ALTER TABLE baseline ADD COLUMN created_by TEXT;

ALTER TABLE change_request ADD COLUMN requested_by TEXT;
ALTER TABLE change_request ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'));

UPDATE change_request SET status = 'approved' WHERE approved_at IS NOT NULL;
