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

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::migrations::latest_version;
use crate::{open_and_migrate, tempo};

/// Tipi di baseline ammessi (vincolo della colonna `baseline.kind`).
const TIPI_BASELINE: [&str; 3] = ["stima", "startup", "altra"];

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

/// Esito di `inspect_plan_file`: una lettura rapida del file prima
/// dell'anteprima completa (passo 1 della procedura guidata, §5).
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanInspection {
    pub format: String,
    pub size_bytes: u64,
    pub estimated_task_count: usize,
    pub detected_columns: Vec<String>,
}

/// Esito di `preview_plan_import`: il piano analizzato per intero ma non
/// ancora scritto (passo 3 della procedura guidata, §5).
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanPreview {
    pub task_count: usize,
    pub resource_count: usize,
    pub assignment_count: usize,
    pub warnings: Vec<String>,
    pub bac_estimate: Option<f64>,
}

/// Interruttori di riconciliazione del BAC (passo 5 della procedura guidata, §5.5).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacOptions {
    pub overhead_pct: f64,
    pub apply_overhead: bool,
    pub contingency_pct: f64,
    pub apply_contingency: bool,
}

impl Default for BacOptions {
    fn default() -> Self {
        Self { overhead_pct: 0.0, apply_overhead: false, contingency_pct: 0.0, apply_contingency: false }
    }
}

/// Opzioni di conferma dell'importazione (passi 4-7 della procedura guidata, §5).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitOptions {
    #[serde(default)]
    pub bac: BacOptions,
    #[serde(default = "baseline_kind_predefinito")]
    pub baseline_kind: String,
    #[serde(default)]
    pub lock_baseline: bool,
    #[serde(default)]
    pub status_date: Option<String>,
}

fn baseline_kind_predefinito() -> String {
    "startup".to_string()
}

impl Default for CommitOptions {
    fn default() -> Self {
        Self {
            bac: BacOptions::default(),
            baseline_kind: baseline_kind_predefinito(),
            lock_baseline: false,
            status_date: None,
        }
    }
}

/// Esito di `resync_plan` (§6): cosa è cambiato tra il progetto e il nuovo export.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResyncReport {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub moved: Vec<String>,
    pub baseline_changed_locked: bool,
    pub warnings: Vec<String>,
}

fn estensione_di(percorso: &Path) -> String {
    percorso
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default()
}

/// Legge e analizza il file del piano senza scrivere nulla: formato scelto
/// dall'estensione (`.xml` MSPDI, `.csv`, `.xlsx`/`.xlsm`/`.xls`), con
/// rilevamento della scala dei costi (§2) già applicato. Usata sia per
/// l'anteprima sia per il commit, così la logica di parsing non si duplica.
pub fn leggi_piano(origine: &Path) -> Result<(ImportedPlan, &'static str, &'static str, String), String> {
    let estensione = estensione_di(origine);
    let bytes = std::fs::read(origine).map_err(|e| format!("lettura del file: {e}"))?;
    let file_hash: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    let (mut plan, source_type, import_kind) = match estensione.as_str() {
        "xml" => {
            let testo = String::from_utf8(bytes).map_err(|_| "file XML non UTF-8".to_string())?;
            (mspdi::leggi(&testo)?, "xml_mspdi", "piano_xml")
        }
        "csv" => (tabular::leggi_csv(&bytes)?, "csv", "piano_csv"),
        "xlsx" | "xlsm" | "xls" => (excel::leggi(origine)?, "excel", "piano_excel"),
        altro => return Err(format!("formato non supportato: .{altro}")),
    };
    rileva_scala_costi(&mut plan);
    Ok((plan, source_type, import_kind, file_hash))
}

/// Rileva se i costi del piano sono scalati per 100 (bug comune di export:
/// centesimi invece di unità di valuta), confrontando `cost` con
/// `work_hours × tariffa standard della risorsa assegnata` su ogni task per
/// cui entrambi sono noti. Se il rapporto medio è vicino a 100, i costi sono
/// divisi per 100 e viene emesso un avviso `PLAN_COST_SCALE` (specifica §2).
/// Richiede almeno due campioni per evitare falsi positivi su piani piccoli
/// o senza tariffe importate.
fn rileva_scala_costi(plan: &mut ImportedPlan) {
    let tariffe: HashMap<&str, f64> = plan
        .resources
        .iter()
        .filter_map(|r| r.std_rate.map(|t| (r.uid.as_str(), t)))
        .collect();
    let mut tariffa_task: HashMap<&str, f64> = HashMap::new();
    for a in &plan.assignments {
        if let Some(&tariffa) = tariffe.get(a.resource_uid.as_str()) {
            tariffa_task.entry(a.task_uid.as_str()).or_insert(tariffa);
        }
    }
    let campioni: Vec<f64> = plan
        .tasks
        .iter()
        .filter_map(|t| {
            let costo = t.cost?;
            let ore = t.work_hours?;
            let tariffa = *tariffa_task.get(t.uid.as_str())?;
            (ore > 0.0 && tariffa > 0.0).then(|| costo / (ore * tariffa))
        })
        .collect();
    if campioni.len() < 2 {
        return;
    }
    let media = campioni.iter().sum::<f64>() / campioni.len() as f64;
    if (80.0..=120.0).contains(&media) {
        for t in plan.tasks.iter_mut() {
            t.cost = t.cost.map(|c| c / 100.0);
        }
        plan.warnings.push(
            "PLAN_COST_SCALE: i costi sembrano espressi in centesimi (rapporto ~100 con lavoro × tariffa): divisi per 100".into(),
        );
    }
}

/// Analisi rapida del file prima dell'anteprima (passo 1 della procedura
/// guidata, §5): formato, dimensione, colonne riconosciute (solo per i
/// formati tabellari) e numero di task stimato.
pub fn inspect_plan_file(origine: &Path) -> Result<PlanInspection, String> {
    let size_bytes = std::fs::metadata(origine).map_err(|e| format!("lettura del file: {e}"))?.len();
    let estensione = estensione_di(origine);
    match estensione.as_str() {
        "csv" => {
            let bytes = std::fs::read(origine).map_err(|e| format!("lettura del file: {e}"))?;
            let righe = tabular::leggi_csv_righe(&bytes)?;
            Ok(PlanInspection {
                format: "csv".into(),
                size_bytes,
                estimated_task_count: righe.len().saturating_sub(1),
                detected_columns: tabular::intestazioni_riconosciute(&righe),
            })
        }
        "xlsx" | "xlsm" | "xls" => {
            let righe = excel::leggi_righe(origine)?;
            Ok(PlanInspection {
                format: "excel".into(),
                size_bytes,
                estimated_task_count: righe.len().saturating_sub(1),
                detected_columns: tabular::intestazioni_riconosciute(&righe),
            })
        }
        "xml" => {
            let (plan, ..) = leggi_piano(origine)?;
            Ok(PlanInspection {
                format: "xml_mspdi".into(),
                size_bytes,
                estimated_task_count: plan.tasks.len(),
                detected_columns: Vec::new(),
            })
        }
        altro => Err(format!("formato non supportato: .{altro}")),
    }
}

/// Anteprima completa del piano (passo 3 della procedura guidata, §5): nulla
/// viene scritto nel database.
pub fn preview_plan_import(origine: &Path) -> Result<PlanPreview, String> {
    let (plan, ..) = leggi_piano(origine)?;
    let bac_estimate = {
        let costi: Vec<f64> = plan.tasks.iter().filter(|t| !t.is_summary).filter_map(|t| t.cost).collect();
        (!costi.is_empty()).then(|| costi.iter().sum())
    };
    Ok(PlanPreview {
        task_count: plan.tasks.len(),
        resource_count: plan.resources.len(),
        assignment_count: plan.assignments.len(),
        warnings: plan.warnings.clone(),
        bac_estimate,
    })
}

/// Importa il file del piano in un nuovo `.evmproj` con le opzioni di
/// default (nessun overhead/contingency, baseline «Startup» non bloccata,
/// data di stato di oggi). Il formato è scelto dall'estensione: `.xml` (MS
/// Project MSPDI), `.csv`, `.xlsx`/`.xlsm`/`.xls`. Il file di destinazione
/// non deve già esistere: non viene mai sovrascritto.
pub fn importa_piano(
    origine: &Path,
    destinazione: &Path,
    nome_progetto: &str,
) -> Result<ImportOutcome, String> {
    commit_plan_import(origine, destinazione, nome_progetto, &CommitOptions::default())
}

/// Importa il file del piano in un nuovo `.evmproj`, applicando le opzioni
/// di riconciliazione del BAC, il tipo/blocco della baseline e la data di
/// stato scelti nella procedura guidata (passi 4-8, §5). Il file di
/// destinazione non deve già esistere: non viene mai sovrascritto.
pub fn commit_plan_import(
    origine: &Path,
    destinazione: &Path,
    nome_progetto: &str,
    opzioni: &CommitOptions,
) -> Result<ImportOutcome, String> {
    if destinazione.exists() {
        return Err(format!(
            "il file {} esiste già: scegli un altro nome",
            destinazione.display()
        ));
    }
    let (plan, source_type, import_kind, file_hash) = leggi_piano(origine)?;

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
        opzioni,
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

/// Verifica che non ci siano chiavi UID duplicate nel piano: una chiave
/// duplicata è un errore bloccante (specifica §4.1), non più uno scarto
/// silenzioso con avviso.
fn verifica_chiavi_duplicate(plan: &ImportedPlan) -> Result<(), String> {
    let mut visti: BTreeSet<&str> = BTreeSet::new();
    let mut duplicati: BTreeSet<&str> = BTreeSet::new();
    for t in &plan.tasks {
        if !visti.insert(t.uid.as_str()) {
            duplicati.insert(t.uid.as_str());
        }
    }
    if duplicati.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "chiavi UID duplicate nel file: {}",
            duplicati.into_iter().collect::<Vec<_>>().join(", ")
        ))
    }
}

/// Scrive il piano in un database già migrato, in un'unica transazione.
pub fn salva_piano(
    conn: &mut Connection,
    plan: &ImportedPlan,
    src: &SourceInfo,
    opzioni: &CommitOptions,
) -> Result<ImportOutcome, String> {
    if !TIPI_BASELINE.contains(&opzioni.baseline_kind.as_str()) {
        return Err(format!("tipo di baseline non valido: {}", opzioni.baseline_kind));
    }
    verifica_chiavi_duplicate(plan)?;
    scrivi_piano(conn, plan, src, opzioni).map_err(|e| e.to_string())
}

fn scrivi_piano(
    conn: &mut Connection,
    plan: &ImportedPlan,
    src: &SourceInfo,
    opzioni: &CommitOptions,
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

    // Task: le chiavi UID duplicate sono già state escluse da verifica_chiavi_duplicate.
    let mut task_id: HashMap<&str, i64> = HashMap::new();
    for t in &plan.tasks {
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
        let data_di_stato = opzioni.status_date.as_deref().unwrap_or(&oggi);
        tx.execute(
            "INSERT INTO status_snapshot (project_id, status_date, label, source)
             VALUES (?1, ?2, 'Import piano', 'import_piano')",
            params![project_id, data_di_stato],
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

    // Baseline di partenza, costruita dal piano importato; tipo, blocco e
    // riconciliazione del BAC (overhead/contingency) vengono dalle opzioni
    // scelte nella procedura guidata (§5.5).
    let ha_date = plan.tasks.iter().any(|t| t.start.is_some() || t.finish.is_some());
    if ha_date {
        let costi: Vec<f64> = plan
            .tasks
            .iter()
            .filter(|t| !t.is_summary)
            .filter_map(|t| t.cost)
            .collect();
        let bac_direct: Option<f64> = (!costi.is_empty()).then(|| costi.iter().sum());
        let bac_indirect = bac_direct.map(|d| {
            if opzioni.bac.apply_overhead { d * opzioni.bac.overhead_pct / 100.0 } else { 0.0 }
        });
        let bac_contingency = bac_direct.zip(bac_indirect).map(|(d, i)| {
            if opzioni.bac.apply_contingency { (d + i) * opzioni.bac.contingency_pct / 100.0 } else { 0.0 }
        });
        let bac_total = bac_direct
            .zip(bac_indirect)
            .zip(bac_contingency)
            .map(|((d, i), c)| d + i + c);
        let nome_baseline = match opzioni.baseline_kind.as_str() {
            "stima" => "Stima",
            "altra" => "Altra",
            _ => "Startup",
        };
        tx.execute(
            "INSERT INTO baseline (project_id, name, kind, created_at, locked,
                                   bac_direct, bac_indirect, bac_contingency, bac_total)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                project_id,
                nome_baseline,
                opzioni.baseline_kind,
                adesso,
                opzioni.lock_baseline as i64,
                bac_direct,
                bac_indirect,
                bac_contingency,
                bac_total,
            ],
        )?;
        let baseline_id = tx.last_insert_rowid();
        let mut task_con_pv_lineare = 0;
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
            // Senza dati time-phased nel file, il costo della baseline si
            // distribuisce linearmente sui giorni lavorativi (lun-ven, §3.11).
            if let (Some(inizio), Some(fine), Some(costo)) = (&t.start, &t.finish, t.cost) {
                let giorni = giorni_lavorativi_tra(inizio, fine);
                if !giorni.is_empty() {
                    let quota = costo / giorni.len() as f64;
                    for giorno in &giorni {
                        tx.execute(
                            "INSERT INTO baseline_timephased (baseline_id, task_id, period_start, cost)
                             VALUES (?1, ?2, ?3, ?4)",
                            params![baseline_id, task, giorno, quota],
                        )?;
                    }
                    task_con_pv_lineare += 1;
                }
            }
        }
        if task_con_pv_lineare > 0 {
            avvisi.push(format!(
                "PLAN_LINEAR_PV: costo distribuito linearmente sui giorni lavorativi per {task_con_pv_lineare} task (nessun dato time-phased nel file)"
            ));
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

/// Date `YYYY-MM-DD` dei giorni lavorativi (lun-ven) tra `inizio` e `fine`,
/// inclusi; vuoto se le date non sono valide o `fine` precede `inizio`. Il
/// giorno dell'epoca Unix (1970-01-01) è un giovedì: `(giorno + 3) % 7 < 5`
/// individua lun-ven.
fn giorni_lavorativi_tra(inizio: &str, fine: &str) -> Vec<String> {
    let (Some(gi), Some(gf)) = (tempo::giorno_da_iso(inizio), tempo::giorno_da_iso(fine)) else {
        return Vec::new();
    };
    if gf < gi {
        return Vec::new();
    }
    (gi..=gf)
        .filter(|g| (g + 3).rem_euclid(7) < 5)
        .map(tempo::iso_da_giorno)
        .collect()
}

/// Ri-sincronizza un progetto già importato con un nuovo export dello stesso
/// piano (§6): diff dei task per chiave, aggiornamento dei soli campi di
/// sola lettura, nuovo `status_snapshot` (`source = 'resync'`) senza toccare
/// l'avanzamento inserito nell'app, nuova riga `source_sync`.
pub fn resync_plan(
    destinazione: &Path,
    origine: &Path,
    status_date: Option<String>,
) -> Result<ResyncReport, String> {
    let (plan, _source_type, _import_kind, file_hash) = leggi_piano(origine)?;
    let mut conn = open_and_migrate(destinazione).map_err(|e| e.to_string())?;
    let project_id = crate::progetto::leggi_progetto(&conn)?.id;

    let risultato = risincronizza(&mut conn, project_id, &plan, origine, &file_hash, status_date);
    match risultato {
        Ok(mut report) => {
            report.warnings = plan.warnings;
            Ok(report)
        }
        Err(e) => Err(format!("ri-sincronizzazione: {e}")),
    }
}

fn risincronizza(
    conn: &mut Connection,
    project_id: i64,
    plan: &ImportedPlan,
    origine: &Path,
    file_hash: &str,
    status_date: Option<String>,
) -> rusqlite::Result<ResyncReport> {
    let tx = conn.transaction()?;
    let mut report = ResyncReport::default();

    // Task esistenti nel progetto: uid_source -> (id, codice WBS attuale).
    let mut esistenti: HashMap<String, (i64, Option<String>)> = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "SELECT t.id, t.uid_source, w.code FROM task t LEFT JOIN wbs w ON w.id = t.wbs_id WHERE t.project_id = ?1",
        )?;
        let mut righe = stmt.query(params![project_id])?;
        while let Some(riga) = righe.next()? {
            esistenti.insert(riga.get(1)?, (riga.get(0)?, riga.get(2)?));
        }
    }

    let nuovi: HashMap<&str, &PlanTask> = plan.tasks.iter().map(|t| (t.uid.as_str(), t)).collect();

    for uid in nuovi.keys() {
        if !esistenti.contains_key(*uid) {
            report.added.push(uid.to_string());
        }
    }
    let mut rimossi: Vec<&String> = esistenti.keys().filter(|uid| !nuovi.contains_key(uid.as_str())).collect();
    rimossi.sort();
    report.removed = rimossi.into_iter().cloned().collect();
    for (uid, t) in &nuovi {
        if let Some((_, wbs_attuale)) = esistenti.get(*uid) {
            if wbs_attuale.as_deref() != t.wbs.as_deref() {
                report.moved.push(format!(
                    "{uid}: {} → {}",
                    wbs_attuale.clone().unwrap_or_default(),
                    t.wbs.clone().unwrap_or_default()
                ));
            }
        }
    }
    report.added.sort();
    report.moved.sort();

    // Campi di sola lettura: aggiornati dal nuovo export, mai l'avanzamento inserito nell'app.
    for (uid, t) in &nuovi {
        if let Some(&(task_id, _)) = esistenti.get(*uid) {
            tx.execute(
                "UPDATE task SET start_planned = ?1, finish_planned = ?2, float_days = ?3, is_critical = ?4 WHERE id = ?5",
                params![t.start, t.finish, t.float_days, t.is_critical as i64, task_id],
            )?;
        }
    }

    // Baseline bloccata: un costo diverso su un task condiviso è un'anomalia critica (Q016).
    let baseline_bloccata: Option<i64> = tx
        .query_row(
            "SELECT id FROM baseline WHERE project_id = ?1 AND locked = 1 ORDER BY id DESC LIMIT 1",
            params![project_id],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(baseline_id) = baseline_bloccata {
        let mut stmt = tx.prepare(
            "SELECT t.uid_source, bt.cost FROM baseline_task bt JOIN task t ON t.id = bt.task_id WHERE bt.baseline_id = ?1",
        )?;
        let mut righe = stmt.query(params![baseline_id])?;
        while let Some(riga) = righe.next()? {
            let uid: String = riga.get(0)?;
            let costo_bloccato: Option<f64> = riga.get(1)?;
            if let Some(t) = nuovi.get(uid.as_str()) {
                if t.cost.is_some() && t.cost != costo_bloccato {
                    report.baseline_changed_locked = true;
                }
            }
        }
    }

    // Nuovo status_snapshot con l'avanzamento letto dal nuovo export.
    let data_di_stato = status_date.unwrap_or_else(tempo::oggi_iso);
    tx.execute(
        "INSERT INTO status_snapshot (project_id, status_date, label, source)
         VALUES (?1, ?2, 'Ri-sincronizzazione', 'resync')",
        params![project_id, data_di_stato],
    )?;
    let snapshot_id = tx.last_insert_rowid();
    for (uid, t) in &nuovi {
        if t.pct_complete.is_none() && t.actual_start.is_none() && t.actual_finish.is_none() {
            continue;
        }
        if let Some(&(task_id, _)) = esistenti.get(*uid) {
            tx.execute(
                "INSERT INTO snapshot_task (snapshot_id, task_id, actual_start, actual_finish, pct_complete)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![snapshot_id, task_id, t.actual_start, t.actual_finish, t.pct_complete.map(|p| p / 100.0)],
            )?;
        }
    }

    tx.execute(
        "INSERT INTO source_sync (project_id, source_file, file_hash, file_mtime, imported_at, task_count)
         VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
        params![
            project_id,
            origine.file_name().and_then(|n| n.to_str()).unwrap_or_default(),
            file_hash,
            tempo::adesso_iso(),
            plan.tasks.len() as i64,
        ],
    )?;

    tx.commit()?;
    Ok(report)
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
        assert_eq!(
            esito.warnings.len(),
            2,
            "predecessore 99 mancante + PLAN_LINEAR_PV sul task con date e costo"
        );
        assert!(esito.warnings.iter().any(|w| w.contains("PLAN_LINEAR_PV")));
        assert!(conteggio(&conn, "baseline_timephased") > 0, "distribuzione lineare della PV");
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

    #[test]
    fn chiavi_uid_duplicate_sono_un_errore_bloccante() {
        let righe: Vec<Vec<String>> = vec![
            vec!["UID".into(), "Nome".into()],
            vec!["1".into(), "Fase A".into()],
            vec!["1".into(), "Fase A bis".into()],
        ];
        let plan = tabular::da_righe(righe).unwrap();
        let errore = verifica_chiavi_duplicate(&plan).unwrap_err();
        assert!(errore.contains('1'), "l'errore deve elencare la chiave duplicata");
    }

    #[test]
    fn rileva_e_corregge_i_costi_in_centesimi() {
        let mut plan = ImportedPlan {
            resources: vec![PlanResource {
                uid: "r1".into(),
                name: "Mario".into(),
                std_rate: Some(30.0),
                ..PlanResource::default()
            }],
            ..ImportedPlan::default()
        };
        for (uid, ore, costo) in [("1", 40.0, 120_000.0), ("2", 20.0, 60_000.0)] {
            plan.tasks.push(PlanTask { uid: uid.into(), name: uid.into(), work_hours: Some(ore), cost: Some(costo), ..PlanTask::default() });
            plan.assignments.push(PlanAssignment { task_uid: uid.into(), resource_uid: "r1".into(), units: 1.0 });
        }
        rileva_scala_costi(&mut plan);
        assert_eq!(plan.tasks[0].cost, Some(1200.0), "120.000 centesimi = 1.200 €, pari a 40h × 30 €/h");
        assert_eq!(plan.tasks[1].cost, Some(600.0));
        assert!(plan.warnings.iter().any(|w| w.contains("PLAN_COST_SCALE")));
    }

    #[test]
    fn non_corregge_costi_gia_in_unita_di_valuta() {
        let mut plan = ImportedPlan {
            resources: vec![PlanResource { uid: "r1".into(), name: "Mario".into(), std_rate: Some(30.0), ..PlanResource::default() }],
            ..ImportedPlan::default()
        };
        for (uid, ore, costo) in [("1", 40.0, 1200.0), ("2", 20.0, 600.0)] {
            plan.tasks.push(PlanTask { uid: uid.into(), name: uid.into(), work_hours: Some(ore), cost: Some(costo), ..PlanTask::default() });
            plan.assignments.push(PlanAssignment { task_uid: uid.into(), resource_uid: "r1".into(), units: 1.0 });
        }
        rileva_scala_costi(&mut plan);
        assert_eq!(plan.tasks[0].cost, Some(1200.0));
        assert!(!plan.warnings.iter().any(|w| w.contains("PLAN_COST_SCALE")));
    }

    #[test]
    fn distribuzione_lineare_su_cinque_giorni_lavorativi() {
        // Lunedì 5 - venerdì 9 gennaio 2026: 5 giorni lavorativi, 20% al giorno.
        let giorni = giorni_lavorativi_tra("2026-01-05", "2026-01-09");
        assert_eq!(giorni.len(), 5);
        // Lunedì 5 - domenica 11: il weekend (10-11) non è lavorativo.
        let giorni = giorni_lavorativi_tra("2026-01-05", "2026-01-11");
        assert_eq!(giorni.len(), 5, "sabato e domenica esclusi");
    }

    #[test]
    fn riconciliazione_bac_con_overhead_e_contingency() {
        let dir = tempdir().unwrap();
        let origine = dir.path().join("piano.xml");
        std::fs::write(&origine, XML).unwrap();

        // Verifica diretta della formula di riconciliazione (spec §5.5, esempio numerico).
        let direct = 100_000.0;
        let indirect = direct * 20.0 / 100.0;
        let contingency_con_entrambi = (direct + indirect) * 10.0 / 100.0;
        assert_eq!(direct + indirect + contingency_con_entrambi, 132_000.0);
        assert_eq!(direct + indirect, 120_000.0);
        assert_eq!(direct, 100_000.0);

        let destinazione = dir.path().join("piano.evmproj");
        let opzioni = CommitOptions {
            bac: BacOptions { overhead_pct: 20.0, apply_overhead: true, contingency_pct: 10.0, apply_contingency: true },
            baseline_kind: "stima".into(),
            lock_baseline: false,
            status_date: None,
        };
        commit_plan_import(&origine, &destinazione, "Riconciliazione", &opzioni).unwrap();
        let conn = open_and_migrate(&destinazione).unwrap();
        let (direct, indirect, contingency, total): (f64, f64, f64, f64) = conn
            .query_row(
                "SELECT bac_direct, bac_indirect, bac_contingency, bac_total FROM baseline",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(direct, 1200.0);
        assert_eq!(indirect, 240.0, "20% di overhead su 1.200");
        assert_eq!(contingency, 144.0, "10% di contingency su 1.440 (diretto + indiretto)");
        assert_eq!(total, 1584.0);
    }

    #[test]
    fn resync_rileva_task_aggiunti_rimossi_e_spostati_senza_toccare_l_avanzamento() {
        let dir = tempdir().unwrap();
        let origine = dir.path().join("piano.xml");
        std::fs::write(&origine, XML).unwrap();
        let destinazione = dir.path().join("piano.evmproj");
        commit_plan_import(&origine, &destinazione, "Progetto", &CommitOptions::default()).unwrap();

        // Nuovo export: il task 1 cambia WBS, il task 2 resta, un task 3 è nuovo.
        let xml_aggiornato = r#"<?xml version="1.0"?>
<Project><Tasks>
  <Task><UID>1</UID><Name>Fase A</Name><WBS>2</WBS><Summary>1</Summary>
    <Start>2026-01-05T08:00:00</Start><Finish>2026-01-16T17:00:00</Finish></Task>
  <Task><UID>2</UID><Name>Scavo</Name><WBS>2.1</WBS><Start>2026-01-05T08:00:00</Start>
    <Finish>2026-01-09T17:00:00</Finish><Duration>PT40H0M0S</Duration><Cost>1200</Cost>
    <PercentComplete>80</PercentComplete></Task>
  <Task><UID>3</UID><Name>Posa</Name><WBS>2.2</WBS><Start>2026-01-12T08:00:00</Start>
    <Finish>2026-01-14T17:00:00</Finish></Task>
</Tasks></Project>"#;
        let origine_2 = dir.path().join("piano-v2.xml");
        std::fs::write(&origine_2, xml_aggiornato).unwrap();

        let report = resync_plan(&destinazione, &origine_2, None).unwrap();
        assert_eq!(report.added, vec!["3".to_string()]);
        assert!(report.removed.is_empty());
        assert_eq!(report.moved.len(), 2, "i task 1 e 2 sono passati dalla WBS 1/1.1 alla 2/2.1");
        assert!(!report.baseline_changed_locked, "la baseline di startup non è bloccata");

        let conn = open_and_migrate(&destinazione).unwrap();
        assert_eq!(conteggio(&conn, "status_snapshot"), 2, "import + resync");
        let fonti: i64 = conn
            .query_row("SELECT count(*) FROM status_snapshot WHERE source = 'resync'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fonti, 1);
        assert_eq!(conteggio(&conn, "source_sync"), 2, "import + resync, storia conservata");
    }
}
