// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Filoni e programma (specifica Fase 5, §3.7): `workstream`/`workstream_gate`
//! esistevano dalla Fase 1 ma nessun import li popola (il foglio "Agile" del
//! workbook non esporta i filoni, solo gli sprint) e nessun comando li leggeva o
//! scriveva — qui CRUD manuale, come già fatto per `agile_sprint`/`kanban_flow`
//! quando mancava una fonte automatica. Gli indici EVM per filone si calcolano nel
//! motore TypeScript a partire da `dati_monitoraggio` (che ora porta anche il nome
//! del filone di ogni task, come già fa per il WBS).

use rusqlite::{params, Connection};
use serde::Serialize;

type Esito<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

const TIPI: [&str; 4] = ["costruzione", "automazione", "software", "altro"];
const METODI_MISURA: [&str; 4] = ["unita_fisiche", "milestone_pesate", "story_point", "flusso"];

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FiloneRiga {
    pub id: i64,
    pub nome: String,
    pub tipo: String,
    pub metodo_misura: String,
    pub planned_unit_value: Option<f64>,
    pub scope_variabile: bool,
}

pub fn elenco_filoni(conn: &Connection, pid: i64) -> Esito<Vec<FiloneRiga>> {
    let mut st = conn
        .prepare(
            "SELECT id, name, kind, measure_method, planned_unit_value, variable_scope
             FROM workstream WHERE project_id = ?1 ORDER BY name",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(FiloneRiga {
                id: r.get(0)?,
                nome: r.get(1)?,
                tipo: r.get(2)?,
                metodo_misura: r.get(3)?,
                planned_unit_value: r.get(4)?,
                scope_variabile: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

pub fn crea_filone(
    conn: &Connection,
    pid: i64,
    nome: &str,
    tipo: &str,
    metodo_misura: &str,
    planned_unit_value: Option<f64>,
    scope_variabile: bool,
) -> Esito<i64> {
    if nome.trim().is_empty() {
        return Err("il nome del filone è obbligatorio".into());
    }
    if !TIPI.contains(&tipo) {
        return Err(format!("tipo di filone non valido: {tipo}"));
    }
    if !METODI_MISURA.contains(&metodo_misura) {
        return Err(format!("metodo di misura non valido: {metodo_misura}"));
    }
    if let Some(v) = planned_unit_value {
        if !v.is_finite() || v < 0.0 {
            return Err("il valore pianificato per unità deve essere positivo o zero".into());
        }
    }
    // Il motore raggruppa gli indici per filone sul nome (stessa convenzione del codice
    // WBS), non sull'id: due filoni omonimi farebbero confluire i loro dati in un unico
    // gruppo nel rollup EVM.
    let gia_presente: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workstream WHERE project_id = ?1 AND name = ?2",
            params![pid, nome.trim()],
            |r| r.get(0),
        )
        .map_err(e)?;
    if gia_presente > 0 {
        return Err(format!("esiste già un filone chiamato «{}»", nome.trim()));
    }
    conn.execute(
        "INSERT INTO workstream (project_id, name, kind, measure_method, planned_unit_value, variable_scope)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![pid, nome.trim(), tipo, metodo_misura, planned_unit_value, scope_variabile as i64],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Assegna (o rimuove, con `None`) il filone di un task.
pub fn assegna_task_a_filone(conn: &Connection, pid: i64, task_uid: &str, filone_id: Option<i64>) -> Esito<()> {
    if let Some(fid) = filone_id {
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM workstream WHERE id = ?1 AND project_id = ?2", params![fid, pid], |r| r.get(0))
            .map_err(e)?;
        if n == 0 {
            return Err("filone non trovato nel progetto".into());
        }
    }
    let cambiate = conn
        .execute(
            "UPDATE task SET workstream_id = ?3 WHERE project_id = ?1 AND uid_source = ?2",
            params![pid, task_uid, filone_id],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("task non trovato nel progetto".into());
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GateRiga {
    pub id: i64,
    pub da_filone_id: i64,
    pub da_filone: String,
    pub a_filone_id: i64,
    pub a_filone: String,
    pub descrizione: Option<String>,
    pub data_gate: Option<String>,
    pub buffer_giorni: f64,
}

pub fn elenco_gate(conn: &Connection, pid: i64) -> Esito<Vec<GateRiga>> {
    let mut st = conn
        .prepare(
            "SELECT g.id, g.from_workstream_id, wa.name, g.to_workstream_id, wb.name, g.description, g.due_date, g.buffer_days
             FROM workstream_gate g
             JOIN workstream wa ON wa.id = g.from_workstream_id
             JOIN workstream wb ON wb.id = g.to_workstream_id
             WHERE g.project_id = ?1
             ORDER BY g.due_date IS NULL, g.due_date, g.id",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(GateRiga {
                id: r.get(0)?,
                da_filone_id: r.get(1)?,
                da_filone: r.get(2)?,
                a_filone_id: r.get(3)?,
                a_filone: r.get(4)?,
                descrizione: r.get(5)?,
                data_gate: r.get(6)?,
                buffer_giorni: r.get(7)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

pub fn crea_gate(
    conn: &Connection,
    pid: i64,
    da_filone_id: i64,
    a_filone_id: i64,
    descrizione: Option<&str>,
    data_gate: Option<&str>,
    buffer_giorni: f64,
) -> Esito<i64> {
    if da_filone_id == a_filone_id {
        return Err("un gate deve collegare due filoni diversi".into());
    }
    for fid in [da_filone_id, a_filone_id] {
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM workstream WHERE id = ?1 AND project_id = ?2", params![fid, pid], |r| r.get(0))
            .map_err(e)?;
        if n == 0 {
            return Err("filone non trovato nel progetto".into());
        }
    }
    if !buffer_giorni.is_finite() || buffer_giorni < 0.0 {
        return Err("il buffer del gate deve essere positivo o zero".into());
    }
    let descrizione = descrizione.map(str::trim).filter(|s| !s.is_empty());
    conn.execute(
        "INSERT INTO workstream_gate (project_id, from_workstream_id, to_workstream_id, description, due_date, buffer_days)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![pid, da_filone_id, a_filone_id, descrizione, data_gate, buffer_giorni],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progetto::crea_progetto;
    use tempfile::tempdir;

    fn progetto() -> (tempfile::TempDir, Connection, i64) {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("p.evmproj");
        let info = crea_progetto(&percorso, "Prova").unwrap();
        let conn = crate::open_and_migrate(&percorso).unwrap();
        (dir, conn, info.id)
    }

    #[test]
    fn filoni_si_creano_e_si_elencano_con_validazione() {
        let (_d, conn, pid) = progetto();
        assert!(crea_filone(&conn, pid, "", "software", "flusso", None, false).is_err(), "nome obbligatorio");
        assert!(crea_filone(&conn, pid, "X", "altro-non-valido", "flusso", None, false).is_err(), "tipo non valido");
        assert!(crea_filone(&conn, pid, "X", "software", "boh", None, false).is_err(), "metodo non valido");
        let id = crea_filone(&conn, pid, "Backend", "software", "story_point", None, true).unwrap();
        let elenco = elenco_filoni(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 1);
        assert_eq!(elenco[0].id, id);
        assert!(elenco[0].scope_variabile);
        assert!(crea_filone(&conn, pid, "Backend", "software", "story_point", None, false).is_err(), "nome duplicato");
    }

    #[test]
    fn assegnazione_task_a_filone_valida_appartenenza() {
        let (_d, conn, pid) = progetto();
        conn.execute("INSERT INTO task (project_id, uid_source, name) VALUES (?1, '1', 'Task A')", [pid]).unwrap();
        let filone = crea_filone(&conn, pid, "Backend", "software", "story_point", None, false).unwrap();
        assert!(assegna_task_a_filone(&conn, pid, "9", Some(filone)).is_err(), "task inesistente");
        assert!(assegna_task_a_filone(&conn, pid, "1", Some(999)).is_err(), "filone inesistente");
        assegna_task_a_filone(&conn, pid, "1", Some(filone)).unwrap();
        let wid: Option<i64> = conn.query_row("SELECT workstream_id FROM task WHERE uid_source = '1'", [], |r| r.get(0)).unwrap();
        assert_eq!(wid, Some(filone));
        assegna_task_a_filone(&conn, pid, "1", None).unwrap();
        let wid: Option<i64> = conn.query_row("SELECT workstream_id FROM task WHERE uid_source = '1'", [], |r| r.get(0)).unwrap();
        assert_eq!(wid, None);
    }

    #[test]
    fn gate_si_creano_e_si_elencano_in_ordine_di_data() {
        let (_d, conn, pid) = progetto();
        let a = crea_filone(&conn, pid, "Fondazioni", "costruzione", "unita_fisiche", None, false).unwrap();
        let b = crea_filone(&conn, pid, "Strutture", "costruzione", "unita_fisiche", None, false).unwrap();
        assert!(crea_gate(&conn, pid, a, a, None, None, 5.0).is_err(), "stesso filone");
        assert!(crea_gate(&conn, pid, a, b, None, None, -1.0).is_err(), "buffer negativo");
        crea_gate(&conn, pid, a, b, Some("Consegna fondazioni"), Some("2026-03-01"), 5.0).unwrap();
        crea_gate(&conn, pid, a, b, None, Some("2026-02-01"), 0.0).unwrap();
        let elenco = elenco_gate(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 2);
        assert_eq!(elenco[0].data_gate.as_deref(), Some("2026-02-01"), "più vicina prima");
        assert_eq!(elenco[1].da_filone, "Fondazioni");
        assert_eq!(elenco[1].a_filone, "Strutture");
    }
}
