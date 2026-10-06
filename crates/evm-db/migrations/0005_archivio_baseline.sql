-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Archiviazione delle baseline: una baseline bloccata non si cancella (§6-bis.4), si
-- archivia. L'archiviazione è l'unica modifica consentita a una baseline bloccata: il
-- trigger di aggiornamento la lascia passare solo se nient'altro cambia.
ALTER TABLE baseline ADD COLUMN archiviata INTEGER NOT NULL DEFAULT 0 CHECK (archiviata IN (0, 1));

DROP TRIGGER trg_baseline_no_update_if_locked;
CREATE TRIGGER trg_baseline_no_update_if_locked
BEFORE UPDATE ON baseline
WHEN OLD.locked = 1 AND NEW.locked = 1
  AND NOT (
    OLD.archiviata = 0 AND NEW.archiviata = 1
    AND NEW.name IS OLD.name AND NEW.kind IS OLD.kind AND NEW.created_at IS OLD.created_at
    AND NEW.bac_direct IS OLD.bac_direct AND NEW.bac_indirect IS OLD.bac_indirect
    AND NEW.bac_contingency IS OLD.bac_contingency AND NEW.bac_total IS OLD.bac_total
  )
BEGIN
  SELECT RAISE(ABORT, 'baseline bloccata: creare una change_request per modificarla');
END;
