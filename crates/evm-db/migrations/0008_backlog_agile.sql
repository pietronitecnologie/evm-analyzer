-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Backlog residuo (Fase 5, §3.9): `agileMetrics` del motore richiede un totale di
-- story point residui per calcolare sprint residui/EAC tempo/EAC costo, ma nessuna
-- tabella lo portava (gli sprint hanno solo SP pianificati/completati per sprint
-- passato, non il backlog totale ancora da fare). Nessuna fonte di import lo
-- fornisce: si imposta a mano nella scheda Sprint.
ALTER TABLE project_params ADD COLUMN backlog_sp REAL;
