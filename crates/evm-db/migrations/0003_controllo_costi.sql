-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Budget assegnato a ciascun nodo WBS (ricevuto, non stimato: la stima dei costi
-- resta fuori dall'ambito). Il budget dei nodi con task si distribuisce sui task.
ALTER TABLE wbs ADD COLUMN bac REAL;
