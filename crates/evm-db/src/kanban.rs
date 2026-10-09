// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Lavagna Kanban (todo.md, oltre le Fasi 5/6): colonne configurabili e sotto-task
//! sotto un task assegnato alla lavagna (`task.kanban = 1`, vedi `agile.rs`). Ogni
//! sotto-task porta un punteggio di effort; una sotto-task in una colonna segnata
//! "done" conta come effort completato — `riepilogo_effort` lo aggrega per task, per
//! la scheda Kanban. Nessun collegamento automatico all'avanzamento EVM del task
//! (`progress_entry`): l'effort qui è un segnale di tracciamento separato, come il
//! flusso o la velocity — lo stesso principio della scheda Flusso in `agile.rs`.

use rusqlite::{params, Connection};
use serde::Serialize;

type Esito<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColonnaKanban {
    pub id: i64,
    pub nome: String,
    pub posizione: i64,
    pub is_done: bool,
}

pub fn colonne(conn: &Connection, pid: i64) -> Esito<Vec<ColonnaKanban>> {
    let mut st = conn
        .prepare("SELECT id, name, position, is_done FROM kanban_column WHERE project_id = ?1 ORDER BY position")
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(ColonnaKanban { id: r.get(0)?, nome: r.get(1)?, posizione: r.get(2)?, is_done: r.get::<_, i64>(3)? != 0 })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

/// Crea una colonna in coda alla lavagna (posizione = ultima + 1).
pub fn crea_colonna(conn: &Connection, pid: i64, nome: &str, is_done: bool) -> Esito<i64> {
    if nome.trim().is_empty() {
        return Err("il nome della colonna è obbligatorio".into());
    }
    let prossima: i64 = conn
        .query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM kanban_column WHERE project_id = ?1", [pid], |r| r.get(0))
        .map_err(e)?;
    conn.execute(
        "INSERT INTO kanban_column (project_id, name, position, is_done) VALUES (?1, ?2, ?3, ?4)",
        params![pid, nome.trim(), prossima, is_done as i64],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

pub fn rinomina_colonna(conn: &Connection, pid: i64, id: i64, nome: &str, is_done: bool) -> Esito<()> {
    if nome.trim().is_empty() {
        return Err("il nome della colonna è obbligatorio".into());
    }
    let cambiate = conn
        .execute(
            "UPDATE kanban_column SET name = ?3, is_done = ?4 WHERE id = ?1 AND project_id = ?2",
            params![id, pid, nome.trim(), is_done as i64],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("colonna non trovata".into());
    }
    Ok(())
}

/// Riordina le colonne secondo l'elenco di id dato (l'ordine della lista diventa la
/// posizione): non serve passare tutte le colonne, solo l'ordine desiderato. Due
/// passaggi (prima a posizioni temporanee negative, poi a quelle finali): un
/// aggiornamento diretto a una posizione già occupata da un'altra colonna violerebbe
/// il vincolo UNIQUE a metà transazione.
pub fn riordina_colonne(conn: &mut Connection, pid: i64, ordine: &[i64]) -> Esito<()> {
    let tx = conn.transaction().map_err(e)?;
    for (indice, id) in ordine.iter().enumerate() {
        let cambiate = tx
            .execute(
                "UPDATE kanban_column SET position = ?3 WHERE id = ?1 AND project_id = ?2",
                params![id, pid, -(indice as i64) - 1],
            )
            .map_err(e)?;
        if cambiate == 0 {
            return Err(format!("colonna {id} non trovata"));
        }
    }
    for (posizione, id) in ordine.iter().enumerate() {
        tx.execute(
            "UPDATE kanban_column SET position = ?3 WHERE id = ?1 AND project_id = ?2",
            params![id, pid, posizione as i64],
        )
        .map_err(e)?;
    }
    tx.commit().map_err(e)
}

/// Elimina una colonna: rifiuta se contiene ancora sotto-task, per non perderle in
/// silenzio (a differenza del task padre, qui non c'è un posto "senza colonna" dove
/// spostarle automaticamente).
pub fn elimina_colonna(conn: &Connection, pid: i64, id: i64) -> Esito<()> {
    let n_sottotask: i64 = conn
        .query_row("SELECT COUNT(*) FROM kanban_subtask WHERE column_id = ?1", [id], |r| r.get(0))
        .map_err(e)?;
    if n_sottotask > 0 {
        return Err(format!("la colonna ha ancora {n_sottotask} sotto-task: spostale prima di eliminarla"));
    }
    let cambiate = conn
        .execute("DELETE FROM kanban_column WHERE id = ?1 AND project_id = ?2", params![id, pid])
        .map_err(e)?;
    if cambiate == 0 {
        return Err("colonna non trovata".into());
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SottoTaskKanban {
    pub id: i64,
    pub task_uid: String,
    pub task_nome: String,
    pub colonna_id: i64,
    pub nome: String,
    pub punti_effort: f64,
    pub posizione: i64,
}

/// Tutte le sotto-task della lavagna (di ogni task assegnato al kanban): la scheda
/// le raggruppa per colonna lato frontend, qui è un elenco solo ordinato.
pub fn sottotask_elenco(conn: &Connection, pid: i64) -> Esito<Vec<SottoTaskKanban>> {
    let mut st = conn
        .prepare(
            "SELECT k.id, t.uid_source, t.name, k.column_id, k.name, k.effort_points, k.position
             FROM kanban_subtask k JOIN task t ON t.id = k.task_id
             WHERE k.project_id = ?1
             ORDER BY k.column_id, k.position",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(SottoTaskKanban {
                id: r.get(0)?,
                task_uid: r.get(1)?,
                task_nome: r.get(2)?,
                colonna_id: r.get(3)?,
                nome: r.get(4)?,
                punti_effort: r.get(5)?,
                posizione: r.get(6)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

fn task_kanban_id_di(conn: &Connection, pid: i64, uid: &str) -> Esito<i64> {
    conn.query_row(
        "SELECT id FROM task WHERE project_id = ?1 AND uid_source = ?2 AND is_summary = 0 AND kanban = 1",
        params![pid, uid],
        |r| r.get(0),
    )
    .map_err(|_| format!("task UID {uid} non trovato o non assegnato alla lavagna Kanban"))
}

/// Crea una sotto-task in coda alla colonna scelta. Il task deve già essere assegnato
/// alla lavagna (vedi `agile::assegna_task_a_kanban`): una sotto-task non esiste senza
/// un task "contenitore".
pub fn crea_sottotask(conn: &Connection, pid: i64, task_uid: &str, colonna_id: i64, nome: &str, punti_effort: f64) -> Esito<i64> {
    let task_id = task_kanban_id_di(conn, pid, task_uid)?;
    if nome.trim().is_empty() {
        return Err("il nome della sotto-task è obbligatorio".into());
    }
    if !punti_effort.is_finite() || punti_effort < 0.0 {
        return Err("il punteggio deve essere un numero positivo o zero".into());
    }
    let esiste_colonna: i64 = conn
        .query_row("SELECT COUNT(*) FROM kanban_column WHERE id = ?1 AND project_id = ?2", params![colonna_id, pid], |r| r.get(0))
        .map_err(e)?;
    if esiste_colonna == 0 {
        return Err("colonna non trovata".into());
    }
    let prossima: i64 = conn
        .query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM kanban_subtask WHERE column_id = ?1", [colonna_id], |r| r.get(0))
        .map_err(e)?;
    conn.execute(
        "INSERT INTO kanban_subtask (project_id, task_id, column_id, name, effort_points, position, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![pid, task_id, colonna_id, nome.trim(), punti_effort, prossima, crate::tempo::adesso_iso()],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Sposta una sotto-task in un'altra colonna (o nella stessa, per riordinarla), in
/// coda alla colonna di destinazione — un trascinamento sulla lavagna, lato UI.
pub fn sposta_sottotask(conn: &Connection, pid: i64, id: i64, colonna_id: i64) -> Esito<()> {
    let esiste_colonna: i64 = conn
        .query_row("SELECT COUNT(*) FROM kanban_column WHERE id = ?1 AND project_id = ?2", params![colonna_id, pid], |r| r.get(0))
        .map_err(e)?;
    if esiste_colonna == 0 {
        return Err("colonna non trovata".into());
    }
    let prossima: i64 = conn
        .query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM kanban_subtask WHERE column_id = ?1", [colonna_id], |r| r.get(0))
        .map_err(e)?;
    let cambiate = conn
        .execute(
            "UPDATE kanban_subtask SET column_id = ?3, position = ?4 WHERE id = ?1 AND project_id = ?2",
            params![id, pid, colonna_id, prossima],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("sotto-task non trovata".into());
    }
    Ok(())
}

pub fn modifica_sottotask(conn: &Connection, pid: i64, id: i64, nome: &str, punti_effort: f64) -> Esito<()> {
    if nome.trim().is_empty() {
        return Err("il nome della sotto-task è obbligatorio".into());
    }
    if !punti_effort.is_finite() || punti_effort < 0.0 {
        return Err("il punteggio deve essere un numero positivo o zero".into());
    }
    let cambiate = conn
        .execute(
            "UPDATE kanban_subtask SET name = ?3, effort_points = ?4 WHERE id = ?1 AND project_id = ?2",
            params![id, pid, nome.trim(), punti_effort],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("sotto-task non trovata".into());
    }
    Ok(())
}

pub fn elimina_sottotask(conn: &Connection, pid: i64, id: i64) -> Esito<()> {
    let cambiate = conn
        .execute("DELETE FROM kanban_subtask WHERE id = ?1 AND project_id = ?2", params![id, pid])
        .map_err(e)?;
    if cambiate == 0 {
        return Err("sotto-task non trovata".into());
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RiepilogoEffortTask {
    pub task_uid: String,
    pub task_nome: String,
    pub punti_totali: f64,
    pub punti_completati: f64,
}

/// Per ogni task assegnato alla lavagna con almeno una sotto-task: punti totali e
/// punti nelle colonne segnate "done" — l'effort speso, per la scheda Kanban.
pub fn riepilogo_effort(conn: &Connection, pid: i64) -> Esito<Vec<RiepilogoEffortTask>> {
    let mut st = conn
        .prepare(
            "SELECT t.uid_source, t.name, SUM(k.effort_points),
                    SUM(CASE WHEN c.is_done = 1 THEN k.effort_points ELSE 0 END)
             FROM kanban_subtask k
             JOIN task t ON t.id = k.task_id
             JOIN kanban_column c ON c.id = k.column_id
             WHERE k.project_id = ?1
             GROUP BY t.id
             ORDER BY CAST(t.uid_source AS INTEGER), t.uid_source",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(RiepilogoEffortTask {
                task_uid: r.get(0)?,
                task_nome: r.get(1)?,
                punti_totali: r.get(2)?,
                punti_completati: r.get(3)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agile::assegna_task_a_kanban;
    use crate::progetto::crea_progetto;
    use crate::task::{crea_task, NuovoTask};
    use tempfile::tempdir;

    fn progetto_con_task_kanban() -> (tempfile::TempDir, Connection, i64, String) {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("p.evmproj");
        let info = crea_progetto(&percorso, "Prova").unwrap();
        let mut conn = crate::open_and_migrate(&percorso).unwrap();
        let riga = crea_task(&mut conn, info.id, &NuovoTask { nome: "Attività kanban".into(), ..Default::default() }).unwrap();
        assegna_task_a_kanban(&conn, info.id, &riga.uid, true).unwrap();
        (dir, conn, info.id, riga.uid)
    }

    #[test]
    fn le_colonne_si_creano_si_riordinano_e_non_si_eliminano_se_non_vuote() {
        let (_d, mut conn, pid, uid) = progetto_con_task_kanban();
        let a = crea_colonna(&conn, pid, "To do", false).unwrap();
        let b = crea_colonna(&conn, pid, "Done", true).unwrap();
        assert_eq!(colonne(&conn, pid).unwrap().iter().map(|c| c.nome.clone()).collect::<Vec<_>>(), vec!["To do", "Done"]);

        riordina_colonne(&mut conn, pid, &[b, a]).unwrap();
        assert_eq!(colonne(&conn, pid).unwrap()[0].nome, "Done");

        crea_sottotask(&conn, pid, &uid, a, "Disegnare lo schema", 3.0).unwrap();
        assert!(elimina_colonna(&conn, pid, a).is_err(), "colonna non vuota");
    }

    #[test]
    fn le_sotto_task_si_creano_si_spostano_e_l_effort_si_riepiloga_per_task() {
        let (_d, conn, pid, uid) = progetto_con_task_kanban();
        let todo = crea_colonna(&conn, pid, "To do", false).unwrap();
        let done = crea_colonna(&conn, pid, "Done", true).unwrap();

        let s1 = crea_sottotask(&conn, pid, &uid, todo, "Schema elettrico", 5.0).unwrap();
        crea_sottotask(&conn, pid, &uid, todo, "Lista materiali", 2.0).unwrap();

        let riepilogo = riepilogo_effort(&conn, pid).unwrap();
        assert_eq!(riepilogo[0].punti_totali, 7.0);
        assert_eq!(riepilogo[0].punti_completati, 0.0);

        sposta_sottotask(&conn, pid, s1, done).unwrap();
        let riepilogo = riepilogo_effort(&conn, pid).unwrap();
        assert_eq!(riepilogo[0].punti_completati, 5.0, "la colonna Done conta come completato");

        modifica_sottotask(&conn, pid, s1, "Schema elettrico unifilare", 6.0).unwrap();
        assert_eq!(riepilogo_effort(&conn, pid).unwrap()[0].punti_totali, 8.0);

        elimina_sottotask(&conn, pid, s1).unwrap();
        assert_eq!(riepilogo_effort(&conn, pid).unwrap()[0].punti_totali, 2.0);
    }

    #[test]
    fn una_sotto_task_richiede_un_task_gia_assegnato_al_kanban() {
        let (_d, conn, pid, _uid) = progetto_con_task_kanban();
        let col = crea_colonna(&conn, pid, "To do", false).unwrap();
        assert!(crea_sottotask(&conn, pid, "999", col, "Fantasma", 1.0).is_err());
    }
}
