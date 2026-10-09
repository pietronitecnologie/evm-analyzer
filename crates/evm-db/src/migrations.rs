// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Migrazioni versionate con `PRAGMA user_version` (sez. 2 del prompt di
//! sviluppo). Ogni voce di [`MIGRATIONS`] porta il database dalla versione
//! precedente alla propria; le migrazioni già applicate vengono saltate.

use rusqlite::{Connection, Result};

struct Migration {
    version: i64,
    #[allow(dead_code)]
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "0001_schema_iniziale",
        sql: include_str!("../migrations/0001_schema_iniziale.sql"),
    },
    Migration {
        version: 2,
        name: "0002_workbook",
        sql: include_str!("../migrations/0002_workbook.sql"),
    },
    Migration {
        version: 3,
        name: "0003_controllo_costi",
        sql: include_str!("../migrations/0003_controllo_costi.sql"),
    },
    Migration {
        version: 4,
        name: "0004_percentuali_intere",
        sql: include_str!("../migrations/0004_percentuali_intere.sql"),
    },
    Migration {
        version: 5,
        name: "0005_archivio_baseline",
        sql: include_str!("../migrations/0005_archivio_baseline.sql"),
    },
    Migration {
        version: 6,
        name: "0006_resync",
        sql: include_str!("../migrations/0006_resync.sql"),
    },
    Migration {
        version: 7,
        name: "0007_baseline_change_request",
        sql: include_str!("../migrations/0007_baseline_change_request.sql"),
    },
    Migration {
        version: 8,
        name: "0008_backlog_agile",
        sql: include_str!("../migrations/0008_backlog_agile.sql"),
    },
    Migration {
        version: 9,
        name: "0009_filoni_riserve",
        sql: include_str!("../migrations/0009_filoni_riserve.sql"),
    },
    Migration {
        version: 10,
        name: "0010_qualita_dati",
        sql: include_str!("../migrations/0010_qualita_dati.sql"),
    },
    Migration {
        version: 11,
        name: "0011_avanzamento_allegati",
        sql: include_str!("../migrations/0011_avanzamento_allegati.sql"),
    },
    Migration {
        version: 12,
        name: "0012_autenticazione",
        sql: include_str!("../migrations/0012_autenticazione.sql"),
    },
    Migration {
        version: 13,
        name: "0013_agile_kanban",
        sql: include_str!("../migrations/0013_agile_kanban.sql"),
    },
    Migration {
        version: 14,
        name: "0014_kanban_colori",
        sql: include_str!("../migrations/0014_kanban_colori.sql"),
    },
    Migration {
        version: 15,
        name: "0015_rimozione_monte_carlo",
        sql: include_str!("../migrations/0015_rimozione_monte_carlo.sql"),
    },
];

/// Versione di schema più recente conosciuta da questo binario.
pub fn latest_version() -> i64 {
    MIGRATIONS.iter().map(|m| m.version).max().unwrap_or(0)
}

/// Applica tutte le migrazioni non ancora eseguite, in ordine di versione.
/// Ogni migrazione gira nella propria transazione: se falliscono le
/// istruzioni, `user_version` resta a quella precedente (nessuna metà
/// migrazione applicata in modo silenzioso).
pub fn migrate(conn: &mut Connection) -> Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    let mut pending: Vec<&Migration> = MIGRATIONS.iter().filter(|m| m.version > current).collect();
    pending.sort_by_key(|m| m.version);

    for migration in pending {
        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        conn
    }

    #[test]
    fn migra_un_database_vuoto_alla_versione_piu_recente() {
        let mut conn = open_memory();
        migrate(&mut conn).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, latest_version());
    }

    #[test]
    fn e_idempotente() {
        let mut conn = open_memory();
        migrate(&mut conn).unwrap();
        // Una seconda chiamata non deve ri-eseguire lo schema (altrimenti
        // "table already exists" farebbe fallire il test).
        migrate(&mut conn).unwrap();
    }

    #[test]
    fn crea_le_tabelle_principali() {
        let mut conn = open_memory();
        migrate(&mut conn).unwrap();
        for table in [
            "project",
            "task",
            "baseline",
            "progress_entry",
            "user_profile",
            "scope",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "tabella mancante: {table}");
        }
    }

    #[test]
    fn blocca_la_modifica_di_una_baseline_bloccata() {
        let mut conn = open_memory();
        migrate(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO project (id, name, source_type) VALUES (1, 'Progetto test', 'manuale')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO baseline (id, project_id, name, kind, created_at, locked)
             VALUES (1, 1, 'Startup', 'startup', '2026-01-01T00:00:00Z', 1)",
            [],
        )
        .unwrap();

        let result = conn.execute("UPDATE baseline SET name = 'Rinominata' WHERE id = 1", []);
        assert!(
            result.is_err(),
            "la baseline bloccata non doveva poter essere modificata"
        );

        let result = conn.execute("DELETE FROM baseline WHERE id = 1", []);
        assert!(
            result.is_err(),
            "la baseline bloccata non doveva poter essere eliminata"
        );
    }

    #[test]
    fn permette_di_modificare_una_baseline_non_bloccata() {
        let mut conn = open_memory();
        migrate(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO project (id, name, source_type) VALUES (1, 'Progetto test', 'manuale')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO baseline (id, project_id, name, kind, created_at, locked)
             VALUES (1, 1, 'Stima', 'stima', '2026-01-01T00:00:00Z', 0)",
            [],
        )
        .unwrap();

        conn.execute(
            "UPDATE baseline SET name = 'Stima rivista' WHERE id = 1",
            [],
        )
        .unwrap();
    }
}
