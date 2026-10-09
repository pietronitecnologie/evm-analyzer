// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

pub mod agile;
pub mod auth;
pub mod calendario;
pub mod controllo;
pub mod filoni;
pub mod kanban;
pub mod qualita;
pub mod risorse;
pub mod import;
pub mod migrations;
pub mod progetto;
pub mod schermate;
pub mod task;
pub mod workbook;
pub mod export;
pub mod tempo;

use std::path::Path;

use rusqlite::Connection;

/// Apre (o crea) il file `.evmproj` del progetto e lo porta all'ultima
/// versione di schema. Un file per progetto (sez. 2).
pub fn open_and_migrate(path: &Path) -> rusqlite::Result<Connection> {
    let mut conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", true)?;
    // Ogni comando apre una propria connessione sullo stesso file (apri_con_id in
    // src-tauri): più schermate/la barra di contesto ne tengono aperte diverse insieme
    // in lettura, e una scrittura prende un lock esclusivo per la durata della sua
    // transazione. Senza busy_timeout, una lettura che arriva in quella finestra fallisce
    // subito con SQLITE_BUSY invece di aspettare — todo.md "BUG" (un inserimento in DB
    // che a volte "rompe" qualcosa). 5 s è ampiamente sufficiente per le transazioni di
    // questa app (nessuna scrittura itera su migliaia di righe in un singolo comando).
    conn.pragma_update(None, "busy_timeout", 5000)?;
    migrations::migrate(&mut conn)?;
    auth::assicura_utente_default(&conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn apre_e_migra_un_file_evmproj_su_disco() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("progetto-test.evmproj");

        {
            let conn = open_and_migrate(&path).unwrap();
            let version: i64 = conn
                .query_row("PRAGMA user_version", [], |r| r.get(0))
                .unwrap();
            assert_eq!(version, migrations::latest_version());
        }

        // Riapertura: deve restare idempotente e non perdere lo schema.
        let conn = open_and_migrate(&path).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name = 'project'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
