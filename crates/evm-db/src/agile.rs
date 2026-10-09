// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Agile/Flow (specifica Fase 5, §3.9): sprint e parametri agile (`agile_sprint`,
//! `project_params`), già popolati dall'import del workbook ma non ancora letti da
//! nessun comando; periodi di flusso Kanban (`kanban_flow`), finora senza alcuna
//! fonte di dati (nessun import li scrive) — qui con inserimento manuale, unica via
//! possibile fino a un'eventuale integrazione con una board Kanban reale. Il calcolo
//! (velocity, EAC agile, Little's law, FLOW_WIP_EXCESS) resta nel motore TypeScript.

use rusqlite::{params, Connection};
use serde::Serialize;

type Esito<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

// --------------------------------------------------------------------- Sprint

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SprintRiga {
    pub id: i64,
    pub numero: i64,
    pub inizio: Option<String>,
    pub fine: Option<String>,
    pub sp_pianificati: Option<f64>,
    pub sp_completati: Option<f64>,
    pub costo: Option<f64>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParametriAgile {
    pub sprint_days: i64,
    pub team_cost_per_sprint: Option<f64>,
    pub velocity_window: i64,
    pub planned_sp_per_sprint: Option<f64>,
    pub baseline_cost_per_sp: Option<f64>,
    pub backlog_sp: Option<f64>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DatiAgile {
    pub sprint: Vec<SprintRiga>,
    pub parametri: ParametriAgile,
}

/// Sprint e parametri agile del progetto, per la scheda Sprint/Velocity di Agile/Flow.
/// Gli sprint vengono dal foglio "Agile - Velocity" del workbook importato (`workbook.rs`),
/// qui letti per la prima volta da un comando di schermata.
pub fn dati_agile(conn: &Connection, pid: i64) -> Esito<DatiAgile> {
    let mut st = conn
        .prepare(
            "SELECT id, sprint_number, start_date, end_date, sp_planned, sp_completed, team_cost
             FROM agile_sprint WHERE project_id = ?1 ORDER BY sprint_number",
        )
        .map_err(e)?;
    let sprint = st
        .query_map([pid], |r| {
            Ok(SprintRiga {
                id: r.get(0)?,
                numero: r.get(1)?,
                inizio: r.get(2)?,
                fine: r.get(3)?,
                sp_pianificati: r.get(4)?,
                sp_completati: r.get(5)?,
                costo: r.get(6)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;

    let parametri = conn
        .query_row(
            "SELECT sprint_days, team_cost_per_sprint, velocity_window, planned_sp_per_sprint, baseline_cost_per_sp, backlog_sp
             FROM project_params WHERE project_id = ?1",
            [pid],
            |r| {
                Ok(ParametriAgile {
                    sprint_days: r.get(0)?,
                    team_cost_per_sprint: r.get(1)?,
                    velocity_window: r.get(2)?,
                    planned_sp_per_sprint: r.get(3)?,
                    baseline_cost_per_sp: r.get(4)?,
                    backlog_sp: r.get(5)?,
                })
            },
        )
        .map_err(e)?;

    Ok(DatiAgile { sprint, parametri })
}

/// Imposta il backlog residuo (SP): nessuna fonte di import lo fornisce (decisione in
/// DECISIONS.md), si inserisce a mano nella scheda Sprint.
pub fn imposta_backlog_sp(conn: &Connection, pid: i64, backlog_sp: Option<f64>) -> Esito<()> {
    if let Some(v) = backlog_sp {
        if !v.is_finite() || v < 0.0 {
            return Err("il backlog residuo deve essere un numero di SP positivo o zero".into());
        }
    }
    conn.execute("UPDATE project_params SET backlog_sp = ?2 WHERE project_id = ?1", params![pid, backlog_sp])
        .map_err(e)?;
    Ok(())
}

fn numero_valido(importo: Option<f64>, nome: &str) -> Esito<()> {
    if let Some(v) = importo {
        if !v.is_finite() || v < 0.0 {
            return Err(format!("{nome} deve essere un numero positivo o zero"));
        }
    }
    Ok(())
}

/// Crea uno sprint gestito interamente dall'app (todo.md): l'import resta una via
/// alternativa per popolare `agile_sprint`, non l'unica — questa funzione scrive nella
/// stessa tabella con lo stesso schema.
pub fn crea_sprint(
    conn: &Connection,
    pid: i64,
    numero: i64,
    workstream_id: Option<i64>,
    inizio: Option<String>,
    fine: Option<String>,
    sp_pianificati: Option<f64>,
) -> Esito<i64> {
    if numero < 1 {
        return Err("il numero dello sprint deve essere almeno 1".into());
    }
    numero_valido(sp_pianificati, "gli story point pianificati")?;
    // Il vincolo UNIQUE(workstream_id, sprint_number) non impedisce due sprint di
    // progetto (workstream_id NULL) con lo stesso numero: SQLite tratta ogni NULL come
    // distinto. Controllato qui.
    let duplicato: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM agile_sprint
             WHERE project_id = ?1 AND sprint_number = ?2
               AND ((workstream_id IS NULL AND ?3 IS NULL) OR workstream_id = ?3)",
            params![pid, numero, workstream_id],
            |r| r.get(0),
        )
        .map_err(e)?;
    if duplicato > 0 {
        return Err(format!("esiste già lo sprint numero {numero} per questo ambito"));
    }
    conn.execute(
        "INSERT INTO agile_sprint (project_id, workstream_id, sprint_number, start_date, end_date, sp_planned)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![pid, workstream_id, numero, inizio, fine, sp_pianificati],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Modifica le date e le misure di uno sprint esistente (manuale o importato: non
/// distinguibili, e non c'è motivo di farlo — una volta nella tabella sono uguali).
pub fn modifica_sprint(
    conn: &Connection,
    pid: i64,
    id: i64,
    inizio: Option<String>,
    fine: Option<String>,
    sp_pianificati: Option<f64>,
    sp_completati: Option<f64>,
    costo: Option<f64>,
) -> Esito<()> {
    numero_valido(sp_pianificati, "gli story point pianificati")?;
    numero_valido(sp_completati, "gli story point completati")?;
    numero_valido(costo, "il costo del team")?;
    let cambiate = conn
        .execute(
            "UPDATE agile_sprint SET start_date = ?3, end_date = ?4, sp_planned = ?5,
                                     sp_completed = ?6, team_cost = ?7
             WHERE id = ?1 AND project_id = ?2",
            params![id, pid, inizio, fine, sp_pianificati, sp_completati, costo],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("sprint non trovato".into());
    }
    Ok(())
}

/// Elimina uno sprint: i task assegnati tornano senza sprint (`ON DELETE SET NULL`),
/// non restano agganciati a uno sprint fantasma.
pub fn elimina_sprint(conn: &Connection, pid: i64, id: i64) -> Esito<()> {
    let cambiate = conn
        .execute("DELETE FROM agile_sprint WHERE id = ?1 AND project_id = ?2", params![id, pid])
        .map_err(e)?;
    if cambiate == 0 {
        return Err("sprint non trovato".into());
    }
    Ok(())
}

fn task_id_di(conn: &Connection, pid: i64, uid: &str) -> Esito<i64> {
    conn.query_row(
        "SELECT id FROM task WHERE project_id = ?1 AND uid_source = ?2 AND is_summary = 0",
        params![pid, uid],
        |r| r.get(0),
    )
    .map_err(|_| format!("task UID {uid} non trovato o di riepilogo"))
}

/// Assegna un task a uno sprint (o lo toglie, con `None`): esclude automaticamente la
/// lavagna Kanban, un task appartiene all'uno o all'altra, mai a entrambi.
pub fn assegna_task_a_sprint(conn: &Connection, pid: i64, uid: &str, sprint_id: Option<i64>) -> Esito<()> {
    let task_id = task_id_di(conn, pid, uid)?;
    if let Some(sid) = sprint_id {
        let esiste: i64 = conn
            .query_row("SELECT COUNT(*) FROM agile_sprint WHERE id = ?1 AND project_id = ?2", params![sid, pid], |r| r.get(0))
            .map_err(e)?;
        if esiste == 0 {
            return Err("sprint non trovato".into());
        }
    }
    conn.execute(
        "UPDATE task SET sprint_id = ?2, kanban = 0 WHERE id = ?1",
        params![task_id, sprint_id],
    )
    .map_err(e)?;
    Ok(())
}

/// Assegna (o toglie) un task alla lavagna Kanban: esclude automaticamente lo sprint.
pub fn assegna_task_a_kanban(conn: &Connection, pid: i64, uid: &str, kanban: bool) -> Esito<()> {
    let task_id = task_id_di(conn, pid, uid)?;
    conn.execute(
        "UPDATE task SET kanban = ?2, sprint_id = CASE WHEN ?2 = 1 THEN NULL ELSE sprint_id END WHERE id = ?1",
        params![task_id, kanban as i64],
    )
    .map_err(e)?;
    Ok(())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskSprintRiga {
    pub uid: String,
    pub nome: String,
}

/// Task assegnati a uno sprint, per il suo "backlog" nella scheda Sprint.
pub fn sprint_backlog(conn: &Connection, pid: i64, sprint_id: i64) -> Esito<Vec<TaskSprintRiga>> {
    let mut st = conn
        .prepare(
            "SELECT uid_source, name FROM task
             WHERE project_id = ?1 AND sprint_id = ?2 AND is_summary = 0
             ORDER BY CAST(uid_source AS INTEGER), uid_source",
        )
        .map_err(e)?;
    let righe = st
        .query_map(params![pid, sprint_id], |r| Ok(TaskSprintRiga { uid: r.get(0)?, nome: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

// ----------------------------------------------------------------------- Flusso

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PeriodoFlusso {
    pub id: i64,
    pub inizio_periodo: String,
    pub fine_periodo: String,
    pub throughput: Option<f64>,
    pub cycle_time_giorni: Option<f64>,
    pub wip_osservato: Option<f64>,
}

/// Periodi di flusso Kanban del progetto, in ordine cronologico, per la scheda Flusso.
pub fn flusso_elenco(conn: &Connection, pid: i64) -> Esito<Vec<PeriodoFlusso>> {
    let mut st = conn
        .prepare(
            "SELECT id, period_start, period_end, throughput, cycle_time_days, wip_observed
             FROM kanban_flow WHERE project_id = ?1 ORDER BY period_start",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(PeriodoFlusso {
                id: r.get(0)?,
                inizio_periodo: r.get(1)?,
                fine_periodo: r.get(2)?,
                throughput: r.get(3)?,
                cycle_time_giorni: r.get(4)?,
                wip_osservato: r.get(5)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

/// Registra un periodo di flusso Kanban (inserimento manuale: nessun import lo popola).
pub fn crea_periodo_flusso(
    conn: &Connection,
    pid: i64,
    inizio_periodo: &str,
    fine_periodo: &str,
    throughput: Option<f64>,
    cycle_time_giorni: Option<f64>,
    wip_osservato: Option<f64>,
) -> Esito<i64> {
    if inizio_periodo.trim().is_empty() || fine_periodo.trim().is_empty() {
        return Err("inizio e fine del periodo sono obbligatori".into());
    }
    if fine_periodo < inizio_periodo {
        return Err("la fine del periodo non può precedere l'inizio".into());
    }
    for (nome, v) in [("il throughput", throughput), ("il cycle time", cycle_time_giorni), ("il WIP osservato", wip_osservato)] {
        if let Some(x) = v {
            if !x.is_finite() || x < 0.0 {
                return Err(format!("{nome} deve essere un numero positivo o zero"));
            }
        }
    }
    conn.execute(
        "INSERT INTO kanban_flow (project_id, period_start, period_end, throughput, cycle_time_days, wip_observed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![pid, inizio_periodo.trim(), fine_periodo.trim(), throughput, cycle_time_giorni, wip_osservato],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Elimina un periodo di flusso Kanban (correzione di un inserimento manuale errato).
pub fn elimina_periodo_flusso(conn: &Connection, pid: i64, id: i64) -> Esito<()> {
    let cambiate = conn
        .execute("DELETE FROM kanban_flow WHERE id = ?1 AND project_id = ?2", params![id, pid])
        .map_err(e)?;
    if cambiate == 0 {
        return Err("periodo di flusso non trovato".into());
    }
    Ok(())
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
    fn dati_agile_legge_sprint_e_parametri_con_backlog_assente_di_default() {
        let (_d, conn, pid) = progetto();
        conn.execute(
            "INSERT INTO agile_sprint (project_id, sprint_number, sp_planned, sp_completed, team_cost) VALUES (?1, 1, 20, 18, 5000)",
            [pid],
        )
        .unwrap();
        let d = dati_agile(&conn, pid).unwrap();
        assert_eq!(d.sprint.len(), 1);
        assert_eq!(d.sprint[0].sp_completati, Some(18.0));
        assert_eq!(d.parametri.backlog_sp, None);
    }

    #[test]
    fn imposta_backlog_sp_valida_e_si_puo_azzerare() {
        let (_d, conn, pid) = progetto();
        assert!(imposta_backlog_sp(&conn, pid, Some(-1.0)).is_err());
        imposta_backlog_sp(&conn, pid, Some(120.0)).unwrap();
        assert_eq!(dati_agile(&conn, pid).unwrap().parametri.backlog_sp, Some(120.0));
        imposta_backlog_sp(&conn, pid, None).unwrap();
        assert_eq!(dati_agile(&conn, pid).unwrap().parametri.backlog_sp, None);
    }

    #[test]
    fn periodi_di_flusso_si_creano_elencano_ed_eliminano() {
        let (_d, conn, pid) = progetto();
        assert!(crea_periodo_flusso(&conn, pid, "2026-02-01", "2026-01-25", Some(5.0), Some(3.0), Some(15.0)).is_err(), "fine prima dell'inizio");
        assert!(crea_periodo_flusso(&conn, pid, "2026-01-01", "2026-01-07", Some(-1.0), None, None).is_err(), "throughput negativo");
        let id = crea_periodo_flusso(&conn, pid, "2026-01-01", "2026-01-07", Some(5.0), Some(3.0), Some(15.0)).unwrap();
        let elenco = flusso_elenco(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 1);
        assert_eq!(elenco[0].throughput, Some(5.0));
        elimina_periodo_flusso(&conn, pid, id).unwrap();
        assert!(flusso_elenco(&conn, pid).unwrap().is_empty());
        assert!(elimina_periodo_flusso(&conn, pid, id).is_err(), "già eliminato");
    }

    fn crea_task_di_prova(conn: &mut Connection, pid: i64, nome: &str) -> String {
        let riga = crate::task::crea_task(
            conn,
            pid,
            &crate::task::NuovoTask { nome: nome.into(), ..Default::default() },
        )
        .unwrap();
        riga.uid
    }

    #[test]
    fn uno_sprint_si_crea_modifica_ed_elimina_senza_duplicare_il_numero() {
        let (_d, conn, pid) = progetto();
        assert!(crea_sprint(&conn, pid, 0, None, None, None, None).is_err(), "numero sprint non valido");
        let id = crea_sprint(&conn, pid, 1, None, Some("2026-01-01".into()), Some("2026-01-14".into()), Some(20.0)).unwrap();
        assert!(crea_sprint(&conn, pid, 1, None, None, None, None).is_err(), "stesso numero, stesso ambito (NULL incluso)");
        modifica_sprint(&conn, pid, id, Some("2026-01-01".into()), Some("2026-01-14".into()), Some(20.0), Some(18.0), Some(5000.0)).unwrap();
        assert_eq!(dati_agile(&conn, pid).unwrap().sprint[0].sp_completati, Some(18.0));
        elimina_sprint(&conn, pid, id).unwrap();
        assert!(dati_agile(&conn, pid).unwrap().sprint.is_empty());
    }

    #[test]
    fn un_task_appartiene_allo_sprint_o_al_kanban_mai_a_entrambi() {
        let (_d, mut conn, pid) = progetto();
        let uid = crea_task_di_prova(&mut conn, pid, "Attività di prova");
        let sprint_id = crea_sprint(&conn, pid, 1, None, None, None, None).unwrap();

        assegna_task_a_sprint(&conn, pid, &uid, Some(sprint_id)).unwrap();
        let kanban: i64 = conn.query_row("SELECT kanban FROM task WHERE uid_source = ?1", [&uid], |r| r.get(0)).unwrap();
        assert_eq!(kanban, 0, "assegnare a uno sprint toglie il kanban");
        assert_eq!(sprint_backlog(&conn, pid, sprint_id).unwrap().len(), 1);

        assegna_task_a_kanban(&conn, pid, &uid, true).unwrap();
        let sprint_dopo: Option<i64> = conn.query_row("SELECT sprint_id FROM task WHERE uid_source = ?1", [&uid], |r| r.get(0)).unwrap();
        assert_eq!(sprint_dopo, None, "passare al kanban toglie lo sprint");
        assert!(sprint_backlog(&conn, pid, sprint_id).unwrap().is_empty());
    }
}
