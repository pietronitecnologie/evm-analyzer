// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Controllo dei costi: budget per nodo WBS, dati di monitoraggio per il motore
//! (PV/EV/AC si calcolano nel motore), governance (contingency, riserva di gestione,
//! change request, baseline di budget).

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::tempo;

type Esito<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

fn importo_valido(v: f64, nome: &str) -> Esito<f64> {
    if !v.is_finite() || v < 0.0 {
        return Err(format!("{nome} deve essere un importo positivo o zero"));
    }
    Ok(v)
}

/// Imposta (o rimuove, con `None`) il budget di un nodo WBS.
pub fn imposta_budget_wbs(conn: &Connection, pid: i64, codice: &str, budget: Option<f64>) -> Esito<()> {
    if let Some(b) = budget {
        importo_valido(b, "il budget")?;
    }
    let cambiate = conn
        .execute(
            "UPDATE wbs SET bac = ?3 WHERE project_id = ?1 AND code = ?2",
            params![pid, codice, budget],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err(format!("nodo WBS {codice} non trovato"));
    }
    Ok(())
}

// ------------------------------------------------------------- Monitoraggio

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BudgetWbs {
    pub codice: String,
    pub budget: Option<f64>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskMon {
    pub uid: String,
    pub wbs: Option<String>,
    pub riepilogo: bool,
    pub inizio: Option<String>,
    pub fine: Option<String>,
    /// Costo di baseline del task (baseline «startup» più recente).
    pub costo_baseline: f64,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigaSnapMon {
    pub uid: String,
    /// Frazione 0..1.
    pub pct: f64,
    /// AC cumulato del task.
    pub ac: f64,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMon {
    pub data: String,
    pub etichetta: Option<String>,
    pub sorgente: String,
    pub righe: Vec<RigaSnapMon>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointMon {
    pub data: String,
    pub nota: Option<String>,
    pub pct_pianificato: Option<f64>,
    pub pct_reale: Option<f64>,
    pub ac: Option<f64>,
}

/// Dati grezzi per il motore di monitoraggio: budget dei WBS, task con date e costi,
/// stati di avanzamento per data, checkpoint del workbook.
#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DatiMonitoraggio {
    pub wbs: Vec<BudgetWbs>,
    pub task: Vec<TaskMon>,
    pub snapshot: Vec<SnapshotMon>,
    pub checkpoint: Vec<CheckpointMon>,
}

pub fn dati_monitoraggio(conn: &Connection, pid: i64) -> Esito<DatiMonitoraggio> {
    let mut st = conn
        .prepare("SELECT code, bac FROM wbs WHERE project_id = ?1 ORDER BY code")
        .map_err(e)?;
    let wbs = st
        .query_map([pid], |r| Ok(BudgetWbs { codice: r.get(0)?, budget: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;

    let mut st = conn
        .prepare(
            "SELECT t.uid_source, w.code, t.is_summary, t.start_planned, t.finish_planned,
                    COALESCE((SELECT bt.cost FROM baseline_task bt JOIN baseline b ON b.id = bt.baseline_id
                              WHERE bt.task_id = t.id AND b.kind = 'startup' ORDER BY b.id DESC LIMIT 1), 0)
             FROM task t LEFT JOIN wbs w ON w.id = t.wbs_id
             WHERE t.project_id = ?1
             ORDER BY CAST(t.uid_source AS INTEGER), t.uid_source",
        )
        .map_err(e)?;
    let task = st
        .query_map([pid], |r| {
            Ok(TaskMon {
                uid: r.get(0)?,
                wbs: r.get(1)?,
                riepilogo: r.get::<_, i64>(2)? != 0,
                inizio: r.get(3)?,
                fine: r.get(4)?,
                costo_baseline: r.get(5)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;

    let mut elenco = conn
        .prepare("SELECT id, status_date, label, source FROM status_snapshot WHERE project_id = ?1 ORDER BY status_date, id")
        .map_err(e)?;
    let snapshot_testate: Vec<(i64, String, Option<String>, String)> = elenco
        .query_map([pid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    let mut snapshot = Vec::new();
    for (id, data, etichetta, sorgente) in snapshot_testate {
        let mut righe_st = conn
            .prepare(
                "SELECT t.uid_source, COALESCE(st.pct_complete, 0), COALESCE(st.ac_cost, 0)
                 FROM snapshot_task st JOIN task t ON t.id = st.task_id WHERE st.snapshot_id = ?1",
            )
            .map_err(e)?;
        let righe = righe_st
            .query_map([id], |r| Ok(RigaSnapMon { uid: r.get(0)?, pct: r.get(1)?, ac: r.get(2)? }))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        snapshot.push(SnapshotMon { data, etichetta, sorgente, righe });
    }

    let mut st = conn
        .prepare("SELECT date, note, pct_planned, pct_actual, ac FROM project_checkpoint WHERE project_id = ?1 ORDER BY ordine")
        .map_err(e)?;
    let checkpoint = st
        .query_map([pid], |r| {
            Ok(CheckpointMon { data: r.get(0)?, nota: r.get(1)?, pct_pianificato: r.get(2)?, pct_reale: r.get(3)?, ac: r.get(4)? })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;

    Ok(DatiMonitoraggio { wbs, task, snapshot, checkpoint })
}

// --------------------------------------------------------------- Governance

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConsumoRiserva {
    pub id: i64,
    pub tipo: String,
    pub importo: f64,
    pub data: String,
    pub nota: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BaselineRiga {
    pub id: i64,
    pub nome: String,
    pub tipo: String,
    pub creata_il: String,
    pub bloccata: bool,
    pub archiviata: bool,
    pub bac_totale: Option<f64>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRequestRiga {
    pub id: i64,
    pub richiesta_il: String,
    pub motivo: String,
    pub delta_costo: Option<f64>,
    pub delta_durata: Option<f64>,
    pub approvata_il: Option<String>,
    pub approvata_da: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Governance {
    /// Somma dei budget dei nodi WBS (BAC del progetto).
    pub budget_totale: f64,
    pub wbs_con_budget: i64,
    pub contingency_pct: f64,
    pub contingency_stanziata: f64,
    pub contingency_usata: f64,
    pub riserva_gestione_pct: f64,
    pub riserva_gestione_usata: f64,
    pub consumi: Vec<ConsumoRiserva>,
    pub baseline: Vec<BaselineRiga>,
    pub change_request: Vec<ChangeRequestRiga>,
}

pub fn governance(conn: &Connection, pid: i64) -> Esito<Governance> {
    let (budget_totale, wbs_con_budget): (f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(bac), 0), COUNT(bac) FROM wbs WHERE project_id = ?1",
            [pid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(e)?;
    let (contingency_pct, riserva_gestione_pct): (f64, f64) = conn
        .query_row(
            "SELECT contingency_pct, mgmt_reserve_pct FROM project_params WHERE project_id = ?1",
            [pid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(e)?;
    let contingency_stanziata: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(contingency_allocated), 0) FROM risk WHERE project_id = ?1",
            [pid],
            |r| r.get(0),
        )
        .map_err(e)?;
    let somma_uso = |tipo: &str| -> Esito<f64> {
        conn.query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM reserve_usage WHERE project_id = ?1 AND kind = ?2",
            params![pid, tipo],
            |r| r.get(0),
        )
        .map_err(e)
    };
    let contingency_usata = somma_uso("contingency")?;
    let riserva_gestione_usata = somma_uso("management_reserve")?;

    let mut st = conn
        .prepare("SELECT id, kind, amount, date, note FROM reserve_usage WHERE project_id = ?1 ORDER BY date, id")
        .map_err(e)?;
    let consumi = st
        .query_map([pid], |r| Ok(ConsumoRiserva { id: r.get(0)?, tipo: r.get(1)?, importo: r.get(2)?, data: r.get(3)?, nota: r.get(4)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    let mut st = conn
        .prepare("SELECT id, name, kind, created_at, locked, bac_total, archiviata FROM baseline WHERE project_id = ?1 ORDER BY id")
        .map_err(e)?;
    let baseline = st
        .query_map([pid], |r| {
            Ok(BaselineRiga {
                id: r.get(0)?,
                nome: r.get(1)?,
                tipo: r.get(2)?,
                creata_il: r.get(3)?,
                bloccata: r.get::<_, i64>(4)? != 0,
                bac_totale: r.get(5)?,
                archiviata: r.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    let mut st = conn
        .prepare("SELECT id, requested_at, reason, delta_cost, delta_duration_days, approved_at, approved_by FROM change_request WHERE project_id = ?1 ORDER BY id")
        .map_err(e)?;
    let change_request = st
        .query_map([pid], |r| {
            Ok(ChangeRequestRiga {
                id: r.get(0)?,
                richiesta_il: r.get(1)?,
                motivo: r.get(2)?,
                delta_costo: r.get(3)?,
                delta_durata: r.get(4)?,
                approvata_il: r.get(5)?,
                approvata_da: r.get(6)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;

    Ok(Governance {
        budget_totale,
        wbs_con_budget,
        contingency_pct,
        contingency_stanziata,
        contingency_usata,
        riserva_gestione_pct,
        riserva_gestione_usata,
        consumi,
        baseline,
        change_request,
    })
}

/// Apre una richiesta di variazione: motivo obbligatorio, delta opzionali.
pub fn crea_change_request(conn: &Connection, pid: i64, motivo: &str, delta_costo: Option<f64>, delta_durata: Option<f64>) -> Esito<i64> {
    if motivo.trim().is_empty() {
        return Err("il motivo della variazione è obbligatorio".into());
    }
    conn.execute(
        "INSERT INTO change_request (project_id, requested_at, reason, delta_cost, delta_duration_days)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![pid, tempo::adesso_iso(), motivo.trim(), delta_costo, delta_durata],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Approva una richiesta: serve il nome di chi approva (tracciato).
pub fn approva_change_request(conn: &Connection, pid: i64, id: i64, approvatore: &str) -> Esito<()> {
    if approvatore.trim().is_empty() {
        return Err("indica chi approva la variazione".into());
    }
    let cambiate = conn
        .execute(
            "UPDATE change_request SET approved_at = ?3, approved_by = ?4
             WHERE id = ?1 AND project_id = ?2 AND approved_at IS NULL",
            params![id, pid, tempo::adesso_iso(), approvatore.trim()],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("richiesta non trovata o già approvata".into());
    }
    Ok(())
}

/// Archivia una baseline: non compare più nell'elenco attivo, ma resta nel database con
/// la sua data e il suo contenuto. Non si cancella una baseline bloccata.
pub fn archivia_baseline(conn: &Connection, pid: i64, id: i64) -> Esito<()> {
    let cambiate = conn
        .execute(
            "UPDATE baseline SET archiviata = 1 WHERE id = ?1 AND project_id = ?2 AND archiviata = 0",
            params![id, pid],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("baseline non trovata o già archiviata".into());
    }
    Ok(())
}

/// Blocca una baseline di budget: somma dei budget dei WBS, immutabile (trigger del
/// database). Per cambiarla serve una change request approvata.
pub fn blocca_baseline_budget(conn: &Connection, pid: i64, nome: &str, tipo: &str) -> Esito<i64> {
    if nome.trim().is_empty() {
        return Err("il nome della baseline è obbligatorio".into());
    }
    if !["stima", "startup", "altra"].contains(&tipo) {
        return Err(format!("tipo di baseline non valido: {tipo}"));
    }
    let totale: f64 = conn
        .query_row("SELECT COALESCE(SUM(bac), 0) FROM wbs WHERE project_id = ?1", [pid], |r| r.get(0))
        .map_err(e)?;
    if totale <= 0.0 {
        return Err("assegna prima un budget ai nodi WBS".into());
    }
    conn.execute(
        "INSERT INTO baseline (project_id, name, kind, created_at, locked, bac_direct, bac_indirect, bac_contingency, bac_total)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, 0, 0, ?5)",
        params![pid, nome.trim(), tipo, tempo::adesso_iso(), totale],
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
        conn.execute("INSERT INTO wbs (project_id, code, name) VALUES (?1, '1', 'Fase 1')", [info.id]).unwrap();
        conn.execute("INSERT INTO wbs (project_id, code, name) VALUES (?1, '1.1', 'Scavi')", [info.id]).unwrap();
        (dir, conn, info.id)
    }

    #[test]
    fn budget_dei_wbs_e_totale_in_governance() {
        let (_d, conn, pid) = progetto();
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        assert!(imposta_budget_wbs(&conn, pid, "1.1", Some(-5.0)).is_err());
        assert!(imposta_budget_wbs(&conn, pid, "9.9", Some(1.0)).is_err());
        let g = governance(&conn, pid).unwrap();
        assert_eq!(g.budget_totale, 12000.0);
        assert_eq!(g.wbs_con_budget, 1);
    }

    #[test]
    fn change_request_richiede_motivo_e_approvatore_e_si_approva_una_volta() {
        let (_d, conn, pid) = progetto();
        assert!(crea_change_request(&conn, pid, "  ", None, None).is_err());
        let id = crea_change_request(&conn, pid, "Variante scavi", Some(2500.0), Some(5.0)).unwrap();
        assert!(approva_change_request(&conn, pid, id, " ").is_err());
        approva_change_request(&conn, pid, id, "Direttore tecnico").unwrap();
        assert!(approva_change_request(&conn, pid, id, "Altri").is_err(), "già approvata");
        let g = governance(&conn, pid).unwrap();
        assert_eq!(g.change_request[0].approvata_da.as_deref(), Some("Direttore tecnico"));
    }

    #[test]
    fn baseline_di_budget_e_immutabile_e_richiede_budget() {
        let (_d, conn, pid) = progetto();
        assert!(blocca_baseline_budget(&conn, pid, "Startup", "startup").is_err(), "senza budget");
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let id = blocca_baseline_budget(&conn, pid, "Startup", "startup").unwrap();
        let aggiornamento = conn.execute("UPDATE baseline SET bac_total = 1 WHERE id = ?1", [id]);
        assert!(aggiornamento.is_err(), "baseline bloccata non modificabile");
    }

    #[test]
    fn baseline_bloccata_si_archivia_ma_non_si_cancella() {
        let (_d, conn, pid) = progetto();
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let id = blocca_baseline_budget(&conn, pid, "Startup", "startup").unwrap();
        assert!(conn.execute("DELETE FROM baseline WHERE id = ?1", [id]).is_err(), "cancellazione bloccata");
        archivia_baseline(&conn, pid, id).unwrap();
        assert!(archivia_baseline(&conn, pid, id).is_err(), "già archiviata");
        let g = governance(&conn, pid).unwrap();
        assert!(g.baseline[0].archiviata);
        assert_eq!(g.baseline[0].bac_totale, Some(12000.0), "contenuto invariato");
        let altro = conn.execute("UPDATE baseline SET bac_total = 1 WHERE id = ?1", [id]);
        assert!(altro.is_err(), "archiviazione non sblocca altre modifiche");
    }

    #[test]
    fn dati_monitoraggio_riportano_budget_task_e_stati() {
        let (_d, conn, pid) = progetto();
        imposta_budget_wbs(&conn, pid, "1.1", Some(100.0)).unwrap();
        let d = dati_monitoraggio(&conn, pid).unwrap();
        assert_eq!(d.wbs.len(), 2);
        assert!(d.snapshot.is_empty());
        assert!(d.checkpoint.is_empty());
    }
}
