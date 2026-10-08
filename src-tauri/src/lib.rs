// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

use std::path::Path;

use evm_db::progetto::{self, ProjectInfo};
use evm_db::calendario;
use evm_db::controllo;
use evm_db::risorse;
use evm_db::export::{self, CacheExport, OpzioniExport};
use evm_db::workbook::{self, WorkbookImportato};
use evm_db::schermate;
use evm_db::task::{self, NuovoTask, TaskRiga};
use serde::{Deserialize, Serialize};

/// Intestazione del progetto aperto, come la riceve la UI.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgettoAperto {
    percorso: String,
    nome: String,
    origine: String,
    data_inizio: Option<String>,
    data_fine_prevista: Option<String>,
    data_di_stato: Option<String>,
}

impl ProgettoAperto {
    fn da_info(percorso: &Path, info: ProjectInfo) -> Self {
        Self {
            percorso: percorso.display().to_string(),
            nome: info.name,
            origine: info.source_type,
            data_inizio: info.start_date,
            data_fine_prevista: info.planned_end_date,
            data_di_stato: info.status_date,
        }
    }
}

/// Esito di un import: progetto creato più gli avvisi non bloccanti.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportoRisultato {
    progetto: ProgettoAperto,
    avvisi: Vec<String>,
}

/// Crea un nuovo progetto vuoto in `percorso` (un file `.evmproj`).
#[tauri::command]
fn nuovo_progetto(percorso: String, nome: String) -> Result<ProgettoAperto, String> {
    let path = Path::new(&percorso);
    let info = progetto::crea_progetto(path, &nome)?;
    Ok(ProgettoAperto::da_info(path, info))
}

/// Apre un file `.evmproj` esistente.
#[tauri::command]
fn apri_progetto(percorso: String) -> Result<ProgettoAperto, String> {
    let path = Path::new(&percorso);
    let info = progetto::apri_progetto(path)?;
    Ok(ProgettoAperto::da_info(path, info))
}

/// Passo 1 della procedura guidata di importazione: analisi rapida del file
/// (formato, dimensione, colonne riconosciute), senza scrivere nulla.
#[tauri::command]
fn inspect_plan_file(percorso: String) -> Result<evm_db::import::PlanInspection, String> {
    evm_db::import::inspect_plan_file(Path::new(&percorso))
}

/// Passo 3 della procedura guidata di importazione: anteprima completa del
/// piano (conteggi, avvisi, stima del BAC), senza scrivere nulla.
#[tauri::command]
fn preview_plan_import(percorso: String) -> Result<evm_db::import::PlanPreview, String> {
    evm_db::import::preview_plan_import(Path::new(&percorso))
}

/// Ultimo passo della procedura guidata: scrive il piano in un nuovo
/// `.evmproj`, applicando riconciliazione del BAC, tipo/blocco della
/// baseline e data di stato scelti nei passi precedenti.
#[tauri::command]
fn commit_plan_import(
    origine: String,
    destinazione: String,
    nome: String,
    opzioni: evm_db::import::CommitOptions,
) -> Result<ImportoRisultato, String> {
    let destinazione_path = Path::new(&destinazione);
    let esito = evm_db::import::commit_plan_import(Path::new(&origine), destinazione_path, &nome, &opzioni)?;
    let info = progetto::apri_progetto(destinazione_path)?;
    Ok(ImportoRisultato {
        progetto: ProgettoAperto::da_info(destinazione_path, info),
        avvisi: esito.warnings,
    })
}

/// Ri-sincronizza il progetto aperto da `percorso` con un nuovo export dello
/// stesso piano: diff dei task, aggiornamento dei soli campi di sola
/// lettura, nuovo status_snapshot (`source = 'resync'`).
#[tauri::command]
fn resync_plan(
    percorso: String,
    origine: String,
    data_di_stato: Option<String>,
) -> Result<evm_db::import::ResyncReport, String> {
    evm_db::import::resync_plan(Path::new(&percorso), Path::new(&origine), data_di_stato)
}

/// Dati del modulo "Nuovo task" così come arrivano dalla UI.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NuovoTaskInput {
    nome: String,
    codice_wbs: Option<String>,
    inizio: Option<String>,
    fine: Option<String>,
    durata_giorni: Option<f64>,
    #[serde(default)]
    milestone: bool,
}

fn progetto_id(conn: &rusqlite::Connection) -> Result<i64, String> {
    progetto::leggi_progetto(conn).map(|info| info.id)
}

/// Crea un task nel progetto aperto da `percorso`.
#[tauri::command]
fn crea_task(percorso: String, input: NuovoTaskInput) -> Result<TaskRiga, String> {
    let mut conn = evm_db::open_and_migrate(Path::new(&percorso)).map_err(|e| e.to_string())?;
    let id = progetto_id(&conn)?;
    task::crea_task(
        &mut conn,
        id,
        &NuovoTask {
            nome: input.nome,
            codice_wbs: input.codice_wbs,
            inizio: input.inizio,
            fine: input.fine,
            durata_giorni: input.durata_giorni,
            milestone: input.milestone,
        },
    )
}

/// Elenco dei task del progetto aperto da `percorso`.
#[tauri::command]
fn elenca_task(percorso: String) -> Result<Vec<TaskRiga>, String> {
    let conn = evm_db::open_and_migrate(Path::new(&percorso)).map_err(|e| e.to_string())?;
    let id = progetto_id(&conn)?;
    task::elenca_task(&conn, id)
}

/// Elenco dei task con dati di pianificazione/baseline per la scheda Task e risorse.
#[tauri::command]
fn task_evm_elenco(percorso: String) -> Result<Vec<task::TaskEvmRiga>, String> {
    let conn = evm_db::open_and_migrate(Path::new(&percorso)).map_err(|e| e.to_string())?;
    let id = progetto_id(&conn)?;
    task::elenco_evm(&conn, id)
}

/// Apre il progetto e restituisce la connessione con l'id del progetto.
fn apri_con_id(percorso: &str) -> Result<(rusqlite::Connection, i64), String> {
    let conn = evm_db::open_and_migrate(Path::new(percorso)).map_err(|e| e.to_string())?;
    let id = progetto_id(&conn)?;
    Ok((conn, id))
}

#[tauri::command]
fn dashboard(percorso: String) -> Result<schermate::Dashboard, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::dashboard(&conn, id)
}

#[tauri::command]
fn wbs_elenco(percorso: String) -> Result<Vec<schermate::NodoWbs>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::wbs(&conn, id)
}

#[tauri::command]
fn crea_wbs(percorso: String, codice: String, nome: String) -> Result<(), String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::crea_wbs(&conn, id, &codice, &nome)
}

#[tauri::command]
fn gantt_elenco(percorso: String) -> Result<Vec<schermate::RigaGantt>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::gantt(&conn, id)
}

#[tauri::command]
fn avanzamento_elenco(percorso: String) -> Result<Vec<schermate::RigaAvanzamento>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::avanzamento_elenco(&conn, id)
}

#[tauri::command]
fn registra_avanzamento(
    percorso: String,
    uid: String,
    pct: f64,
    inizio: Option<String>,
    fine: Option<String>,
    ac: Option<f64>,
    ore: Option<f64>,
) -> Result<(), String> {
    let (mut conn, id) = apri_con_id(&percorso)?;
    schermate::registra_avanzamento(&mut conn, id, &uid, pct, inizio, fine, ac, ore)
}

#[tauri::command]
fn approvazioni_elenco(percorso: String) -> Result<Vec<schermate::RigaApprovazione>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::approvazioni(&conn, id)
}

#[tauri::command]
fn approva_voce(percorso: String, voce_id: i64) -> Result<(), String> {
    let (mut conn, _) = apri_con_id(&percorso)?;
    schermate::approva(&mut conn, voce_id)
}

#[tauri::command]
fn respingi_voce(percorso: String, voce_id: i64, nota: String) -> Result<(), String> {
    let (conn, _) = apri_con_id(&percorso)?;
    schermate::respingi(&conn, voce_id, &nota)
}

#[tauri::command]
fn utenti_elenco(percorso: String) -> Result<Vec<schermate::Utente>, String> {
    let (conn, _) = apri_con_id(&percorso)?;
    schermate::utenti(&conn)
}

#[tauri::command]
fn crea_utente(percorso: String, uid: String, nome: String, ruoli: Vec<String>) -> Result<(), String> {
    let (mut conn, _) = apri_con_id(&percorso)?;
    schermate::crea_utente(&mut conn, &uid, &nome, &ruoli)
}

#[tauri::command]
fn perimetri_elenco(percorso: String) -> Result<Vec<schermate::Perimetro>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::perimetri(&conn, id)
}

#[tauri::command]
fn crea_perimetro(
    percorso: String,
    nome: String,
    codice_wbs: String,
    proprietario_uid: Option<String>,
) -> Result<(), String> {
    let (mut conn, id) = apri_con_id(&percorso)?;
    schermate::crea_perimetro(&mut conn, id, &nome, &codice_wbs, proprietario_uid.as_deref())
}

#[tauri::command]
fn riserve_dati(percorso: String) -> Result<schermate::Riserve, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::riserve(&conn, id)
}

#[tauri::command]
fn crea_rischio(
    percorso: String,
    descrizione: String,
    probabilita_pct: Option<i64>,
    impatto: Option<f64>,
    contingenza: Option<f64>,
) -> Result<(), String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::crea_rischio(&conn, id, &descrizione, probabilita_pct, impatto, contingenza)
}

#[tauri::command]
fn registra_consumo(
    percorso: String,
    tipo: String,
    importo: f64,
    data: String,
    nota: Option<String>,
) -> Result<(), String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::registra_consumo(&conn, id, &tipo, importo, &data, nota.as_deref())
}

#[tauri::command]
fn aggiorna_parametri(
    percorso: String,
    contingency_pct: i64,
    mgmt_reserve_pct: i64,
    time_buffer_days: f64,
) -> Result<(), String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::aggiorna_parametri(&conn, id, contingency_pct, mgmt_reserve_pct, time_buffer_days)
}

#[tauri::command]
fn calendari_elenco(percorso: String) -> Result<Vec<calendario::Calendario>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    calendario::calendari(&conn, id)
}

#[tauri::command]
fn crea_calendario(
    percorso: String,
    nome: String,
    maschera: i64,
    festivi: Vec<String>,
) -> Result<i64, String> {
    let (mut conn, id) = apri_con_id(&percorso)?;
    calendario::crea_calendario(&mut conn, id, &nome, maschera, &festivi)
}

#[tauri::command]
fn imposta_calendario_predefinito(percorso: String, calendario_id: i64) -> Result<(), String> {
    let (mut conn, id) = apri_con_id(&percorso)?;
    calendario::imposta_predefinito(&mut conn, id, calendario_id)
}

#[tauri::command]
fn ricalcola_durate(percorso: String) -> Result<usize, String> {
    let (mut conn, id) = apri_con_id(&percorso)?;
    calendario::ricalcola_durate(&mut conn, id)
}

/// Esito di importazione del workbook: progetto aperto più il contenuto letto (avvisi, cache, input).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsitoWorkbook {
    progetto: ProgettoAperto,
    dati: WorkbookImportato,
}

/// Anteprima del workbook senza scrivere nel database (specifica fase 3, §0).
#[tauri::command]
fn anteprima_workbook(percorso: String) -> Result<WorkbookImportato, String> {
    workbook::anteprima(Path::new(&percorso))
}

/// Importa il workbook in un nuovo progetto `.evmproj`.
#[tauri::command]
fn importa_workbook(origine: String, destinazione: String, nome: String) -> Result<EsitoWorkbook, String> {
    let (esito, dati) = workbook::importa_workbook(Path::new(&origine), Path::new(&destinazione), &nome)?;
    let info = progetto::apri_progetto(Path::new(&destinazione))?;
    let _ = esito;
    Ok(EsitoWorkbook { progetto: ProgettoAperto::da_info(Path::new(&destinazione), info), dati })
}

/// Aggiorna gli input di un progetto esistente con il workbook (idempotente).
#[tauri::command]
fn aggiorna_workbook(origine: String, progetto: String) -> Result<EsitoWorkbook, String> {
    let (_, dati) = workbook::aggiorna_progetto(Path::new(&origine), Path::new(&progetto))?;
    let info = progetto::apri_progetto(Path::new(&progetto))?;
    Ok(EsitoWorkbook { progetto: ProgettoAperto::da_info(Path::new(&progetto), info), dati })
}

/// Input del progetto aperto, per il calcolo della cache nel motore (frontend).
#[tauri::command]
fn input_workbook(percorso: String) -> Result<WorkbookImportato, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    workbook::input_progetto(&conn, id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpzioniEsportazione {
    #[serde(default = "vero")]
    con_formule: bool,
    /// Data di stato ISO: esporta solo i checkpoint fino a questa data.
    data_di_stato: Option<String>,
}

fn vero() -> bool {
    true
}

/// Scrive un file di testo (log degli avvisi in CSV). Non sovrascrive un file esistente.
#[tauri::command]
fn salva_testo(percorso: String, contenuto: String) -> Result<(), String> {
    let path = Path::new(&percorso);
    if path.exists() {
        return Err(format!("il file {} esiste già", path.display()));
    }
    std::fs::write(path, contenuto).map_err(|e| e.to_string())
}

/// Esporta il progetto in un workbook nuovo, con formule e valori in cache dal motore.
#[tauri::command]
fn esporta_workbook(
    percorso: String,
    destinazione: String,
    cache: CacheExport,
    opzioni: OpzioniEsportazione,
) -> Result<(), String> {
    let (conn, id) = apri_con_id(&percorso)?;
    let data_limite = match opzioni.data_di_stato.as_deref() {
        Some(d) => Some(evm_db::tempo::giorno_da_iso(d).ok_or_else(|| format!("data di stato non valida: {d}"))?),
        None => None,
    };
    export::esporta_workbook(
        &conn,
        id,
        Path::new(&destinazione),
        &cache,
        OpzioniExport { con_formule: opzioni.con_formule, data_di_stato: data_limite },
    )
}

// ----------------------------------------------------- Costi, governance, risorse

#[tauri::command]
fn imposta_budget_wbs(percorso: String, codice: String, budget: Option<f64>) -> Result<(), String> {
    let (conn, id) = apri_con_id(&percorso)?;
    controllo::imposta_budget_wbs(&conn, id, &codice, budget)
}

#[tauri::command]
fn dati_monitoraggio(percorso: String) -> Result<controllo::DatiMonitoraggio, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    controllo::dati_monitoraggio(&conn, id)
}

#[tauri::command]
fn governance(percorso: String) -> Result<controllo::Governance, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    controllo::governance(&conn, id)
}

/// Elenco delle baseline, per il selettore di baseline della barra di contesto.
#[tauri::command]
fn baseline_elenco(percorso: String) -> Result<Vec<controllo::BaselineRiga>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    controllo::elenco_baseline(&conn, id)
}

/// Elenco delle date di stato, per il selettore della barra di contesto.
#[tauri::command]
fn snapshot_elenco(percorso: String) -> Result<Vec<controllo::SnapshotRiga>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    controllo::elenco_snapshot(&conn, id)
}

#[tauri::command]
fn crea_change_request(percorso: String, motivo: String, delta_costo: Option<f64>, delta_durata: Option<f64>) -> Result<i64, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    controllo::crea_change_request(&conn, id, &motivo, delta_costo, delta_durata)
}

#[tauri::command]
fn approva_change_request(percorso: String, id: i64, approvatore: String) -> Result<(), String> {
    let (conn, pid) = apri_con_id(&percorso)?;
    controllo::approva_change_request(&conn, pid, id, &approvatore)
}

#[tauri::command]
fn archivia_baseline(percorso: String, id: i64) -> Result<(), String> {
    let (conn, pid) = apri_con_id(&percorso)?;
    controllo::archivia_baseline(&conn, pid, id)
}

#[tauri::command]
fn blocca_baseline_budget(percorso: String, nome: String, tipo: String) -> Result<i64, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    controllo::blocca_baseline_budget(&conn, id, &nome, &tipo)
}

#[tauri::command]
fn risorse_elenco(percorso: String) -> Result<Vec<risorse::RisorsaRiga>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    risorse::risorse(&conn, id)
}

#[tauri::command]
fn crea_risorsa(percorso: String, nome: String, tipo: Option<String>, tariffa: Option<f64>, tariffa_straordinario: Option<f64>) -> Result<i64, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    risorse::crea_risorsa(&conn, id, &nome, tipo.as_deref(), tariffa, tariffa_straordinario)
}

#[tauri::command]
fn imposta_tariffa(percorso: String, id: i64, tariffa: Option<f64>) -> Result<(), String> {
    let (conn, pid) = apri_con_id(&percorso)?;
    risorse::imposta_tariffa(&conn, pid, id, tariffa)
}

#[tauri::command]
fn imposta_costo_reale(percorso: String, id: i64, costo: Option<f64>) -> Result<(), String> {
    let (conn, pid) = apri_con_id(&percorso)?;
    risorse::imposta_costo_reale(&conn, pid, id, costo)
}

#[tauri::command]
fn assegnazioni_elenco(percorso: String) -> Result<Vec<risorse::AssegnazioneRiga>, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    risorse::assegnazioni(&conn, id)
}

#[tauri::command]
fn crea_assegnazione(percorso: String, task_uid: String, risorsa_id: i64, unita: f64) -> Result<i64, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    risorse::crea_assegnazione(&conn, id, &task_uid, risorsa_id, unita)
}

#[tauri::command]
fn imposta_unita_assegnazione(percorso: String, id: i64, unita: f64) -> Result<(), String> {
    let (conn, pid) = apri_con_id(&percorso)?;
    risorse::imposta_unita_assegnazione(&conn, pid, id, unita)
}

#[tauri::command]
fn elimina_assegnazione(percorso: String, id: i64) -> Result<(), String> {
    let (conn, pid) = apri_con_id(&percorso)?;
    risorse::elimina_assegnazione(&conn, pid, id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            nuovo_progetto,
            apri_progetto,
            inspect_plan_file,
            preview_plan_import,
            commit_plan_import,
            resync_plan,
            crea_task,
            elenca_task,
            task_evm_elenco,
            dashboard,
            wbs_elenco,
            crea_wbs,
            gantt_elenco,
            avanzamento_elenco,
            registra_avanzamento,
            approvazioni_elenco,
            approva_voce,
            respingi_voce,
            utenti_elenco,
            crea_utente,
            perimetri_elenco,
            crea_perimetro,
            riserve_dati,
            crea_rischio,
            registra_consumo,
            aggiorna_parametri,
            calendari_elenco,
            crea_calendario,
            imposta_calendario_predefinito,
            ricalcola_durate,
            anteprima_workbook,
            importa_workbook,
            aggiorna_workbook,
            input_workbook,
            esporta_workbook,
            salva_testo,
            imposta_budget_wbs,
            dati_monitoraggio,
            governance,
            baseline_elenco,
            snapshot_elenco,
            crea_change_request,
            approva_change_request,
            blocca_baseline_budget,
            archivia_baseline,
            risorse_elenco,
            crea_risorsa,
            imposta_tariffa,
            imposta_costo_reale,
            assegnazioni_elenco,
            crea_assegnazione,
            imposta_unita_assegnazione,
            elimina_assegnazione
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
