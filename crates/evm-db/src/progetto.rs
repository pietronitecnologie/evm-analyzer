// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Creazione di un progetto vuoto e lettura delle sue informazioni di
//! intestazione. Un file `.evmproj` contiene un solo progetto.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::migrations::latest_version;
use crate::{open_and_migrate, tempo};

/// Informazioni di intestazione mostrate nella barra di contesto.
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectInfo {
    pub id: i64,
    pub name: String,
    pub source_type: String,
    pub start_date: Option<String>,
    pub planned_end_date: Option<String>,
    pub status_date: Option<String>,
}

/// Crea un progetto vuoto in un nuovo file `.evmproj`. Il file non deve già esistere.
pub fn crea_progetto(percorso: &Path, nome: &str) -> Result<ProjectInfo, String> {
    if percorso.exists() {
        return Err(format!("il file {} esiste già", percorso.display()));
    }
    let mut conn = open_and_migrate(percorso).map_err(|e| e.to_string())?;
    let risultato = inserisci_vuoto(&mut conn, nome);
    drop(conn);
    match risultato {
        Ok(_) => apri_progetto(percorso),
        Err(e) => {
            let _ = std::fs::remove_file(percorso);
            Err(format!("creazione del progetto: {e}"))
        }
    }
}

fn inserisci_vuoto(conn: &mut Connection, nome: &str) -> rusqlite::Result<i64> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO project (name, source_type, imported_at, schema_version)
         VALUES (?1, 'manuale', ?2, ?3)",
        params![nome, tempo::adesso_iso(), latest_version()],
    )?;
    let id = tx.last_insert_rowid();
    tx.execute("INSERT INTO project_params (project_id) VALUES (?1)", [id])?;
    tx.execute(
        "INSERT INTO calendar (project_id, name, is_default) VALUES (?1, 'Standard', 1)",
        [id],
    )?;
    tx.commit()?;
    Ok(id)
}

/// Apre un `.evmproj` esistente (migrandolo se necessario) e ne legge l'intestazione.
pub fn apri_progetto(percorso: &Path) -> Result<ProjectInfo, String> {
    if !percorso.exists() {
        return Err(format!("il file {} non esiste", percorso.display()));
    }
    let conn = open_and_migrate(percorso).map_err(|e| e.to_string())?;
    leggi_progetto(&conn)
}

/// Legge l'intestazione del progetto contenuto nel database.
pub fn leggi_progetto(conn: &Connection) -> Result<ProjectInfo, String> {
    let base = conn
        .query_row(
            "SELECT p.id, p.name, p.source_type, pp.start_date, pp.planned_end_date
             FROM project p
             LEFT JOIN project_params pp ON pp.project_id = p.id
             ORDER BY p.id
             LIMIT 1",
            [],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "il file non contiene un progetto".to_string())?;

    let status_date: Option<String> = conn
        .query_row(
            "SELECT MAX(status_date) FROM status_snapshot WHERE project_id = ?1",
            [base.0],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(ProjectInfo {
        id: base.0,
        name: base.1,
        source_type: base.2,
        start_date: base.3,
        planned_end_date: base.4,
        status_date,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn crea_un_progetto_vuoto_e_lo_riapre() {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("nuovo.evmproj");
        let creato = crea_progetto(&percorso, "Impianto X").unwrap();
        assert_eq!(creato.name, "Impianto X");
        assert_eq!(creato.source_type, "manuale");
        let riaperto = apri_progetto(&percorso).unwrap();
        assert_eq!(riaperto, creato);
    }

    #[test]
    fn non_sovrascrive_un_file_esistente() {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("esistente.evmproj");
        crea_progetto(&percorso, "Primo").unwrap();
        assert!(crea_progetto(&percorso, "Secondo").is_err());
    }
}
