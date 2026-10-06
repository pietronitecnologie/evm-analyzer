-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Percentuali di parametro e probabilità dei rischi in intero positivo (0..100).
-- Prima il workbook le scriveva come frazioni (0,15) e la UI come percento (15): un
-- valore ≤ 1 è una frazione e si porta a percento, un valore > 1 è già in percento.
-- Ambiguità nota: un 1% scritto come 1,0 diventa 100%; vedi DECISIONS.md, decisione 62.
UPDATE project_params SET
  overhead_pct     = CASE WHEN overhead_pct <= 1 THEN ROUND(overhead_pct * 100) ELSE ROUND(overhead_pct) END,
  contingency_pct  = CASE WHEN contingency_pct <= 1 THEN ROUND(contingency_pct * 100) ELSE ROUND(contingency_pct) END,
  mgmt_reserve_pct = CASE WHEN mgmt_reserve_pct <= 1 THEN ROUND(mgmt_reserve_pct * 100) ELSE ROUND(mgmt_reserve_pct) END,
  green_threshold  = CASE WHEN green_threshold <= 1 THEN ROUND(green_threshold * 100) ELSE ROUND(green_threshold) END,
  yellow_threshold = CASE WHEN yellow_threshold <= 1 THEN ROUND(yellow_threshold * 100) ELSE ROUND(yellow_threshold) END;

UPDATE risk SET probability_pct = ROUND(probability_pct) WHERE probability_pct IS NOT NULL;
