// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

use std::path::Path;

/// Crea (o apre) un file di progetto .evmproj e lo porta all'ultima
/// versione di schema; restituisce la versione applicata. La UI non usa
/// ancora questo comando (il DB reale si collega nelle Fasi 2-4): serve a
/// verificare che la pipeline Tauri -> Rust -> SQLite funzioni.
#[tauri::command]
fn apri_progetto(percorso: String) -> Result<i64, String> {
    let conn = evm_db::open_and_migrate(Path::new(&percorso)).map_err(|e| e.to_string())?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(version)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![apri_progetto])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
