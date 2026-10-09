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

/// Metodi EV validi (vincolo `ev_method` della tabella `task`, migrazione 0001).
const METODI_EV: [&str; 7] = ["0_100", "50_50", "20_80", "unita_fisiche", "milestone_pesate", "loe", "pct_soggettiva"];

fn task_non_trovato(cambiate: usize) -> Result<(), String> {
    if cambiate == 0 {
        return Err("task non trovato".into());
    }
    Ok(())
}

/// Modifica il nome di un task (editabile direttamente in tabella, todo.md).
pub fn imposta_nome(conn: &Connection, project_id: i64, id: i64, nome: &str) -> Result<(), String> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Err("il nome del task è obbligatorio".into());
    }
    let cambiate = conn
        .execute("UPDATE task SET name = ?3 WHERE id = ?1 AND project_id = ?2", params![id, project_id, nome])
        .map_err(|e| e.to_string())?;
    task_non_trovato(cambiate)
}

/// Modifica il nodo WBS di un task (`None`/stringa vuota lo rimuove dalla WBS).
pub fn imposta_wbs(conn: &Connection, project_id: i64, id: i64, codice_wbs: Option<String>) -> Result<(), String> {
    let wbs_id: Option<i64> = match codice_wbs.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(codice) => Some(
            conn.query_row(
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
    let cambiate = conn
        .execute("UPDATE task SET wbs_id = ?3 WHERE id = ?1 AND project_id = ?2", params![id, project_id, wbs_id])
        .map_err(|e| e.to_string())?;
    task_non_trovato(cambiate)
}

/// Modifica il metodo di misura EV di un task (`None` lo lascia non assegnato).
pub fn imposta_metodo_ev(conn: &Connection, project_id: i64, id: i64, metodo_ev: Option<String>) -> Result<(), String> {
    if let Some(m) = &metodo_ev {
        if !METODI_EV.contains(&m.as_str()) {
            return Err(format!("metodo EV non valido: {m}"));
        }
    }
    let cambiate = conn
        .execute("UPDATE task SET ev_method = ?3 WHERE id = ?1 AND project_id = ?2", params![id, project_id, metodo_ev])
        .map_err(|e| e.to_string())?;
    task_non_trovato(cambiate)
}

/// Modifica la milestone di un task.
pub fn imposta_milestone(conn: &Connection, project_id: i64, id: i64, milestone: bool) -> Result<(), String> {
    let cambiate = conn
        .execute(
            "UPDATE task SET is_milestone = ?3 WHERE id = ?1 AND project_id = ?2",
            params![id, project_id, milestone as i64],
        )
        .map_err(|e| e.to_string())?;
    task_non_trovato(cambiate)
}

/// Modifica le date pianificate di un task (editabili direttamente in tabella, todo.md).
/// Stessa regola di calcolo di `crea_task`: con entrambe le date note, la durata si
/// ricalcola sui giorni lavorativi del calendario — altrimenti resta quella già
/// salvata (una sola data non basta per ricavarla).
pub fn imposta_pianificazione(
    conn: &Connection,
    project_id: i64,
    id: i64,
    inizio: Option<String>,
    fine: Option<String>,
) -> Result<(), String> {
    let inizio = match inizio.as_deref().filter(|v| !v.trim().is_empty()) {
        Some(v) => Some(tempo::normalizza_data(v).ok_or_else(|| format!("data di inizio non valida: {v}"))?),
        None => None,
    };
    let fine = match fine.as_deref().filter(|v| !v.trim().is_empty()) {
        Some(v) => Some(tempo::normalizza_data(v).ok_or_else(|| format!("data di fine non valida: {v}"))?),
        None => None,
    };
    if let (Some(i), Some(f)) = (&inizio, &fine) {
        if f < i {
            return Err("la data di fine precede quella di inizio".into());
        }
    }
    let cambiate = match (&inizio, &fine) {
        (Some(i), Some(f)) => {
            let regole = calendario::regole_predefinite(conn, project_id)?;
            let (Some(gi), Some(gf)) = (giorno_da_iso(i), giorno_da_iso(f)) else {
                return Err("date non valide".into());
            };
            let durata_giorni = regole.giorni_lavorativi(gi, gf) as f64;
            conn.execute(
                "UPDATE task SET start_planned = ?3, finish_planned = ?4, duration_planned_days = ?5 WHERE id = ?1 AND project_id = ?2",
                params![id, project_id, inizio, fine, durata_giorni],
            )
            .map_err(|e| e.to_string())?
        }
        _ => conn
            .execute(
                "UPDATE task SET start_planned = ?3, finish_planned = ?4 WHERE id = ?1 AND project_id = ?2",
                params![id, project_id, inizio, fine],
            )
            .map_err(|e| e.to_string())?,
    };
    task_non_trovato(cambiate)
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

/// Riga del task per la scheda "Task e risorse" (Fase 5, §3.3): colonne di
/// pianificazione e baseline; gli indici EVM (BAC/PV/EV/AC/CV/SV/CPI/SPI) si
/// calcolano nel motore a partire da `dati_monitoraggio`, non qui.
#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskEvmRiga {
    pub id: i64,
    pub uid: String,
    pub nome: String,
    pub wbs: Option<String>,
    pub filone: Option<String>,
    pub metodo_ev: Option<String>,
    pub inizio_pianificato: Option<String>,
    pub fine_pianificata: Option<String>,
    pub inizio_baseline: Option<String>,
    pub fine_baseline: Option<String>,
    /// Frazione 0..1, `None` se non ancora registrato in nessuna data di stato.
    pub pct_reale: Option<f64>,
    pub float_days: Option<f64>,
    pub critico: bool,
    pub riepilogo: bool,
    pub milestone: bool,
    /// Numero dello sprint Agile assegnato, se c'è (esclusivo col kanban: agile.rs).
    pub sprint_numero: Option<i64>,
    pub kanban: bool,
}

/// Elenco dei task con i dati di pianificazione/baseline per la scheda Task e risorse.
/// La baseline usata è la più recente di tipo `startup` (stessa convenzione di
/// `dati_monitoraggio`); `pct_reale` viene dalla data di stato più recente del progetto.
pub fn elenco_evm(conn: &Connection, project_id: i64) -> Result<Vec<TaskEvmRiga>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.uid_source, t.name, w.code, ws.name, t.ev_method,
                    t.start_planned, t.finish_planned,
                    (SELECT bt.start FROM baseline_task bt JOIN baseline b ON b.id = bt.baseline_id
                     WHERE bt.task_id = t.id AND b.kind = 'startup' ORDER BY b.id DESC LIMIT 1),
                    (SELECT bt.finish FROM baseline_task bt JOIN baseline b ON b.id = bt.baseline_id
                     WHERE bt.task_id = t.id AND b.kind = 'startup' ORDER BY b.id DESC LIMIT 1),
                    (SELECT st.pct_complete FROM snapshot_task st
                     JOIN status_snapshot s ON s.id = st.snapshot_id
                     WHERE st.task_id = t.id AND s.project_id = ?1
                     ORDER BY s.status_date DESC, s.id DESC LIMIT 1),
                    t.float_days, t.is_critical, t.is_summary, t.is_milestone,
                    sp.sprint_number, t.kanban
             FROM task t
             LEFT JOIN wbs w ON w.id = t.wbs_id
             LEFT JOIN workstream ws ON ws.id = t.workstream_id
             LEFT JOIN agile_sprint sp ON sp.id = t.sprint_id
             WHERE t.project_id = ?1
             ORDER BY CAST(t.uid_source AS INTEGER), t.uid_source",
        )
        .map_err(|e| e.to_string())?;
    let righe = stmt
        .query_map([project_id], |r| {
            Ok(TaskEvmRiga {
                id: r.get(0)?,
                uid: r.get(1)?,
                nome: r.get(2)?,
                wbs: r.get(3)?,
                filone: r.get(4)?,
                metodo_ev: r.get(5)?,
                inizio_pianificato: r.get(6)?,
                fine_pianificata: r.get(7)?,
                inizio_baseline: r.get(8)?,
                fine_baseline: r.get(9)?,
                pct_reale: r.get(10)?,
                float_days: r.get(11)?,
                critico: r.get::<_, i64>(12)? != 0,
                riepilogo: r.get::<_, i64>(13)? != 0,
                milestone: r.get::<_, i64>(14)? != 0,
                sprint_numero: r.get(15)?,
                kanban: r.get::<_, i64>(16)? != 0,
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

    #[test]
    fn elenco_evm_risolve_baseline_e_avanzamento_senza_fallire_su_task_spogli() {
        let (_dir, mut conn, pid) = progetto_con_wbs();
        let scavo = crea_task(
            &mut conn,
            pid,
            &NuovoTask {
                nome: "Scavo".into(),
                codice_wbs: Some("1".into()),
                inizio: Some("2026-01-05".into()),
                fine: Some("2026-01-09".into()),
                durata_giorni: Some(5.0),
                ..Default::default()
            },
        )
        .unwrap();
        let _spoglio = crea_task(&mut conn, pid, &NuovoTask { nome: "Senza dati".into(), ..Default::default() }).unwrap();

        conn.execute(
            "INSERT INTO baseline (project_id, name, kind, created_at, locked) VALUES (?1, 'Startup', 'startup', '2026-01-01T00:00:00Z', 0)",
            [pid],
        )
        .unwrap();
        let baseline_id = conn.last_insert_rowid();
        let task_id: i64 = conn
            .query_row("SELECT id FROM task WHERE uid_source = ?1 AND project_id = ?2", params![scavo.uid, pid], |r| r.get(0))
            .unwrap();
        conn.execute(
            "INSERT INTO baseline_task (baseline_id, task_id, start, finish, cost) VALUES (?1, ?2, '2026-01-05', '2026-01-09', 1000)",
            params![baseline_id, task_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO status_snapshot (project_id, status_date, source) VALUES (?1, '2026-01-10', 'manuale')",
            [pid],
        )
        .unwrap();
        let snap_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO snapshot_task (snapshot_id, task_id, pct_complete) VALUES (?1, ?2, 0.5)",
            params![snap_id, task_id],
        )
        .unwrap();

        let elenco = elenco_evm(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 2);
        let scavo = elenco.iter().find(|r| r.uid == "1").unwrap();
        assert_eq!(scavo.inizio_baseline.as_deref(), Some("2026-01-05"));
        assert_eq!(scavo.fine_baseline.as_deref(), Some("2026-01-09"));
        assert_eq!(scavo.pct_reale, Some(0.5));
        assert!(!scavo.riepilogo);

        let spoglio = elenco.iter().find(|r| r.uid == "2").unwrap();
        assert_eq!(spoglio.inizio_baseline, None);
        assert_eq!(spoglio.pct_reale, None, "mai registrato: None, non 0");
        assert_eq!(spoglio.filone, None);
    }

    #[test]
    fn i_campi_di_un_task_si_modificano_direttamente_in_tabella() {
        let (_dir, mut conn, pid) = progetto_con_wbs();
        conn.execute("INSERT INTO wbs (project_id, parent_id, code, name) VALUES (?1, NULL, '2', 'Fase 2')", [pid]).unwrap();
        let riga = crea_task(&mut conn, pid, &NuovoTask { nome: "Scavo".into(), codice_wbs: Some("1".into()), ..Default::default() }).unwrap();

        imposta_nome(&conn, pid, riga.id, "  ").unwrap_err();
        imposta_nome(&conn, pid, riga.id, "Scavo di sbancamento").unwrap();
        assert_eq!(elenca_task(&conn, pid).unwrap()[0].nome, "Scavo di sbancamento");

        imposta_wbs(&conn, pid, riga.id, Some("9.9".into())).unwrap_err();
        imposta_wbs(&conn, pid, riga.id, Some("2".into())).unwrap();
        assert_eq!(elenca_task(&conn, pid).unwrap()[0].wbs.as_deref(), Some("2"));
        imposta_wbs(&conn, pid, riga.id, None).unwrap();
        assert_eq!(elenca_task(&conn, pid).unwrap()[0].wbs, None);

        imposta_metodo_ev(&conn, pid, riga.id, Some("non_esiste".into())).unwrap_err();
        imposta_metodo_ev(&conn, pid, riga.id, Some("loe".into())).unwrap();
        let metodo: Option<String> = conn.query_row("SELECT ev_method FROM task WHERE id = ?1", [riga.id], |r| r.get(0)).unwrap();
        assert_eq!(metodo.as_deref(), Some("loe"));

        imposta_milestone(&conn, pid, riga.id, true).unwrap();
        assert!(elenca_task(&conn, pid).unwrap()[0].milestone);

        imposta_pianificazione(&conn, pid, riga.id, Some("2026-01-05".into()), Some("2026-01-09".into())).unwrap();
        let dopo = elenca_task(&conn, pid).unwrap();
        assert_eq!(dopo[0].inizio.as_deref(), Some("2026-01-05"));
        assert_eq!(dopo[0].fine.as_deref(), Some("2026-01-09"));
        assert_eq!(dopo[0].durata_giorni, Some(5.0), "ricalcolata sui giorni lavorativi");

        imposta_pianificazione(&conn, pid, riga.id, Some("2026-01-09".into()), Some("2026-01-05".into())).unwrap_err();

        assert!(imposta_nome(&conn, pid, 999, "x").is_err(), "task inesistente");
    }
}
