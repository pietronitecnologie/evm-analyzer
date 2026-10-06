// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Creazione e lettura dei task da interfaccia. Un task creato a mano ha
//! UID numerico progressivo (dopo il massimo già presente) e la stessa
//! struttura di quelli importati; ogni creazione va nel log di audit.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::calendario;
use crate::tempo::{self, giorno_da_iso};

/// Dati inseriti dall'utente nel modulo "Nuovo task".
#[derive(Debug, Default)]
pub struct NuovoTask {
    pub nome: String,
    /// Codice WBS del nodo di appartenenza (es. `1.2`); facoltativo.
    pub codice_wbs: Option<String>,
    pub inizio: Option<String>,
    pub fine: Option<String>,
    pub durata_giorni: Option<f64>,
    pub milestone: bool,
}

/// Riga dell'elenco task mostrato nella schermata.
#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskRiga {
    pub id: i64,
    pub uid: String,
    pub nome: String,
    pub wbs: Option<String>,
    pub inizio: Option<String>,
    pub fine: Option<String>,
    pub durata_giorni: Option<f64>,
    pub milestone: bool,
    pub riepilogo: bool,
}

/// Crea un task nel progetto. Valida i dati prima di scrivere: nome
/// obbligatorio, date ISO valide, fine non precedente all'inizio, WBS esistente.
pub fn crea_task(conn: &mut Connection, project_id: i64, input: &NuovoTask) -> Result<TaskRiga, String> {
    let nome = input.nome.trim();
    if nome.is_empty() {
        return Err("il nome del task è obbligatorio".into());
    }
    let inizio = match input.inizio.as_deref().filter(|v| !v.trim().is_empty()) {
        Some(v) => Some(tempo::normalizza_data(v).ok_or_else(|| format!("data di inizio non valida: {v}"))?),
        None => None,
    };
    let fine = match input.fine.as_deref().filter(|v| !v.trim().is_empty()) {
        Some(v) => Some(tempo::normalizza_data(v).ok_or_else(|| format!("data di fine non valida: {v}"))?),
        None => None,
    };
    if let (Some(i), Some(f)) = (&inizio, &fine) {
        if f < i {
            return Err("la data di fine precede quella di inizio".into());
        }
    }
    if let Some(d) = input.durata_giorni {
        if !d.is_finite() || d < 0.0 {
            return Err("la durata deve essere un numero positivo".into());
        }
    }

    // Durate e date si collegano sui giorni lavorativi dello schema del progetto:
    // inizio + durata calcola la fine; inizio + fine calcola la durata.
    let regole = calendario::regole_predefinite(conn, project_id)?;
    let (fine, durata_giorni) = match (&inizio, &fine, input.durata_giorni) {
        (Some(i), None, Some(d)) => (Some(calendario::data_fine(&regole, i, d)?), Some(d)),
        (Some(i), Some(f), None) => {
            let (Some(gi), Some(gf)) = (giorno_da_iso(i), giorno_da_iso(f)) else {
                return Err("date non valide".into());
            };
            (fine.clone(), Some(regole.giorni_lavorativi(gi, gf) as f64))
        }
        _ => (fine.clone(), input.durata_giorni),
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let wbs_id: Option<i64> = match input.codice_wbs.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(codice) => Some(
            tx.query_row(
                "SELECT id FROM wbs WHERE project_id = ?1 AND code = ?2",
                params![project_id, codice],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("codice WBS «{codice}» non presente nel progetto"))?,
        ),
        None => None,
    };

    let uid_successivo: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(CAST(uid_source AS INTEGER)), 0) + 1 FROM task WHERE project_id = ?1",
            [project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let uid = uid_successivo.to_string();

    tx.execute(
        "INSERT INTO task (project_id, wbs_id, uid_source, name, is_milestone,
                           start_planned, finish_planned, duration_planned_days)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            project_id,
            wbs_id,
            uid,
            nome,
            input.milestone as i64,
            inizio,
            fine,
            durata_giorni,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();

    let dopo = serde_json::json!({
        "uid": uid,
        "nome": nome,
        "wbs": input.codice_wbs,
        "inizio": inizio,
        "fine": fine,
        "durataGiorni": durata_giorni,
        "milestone": input.milestone,
    });
    tx.execute(
        "INSERT INTO audit_log (ts, user, entity, entity_id, action, after_json)
         VALUES (?1, 'locale', 'task', ?2, 'crea', ?3)",
        params![tempo::adesso_iso(), id, dopo.to_string()],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(TaskRiga {
        id,
        uid,
        nome: nome.to_string(),
        wbs: input.codice_wbs.clone(),
        inizio,
        fine,
        durata_giorni,
        milestone: input.milestone,
        riepilogo: false,
    })
}

/// Elenco dei task del progetto, nell'ordine di UID.
pub fn elenca_task(conn: &Connection, project_id: i64) -> Result<Vec<TaskRiga>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.uid_source, t.name, w.code, t.start_planned, t.finish_planned,
                    t.duration_planned_days, t.is_milestone, t.is_summary
             FROM task t
             LEFT JOIN wbs w ON w.id = t.wbs_id
             WHERE t.project_id = ?1
             ORDER BY CAST(t.uid_source AS INTEGER), t.uid_source",
        )
        .map_err(|e| e.to_string())?;
    let righe = stmt
        .query_map([project_id], |r| {
            Ok(TaskRiga {
                id: r.get(0)?,
                uid: r.get(1)?,
                nome: r.get(2)?,
                wbs: r.get(3)?,
                inizio: r.get(4)?,
                fine: r.get(5)?,
                durata_giorni: r.get(6)?,
                milestone: r.get::<_, i64>(7)? != 0,
                riepilogo: r.get::<_, i64>(8)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(righe)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progetto::crea_progetto;
    use tempfile::tempdir;

    fn progetto_con_wbs() -> (tempfile::TempDir, Connection, i64) {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("p.evmproj");
        let info = crea_progetto(&percorso, "Prova").unwrap();
        let conn = crate::open_and_migrate(&percorso).unwrap();
        conn.execute(
            "INSERT INTO wbs (project_id, parent_id, code, name) VALUES (?1, NULL, '1', 'Fase 1')",
            [info.id],
        )
        .unwrap();
        (dir, conn, info.id)
    }

    #[test]
    fn crea_un_task_con_uid_progressivo_e_audit() {
        let (_dir, mut conn, pid) = progetto_con_wbs();
        let primo = crea_task(
            &mut conn,
            pid,
            &NuovoTask {
                nome: "Scavo".into(),
                codice_wbs: Some("1".into()),
                inizio: Some("05/01/2026".into()),
                fine: Some("2026-01-09".into()),
                durata_giorni: Some(5.0),
                milestone: false,
            },
        )
        .unwrap();
        assert_eq!(primo.uid, "1");
        assert_eq!(primo.inizio.as_deref(), Some("2026-01-05"));

        let secondo = crea_task(
            &mut conn,
            pid,
            &NuovoTask { nome: "Collaudo".into(), milestone: true, ..Default::default() },
        )
        .unwrap();
        assert_eq!(secondo.uid, "2");

        let elenco = elenca_task(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 2);
        assert_eq!(elenco[0].wbs.as_deref(), Some("1"));
        assert!(elenco[1].milestone);

        let audit: i64 = conn
            .query_row("SELECT count(*) FROM audit_log WHERE entity = 'task'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(audit, 2);
    }

    #[test]
    fn la_durata_conta_solo_i_giorni_lavorativi() {
        let (_dir, mut conn, pid) = progetto_con_wbs();
        // Venerdì 9 gennaio 2026 + 2 giorni lavorativi = lunedì 12.
        let t = crea_task(
            &mut conn,
            pid,
            &NuovoTask {
                nome: "Posa".into(),
                inizio: Some("2026-01-09".into()),
                durata_giorni: Some(2.0),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(t.fine.as_deref(), Some("2026-01-12"));
        // Lun 5 – ven 9 gennaio: cinque giorni lavorativi, il fine settimana non conta.
        let u = crea_task(
            &mut conn,
            pid,
            &NuovoTask {
                nome: "Scavo".into(),
                inizio: Some("2026-01-05".into()),
                fine: Some("2026-01-11".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(u.durata_giorni, Some(5.0));
    }

    #[test]
    fn rifiuta_dati_non_validi_senza_scrivere() {
        let (_dir, mut conn, pid) = progetto_con_wbs();
        assert!(crea_task(&mut conn, pid, &NuovoTask::default()).is_err(), "nome vuoto");
        let fine_prima = NuovoTask {
            nome: "X".into(),
            inizio: Some("2026-02-10".into()),
            fine: Some("2026-02-01".into()),
            ..Default::default()
        };
        assert!(crea_task(&mut conn, pid, &fine_prima).is_err());
        let wbs_ignoto = NuovoTask {
            nome: "X".into(),
            codice_wbs: Some("9.9".into()),
            ..Default::default()
        };
        assert!(crea_task(&mut conn, pid, &wbs_ignoto).is_err());
        assert!(elenca_task(&conn, pid).unwrap().is_empty());
    }
}
