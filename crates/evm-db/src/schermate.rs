// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Letture e scritture delle schermate di lavoro (sez. 8.5): dashboard,
//! WBS, Gantt, avanzamento, approvazioni, perimetri e utenti, buffer e riserve.
//!
//! Convenzioni:
//! - l'avanzamento è una frazione 0..1 nel database e una percentuale 0..100
//!   nelle strutture esposte alla UI;
//! - lo stato di avanzamento "vigente" è quello dello snapshot più recente;
//! - ogni modifica di avanzamento passa da `progress_entry` (inviato
//!   → applicato / respinto), così resta tracciata e approvabile.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::controllo::richiede_coordinatore_piano;
use crate::tempo;

type Esito<T> = Result<T, String>;

fn errore<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Riga base di un task, comune a più schermate.
pub struct TaskBase {
    pub id: i64,
    pub uid: String,
    pub nome: String,
    pub wbs: Option<String>,
    pub inizio: Option<String>,
    pub fine: Option<String>,
    pub durata: Option<f64>,
    pub milestone: bool,
    pub riepilogo: bool,
    pub critico: bool,
    pub galleggiamento: Option<f64>,
}

fn task_base(conn: &Connection, pid: i64) -> Esito<Vec<TaskBase>> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.uid_source, t.name, w.code, t.start_planned, t.finish_planned,
                    t.duration_planned_days, t.is_milestone, t.is_summary, t.is_critical, t.float_days
             FROM task t LEFT JOIN wbs w ON w.id = t.wbs_id
             WHERE t.project_id = ?1
             ORDER BY CAST(t.uid_source AS INTEGER), t.uid_source",
        )
        .map_err(errore)?;
    let righe = stmt
        .query_map([pid], |r| {
            Ok(TaskBase {
                id: r.get(0)?,
                uid: r.get(1)?,
                nome: r.get(2)?,
                wbs: r.get(3)?,
                inizio: r.get(4)?,
                fine: r.get(5)?,
                durata: r.get(6)?,
                milestone: r.get::<_, i64>(7)? != 0,
                riepilogo: r.get::<_, i64>(8)? != 0,
                critico: r.get::<_, i64>(9)? != 0,
                galleggiamento: r.get(10)?,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    Ok(righe)
}

/// Id dello snapshot più recente del progetto.
fn ultimo_snapshot(conn: &Connection, pid: i64) -> Esito<Option<i64>> {
    conn.query_row(
        "SELECT id FROM status_snapshot WHERE project_id = ?1
         ORDER BY status_date DESC, id DESC LIMIT 1",
        [pid],
        |r| r.get(0),
    )
    .optional()
    .map_err(errore)
}

/// Avanzamento vigente per task: (frazione, inizio effettivo, fine effettiva).
type Vigente = HashMap<i64, (f64, Option<String>, Option<String>, f64)>;

fn avanzamento_vigente(conn: &Connection, pid: i64) -> Esito<Vigente> {
    let Some(snap) = ultimo_snapshot(conn, pid)? else {
        return Ok(HashMap::new());
    };
    let mut stmt = conn
        .prepare(
            "SELECT task_id, COALESCE(pct_complete, 0), actual_start, actual_finish, COALESCE(ac_cost, 0)
             FROM snapshot_task WHERE snapshot_id = ?1",
        )
        .map_err(errore)?;
    let mappa = stmt
        .query_map([snap], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                (r.get::<_, f64>(1)?, r.get(2)?, r.get(3)?, r.get::<_, f64>(4)?),
            ))
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    Ok(mappa.into_iter().collect())
}

// ---------------------------------------------------------------- Dashboard

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Anomalia {
    pub uid: String,
    pub nome: String,
    pub messaggio: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub task_totali: i64,
    pub task_critici: i64,
    pub milestone: i64,
    pub bac_totale: Option<f64>,
    /// Media dell'avanzamento vigente sui task di lavoro (0..100).
    pub avanzamento_medio_pct: Option<f64>,
    pub data_di_stato: Option<String>,
    pub anomalie: Vec<Anomalia>,
}

pub fn dashboard(conn: &Connection, pid: i64) -> Esito<Dashboard> {
    let tasks = task_base(conn, pid)?;
    let vigente = avanzamento_vigente(conn, pid)?;
    let di_lavoro: Vec<&TaskBase> = tasks.iter().filter(|t| !t.riepilogo).collect();

    let avanzamento_medio_pct = if di_lavoro.is_empty() {
        None
    } else {
        let somma: f64 = di_lavoro
            .iter()
            .map(|t| vigente.get(&t.id).map_or(0.0, |v| v.0))
            .sum();
        Some(somma / di_lavoro.len() as f64 * 100.0)
    };

    let mut anomalie = Vec::new();
    for t in &di_lavoro {
        if t.inizio.is_none() || t.fine.is_none() {
            anomalie.push(Anomalia {
                uid: t.uid.clone(),
                nome: t.nome.clone(),
                messaggio: "date pianificate mancanti".into(),
            });
        }
        let avanzato = vigente.get(&t.id).is_some_and(|v| v.0 > 0.0);
        let senza_inizio = vigente.get(&t.id).is_none_or(|v| v.1.is_none());
        if avanzato && senza_inizio {
            anomalie.push(Anomalia {
                uid: t.uid.clone(),
                nome: t.nome.clone(),
                messaggio: "avanzamento senza data di inizio effettiva".into(),
            });
        }
    }

    let bac_totale: Option<f64> = conn
        .query_row(
            "SELECT bac_total FROM baseline WHERE project_id = ?1 AND kind = 'startup'
             ORDER BY id DESC LIMIT 1",
            [pid],
            |r| r.get(0),
        )
        .optional()
        .map_err(errore)?
        .flatten();
    let data_di_stato: Option<String> = conn
        .query_row(
            "SELECT MAX(status_date) FROM status_snapshot WHERE project_id = ?1",
            [pid],
            |r| r.get(0),
        )
        .map_err(errore)?;

    Ok(Dashboard {
        task_totali: di_lavoro.len() as i64,
        task_critici: di_lavoro.iter().filter(|t| t.critico).count() as i64,
        milestone: di_lavoro.iter().filter(|t| t.milestone).count() as i64,
        bac_totale,
        avanzamento_medio_pct,
        data_di_stato,
        anomalie,
    })
}

// --------------------------------------------------------------------- WBS

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NodoWbs {
    pub id: i64,
    pub codice: String,
    pub nome: String,
    pub genitore: Option<String>,
    pub task: i64,
    /// Budget assegnato al nodo (€), `None` se non assegnato.
    pub budget: Option<f64>,
}

pub fn wbs(conn: &Connection, pid: i64) -> Esito<Vec<NodoWbs>> {
    let mut stmt = conn
        .prepare(
            "SELECT w.id, w.code, w.name, p.code,
                    (SELECT count(*) FROM task t WHERE t.wbs_id = w.id AND t.is_summary = 0), w.bac
             FROM wbs w LEFT JOIN wbs p ON p.id = w.parent_id
             WHERE w.project_id = ?1
             ORDER BY w.code",
        )
        .map_err(errore)?;
    let nodi = stmt
        .query_map([pid], |r| {
            Ok(NodoWbs {
                id: r.get(0)?,
                codice: r.get(1)?,
                nome: r.get(2)?,
                genitore: r.get(3)?,
                task: r.get(4)?,
                budget: r.get(5)?,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    Ok(nodi)
}

/// Aggiunge un nodo WBS. Il genitore è il prefisso del codice (`1.2` sotto `1`)
/// e deve già esistere; il codice non deve essere duplicato.
pub fn crea_wbs(conn: &Connection, pid: i64, codice: &str, nome: &str) -> Esito<()> {
    let codice = codice.trim();
    let nome = nome.trim();
    if codice.is_empty() || nome.is_empty() {
        return Err("codice e nome della WBS sono obbligatori".into());
    }
    let presente: bool = conn
        .query_row(
            "SELECT count(*) FROM wbs WHERE project_id = ?1 AND code = ?2",
            params![pid, codice],
            |r| r.get::<_, i64>(0),
        )
        .map_err(errore)?
        > 0;
    if presente {
        return Err(format!("il codice WBS {codice} esiste già"));
    }
    let genitore_id: Option<i64> = match codice.rsplit_once('.') {
        Some((padre, _)) => Some(
            conn.query_row(
                "SELECT id FROM wbs WHERE project_id = ?1 AND code = ?2",
                params![pid, padre],
                |r| r.get(0),
            )
            .optional()
            .map_err(errore)?
            .ok_or_else(|| format!("il nodo padre {padre} non esiste"))?,
        ),
        None => None,
    };
    conn.execute(
        "INSERT INTO wbs (project_id, parent_id, code, name) VALUES (?1, ?2, ?3, ?4)",
        params![pid, genitore_id, codice, nome],
    )
    .map_err(errore)?;
    Ok(())
}

// --------------------------------------------------------------------- Gantt

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigaGantt {
    pub id: i64,
    pub uid: String,
    pub nome: String,
    pub wbs: Option<String>,
    pub inizio: Option<String>,
    pub fine: Option<String>,
    pub inizio_baseline: Option<String>,
    pub fine_baseline: Option<String>,
    pub durata_giorni: Option<f64>,
    pub critico: bool,
    pub riepilogo: bool,
    pub milestone: bool,
    pub pct: f64,
    /// UID dei predecessori, con tipo e ritardo in giorni (es. `3 FS +2`).
    pub predecessori: Vec<String>,
}

/// `baseline_id`: `None` usa l'ultima baseline `kind = 'startup'` (stessa convenzione di
/// `task.rs::elenco_evm`/`controllo.rs::dati_monitoraggio`), altrimenti la baseline scelta
/// nella barra di contesto (specifica Fase 5 §3.4: "selettore baseline").
pub fn gantt(conn: &Connection, pid: i64, baseline_id: Option<i64>) -> Esito<Vec<RigaGantt>> {
    let tasks = task_base(conn, pid)?;
    let vigente = avanzamento_vigente(conn, pid)?;

    let mut stmt = conn
        .prepare(
            "SELECT
                (SELECT bt.start FROM baseline_task bt
                 WHERE bt.task_id = t.id
                   AND bt.baseline_id = COALESCE(?2, (SELECT id FROM baseline WHERE project_id = ?1 AND kind = 'startup' ORDER BY id DESC LIMIT 1))),
                (SELECT bt.finish FROM baseline_task bt
                 WHERE bt.task_id = t.id
                   AND bt.baseline_id = COALESCE(?2, (SELECT id FROM baseline WHERE project_id = ?1 AND kind = 'startup' ORDER BY id DESC LIMIT 1)))
             FROM task t WHERE t.id = ?3",
        )
        .map_err(errore)?;
    let mut baseline_date = |task_id: i64| -> Esito<(Option<String>, Option<String>)> {
        stmt.query_row(params![pid, baseline_id, task_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(errore)
    };

    let mut stmt_dip = conn
        .prepare(
            "SELECT d.succ_id, p.uid_source, d.type, d.lag_minutes
             FROM dependency d JOIN task p ON p.id = d.pred_id
             JOIN task s ON s.id = d.succ_id WHERE s.project_id = ?1",
        )
        .map_err(errore)?;
    let mut preds: HashMap<i64, Vec<String>> = HashMap::new();
    let legami = stmt_dip
        .query_map([pid], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    for (succ, uid, tipo, ritardo) in legami {
        let voce = if ritardo == 0 {
            format!("{uid}{tipo}")
        } else {
            format!("{uid}{tipo}{:+}g", ritardo as f64 / 480.0)
        };
        preds.entry(succ).or_default().push(voce);
    }

    let mut righe = Vec::with_capacity(tasks.len());
    for t in tasks {
        let (inizio_baseline, fine_baseline) = baseline_date(t.id)?;
        righe.push(RigaGantt {
            pct: vigente.get(&t.id).map_or(0.0, |v| v.0 * 100.0),
            predecessori: preds.remove(&t.id).unwrap_or_default(),
            id: t.id,
            uid: t.uid,
            nome: t.nome,
            wbs: t.wbs,
            inizio: t.inizio,
            fine: t.fine,
            inizio_baseline,
            fine_baseline,
            durata_giorni: t.durata,
            critico: t.critico,
            riepilogo: t.riepilogo,
            milestone: t.milestone,
        });
    }
    Ok(righe)
}

// -------------------------------------------------------------- Avanzamento

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigaAvanzamento {
    pub uid: String,
    pub nome: String,
    pub pct: f64,
    pub inizio_effettivo: Option<String>,
    pub fine_effettiva: Option<String>,
    /// Stato dell'ultima voce di avanzamento per il task, se presente.
    pub stato_ultima_voce: Option<String>,
    /// Motivo dell'ultimo rifiuto, se l'ultima voce è stata respinta.
    pub nota_ultima_voce: Option<String>,
    /// AC cumulato del task alla status date vigente (€).
    pub ac: f64,
}

pub fn avanzamento_elenco(conn: &Connection, pid: i64) -> Esito<Vec<RigaAvanzamento>> {
    let tasks = task_base(conn, pid)?;
    let vigente = avanzamento_vigente(conn, pid)?;
    let mut stmt = conn
        .prepare(
            "SELECT pe.state, pe.note FROM progress_entry pe
             WHERE pe.task_id = ?1 ORDER BY pe.id DESC LIMIT 1",
        )
        .map_err(errore)?;
    let mut righe = Vec::new();
    for t in tasks.iter().filter(|t| !t.riepilogo) {
        let (pct, inizio, fine, ac) = vigente
            .get(&t.id)
            .map(|v| (v.0, v.1.clone(), v.2.clone(), v.3))
            .unwrap_or((0.0, None, None, 0.0));
        let ultima: Option<(String, Option<String>)> = stmt
            .query_row([t.id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(errore)?;
        let (stato, nota) = match ultima {
            Some((s, n)) => (Some(s), n),
            None => (None, None),
        };
        righe.push(RigaAvanzamento {
            uid: t.uid.clone(),
            nome: t.nome.clone(),
            pct: pct * 100.0,
            inizio_effettivo: inizio,
            fine_effettiva: fine,
            stato_ultima_voce: stato,
            nota_ultima_voce: nota,
            ac,
        });
    }
    Ok(righe)
}

/// Snapshot manuale della data odierna: lo crea copiando lo stato vigente, così
/// l'avanzamento degli altri task non va perso.
fn snapshot_manuale(conn: &Connection, pid: i64) -> Esito<i64> {
    let oggi = tempo::oggi_iso();
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM status_snapshot
             WHERE project_id = ?1 AND source = 'manuale' AND status_date = ?2",
            params![pid, oggi],
            |r| r.get(0),
        )
        .optional()
        .map_err(errore)?
    {
        return Ok(id);
    }
    let precedente = ultimo_snapshot(conn, pid)?;
    conn.execute(
        "INSERT INTO status_snapshot (project_id, status_date, label, source)
         VALUES (?1, ?2, 'Avanzamento manuale', 'manuale')",
        params![pid, oggi],
    )
    .map_err(errore)?;
    let nuovo = conn.last_insert_rowid();
    if let Some(vecchio) = precedente {
        conn.execute(
            "INSERT INTO snapshot_task (snapshot_id, task_id, actual_start, actual_finish, pct_complete, ac_cost)
             SELECT ?1, task_id, actual_start, actual_finish, pct_complete, ac_cost
             FROM snapshot_task WHERE snapshot_id = ?2",
            params![nuovo, vecchio],
        )
        .map_err(errore)?;
    }
    Ok(nuovo)
}

/// Registra una proposta di avanzamento per un task (UID) e la invia subito per
/// approvazione: compare nella schermata Approvazioni. Restituisce l'id della voce
/// creata, per poterle allegare subito dei file (todo.md).
pub fn registra_avanzamento(
    conn: &mut Connection,
    pid: i64,
    uid: &str,
    pct: f64,
    inizio: Option<String>,
    fine: Option<String>,
    ac: Option<f64>,
    ore: Option<f64>,
    nota: Option<String>,
) -> Esito<i64> {
    if ore.is_some_and(|v| !v.is_finite() || v < 0.0) {
        return Err("le ore consuntive devono essere un numero positivo o zero".into());
    }
    if !(0.0..=100.0).contains(&pct) {
        return Err("l'avanzamento deve essere tra 0 e 100".into());
    }
    if ac.is_some_and(|v| !v.is_finite() || v < 0.0) {
        return Err("il costo consuntivo (AC) deve essere un importo positivo o zero".into());
    }
    let inizio = inizio.filter(|v| !v.is_empty()).map(|v| tempo::normalizza_data(&v).ok_or(format!("data non valida: {v}"))).transpose()?;
    let fine = fine.filter(|v| !v.is_empty()).map(|v| tempo::normalizza_data(&v).ok_or(format!("data non valida: {v}"))).transpose()?;
    let tx = conn.transaction().map_err(errore)?;
    let task_id: i64 = tx
        .query_row(
            "SELECT id FROM task WHERE project_id = ?1 AND uid_source = ?2 AND is_summary = 0",
            params![pid, uid],
            |r| r.get(0),
        )
        .optional()
        .map_err(errore)?
        .ok_or_else(|| format!("task UID {uid} non trovato o di riepilogo"))?;
    let snapshot = snapshot_manuale(&tx, pid)?;
    let nota = nota.filter(|v| !v.trim().is_empty());
    tx.execute(
        "INSERT INTO progress_entry (snapshot_id, task_id, entered_at, pct_complete,
                                     actual_start, actual_finish, actual_cost, actual_work_h,
                                     author_note, state)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'inviato')",
        params![snapshot, task_id, tempo::adesso_iso(), pct / 100.0, inizio, fine, ac, ore, nota],
    )
    .map_err(errore)?;
    let entry_id = tx.last_insert_rowid();
    tx.commit().map_err(errore)?;
    Ok(entry_id)
}

// ------------------------------------------------------------ Approvazioni

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigaApprovazione {
    pub id: i64,
    pub uid: String,
    pub nome: String,
    pub pct: f64,
    pub inizio_effettivo: Option<String>,
    pub fine_effettiva: Option<String>,
    pub inviato_il: String,
    /// AC cumulato proposto (€), se inserito.
    pub ac: Option<f64>,
}

pub fn approvazioni(conn: &Connection, pid: i64) -> Esito<Vec<RigaApprovazione>> {
    let mut stmt = conn
        .prepare(
            "SELECT pe.id, t.uid_source, t.name, pe.pct_complete, pe.actual_start,
                    pe.actual_finish, pe.entered_at, pe.actual_cost
             FROM progress_entry pe
             JOIN task t ON t.id = pe.task_id
             JOIN status_snapshot s ON s.id = pe.snapshot_id
             WHERE s.project_id = ?1 AND pe.state = 'inviato'
             ORDER BY pe.id",
        )
        .map_err(errore)?;
    let righe = stmt
        .query_map([pid], |r| {
            Ok(RigaApprovazione {
                id: r.get(0)?,
                uid: r.get(1)?,
                nome: r.get(2)?,
                pct: r.get::<_, Option<f64>>(3)?.unwrap_or(0.0) * 100.0,
                inizio_effettivo: r.get(4)?,
                fine_effettiva: r.get(5)?,
                inviato_il: r.get(6)?,
                ac: r.get(7)?,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    Ok(righe)
}

/// Approva una voce inviata: il suo valore entra nello snapshot a cui appartiene.
pub fn approva(conn: &mut Connection, entry_id: i64) -> Esito<()> {
    let tx = conn.transaction().map_err(errore)?;
    let (stato, snapshot, task, pct, inizio, fine, ac): (String, i64, i64, Option<f64>, Option<String>, Option<String>, Option<f64>) = tx
        .query_row(
            "SELECT state, snapshot_id, task_id, pct_complete, actual_start, actual_finish, actual_cost
             FROM progress_entry WHERE id = ?1",
            [entry_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        )
        .map_err(errore)?;
    if stato != "inviato" {
        return Err(format!("la voce è in stato «{stato}», non può essere approvata"));
    }
    tx.execute(
        "INSERT INTO snapshot_task (snapshot_id, task_id, actual_start, actual_finish, pct_complete, ac_cost)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(snapshot_id, task_id) DO UPDATE SET
           pct_complete = excluded.pct_complete,
           actual_start = COALESCE(excluded.actual_start, snapshot_task.actual_start),
           actual_finish = COALESCE(excluded.actual_finish, snapshot_task.actual_finish),
           ac_cost = COALESCE(excluded.ac_cost, snapshot_task.ac_cost)",
        params![snapshot, task, inizio, fine, pct, ac],
    )
    .map_err(errore)?;
    tx.execute(
        "UPDATE progress_entry SET state = 'applicato' WHERE id = ?1",
        [entry_id],
    )
    .map_err(errore)?;
    tx.commit().map_err(errore)
}

/// Respinge una voce inviata, con una nota obbligatoria per chi l'ha inviata.
pub fn respingi(conn: &Connection, entry_id: i64, nota: &str) -> Esito<()> {
    if nota.trim().is_empty() {
        return Err("indica il motivo del rifiuto".into());
    }
    let cambiate = conn
        .execute(
            "UPDATE progress_entry SET state = 'respinto', note = ?2
             WHERE id = ?1 AND state = 'inviato'",
            params![entry_id, nota.trim()],
        )
        .map_err(errore)?;
    if cambiate == 0 {
        return Err("la voce non è più in attesa di approvazione".into());
    }
    Ok(())
}

// ------------------------------------------------- Storico e allegati avanzamento

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VoceStorico {
    pub id: i64,
    pub status_date: String,
    pub registrato_il: String,
    pub stato: String,
    pub pct: f64,
    pub inizio_effettivo: Option<String>,
    pub fine_effettiva: Option<String>,
    pub ac: Option<f64>,
    pub ore: Option<f64>,
    pub nota_autore: Option<String>,
    pub nota_rifiuto: Option<String>,
    pub allegati: i64,
}

/// Storico completo (tutte le voci, non solo quella vigente) di un task, con nota
/// dell'autore, motivo di un eventuale rifiuto e conteggio allegati.
pub fn storico_avanzamento(conn: &Connection, pid: i64, uid: &str) -> Esito<Vec<VoceStorico>> {
    let mut stmt = conn
        .prepare(
            "SELECT pe.id, s.status_date, pe.entered_at, pe.state, pe.pct_complete,
                    pe.actual_start, pe.actual_finish, pe.actual_cost, pe.actual_work_h,
                    pe.author_note, pe.note,
                    (SELECT COUNT(*) FROM progress_entry_attachment a WHERE a.progress_entry_id = pe.id)
             FROM progress_entry pe
             JOIN status_snapshot s ON s.id = pe.snapshot_id
             JOIN task t ON t.id = pe.task_id
             WHERE t.project_id = ?1 AND t.uid_source = ?2
             ORDER BY pe.id DESC",
        )
        .map_err(errore)?;
    let righe = stmt
        .query_map(params![pid, uid], |r| {
            Ok(VoceStorico {
                id: r.get(0)?,
                status_date: r.get(1)?,
                registrato_il: r.get(2)?,
                stato: r.get(3)?,
                pct: r.get::<_, Option<f64>>(4)?.unwrap_or(0.0) * 100.0,
                inizio_effettivo: r.get(5)?,
                fine_effettiva: r.get(6)?,
                ac: r.get(7)?,
                ore: r.get(8)?,
                nota_autore: r.get(9)?,
                nota_rifiuto: r.get(10)?,
                allegati: r.get(11)?,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    Ok(righe)
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllegatoRiga {
    pub id: i64,
    pub nome_file: String,
    pub mime: Option<String>,
    pub dimensione: i64,
    pub caricato_il: String,
}

pub fn elenco_allegati(conn: &Connection, entry_id: i64) -> Esito<Vec<AllegatoRiga>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, file_name, mime_type, size_bytes, uploaded_at
             FROM progress_entry_attachment WHERE progress_entry_id = ?1 ORDER BY id",
        )
        .map_err(errore)?;
    let righe = stmt
        .query_map([entry_id], |r| {
            Ok(AllegatoRiga {
                id: r.get(0)?,
                nome_file: r.get(1)?,
                mime: r.get(2)?,
                dimensione: r.get(3)?,
                caricato_il: r.get(4)?,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    Ok(righe)
}

/// Indovina il MIME dall'estensione: solo per i tipi comuni, `None` altrove (il
/// visualizzatore del sistema operativo se la cava comunque aprendo per estensione).
fn mime_da_estensione(nome_file: &str) -> Option<String> {
    let ext = nome_file.rsplit('.').next()?.to_lowercase();
    let mime = match ext.as_str() {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "zip" => "application/zip",
        _ => return None,
    };
    Some(mime.to_string())
}

/// Allega un file a una voce di avanzamento: il contenuto entra nel file `.evmproj`
/// come blob, non un percorso esterno (un solo file da copiare/spostare, sez. 2).
pub fn aggiungi_allegato(conn: &Connection, entry_id: i64, percorso_file: &str) -> Esito<i64> {
    let percorso = std::path::Path::new(percorso_file);
    let nome_file = percorso
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("percorso file non valido")?
        .to_string();
    let contenuto = std::fs::read(percorso).map_err(errore)?;
    let dimensione = contenuto.len() as i64;
    let mime = mime_da_estensione(&nome_file);
    conn.execute(
        "INSERT INTO progress_entry_attachment
            (progress_entry_id, file_name, mime_type, size_bytes, content, uploaded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![entry_id, nome_file, mime, dimensione, contenuto, tempo::adesso_iso()],
    )
    .map_err(errore)?;
    Ok(conn.last_insert_rowid())
}

/// Scrive il contenuto di un allegato nel percorso scelto dall'utente (dialogo "Save as").
pub fn salva_allegato(conn: &Connection, allegato_id: i64, percorso_destinazione: &str) -> Esito<()> {
    let contenuto: Vec<u8> = conn
        .query_row(
            "SELECT content FROM progress_entry_attachment WHERE id = ?1",
            [allegato_id],
            |r| r.get(0),
        )
        .map_err(errore)?;
    std::fs::write(percorso_destinazione, contenuto).map_err(errore)
}

pub fn rimuovi_allegato(conn: &Connection, allegato_id: i64) -> Esito<()> {
    let cambiate = conn
        .execute("DELETE FROM progress_entry_attachment WHERE id = ?1", [allegato_id])
        .map_err(errore)?;
    if cambiate == 0 {
        return Err("allegato non trovato".into());
    }
    Ok(())
}

// ------------------------------------------------------ Utenti e perimetri

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Utente {
    pub id: i64,
    pub uid: String,
    pub nome: String,
    pub ruoli: Vec<String>,
    pub attivo: bool,
}

pub fn utenti(conn: &Connection) -> Esito<Vec<Utente>> {
    let mut stmt = conn
        .prepare("SELECT id, user_uid, display_name, active FROM user_profile ORDER BY display_name")
        .map_err(errore)?;
    let base = stmt
        .query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)? != 0))
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    let mut out = Vec::new();
    for (id, uid, nome, attivo) in base {
        let mut ruoli_stmt = conn
            .prepare("SELECT role FROM user_role WHERE user_profile_id = ?1 ORDER BY role")
            .map_err(errore)?;
        let ruoli = ruoli_stmt
            .query_map([id], |r| r.get(0))
            .map_err(errore)?
            .collect::<rusqlite::Result<Vec<String>>>()
            .map_err(errore)?;
        out.push(Utente { id, uid, nome, ruoli, attivo });
    }
    Ok(out)
}

pub const RUOLI: [&str; 4] = ["project_engineer", "supervisore", "coordinatore_piano", "amministratore"];

pub fn crea_utente(conn: &mut Connection, uid: &str, nome: &str, ruoli: &[String]) -> Esito<()> {
    if uid.trim().is_empty() || nome.trim().is_empty() {
        return Err("identificativo e nome dell'utente sono obbligatori".into());
    }
    if ruoli.is_empty() {
        return Err("assegna almeno un ruolo".into());
    }
    if let Some(r) = ruoli.iter().find(|r| !RUOLI.contains(&r.as_str())) {
        return Err(format!("ruolo sconosciuto: {r}"));
    }
    let tx = conn.transaction().map_err(errore)?;
    tx.execute(
        "INSERT INTO user_profile (user_uid, display_name) VALUES (?1, ?2)",
        params![uid.trim(), nome.trim()],
    )
    .map_err(errore)?;
    let id = tx.last_insert_rowid();
    for ruolo in ruoli {
        tx.execute(
            "INSERT INTO user_role (user_profile_id, role) VALUES (?1, ?2)",
            params![id, ruolo],
        )
        .map_err(errore)?;
    }
    tx.commit().map_err(errore)
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Perimetro {
    pub id: i64,
    pub nome: String,
    pub codice_wbs: Option<String>,
    pub task: i64,
    pub proprietario: Option<String>,
}

pub fn perimetri(conn: &Connection, pid: i64) -> Esito<Vec<Perimetro>> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.rule_json, u.display_name,
                    (SELECT count(*) FROM scope_task st WHERE st.scope_id = s.id)
             FROM scope s LEFT JOIN user_profile u ON u.id = s.owner_user_id
             WHERE s.project_id = ?1 ORDER BY s.name",
        )
        .map_err(errore)?;
    let righe = stmt
        .query_map([pid], |r| {
            let regola: String = r.get(2)?;
            let codice = serde_json::from_str::<serde_json::Value>(&regola)
                .ok()
                .and_then(|v| v.get("wbs").and_then(|c| c.as_str()).map(str::to_string));
            Ok(Perimetro {
                id: r.get(0)?,
                nome: r.get(1)?,
                codice_wbs: codice,
                proprietario: r.get(3)?,
                task: r.get(4)?,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;
    Ok(righe)
}

/// Crea un perimetro come sottoalbero WBS e ne fissa i task appartenenti.
pub fn crea_perimetro(
    conn: &mut Connection,
    pid: i64,
    nome: &str,
    codice_wbs: &str,
    proprietario_uid: Option<&str>,
) -> Esito<()> {
    let nome = nome.trim();
    let codice = codice_wbs.trim();
    if nome.is_empty() || codice.is_empty() {
        return Err("nome e codice WBS del perimetro sono obbligatori".into());
    }
    let tx = conn.transaction().map_err(errore)?;
    let presente: bool = tx
        .query_row(
            "SELECT count(*) FROM wbs WHERE project_id = ?1 AND code = ?2",
            params![pid, codice],
            |r| r.get::<_, i64>(0),
        )
        .map_err(errore)?
        > 0;
    if !presente {
        return Err(format!("il codice WBS {codice} non esiste nel progetto"));
    }
    let proprietario: Option<i64> = match proprietario_uid.filter(|u| !u.is_empty()) {
        Some(uid) => Some(
            tx.query_row("SELECT id FROM user_profile WHERE user_uid = ?1", [uid], |r| r.get(0))
                .optional()
                .map_err(errore)?
                .ok_or_else(|| format!("utente {uid} non trovato"))?,
        ),
        None => None,
    };
    let regola = serde_json::json!({ "wbs": codice }).to_string();
    let adesso = tempo::adesso_iso();
    tx.execute(
        "INSERT INTO scope (project_id, name, rule_kind, rule_json, owner_user_id, resolved_at)
         VALUES (?1, ?2, 'wbs', ?3, ?4, ?5)",
        params![pid, nome, regola, proprietario, adesso],
    )
    .map_err(errore)?;
    let scope_id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO scope_task (scope_id, task_id, uid_source, added_at)
         SELECT ?1, t.id, t.uid_source, ?2 FROM task t JOIN wbs w ON w.id = t.wbs_id
         WHERE t.project_id = ?3 AND t.is_summary = 0 AND (w.code = ?4 OR w.code LIKE ?4 || '.%')",
        params![scope_id, adesso, pid, codice],
    )
    .map_err(errore)?;
    tx.commit().map_err(errore)
}

// ---------------------------------------------------- Buffer e riserve

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rischio {
    pub id: i64,
    pub descrizione: String,
    pub probabilita_pct: Option<f64>,
    pub impatto: Option<f64>,
    pub contingenza: Option<f64>,
    /// Importo usato (`risk.usage_amount`): `None` se il rischio non si è ancora
    /// materializzato, diverso da `Some(0.0)` ("materializzato ma senza costo").
    pub utilizzato: Option<f64>,
    pub data_utilizzo: Option<String>,
    pub stato: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Consumo {
    pub id: i64,
    pub tipo: String,
    pub importo: f64,
    pub data: String,
    pub nota: Option<String>,
    /// Riservato a `management_reserve` (RES_MR_UNAPPROVED, specifica Fase 5 §3.8):
    /// contingency/buffer di tempo non richiedono approvazione, il campo esiste su
    /// ogni riga solo perché `reserve_usage` non distingue la colonna per tipo.
    pub approvato: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Riserve {
    pub contingency_pct: f64,
    pub mgmt_reserve_pct: f64,
    pub time_buffer_days: f64,
    pub bac_totale: Option<f64>,
    pub contingenza_allocata: f64,
    pub rischi: Vec<Rischio>,
    pub consumi: Vec<Consumo>,
}

pub fn riserve(conn: &Connection, pid: i64) -> Esito<Riserve> {
    let (contingency_pct, mgmt_reserve_pct, time_buffer_days): (f64, f64, f64) = conn
        .query_row(
            "SELECT contingency_pct, mgmt_reserve_pct, time_buffer_days
             FROM project_params WHERE project_id = ?1",
            [pid],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(errore)?;
    let bac_totale = conn
        .query_row(
            "SELECT bac_total FROM baseline WHERE project_id = ?1 AND kind = 'startup'
             ORDER BY id DESC LIMIT 1",
            [pid],
            |r| r.get::<_, Option<f64>>(0),
        )
        .optional()
        .map_err(errore)?
        .flatten();

    let mut stmt = conn
        .prepare(
            "SELECT id, description, probability_pct, impact_estimated, contingency_allocated, usage_amount, usage_date, status
             FROM risk WHERE project_id = ?1 ORDER BY id",
        )
        .map_err(errore)?;
    let rischi = stmt
        .query_map([pid], |r| {
            Ok(Rischio {
                id: r.get(0)?,
                descrizione: r.get(1)?,
                probabilita_pct: r.get(2)?,
                impatto: r.get(3)?,
                contingenza: r.get(4)?,
                utilizzato: r.get(5)?,
                data_utilizzo: r.get(6)?,
                stato: r.get(7)?,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, kind, amount, date, note, approved FROM reserve_usage
             WHERE project_id = ?1 ORDER BY date, id",
        )
        .map_err(errore)?;
    let consumi = stmt
        .query_map([pid], |r| {
            Ok(Consumo {
                id: r.get(0)?,
                tipo: r.get(1)?,
                importo: r.get(2)?,
                data: r.get(3)?,
                nota: r.get(4)?,
                approvato: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(errore)?;

    let contingenza_allocata = rischi.iter().filter_map(|r| r.contingenza).sum();
    Ok(Riserve {
        contingency_pct,
        mgmt_reserve_pct,
        time_buffer_days,
        bac_totale,
        contingenza_allocata,
        rischi,
        consumi,
    })
}

pub fn crea_rischio(
    conn: &Connection,
    pid: i64,
    descrizione: &str,
    probabilita_pct: Option<i64>,
    impatto: Option<f64>,
    contingenza: Option<f64>,
) -> Esito<()> {
    if descrizione.trim().is_empty() {
        return Err("la descrizione del rischio è obbligatoria".into());
    }
    if let Some(p) = probabilita_pct {
        if !(0..=100).contains(&p) {
            return Err("la probabilità deve essere un intero tra 0 e 100".into());
        }
    }
    conn.execute(
        "INSERT INTO risk (project_id, description, probability_pct, impact_estimated, contingency_allocated)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![pid, descrizione.trim(), probabilita_pct, impatto, contingenza],
    )
    .map_err(errore)?;
    Ok(())
}

pub fn registra_consumo(
    conn: &Connection,
    pid: i64,
    tipo: &str,
    importo: f64,
    data: &str,
    nota: Option<&str>,
) -> Esito<()> {
    if !importo.is_finite() || importo <= 0.0 {
        return Err("l'importo del consumo deve essere positivo".into());
    }
    let data = tempo::normalizza_data(data).ok_or_else(|| format!("data non valida: {data}"))?;
    conn.execute(
        "INSERT INTO reserve_usage (project_id, kind, amount, date, note) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![pid, tipo, importo, data, nota.filter(|n| !n.trim().is_empty())],
    )
    .map_err(errore)?;
    Ok(())
}

/// Approva un consumo di riserva (serve a chiudere RES_MR_UNAPPROVED per la management
/// reserve, specifica Fase 5 §3.8). Riservato al coordinatore del piano.
pub fn approva_consumo_riserva(conn: &Connection, pid: i64, attore_id: Option<i64>, id: i64) -> Esito<()> {
    richiede_coordinatore_piano(conn, attore_id)?;
    let cambiate = conn
        .execute(
            "UPDATE reserve_usage SET approved = 1 WHERE id = ?1 AND project_id = ?2 AND approved = 0",
            params![id, pid],
        )
        .map_err(errore)?;
    if cambiate == 0 {
        return Err("consumo non trovato o già approvato".into());
    }
    Ok(())
}

pub fn aggiorna_parametri(
    conn: &Connection,
    pid: i64,
    contingency_pct: i64,
    mgmt_reserve_pct: i64,
    time_buffer_days: f64,
) -> Esito<()> {
    for (nome, v) in [
        ("contingency", contingency_pct),
        ("riserva di gestione", mgmt_reserve_pct),
    ] {
        if !(0..=100).contains(&v) {
            return Err(format!("la {nome} deve essere un intero tra 0 e 100 %"));
        }
    }
    if time_buffer_days < 0.0 {
        return Err("il buffer di tempo non può essere negativo".into());
    }
    conn.execute(
        "UPDATE project_params SET contingency_pct = ?2, mgmt_reserve_pct = ?3, time_buffer_days = ?4
         WHERE project_id = ?1",
        params![pid, contingency_pct as f64, mgmt_reserve_pct as f64, time_buffer_days],
    )
    .map_err(errore)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::{salva_piano, ImportedPlan, PlanTask, SourceInfo};
    use crate::progetto::crea_progetto;
    use tempfile::tempdir;

    /// Progetto con due task in WBS 1 (uno con avanzamento nel piano) e una baseline.
    fn progetto() -> (tempfile::TempDir, Connection, i64) {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("p.evmproj");
        let info = crea_progetto(&percorso, "Prova").unwrap();
        let mut conn = crate::open_and_migrate(&percorso).unwrap();
        let piano = ImportedPlan {
            tasks: vec![
                PlanTask {
                    uid: "1".into(),
                    name: "Fase".into(),
                    wbs: Some("1".into()),
                    is_summary: true,
                    ..Default::default()
                },
                PlanTask {
                    uid: "2".into(),
                    name: "Scavo".into(),
                    wbs: Some("1.1".into()),
                    start: Some("2026-01-05".into()),
                    finish: Some("2026-01-09".into()),
                    cost: Some(1000.0),
                    pct_complete: Some(50.0),
                    actual_start: Some("2026-01-05".into()),
                    ..Default::default()
                },
                PlanTask {
                    uid: "3".into(),
                    name: "Posa".into(),
                    wbs: Some("1.2".into()),
                    cost: Some(500.0),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        salva_piano(
            &mut conn,
            &piano,
            &SourceInfo {
                project_name: "Prova",
                source_type: "manuale",
                import_kind: "piano_csv",
                source_file: "test",
                file_hash: "x".into(),
            },
            &crate::import::CommitOptions::default(),
        )
        .unwrap();
        // salva_piano crea il progetto con il piano: è l'ultimo inserito.
        let pid: i64 = conn
            .query_row("SELECT max(id) FROM project", [], |r| r.get(0))
            .unwrap();
        let _ = info;
        (dir, conn, pid)
    }

    #[test]
    fn dashboard_conta_task_e_avanzamento_medio() {
        let (_d, conn, pid) = progetto();
        let d = dashboard(&conn, pid).unwrap();
        assert_eq!(d.task_totali, 2, "il riepilogo non conta");
        assert_eq!(d.bac_totale, Some(1500.0));
        // Scavo al 50 %, Posa al 0 %: media 25 %.
        assert_eq!(d.avanzamento_medio_pct.map(|v| v.round()), Some(25.0));
        assert!(d.anomalie.iter().any(|a| a.uid == "3"), "Posa senza date");
    }

    #[test]
    fn un_rifiuto_riporta_il_motivo_a_chi_ha_proposto() {
        let (_d, mut conn, pid) = progetto();
        registra_avanzamento(&mut conn, pid, "3", 30.0, None, None, None, None, None).unwrap();
        let voce = approvazioni(&conn, pid).unwrap()[0].id;
        assert!(respingi(&conn, voce, "  ").is_err(), "il motivo è obbligatorio");
        respingi(&conn, voce, "manca la data di fine").unwrap();
        let riga = avanzamento_elenco(&conn, pid).unwrap().into_iter().find(|r| r.uid == "3").unwrap();
        assert_eq!(riga.stato_ultima_voce.as_deref(), Some("respinto"));
        assert_eq!(riga.nota_ultima_voce.as_deref(), Some("manca la data di fine"));
        assert!(approvazioni(&conn, pid).unwrap().is_empty());
    }

    #[test]
    fn avanzamento_passa_da_inviato_ad_applicato() {
        let (_d, mut conn, pid) = progetto();
        registra_avanzamento(&mut conn, pid, "3", 30.0, Some("2026-01-12".into()), None, Some(1200.0), None, None).unwrap();
        let coda = approvazioni(&conn, pid).unwrap();
        assert_eq!(coda.len(), 1, "una proposta registrata è subito in approvazione");
        approva(&mut conn, coda[0].id).unwrap();
        let riga = avanzamento_elenco(&conn, pid)
            .unwrap()
            .into_iter()
            .find(|r| r.uid == "3")
            .unwrap();
        assert_eq!(riga.pct, 30.0);
        assert_eq!(riga.stato_ultima_voce.as_deref(), Some("applicato"));
        // Lo scavo non deve perdere il suo 50 % nel nuovo snapshot.
        let scavo = avanzamento_elenco(&conn, pid).unwrap().into_iter().find(|r| r.uid == "2").unwrap();
        assert_eq!(scavo.pct, 50.0);
    }

    #[test]
    fn la_nota_dell_autore_non_si_confonde_con_il_motivo_di_rifiuto() {
        let (_d, mut conn, pid) = progetto();
        registra_avanzamento(&mut conn, pid, "3", 30.0, None, None, None, None, Some("ritardo per maltempo".into()))
            .unwrap();
        let voce = approvazioni(&conn, pid).unwrap()[0].id;
        respingi(&conn, voce, "manca la data di fine").unwrap();
        let storico = storico_avanzamento(&conn, pid, "3").unwrap();
        assert_eq!(storico.len(), 1);
        assert_eq!(storico[0].nota_autore.as_deref(), Some("ritardo per maltempo"));
        assert_eq!(storico[0].nota_rifiuto.as_deref(), Some("manca la data di fine"));
    }

    #[test]
    fn lo_storico_vede_tutte_le_voci_non_solo_l_ultima() {
        let (_d, mut conn, pid) = progetto();
        registra_avanzamento(&mut conn, pid, "3", 10.0, None, None, None, None, None).unwrap();
        let prima = approvazioni(&conn, pid).unwrap()[0].id;
        approva(&mut conn, prima).unwrap();
        registra_avanzamento(&mut conn, pid, "3", 20.0, None, None, None, None, None).unwrap();
        let storico = storico_avanzamento(&conn, pid, "3").unwrap();
        assert_eq!(storico.len(), 2, "entrambe le voci restano visibili, non solo la vigente");
        assert_eq!(storico[0].pct, 20.0, "la più recente è la prima (ORDER BY id DESC)");
        assert_eq!(storico[1].pct, 10.0);
    }

    #[test]
    fn un_allegato_si_puo_aggiungere_elencare_salvare_e_rimuovere() {
        let (dir, mut conn, pid) = progetto();
        registra_avanzamento(&mut conn, pid, "3", 10.0, None, None, None, None, None).unwrap();
        let entry_id = approvazioni(&conn, pid).unwrap()[0].id;

        let origine = dir.path().join("foto-cantiere.jpg");
        std::fs::write(&origine, b"contenuto finto di una foto").unwrap();
        let allegato_id = aggiungi_allegato(&conn, entry_id, origine.to_str().unwrap()).unwrap();

        let elenco = elenco_allegati(&conn, entry_id).unwrap();
        assert_eq!(elenco.len(), 1);
        assert_eq!(elenco[0].nome_file, "foto-cantiere.jpg");
        assert_eq!(elenco[0].mime.as_deref(), Some("image/jpeg"));
        assert_eq!(elenco[0].dimensione, 27);

        let storico = storico_avanzamento(&conn, pid, "3").unwrap();
        assert_eq!(storico[0].allegati, 1);

        let destinazione = dir.path().join("scaricato.jpg");
        salva_allegato(&conn, allegato_id, destinazione.to_str().unwrap()).unwrap();
        assert_eq!(std::fs::read(&destinazione).unwrap(), b"contenuto finto di una foto");

        rimuovi_allegato(&conn, allegato_id).unwrap();
        assert!(elenco_allegati(&conn, entry_id).unwrap().is_empty());
    }

    #[test]
    fn wbs_e_perimetri_seguono_il_sottoalbero() {
        let (_d, mut conn, pid) = progetto();
        crea_wbs(&conn, pid, "1.3", "Collaudo").unwrap();
        assert!(crea_wbs(&conn, pid, "9.1", "Orfano").is_err(), "padre mancante");
        crea_perimetro(&mut conn, pid, "Area 1", "1", None).unwrap();
        let p = perimetri(&conn, pid).unwrap();
        assert_eq!(p[0].task, 2, "Scavo e Posa, non il riepilogo");
    }

    #[test]
    fn riserve_registra_rischi_consumi_e_parametri() {
        let (_d, conn, pid) = progetto();
        crea_rischio(&conn, pid, "Ritardo fornitore", Some(30), Some(200.0), Some(60.0)).unwrap();
        registra_consumo(&conn, pid, "contingency", 25.0, "10/02/2026", Some("prima tranche")).unwrap();
        aggiorna_parametri(&conn, pid, 10, 5, 3.0).unwrap();
        let r = riserve(&conn, pid).unwrap();
        assert_eq!(r.rischi.len(), 1);
        assert_eq!(r.consumi[0].data, "2026-02-10");
        assert_eq!(r.contingenza_allocata, 60.0);
        assert_eq!(r.contingency_pct, 10.0);
        assert!(aggiorna_parametri(&conn, pid, 150, 0, 0.0).is_err());
    }

    #[test]
    fn gantt_porta_wbs_e_date_di_baseline_parametrizzate() {
        let (_d, conn, pid) = progetto();
        let task_scavo: i64 = conn.query_row("SELECT id FROM task WHERE uid_source = '2'", [], |r| r.get(0)).unwrap();

        let righe = gantt(&conn, pid, None).unwrap();
        let scavo = righe.iter().find(|r| r.uid == "2").unwrap();
        assert_eq!(scavo.wbs.as_deref(), Some("1.1"));
        // Nessun baseline_id esplicito: cade sull'ultima baseline 'startup' creata dall'import.
        assert_eq!(scavo.inizio_baseline.as_deref(), Some("2026-01-05"));
        assert_eq!(scavo.fine_baseline.as_deref(), Some("2026-01-09"));

        // Una seconda baseline con date diverse per lo stesso task: con il suo id esplicito,
        // il Gantt legge da quella, non più dalla 'startup' di default.
        conn.execute(
            "INSERT INTO baseline (project_id, name, kind, created_at, locked) VALUES (?1, 'Stima', 'stima', '2026-01-01T00:00:00Z', 1)",
            [pid],
        )
        .unwrap();
        let altra_baseline = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO baseline_task (baseline_id, task_id, start, finish) VALUES (?1, ?2, '2025-12-20', '2025-12-24')",
            params![altra_baseline, task_scavo],
        )
        .unwrap();
        let righe_stima = gantt(&conn, pid, Some(altra_baseline)).unwrap();
        let scavo_stima = righe_stima.iter().find(|r| r.uid == "2").unwrap();
        assert_eq!(scavo_stima.inizio_baseline.as_deref(), Some("2025-12-20"));
        assert_eq!(scavo_stima.fine_baseline.as_deref(), Some("2025-12-24"));
        // Il task "Posa" non è nella nuova baseline: nessuna riga di fallback indesiderata.
        let posa_stima = righe_stima.iter().find(|r| r.uid == "3").unwrap();
        assert_eq!(posa_stima.inizio_baseline, None);
    }
}
