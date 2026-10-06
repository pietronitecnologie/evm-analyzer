// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

use std::path::Path;

use evm_db::progetto::{self, ProjectInfo};
use evm_db::calendario;
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

/// Importa un export del piano (XML MSPDI, CSV o Excel) in un nuovo `.evmproj`.
#[tauri::command]
fn importa_piano(
    origine: String,
    destinazione: String,
    nome: String,
) -> Result<ImportoRisultato, String> {
    let destinazione_path = Path::new(&destinazione);
    let esito = evm_db::import::importa_piano(Path::new(&origine), destinazione_path, &nome)?;
    let info = progetto::apri_progetto(destinazione_path)?;
    Ok(ImportoRisultato {
        progetto: ProgettoAperto::da_info(destinazione_path, info),
        avvisi: esito.warnings,
    })
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
) -> Result<(), String> {
    let (mut conn, id) = apri_con_id(&percorso)?;
    schermate::registra_avanzamento(&mut conn, id, &uid, pct, inizio, fine)
}

#[tauri::command]
fn invia_avanzamento(percorso: String) -> Result<usize, String> {
    let (conn, id) = apri_con_id(&percorso)?;
    schermate::invia_avanzamento(&conn, id)
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
    probabilita_pct: Option<f64>,
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
    contingency_pct: f64,
    mgmt_reserve_pct: f64,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            nuovo_progetto,
            apri_progetto,
            importa_piano,
            crea_task,
            elenca_task,
            dashboard,
            wbs_elenco,
            crea_wbs,
            gantt_elenco,
            avanzamento_elenco,
            registra_avanzamento,
            invia_avanzamento,
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
            ricalcola_durate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
