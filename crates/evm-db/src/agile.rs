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
            "SELECT sprint_number, start_date, end_date, sp_planned, sp_completed, team_cost
             FROM agile_sprint WHERE project_id = ?1 ORDER BY sprint_number",
        )
        .map_err(e)?;
    let sprint = st
        .query_map([pid], |r| {
            Ok(SprintRiga {
                numero: r.get(0)?,
                inizio: r.get(1)?,
                fine: r.get(2)?,
                sp_pianificati: r.get(3)?,
                sp_completati: r.get(4)?,
                costo: r.get(5)?,
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
}
