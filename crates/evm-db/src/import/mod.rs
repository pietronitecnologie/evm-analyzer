// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Importazione di un piano di progetto (export di MS Project in XML MSPDI,
//! CSV o Excel) in un nuovo file `.evmproj`. I parser producono un modello
//! comune ([`ImportedPlan`]); [`salva_piano`] lo scrive in un'unica
//! transazione, così un import fallito non lascia dati a metà.

pub mod excel;
pub mod mspdi;
pub mod tabular;

use std::collections::{BTreeSet, HashMap};
use std::path::Path;

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use crate::migrations::latest_version;
use crate::{open_and_migrate, tempo};

/// Ore di lavoro per giorno, usate per convertire ore in giorni (MS Project
/// esporta le durate in ore; il calendario standard è 8 h/giorno).
pub const ORE_PER_GIORNO: f64 = 8.0;

/// Minuti di lavoro per giorno, usati per i ritardi dei collegamenti.
const MINUTI_PER_GIORNO: f64 = ORE_PER_GIORNO * 60.0;

#[derive(Debug, Default)]
pub struct ImportedPlan {
    pub tasks: Vec<PlanTask>,
    pub resources: Vec<PlanResource>,
    pub assignments: Vec<PlanAssignment>,
    /// Avvisi non bloccanti emersi durante il parsing (righe scartate, ecc.).
    pub warnings: Vec<String>,
}

#[derive(Debug, Default)]
pub struct PlanTask {
    pub uid: String,
    pub name: String,
    pub wbs: Option<String>,
    pub is_summary: bool,
    pub is_milestone: bool,
    pub is_critical: bool,
    pub start: Option<String>,
    pub finish: Option<String>,
    pub duration_days: Option<f64>,
    pub float_days: Option<f64>,
    pub pct_complete: Option<f64>,
    pub actual_start: Option<String>,
    pub actual_finish: Option<String>,
    pub work_hours: Option<f64>,
    pub cost: Option<f64>,
    pub predecessors: Vec<PlanLink>,
}

#[derive(Debug)]
pub struct PlanLink {
    pub pred_uid: String,
    /// `FS`, `SS`, `FF` oppure `SF`.
    pub kind: String,
    pub lag_minutes: i64,
}

#[derive(Debug, Default)]
pub struct PlanResource {
    pub uid: String,
    pub name: String,
    pub kind: Option<String>,
    pub std_rate: Option<f64>,
    pub overtime_rate: Option<f64>,
    pub cost_per_use: Option<f64>,
}

#[derive(Debug)]
pub struct PlanAssignment {
    pub task_uid: String,
    pub resource_uid: String,
    pub units: f64,
}

/// Origine di un import, registrata nelle tabelle `project`, `source_sync`
/// e `import_log`.
pub struct SourceInfo<'a> {
    pub project_name: &'a str,
    pub source_type: &'a str,
    pub import_kind: &'a str,
    pub source_file: &'a str,
    pub file_hash: String,
}

/// Esito di un import: id del progetto creato e avvisi emersi.
#[derive(Debug)]
pub struct ImportOutcome {
    pub project_id: i64,
    pub warnings: Vec<String>,
}

/// Importa il file del piano in un nuovo `.evmproj`. Il formato è scelto
/// dall'estensione: `.xml` (MS Project MSPDI), `.csv`, `.xlsx`/`.xlsm`/`.xls`.
/// Il file di destinazione non deve già esistere: non viene mai sovrascritto.
pub fn importa_piano(
    origine: &Path,
    destinazione: &Path,
    nome_progetto: &str,
) -> Result<ImportOutcome, String> {
    if destinazione.exists() {
        return Err(format!(
            "il file {} esiste già: scegli un altro nome",
            destinazione.display()
        ));
    }
    let estensione = origine
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let bytes = std::fs::read(origine).map_err(|e| format!("lettura del file: {e}"))?;
    let file_hash: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    let (plan, source_type, import_kind) = match estensione.as_str() {
        "xml" => {
            let testo = String::from_utf8(bytes).map_err(|_| "file XML non UTF-8".to_string())?;
            (mspdi::leggi(&testo)?, "xml_mspdi", "piano_xml")
        }
        "csv" => (tabular::leggi_csv(&bytes)?, "csv", "piano_csv"),
        "xlsx" | "xlsm" | "xls" => (excel::leggi(origine)?, "excel", "piano_excel"),
        altro => return Err(format!("formato non supportato: .{altro}")),
    };

    let nome_file = origine
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();
    let mut conn = open_and_migrate(destinazione).map_err(|e| e.to_string())?;
    let risultato = salva_piano(
        &mut conn,
        &plan,
        &SourceInfo {
            project_name: nome_progetto,
            source_type,
            import_kind,
            source_file: &nome_file,
            file_hash,
        },
    );
    drop(conn);
    match risultato {
        Ok(outcome) => Ok(outcome),
        Err(e) => {
            // Niente file mezzo importato: il database è stato creato solo per questo import.
            let _ = std::fs::remove_file(destinazione);
            Err(format!("scrittura del progetto: {e}"))
        }
    }
}

/// Scrive il piano in un database già migrato, in un'unica transazione.
pub fn salva_piano(
    conn: &mut Connection,
    plan: &ImportedPlan,
    src: &SourceInfo,
) -> rusqlite::Result<ImportOutcome> {
    let mut avvisi = plan.warnings.clone();
    let tx = conn.transaction()?;
    let adesso = tempo::adesso_iso();
    let oggi = tempo::oggi_iso();

    let inizio = plan.tasks.iter().filter_map(|t| t.start.as_deref()).min();
    let fine = plan.tasks.iter().filter_map(|t| t.finish.as_deref()).max();

    tx.execute(
        "INSERT INTO project (name, source_type, source_file, imported_at, schema_version)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![src.project_name, src.source_type, src.source_file, adesso, latest_version()],
    )?;
    let project_id = tx.last_insert_rowid();

    tx.execute(
        "INSERT INTO project_params (project_id, start_date, planned_end_date, green_threshold, yellow_threshold)
         VALUES (?1, ?2, ?3, 95, 85)",
        params![project_id, inizio, fine],
    )?;
    tx.execute(
        "INSERT INTO calendar (project_id, name, is_default) VALUES (?1, 'Standard', 1)",
        [project_id],
    )?;

    // WBS: ogni codice diventa un nodo; il genitore è il prefisso ("1.2" → "1").
    // Il nome è quello del task che porta quel codice, se presente.
    let nomi_task: HashMap<&str, &str> = plan
        .tasks
        .iter()
        .filter_map(|t| t.wbs.as_deref().map(|w| (w, t.name.as_str())))
        .collect();
    let mut codici_wbs: BTreeSet<String> = BTreeSet::new();
    for t in &plan.tasks {
        if let Some(codice) = &t.wbs {
            let mut prefisso = String::new();
            for parte in codice.split('.').filter(|p| !p.is_empty()) {
                if !prefisso.is_empty() {
                    prefisso.push('.');
                }
                prefisso.push_str(parte);
                codici_wbs.insert(prefisso.clone());
            }
        }
    }
    let mut ordine: Vec<String> = codici_wbs.into_iter().collect();
    ordine.sort_by_key(|c| (c.matches('.').count(), c.clone()));
    let mut wbs_id: HashMap<String, i64> = HashMap::new();
    for codice in &ordine {
        let genitore_id = codice
            .rsplit_once('.')
            .and_then(|(padre, _)| wbs_id.get(padre).copied());
        let nome = nomi_task.get(codice.as_str()).copied().unwrap_or(codice.as_str());
        tx.execute(
            "INSERT INTO wbs (project_id, parent_id, code, name) VALUES (?1, ?2, ?3, ?4)",
            params![project_id, genitore_id, codice, nome],
        )?;
        wbs_id.insert(codice.clone(), tx.last_insert_rowid());
    }

    // Task: un UID duplicato viene scartato con un avviso (la colonna è UNIQUE per progetto).
    let mut task_id: HashMap<&str, i64> = HashMap::new();
    for t in &plan.tasks {
        if task_id.contains_key(t.uid.as_str()) {
            avvisi.push(format!("UID {} duplicato: riga successiva scartata", t.uid));
            continue;
        }
        let wbs = t.wbs.as_ref().and_then(|w| wbs_id.get(w).copied());
        tx.execute(
            "INSERT INTO task (project_id, wbs_id, uid_source, name, is_summary, is_milestone,
                               start_planned, finish_planned, duration_planned_days,
                               float_days, is_critical)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                project_id,
                wbs,
                t.uid,
                t.name,
                t.is_summary as i64,
                t.is_milestone as i64,
                t.start,
                t.finish,
                t.duration_days,
                t.float_days,
                t.is_critical as i64,
            ],
        )?;
        task_id.insert(t.uid.as_str(), tx.last_insert_rowid());
    }

    // Dipendenze: un predecessore sconosciuto è segnalato, non fa fallire l'import.
    for t in &plan.tasks {
        let Some(&succ) = task_id.get(t.uid.as_str()) else { continue };
        for link in &t.predecessors {
            match task_id.get(link.pred_uid.as_str()) {
                Some(&pred) => {
                    tx.execute(
                        "INSERT OR IGNORE INTO dependency (pred_id, succ_id, type, lag_minutes)
                         VALUES (?1, ?2, ?3, ?4)",
                        params![pred, succ, link.kind, link.lag_minutes],
                    )?;
                }
                None => avvisi.push(format!(
                    "task {}: predecessore UID {} non presente nel file",
                    t.uid, link.pred_uid
                )),
            }
        }
    }

    let mut resource_id: HashMap<&str, i64> = HashMap::new();
    for r in &plan.resources {
        if resource_id.contains_key(r.uid.as_str()) {
            continue;
        }
        tx.execute(
            "INSERT INTO resource (project_id, name, type, std_rate, overtime_rate, cost_per_use)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![project_id, r.name, r.kind, r.std_rate, r.overtime_rate, r.cost_per_use],
        )?;
        resource_id.insert(r.uid.as_str(), tx.last_insert_rowid());
    }

    for a in &plan.assignments {
        match (task_id.get(a.task_uid.as_str()), resource_id.get(a.resource_uid.as_str())) {
            (Some(&task), Some(&resource)) => {
                tx.execute(
                    "INSERT INTO assignment (task_id, resource_id, units) VALUES (?1, ?2, ?3)",
                    params![task, resource, a.units],
                )?;
            }
            _ => avvisi.push(format!(
                "assegnazione task {} / risorsa {} non collegabile",
                a.task_uid, a.resource_uid
            )),
        }
    }

    // Avanzamento presente nel piano: uno snapshot alla data di import.
    let con_avanzamento = plan.tasks.iter().any(|t| {
        t.pct_complete.is_some() || t.actual_start.is_some() || t.actual_finish.is_some()
    });
    if con_avanzamento {
        tx.execute(
            "INSERT INTO status_snapshot (project_id, status_date, label, source)
             VALUES (?1, ?2, 'Import piano', 'import_piano')",
            params![project_id, oggi],
        )?;
        let snapshot_id = tx.last_insert_rowid();
        for t in &plan.tasks {
            let Some(&task) = task_id.get(t.uid.as_str()) else { continue };
            if t.pct_complete.is_none() && t.actual_start.is_none() && t.actual_finish.is_none() {
                continue;
            }
            tx.execute(
                "INSERT INTO snapshot_task (snapshot_id, task_id, actual_start, actual_finish, pct_complete)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    snapshot_id,
                    task,
                    t.actual_start,
                    t.actual_finish,
                    t.pct_complete.map(|p| p / 100.0),
                ],
            )?;
        }
    }

    // Baseline di partenza ("Startup"), costruita dal piano importato. Non
    // bloccata: sarà la baseline da bloccare nelle fasi successive.
    let ha_date = plan.tasks.iter().any(|t| t.start.is_some() || t.finish.is_some());
    if ha_date {
        let costi: Vec<f64> = plan
            .tasks
            .iter()
            .filter(|t| !t.is_summary)
            .filter_map(|t| t.cost)
            .collect();
        let bac: Option<f64> = (!costi.is_empty()).then(|| costi.iter().sum());
        tx.execute(
            "INSERT INTO baseline (project_id, name, kind, created_at, locked,
                                   bac_direct, bac_indirect, bac_contingency, bac_total)
             VALUES (?1, 'Startup', 'startup', ?2, 0, ?3, 0, 0, ?3)",
            params![project_id, adesso, bac],
        )?;
        let baseline_id = tx.last_insert_rowid();
        for t in &plan.tasks {
            let Some(&task) = task_id.get(t.uid.as_str()) else { continue };
            tx.execute(
                "INSERT INTO baseline_task (baseline_id, task_id, start, finish, duration, work, cost)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    baseline_id,
                    task,
                    t.start,
                    t.finish,
                    t.duration_days,
                    t.work_hours,
                    t.cost,
                ],
            )?;
        }
    }

    tx.execute(
        "INSERT INTO source_sync (project_id, source_file, file_hash, file_mtime, imported_at, task_count)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
        params![
            project_id,
            src.source_file,
            src.file_hash,
            adesso,
            plan.tasks.len() as i64
        ],
    )?;
    tx.execute(
        "INSERT INTO import_log (kind, file, timestamp, warnings_json) VALUES (?1, ?2, ?3, ?4)",
        params![
            src.import_kind,
            src.source_file,
            adesso,
            serde_json::to_string(&avvisi).unwrap_or_else(|_| "[]".into()),
        ],
    )?;

    tx.commit()?;
    Ok(ImportOutcome {
        project_id,
        warnings: avvisi,
    })
}

/// Converte una durata in ore nel valore in giorni usato dal progetto.
pub(crate) fn ore_in_giorni(ore: f64) -> f64 {
    ore / ORE_PER_GIORNO
}

/// Converte un ritardo espresso in giorni in minuti (come nel database).
pub(crate) fn giorni_in_minuti(giorni: f64) -> i64 {
    (giorni * MINUTI_PER_GIORNO).round() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const XML: &str = r#"<?xml version="1.0"?>
<Project><Tasks>
  <Task><UID>1</UID><Name>Fase A</Name><WBS>1</WBS><Summary>1</Summary>
    <Start>2026-01-05T08:00:00</Start><Finish>2026-01-16T17:00:00</Finish></Task>
  <Task><UID>2</UID><Name>Scavo</Name><WBS>1.1</WBS><Start>2026-01-05T08:00:00</Start>
    <Finish>2026-01-09T17:00:00</Finish><Duration>PT40H0M0S</Duration><Cost>1200</Cost>
    <PercentComplete>40</PercentComplete>
    <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    <PredecessorLink><PredecessorUID>99</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
  </Task>
</Tasks><Resources><Resource><UID>1</UID><Name>Mario</Name><StandardRate>30</StandardRate></Resource></Resources>
<Assignments><Assignment><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units></Assignment></Assignments>
</Project>"#;

    fn conteggio(conn: &Connection, tabella: &str) -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {tabella}"), [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn importa_un_xml_in_un_evmproj_completo() {
        let dir = tempdir().unwrap();
        let origine = dir.path().join("piano.xml");
        std::fs::write(&origine, XML).unwrap();
        let destinazione = dir.path().join("piano.evmproj");

        let esito = importa_piano(&origine, &destinazione, "Piano di prova").unwrap();
        let conn = open_and_migrate(&destinazione).unwrap();

        assert_eq!(conteggio(&conn, "task"), 2);
        assert_eq!(conteggio(&conn, "wbs"), 2, "codici 1 e 1.1");
        assert_eq!(conteggio(&conn, "resource"), 1);
        assert_eq!(conteggio(&conn, "assignment"), 1);
        assert_eq!(conteggio(&conn, "dependency"), 1, "il predecessore 99 è scartato");
        assert_eq!(conteggio(&conn, "baseline"), 1);
        assert_eq!(conteggio(&conn, "snapshot_task"), 1, "solo il task con avanzamento");
        assert_eq!(esito.warnings.len(), 1);
        let bac: f64 = conn
            .query_row("SELECT bac_total FROM baseline", [], |r| r.get(0))
            .unwrap();
        assert_eq!(bac, 1200.0);
        let info = crate::progetto::leggi_progetto(&conn).unwrap();
        assert_eq!(info.name, "Piano di prova");
        assert_eq!(info.start_date.as_deref(), Some("2026-01-05"));
    }

    #[test]
    fn non_sovrascrive_la_destinazione_e_lascia_nulla_se_il_formato_non_va() {
        let dir = tempdir().unwrap();
        let origine = dir.path().join("piano.txt");
        std::fs::write(&origine, "x").unwrap();
        let destinazione = dir.path().join("piano.evmproj");
        assert!(importa_piano(&origine, &destinazione, "X").is_err());
        assert!(!destinazione.exists(), "un formato non valido non crea file");
    }
}
