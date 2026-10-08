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

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRiga {
    pub id: i64,
    pub status_date: String,
    pub label: Option<String>,
    pub source: String,
}

/// Elenco delle date di stato del progetto, più recenti prima. Usato dal
/// selettore di data di stato della barra di contesto (Fase 5); `dati_monitoraggio`
/// legge già gli stessi id internamente ma non li espone nel suo `SnapshotMon`.
pub fn elenco_snapshot(conn: &Connection, pid: i64) -> Esito<Vec<SnapshotRiga>> {
    let mut st = conn
        .prepare("SELECT id, status_date, label, source FROM status_snapshot WHERE project_id = ?1 ORDER BY status_date DESC, id DESC")
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(SnapshotRiga { id: r.get(0)?, status_date: r.get(1)?, label: r.get(2)?, source: r.get(3)? })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
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
    pub creata_da: Option<String>,
    pub bloccata: bool,
    pub archiviata: bool,
    pub bac_diretto: Option<f64>,
    pub bac_indiretto: Option<f64>,
    pub bac_contingency: Option<f64>,
    pub bac_totale: Option<f64>,
}

/// Elenco delle baseline del progetto, più recenti prima dell'id. Usata sia da
/// `governance()` sia dal selettore di baseline della barra di contesto (Fase 5).
pub fn elenco_baseline(conn: &Connection, pid: i64) -> Esito<Vec<BaselineRiga>> {
    let mut st = conn
        .prepare(
            "SELECT id, name, kind, created_at, locked, bac_direct, bac_indirect, bac_contingency, bac_total, archiviata, created_by
             FROM baseline WHERE project_id = ?1 ORDER BY id",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(BaselineRiga {
                id: r.get(0)?,
                nome: r.get(1)?,
                tipo: r.get(2)?,
                creata_il: r.get(3)?,
                bloccata: r.get::<_, i64>(4)? != 0,
                bac_diretto: r.get(5)?,
                bac_indiretto: r.get(6)?,
                bac_contingency: r.get(7)?,
                bac_totale: r.get(8)?,
                archiviata: r.get::<_, i64>(9)? != 0,
                creata_da: r.get(10)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

/// L'id della baseline "corrente": l'ultima bloccata e non archiviata. Una
/// change_request parte sempre da questa (`baseline_from_id`); nessuna
/// baseline corrente = niente da cui proporre una variazione.
fn baseline_corrente(conn: &Connection, pid: i64) -> Esito<i64> {
    conn.query_row(
        "SELECT id FROM baseline WHERE project_id = ?1 AND locked = 1 AND archiviata = 0 ORDER BY id DESC LIMIT 1",
        [pid],
        |r| r.get(0),
    )
    .map_err(|_| "nessuna baseline bloccata da cui partire: blocca prima una baseline di budget".to_string())
}

/// Verifica che l'utente `attore_id` sia attivo e abbia il ruolo
/// `coordinatore_piano` (specifica Fase 5 §3.5: le azioni di gestione sulle
/// schermate Baseline/Change request sono riservate a questo ruolo). Restituisce
/// il suo nome, usato come "creata da"/"approvata da" invece di un campo di
/// testo libero separato (l'autore tracciato è sempre l'utente verificato).
fn richiede_coordinatore_piano(conn: &Connection, attore_id: Option<i64>) -> Esito<String> {
    let id = attore_id.ok_or_else(|| "azione riservata al coordinatore del piano: seleziona l'utente attivo".to_string())?;
    let nome: String = conn
        .query_row("SELECT display_name FROM user_profile WHERE id = ?1 AND active = 1", [id], |r| r.get(0))
        .map_err(|_| "utente attivo non trovato".to_string())?;
    let ha_ruolo: i64 = conn
        .query_row("SELECT COUNT(*) FROM user_role WHERE user_profile_id = ?1 AND role = 'coordinatore_piano'", [id], |r| r.get(0))
        .map_err(e)?;
    if ha_ruolo == 0 {
        return Err(format!("{nome} non ha il ruolo di coordinatore del piano"));
    }
    Ok(nome)
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRequestRiga {
    pub id: i64,
    pub richiesta_il: String,
    pub richiesta_da: Option<String>,
    pub motivo: String,
    pub delta_costo: Option<f64>,
    pub delta_durata: Option<f64>,
    pub delta_scope: Option<String>,
    /// `pending` | `approved` | `rejected`.
    pub stato: String,
    pub approvata_il: Option<String>,
    pub approvata_da: Option<String>,
    pub baseline_da_id: Option<i64>,
    pub baseline_a_id: Option<i64>,
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
    let baseline = elenco_baseline(conn, pid)?;
    let mut st = conn
        .prepare(
            "SELECT id, requested_at, requested_by, reason, delta_cost, delta_duration_days, delta_scope_note,
                    status, approved_at, approved_by, baseline_from_id, baseline_to_id
             FROM change_request WHERE project_id = ?1 ORDER BY id",
        )
        .map_err(e)?;
    let change_request = st
        .query_map([pid], |r| {
            Ok(ChangeRequestRiga {
                id: r.get(0)?,
                richiesta_il: r.get(1)?,
                richiesta_da: r.get(2)?,
                motivo: r.get(3)?,
                delta_costo: r.get(4)?,
                delta_durata: r.get(5)?,
                delta_scope: r.get(6)?,
                stato: r.get(7)?,
                approvata_il: r.get(8)?,
                approvata_da: r.get(9)?,
                baseline_da_id: r.get(10)?,
                baseline_a_id: r.get(11)?,
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

/// Apre una richiesta di variazione: richiedente e motivo obbligatori, delta opzionali.
/// Parte sempre dalla baseline corrente (l'ultima bloccata e non archiviata): non si
/// propone una variazione senza una baseline da cui variare.
pub fn crea_change_request(
    conn: &Connection,
    pid: i64,
    richiedente: &str,
    motivo: &str,
    delta_costo: Option<f64>,
    delta_durata: Option<f64>,
    delta_scope: Option<&str>,
) -> Esito<i64> {
    if richiedente.trim().is_empty() {
        return Err("il richiedente della variazione è obbligatorio".into());
    }
    if motivo.trim().is_empty() {
        return Err("il motivo della variazione è obbligatorio".into());
    }
    let baseline_from_id = baseline_corrente(conn, pid)?;
    let nota_scope = delta_scope.map(str::trim).filter(|s| !s.is_empty());
    conn.execute(
        "INSERT INTO change_request (project_id, baseline_from_id, requested_at, requested_by, reason, delta_cost, delta_duration_days, delta_scope_note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![pid, baseline_from_id, tempo::adesso_iso(), richiedente.trim(), motivo.trim(), delta_costo, delta_durata, nota_scope],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Approva una richiesta: riservato al coordinatore del piano. Crea la nuova baseline
/// collegata (clona i BAC della baseline di partenza con il Δ costo applicato al BAC
/// diretto) e restituisce il suo id (specifica Fase 5 §3.5: "approvata ⇒ crea la nuova
/// baseline collegata"). Nessuna variazione di task/data di baseline: come
/// `blocca_baseline_budget`, questa è una baseline di soli importi di budget.
pub fn approva_change_request(conn: &mut Connection, pid: i64, attore_id: Option<i64>, id: i64) -> Esito<i64> {
    let nome_decisore = richiede_coordinatore_piano(conn, attore_id)?;
    let tx = conn.transaction().map_err(e)?;
    let (baseline_from_id, delta_costo): (Option<i64>, Option<f64>) = tx
        .query_row(
            "SELECT baseline_from_id, delta_cost FROM change_request WHERE id = ?1 AND project_id = ?2 AND status = 'pending'",
            params![id, pid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "richiesta non trovata o già decisa".to_string())?;
    let baseline_from_id = baseline_from_id.ok_or("la richiesta non ha una baseline di partenza registrata")?;
    let (nome_base, diretto, indiretto, contingenza): (String, f64, f64, f64) = tx
        .query_row(
            "SELECT name, COALESCE(bac_direct, 0), COALESCE(bac_indirect, 0), COALESCE(bac_contingency, 0) FROM baseline WHERE id = ?1",
            [baseline_from_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(e)?;
    let nuovo_diretto = diretto + delta_costo.unwrap_or(0.0);
    let nuovo_totale = nuovo_diretto + indiretto + contingenza;
    tx.execute(
        "INSERT INTO baseline (project_id, name, kind, created_at, locked, bac_direct, bac_indirect, bac_contingency, bac_total, created_by)
         VALUES (?1, ?2, 'altra', ?3, 1, ?4, ?5, ?6, ?7, ?8)",
        params![pid, format!("{nome_base} — CR #{id}"), tempo::adesso_iso(), nuovo_diretto, indiretto, contingenza, nuovo_totale, nome_decisore],
    )
    .map_err(e)?;
    let nuova_baseline_id = tx.last_insert_rowid();
    let cambiate = tx
        .execute(
            "UPDATE change_request SET status = 'approved', approved_at = ?3, approved_by = ?4, baseline_to_id = ?5
             WHERE id = ?1 AND project_id = ?2 AND status = 'pending'",
            params![id, pid, tempo::adesso_iso(), nome_decisore, nuova_baseline_id],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("richiesta non trovata o già decisa".into());
    }
    tx.commit().map_err(e)?;
    Ok(nuova_baseline_id)
}

/// Respinge una richiesta: riservato al coordinatore del piano. Nessuna nuova baseline.
pub fn rifiuta_change_request(conn: &Connection, pid: i64, attore_id: Option<i64>, id: i64) -> Esito<()> {
    let nome_decisore = richiede_coordinatore_piano(conn, attore_id)?;
    let cambiate = conn
        .execute(
            "UPDATE change_request SET status = 'rejected', approved_at = ?3, approved_by = ?4
             WHERE id = ?1 AND project_id = ?2 AND status = 'pending'",
            params![id, pid, tempo::adesso_iso(), nome_decisore],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("richiesta non trovata o già decisa".into());
    }
    Ok(())
}

/// Archivia una baseline: non compare più nell'elenco attivo, ma resta nel database con
/// la sua data e il suo contenuto. Non si cancella una baseline bloccata. Riservato al
/// coordinatore del piano.
pub fn archivia_baseline(conn: &Connection, pid: i64, attore_id: Option<i64>, id: i64) -> Esito<()> {
    richiede_coordinatore_piano(conn, attore_id)?;
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

/// Blocca una baseline di budget: il diretto è la somma dei budget dei WBS, indiretto e
/// contingency si impostano a mano; il totale è la loro somma. Immutabile (trigger del
/// database): per cambiarla serve una change request approvata. Riservato al
/// coordinatore del piano.
pub fn blocca_baseline_budget(
    conn: &Connection,
    pid: i64,
    attore_id: Option<i64>,
    nome: &str,
    tipo: &str,
    bac_indiretto: f64,
    bac_contingency: f64,
) -> Esito<i64> {
    let creatore = richiede_coordinatore_piano(conn, attore_id)?;
    if nome.trim().is_empty() {
        return Err("il nome della baseline è obbligatorio".into());
    }
    if !["stima", "startup", "altra"].contains(&tipo) {
        return Err(format!("tipo di baseline non valido: {tipo}"));
    }
    let bac_indiretto = importo_valido(bac_indiretto, "il BAC indiretto")?;
    let bac_contingency = importo_valido(bac_contingency, "la contingency")?;
    let diretto: f64 = conn
        .query_row("SELECT COALESCE(SUM(bac), 0) FROM wbs WHERE project_id = ?1", [pid], |r| r.get(0))
        .map_err(e)?;
    if diretto <= 0.0 {
        return Err("assegna prima un budget ai nodi WBS".into());
    }
    let totale = diretto + bac_indiretto + bac_contingency;
    conn.execute(
        "INSERT INTO baseline (project_id, name, kind, created_at, locked, bac_direct, bac_indirect, bac_contingency, bac_total, created_by)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9)",
        params![pid, nome.trim(), tipo, tempo::adesso_iso(), diretto, bac_indiretto, bac_contingency, totale, creatore],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

// ------------------------------------------------------ Confronto baseline

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigaConfrontoBaseline {
    pub codice: String,
    pub nome: String,
    pub costo_a: f64,
    pub costo_b: f64,
    pub delta_costo: f64,
    /// Percentuale (es. 12.5 = +12,5%); `None` se il costo A è zero (variazione non definibile).
    pub delta_costo_pct: Option<f64>,
    pub durata_a: Option<i64>,
    pub durata_b: Option<i64>,
    pub delta_durata: Option<i64>,
    pub inizio_a: Option<String>,
    pub inizio_b: Option<String>,
    pub fine_a: Option<String>,
    pub fine_b: Option<String>,
    pub delta_inizio: Option<i64>,
    pub delta_fine: Option<i64>,
}

fn delta_giorni_iso(a: &Option<String>, b: &Option<String>) -> Option<i64> {
    let a = tempo::giorno_da_iso(a.as_deref()?)?;
    let b = tempo::giorno_da_iso(b.as_deref()?)?;
    Some(b - a)
}

/// Confronta due baseline per nodo WBS: Δ costo (dalla somma di `baseline_task.cost`),
/// Δ durata e Δ date di inizio/fine (da min/max di `baseline_task.start`/`finish`).
/// Significativo solo per baseline con dati di task (import di piano): una baseline di
/// soli importi (`blocca_baseline_budget`/una variazione approvata) non ha righe in
/// `baseline_task` e confronta a zero su quel lato.
pub fn confronta_baseline(conn: &Connection, pid: i64, baseline_a: i64, baseline_b: i64) -> Esito<Vec<RigaConfrontoBaseline>> {
    for bid in [baseline_a, baseline_b] {
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM baseline WHERE id = ?1 AND project_id = ?2", params![bid, pid], |r| r.get(0))
            .map_err(e)?;
        if n == 0 {
            return Err("baseline non trovata nel progetto".into());
        }
    }
    let mut st = conn
        .prepare(
            "SELECT w.code, w.name,
                    COALESCE(SUM(bt_a.cost), 0), COALESCE(SUM(bt_b.cost), 0),
                    MIN(bt_a.start), MAX(bt_a.finish), MIN(bt_b.start), MAX(bt_b.finish)
             FROM wbs w
             LEFT JOIN task t ON t.wbs_id = w.id
             LEFT JOIN baseline_task bt_a ON bt_a.task_id = t.id AND bt_a.baseline_id = ?2
             LEFT JOIN baseline_task bt_b ON bt_b.task_id = t.id AND bt_b.baseline_id = ?3
             WHERE w.project_id = ?1
             GROUP BY w.id
             ORDER BY w.code",
        )
        .map_err(e)?;
    let righe = st
        .query_map(params![pid, baseline_a, baseline_b], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, f64>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, Option<String>>(6)?,
                r.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;

    Ok(righe
        .into_iter()
        .map(|(codice, nome, costo_a, costo_b, inizio_a, fine_a, inizio_b, fine_b)| {
            let durata_a = delta_giorni_iso(&inizio_a, &fine_a).map(|d| d + 1);
            let durata_b = delta_giorni_iso(&inizio_b, &fine_b).map(|d| d + 1);
            RigaConfrontoBaseline {
                codice,
                nome,
                costo_a,
                costo_b,
                delta_costo: costo_b - costo_a,
                delta_costo_pct: if costo_a != 0.0 { Some((costo_b - costo_a) / costo_a * 100.0) } else { None },
                delta_durata: match (durata_a, durata_b) {
                    (Some(a), Some(b)) => Some(b - a),
                    _ => None,
                },
                delta_inizio: delta_giorni_iso(&inizio_a, &inizio_b),
                delta_fine: delta_giorni_iso(&fine_a, &fine_b),
                durata_a,
                durata_b,
                inizio_a,
                inizio_b,
                fine_a,
                fine_b,
            }
        })
        .collect())
}

// ------------------------------------------------------------ Scope baseline

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RigaBaselineScope {
    pub wbs_id: i64,
    pub codice: String,
    pub nome: String,
    pub incluso: bool,
    pub nota: Option<String>,
}

/// Elenco dei nodi WBS del progetto con il loro stato in `baseline_scope` per la
/// baseline data: incluso di default (`included` non impostato) finché non viene
/// escluso esplicitamente.
pub fn baseline_scope_elenco(conn: &Connection, pid: i64, baseline_id: i64) -> Esito<Vec<RigaBaselineScope>> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM baseline WHERE id = ?1 AND project_id = ?2", params![baseline_id, pid], |r| r.get(0))
        .map_err(e)?;
    if n == 0 {
        return Err("baseline non trovata nel progetto".into());
    }
    let mut st = conn
        .prepare(
            "SELECT w.id, w.code, w.name, COALESCE(bs.included, 1), bs.note
             FROM wbs w LEFT JOIN baseline_scope bs ON bs.wbs_id = w.id AND bs.baseline_id = ?2
             WHERE w.project_id = ?1 ORDER BY w.code",
        )
        .map_err(e)?;
    let righe = st
        .query_map(params![pid, baseline_id], |r| {
            Ok(RigaBaselineScope {
                wbs_id: r.get(0)?,
                codice: r.get(1)?,
                nome: r.get(2)?,
                incluso: r.get::<_, i64>(3)? != 0,
                nota: r.get(4)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

/// Include/esclude un nodo WBS dalla baseline di scope, con nota. Riservato al
/// coordinatore del piano (specifica Fase 5 §3.5: gli altri sono in sola lettura).
pub fn imposta_baseline_scope(
    conn: &Connection,
    pid: i64,
    attore_id: Option<i64>,
    baseline_id: i64,
    wbs_id: i64,
    incluso: bool,
    nota: Option<&str>,
) -> Esito<()> {
    richiede_coordinatore_piano(conn, attore_id)?;
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM baseline WHERE id = ?1 AND project_id = ?2", params![baseline_id, pid], |r| r.get(0))
        .map_err(e)?;
    if n == 0 {
        return Err("baseline non trovata nel progetto".into());
    }
    let m: i64 = conn
        .query_row("SELECT COUNT(*) FROM wbs WHERE id = ?1 AND project_id = ?2", params![wbs_id, pid], |r| r.get(0))
        .map_err(e)?;
    if m == 0 {
        return Err("nodo WBS non trovato nel progetto".into());
    }
    let nota = nota.map(str::trim).filter(|s| !s.is_empty());
    conn.execute(
        "INSERT INTO baseline_scope (baseline_id, wbs_id, included, note) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (baseline_id, wbs_id) DO UPDATE SET included = excluded.included, note = excluded.note",
        params![baseline_id, wbs_id, incluso as i64, nota],
    )
    .map_err(e)?;
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
        conn.execute("INSERT INTO wbs (project_id, code, name) VALUES (?1, '1', 'Fase 1')", [info.id]).unwrap();
        conn.execute("INSERT INTO wbs (project_id, code, name) VALUES (?1, '1.1', 'Scavi')", [info.id]).unwrap();
        (dir, conn, info.id)
    }

    /// Crea un utente con il ruolo `coordinatore_piano` e ne restituisce l'id, per le
    /// azioni di gestione (blocco baseline, approvazione/rigetto CR, scope) riservate
    /// a questo ruolo.
    fn coordinatore(conn: &Connection) -> i64 {
        conn.execute("INSERT INTO user_profile (user_uid, display_name) VALUES ('coord', 'Coordinatore')", []).unwrap();
        let id = conn.last_insert_rowid();
        conn.execute("INSERT INTO user_role (user_profile_id, role) VALUES (?1, 'coordinatore_piano')", [id]).unwrap();
        id
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
    fn change_request_richiede_dati_parte_dalla_corrente_e_si_decide_una_volta() {
        let (_d, mut conn, pid) = progetto();
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let coord = coordinatore(&conn);
        assert!(crea_change_request(&conn, pid, "Mario Rossi", "Variante scavi", None, None, None).is_err(), "nessuna baseline corrente");
        let base_id = blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 0.0, 0.0).unwrap();
        assert!(crea_change_request(&conn, pid, "  ", "Variante scavi", None, None, None).is_err(), "richiedente obbligatorio");
        assert!(crea_change_request(&conn, pid, "Mario Rossi", "  ", None, None, None).is_err(), "motivo obbligatorio");
        let id = crea_change_request(&conn, pid, "Mario Rossi", "Variante scavi", Some(2500.0), Some(5.0), Some("Aggiunta recinzione")).unwrap();
        assert!(approva_change_request(&mut conn, pid, None, id).is_err(), "richiede coordinatore");
        let nuova_baseline = approva_change_request(&mut conn, pid, Some(coord), id).unwrap();
        assert!(approva_change_request(&mut conn, pid, Some(coord), id).is_err(), "già decisa");
        let g = governance(&conn, pid).unwrap();
        let cr = &g.change_request[0];
        assert_eq!(cr.stato, "approved");
        assert_eq!(cr.richiesta_da.as_deref(), Some("Mario Rossi"));
        assert_eq!(cr.approvata_da.as_deref(), Some("Coordinatore"));
        assert_eq!(cr.baseline_da_id, Some(base_id));
        assert_eq!(cr.baseline_a_id, Some(nuova_baseline));
        let nuova = elenco_baseline(&conn, pid).unwrap().into_iter().find(|b| b.id == nuova_baseline).unwrap();
        assert_eq!(nuova.bac_totale, Some(14500.0), "1.1 budget + delta costo");
        assert_eq!(nuova.creata_da.as_deref(), Some("Coordinatore"));
    }

    #[test]
    fn change_request_si_puo_respingere() {
        let (_d, conn, pid) = progetto();
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let coord = coordinatore(&conn);
        blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 0.0, 0.0).unwrap();
        let id = crea_change_request(&conn, pid, "Mario Rossi", "Variante scavi", None, None, None).unwrap();
        assert!(rifiuta_change_request(&conn, pid, None, id).is_err(), "richiede coordinatore");
        rifiuta_change_request(&conn, pid, Some(coord), id).unwrap();
        assert!(rifiuta_change_request(&conn, pid, Some(coord), id).is_err(), "già decisa");
        let g = governance(&conn, pid).unwrap();
        assert_eq!(g.change_request[0].stato, "rejected");
        assert_eq!(g.baseline.len(), 1, "nessuna baseline creata da un rigetto");
    }

    #[test]
    fn baseline_di_budget_richiede_coordinatore_budget_ed_e_immutabile() {
        let (_d, conn, pid) = progetto();
        let coord = coordinatore(&conn);
        assert!(blocca_baseline_budget(&conn, pid, None, "Startup", "startup", 0.0, 0.0).is_err(), "richiede coordinatore");
        assert!(blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 0.0, 0.0).is_err(), "senza budget");
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let id = blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 1000.0, 500.0).unwrap();
        let riga = elenco_baseline(&conn, pid).unwrap().into_iter().find(|b| b.id == id).unwrap();
        assert_eq!(riga.bac_diretto, Some(12000.0));
        assert_eq!(riga.bac_indiretto, Some(1000.0));
        assert_eq!(riga.bac_contingency, Some(500.0));
        assert_eq!(riga.bac_totale, Some(13500.0));
        assert_eq!(riga.creata_da.as_deref(), Some("Coordinatore"));
        let aggiornamento = conn.execute("UPDATE baseline SET bac_total = 1 WHERE id = ?1", [id]);
        assert!(aggiornamento.is_err(), "baseline bloccata non modificabile");
    }

    #[test]
    fn baseline_bloccata_si_archivia_ma_non_si_cancella() {
        let (_d, conn, pid) = progetto();
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let coord = coordinatore(&conn);
        let id = blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 0.0, 0.0).unwrap();
        assert!(conn.execute("DELETE FROM baseline WHERE id = ?1", [id]).is_err(), "cancellazione bloccata");
        assert!(archivia_baseline(&conn, pid, None, id).is_err(), "richiede coordinatore");
        archivia_baseline(&conn, pid, Some(coord), id).unwrap();
        assert!(archivia_baseline(&conn, pid, Some(coord), id).is_err(), "già archiviata");
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

    #[test]
    fn elenco_baseline_coincide_con_quello_dentro_governance() {
        let (_d, conn, pid) = progetto();
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let coord = coordinatore(&conn);
        blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 0.0, 0.0).unwrap();
        let elenco = elenco_baseline(&conn, pid).unwrap();
        let g = governance(&conn, pid).unwrap();
        assert_eq!(elenco, g.baseline, "stessa query, stesso risultato");
        assert_eq!(elenco[0].nome, "Startup");
    }

    #[test]
    fn confronta_baseline_calcola_delta_costo_e_date_per_wbs() {
        let (_d, conn, pid) = progetto();
        conn.execute("INSERT INTO task (project_id, wbs_id, uid_source, name) VALUES (?1, (SELECT id FROM wbs WHERE code = '1.1'), '1', 'Scavo')", [pid]).unwrap();
        let task_id = conn.last_insert_rowid();
        let coord = coordinatore(&conn);
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let base_a = blocca_baseline_budget(&conn, pid, Some(coord), "Stima", "stima", 0.0, 0.0).unwrap();
        let base_b = blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 0.0, 0.0).unwrap();
        conn.execute(
            "INSERT INTO baseline_task (baseline_id, task_id, start, finish, cost) VALUES (?1, ?2, '2026-01-05', '2026-01-09', 1000)",
            params![base_a, task_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO baseline_task (baseline_id, task_id, start, finish, cost) VALUES (?1, ?2, '2026-01-10', '2026-01-16', 1500)",
            params![base_b, task_id],
        )
        .unwrap();
        let righe = confronta_baseline(&conn, pid, base_a, base_b).unwrap();
        let riga = righe.iter().find(|r| r.codice == "1.1").unwrap();
        assert_eq!(riga.costo_a, 1000.0);
        assert_eq!(riga.costo_b, 1500.0);
        assert_eq!(riga.delta_costo, 500.0);
        assert_eq!(riga.delta_costo_pct, Some(50.0));
        assert_eq!(riga.durata_a, Some(5));
        assert_eq!(riga.durata_b, Some(7));
        assert_eq!(riga.delta_durata, Some(2));
        assert_eq!(riga.delta_inizio, Some(5));
        assert_eq!(riga.delta_fine, Some(7));
        assert!(confronta_baseline(&conn, pid, base_a, 999).is_err(), "baseline inesistente");
    }

    #[test]
    fn scope_baseline_e_incluso_di_default_e_si_puo_escludere() {
        let (_d, conn, pid) = progetto();
        let coord = coordinatore(&conn);
        imposta_budget_wbs(&conn, pid, "1.1", Some(12000.0)).unwrap();
        let base = blocca_baseline_budget(&conn, pid, Some(coord), "Startup", "startup", 0.0, 0.0).unwrap();
        let wbs_id = conn.query_row("SELECT id FROM wbs WHERE code = '1.1'", [], |r| r.get::<_, i64>(0)).unwrap();
        let elenco = baseline_scope_elenco(&conn, pid, base).unwrap();
        assert!(elenco.iter().all(|r| r.incluso), "incluso di default");
        assert!(imposta_baseline_scope(&conn, pid, None, base, wbs_id, false, Some("fuori perimetro")).is_err(), "richiede coordinatore");
        imposta_baseline_scope(&conn, pid, Some(coord), base, wbs_id, false, Some("fuori perimetro")).unwrap();
        let elenco = baseline_scope_elenco(&conn, pid, base).unwrap();
        let riga = elenco.iter().find(|r| r.wbs_id == wbs_id).unwrap();
        assert!(!riga.incluso);
        assert_eq!(riga.nota.as_deref(), Some("fuori perimetro"));
    }

    #[test]
    fn elenco_snapshot_espone_gli_id_in_ordine_decrescente() {
        let (_d, conn, pid) = progetto();
        conn.execute(
            "INSERT INTO status_snapshot (project_id, status_date, label, source) VALUES (?1, '2026-01-10', NULL, 'manuale')",
            [pid],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO status_snapshot (project_id, status_date, label, source) VALUES (?1, '2026-02-10', 'Chiusura mese', 'resync')",
            [pid],
        )
        .unwrap();
        let elenco = elenco_snapshot(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 2);
        assert_eq!(elenco[0].status_date, "2026-02-10", "più recente prima");
        assert_eq!(elenco[0].label.as_deref(), Some("Chiusura mese"));
        assert_eq!(elenco[0].source, "resync");
        assert!(elenco[0].id > elenco[1].id);
    }
}
