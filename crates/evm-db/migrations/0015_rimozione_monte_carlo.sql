-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- La funzione Monte Carlo (pannello condiviso Forecast/Agile, tabella
-- `monte_carlo_run` di 0001_schema_iniziale.sql) è stata rimossa su richiesta
-- dell'utente: nessuno la usava. Non resta alcun comando Tauri né modulo Rust
-- che la legga o scriva: la tabella si elimina per non lasciare schema morto.
DROP TABLE monte_carlo_run;
