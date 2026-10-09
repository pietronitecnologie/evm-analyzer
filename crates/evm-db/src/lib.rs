// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

pub mod agile;
pub mod calendario;
pub mod controllo;
pub mod filoni;
pub mod montecarlo;
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
    migrations::migrate(&mut conn)?;
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
