// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Suite di prestazioni (specifica Fase 6, §3): genera progetti sintetici alle scale
//! della specifica (200/2.000/20.000 task, 20 filoni, 50 risorse, 52 date di stato) e
//! cronometra le operazioni del backend raggiungibili da qui — apertura progetto e le
//! query che alimentano Monitoraggio/Gantt. Il calcolo EVM/Monte Carlo vero e proprio
//! gira nel motore TypeScript, non in questo binario: `bench/engine.bench.mjs` lo
//! cronometra separatamente, scrivendo nello stesso `bench/baseline.json` (vedi
//! DECISIONS.md: niente benchmark "a metà" tra due linguaggi senza un formato comune).
//!
//! Fuori da questo giro: import XML/Excel (richiederebbe una fixture realistica, non
//! solo righe sintetiche), export workbook (richiede una `CacheExport` con gli stessi
//! valori EVM che solo il motore calcola), avvio a freddo/scorrimento UI/memoria a
//! riposo (richiedono un'app con interfaccia grafica in esecuzione, non raggiungibili
//! da un binario headless in questo ambiente di sviluppo — vedi anche la decisione 115
//! sulla virtualizzazione del Gantt, stessa limitazione).

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use evm_db::{controllo, open_and_migrate, progetto::crea_progetto, schermate};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

const N_FILONI: i64 = 20;
const N_RISORSE: i64 = 50;
const N_SNAPSHOT: i64 = 52;

/// Genera un progetto sintetico con `n_task` task, `N_FILONI` filoni, `N_RISORSE`
/// risorse e `N_SNAPSHOT` date di stato (una a settimana). Una sola transazione e
/// istruzioni preparate riusate nei cicli: con 20.000 task × 52 date di stato le righe
/// di avanzamento arrivano a oltre un milione, il costo dominante in SQLite è la singola
/// transazione, non la riga (interventi consentiti dalla specifica, §3).
fn genera_progetto_sintetico(percorso: &Path, n_task: i64) -> Result<i64, String> {
    let info = crea_progetto(percorso, "Benchmark").map_err(|e| e.to_string())?;
    let mut conn = open_and_migrate(percorso).map_err(|e| e.to_string())?;
    let pid = info.id;

    let n_wbs = (n_task / 10).max(1);
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO wbs (project_id, code, name) VALUES (?1, '1', 'Root')", params![pid]).map_err(|e| e.to_string())?;
    {
        let mut st_wbs = tx.prepare("INSERT INTO wbs (project_id, parent_id, code, name, bac) VALUES (?1, (SELECT id FROM wbs WHERE project_id = ?1 AND code = '1'), ?2, ?3, ?4)").map_err(|e| e.to_string())?;
        for i in 0..n_wbs {
            st_wbs.execute(params![pid, format!("1.{i}"), format!("WBS {i}"), 1000.0]).map_err(|e| e.to_string())?;
        }
    }

    {
        let mut st_filone = tx.prepare("INSERT INTO workstream (project_id, name, kind, measure_method) VALUES (?1, ?2, ?3, ?4)").map_err(|e| e.to_string())?;
        let tipi = ["costruzione", "automazione", "software", "altro"];
        let metodi = ["unita_fisiche", "milestone_pesate", "story_point", "flusso"];
        for i in 0..N_FILONI {
            st_filone.execute(params![pid, format!("Filone {i}"), tipi[(i as usize) % tipi.len()], metodi[(i as usize) % metodi.len()]]).map_err(|e| e.to_string())?;
        }
    }
    {
        let mut st_risorsa = tx.prepare("INSERT INTO resource (project_id, name, type, std_rate) VALUES (?1, ?2, 'lavoro', ?3)").map_err(|e| e.to_string())?;
        for i in 0..N_RISORSE {
            st_risorsa.execute(params![pid, format!("Risorsa {i}"), 35.0 + (i as f64)]).map_err(|e| e.to_string())?;
        }
    }

    let wbs_ids: Vec<i64> = {
        let mut st = tx.prepare("SELECT id FROM wbs WHERE project_id = ?1 AND code != '1' ORDER BY id").map_err(|e| e.to_string())?;
        let righe = st.query_map([pid], |r| r.get(0)).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
        righe
    };
    let filone_ids: Vec<i64> = {
        let mut st = tx.prepare("SELECT id FROM workstream WHERE project_id = ?1 ORDER BY id").map_err(|e| e.to_string())?;
        let righe = st.query_map([pid], |r| r.get(0)).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
        righe
    };
    let risorsa_ids: Vec<i64> = {
        let mut st = tx.prepare("SELECT id FROM resource WHERE project_id = ?1 ORDER BY id").map_err(|e| e.to_string())?;
        let righe = st.query_map([pid], |r| r.get(0)).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
        righe
    };

    let mut task_ids = Vec::with_capacity(n_task as usize);
    {
        let mut st_task = tx
            .prepare(
                "INSERT INTO task (project_id, wbs_id, workstream_id, uid_source, name, ev_method, start_planned, finish_planned, duration_planned_days, is_critical, is_milestone)
                 VALUES (?1, ?2, ?3, ?4, ?5, '0_100', ?6, ?7, 5, ?8, ?9)",
            )
            .map_err(|e| e.to_string())?;
        for i in 0..n_task {
            let giorno_inizio = i % 300;
            let inizio = evm_db::tempo::iso_da_giorno(giorno_inizio);
            let fine = evm_db::tempo::iso_da_giorno(giorno_inizio + 5);
            let critico = i % 10 == 0;
            let milestone = i % 50 == 0;
            st_task
                .execute(params![
                    pid,
                    wbs_ids[(i as usize) % wbs_ids.len()],
                    filone_ids[(i as usize) % filone_ids.len()],
                    (i + 1).to_string(),
                    format!("Task {i}"),
                    inizio,
                    fine,
                    critico as i64,
                    milestone as i64,
                ])
                .map_err(|e| e.to_string())?;
            task_ids.push(tx.last_insert_rowid());
        }
    }

    {
        let mut st_ass = tx.prepare("INSERT INTO assignment (task_id, resource_id, units) VALUES (?1, ?2, 1.0)").map_err(|e| e.to_string())?;
        for (i, task_id) in task_ids.iter().enumerate() {
            st_ass.execute(params![task_id, risorsa_ids[i % risorsa_ids.len()]]).map_err(|e| e.to_string())?;
        }
    }

    tx.execute(
        "INSERT INTO baseline (project_id, name, kind, created_at, locked, bac_direct, bac_total) VALUES (?1, 'Startup', 'startup', '2026-01-01T00:00:00Z', 1, ?2, ?2)",
        params![pid, (n_wbs as f64) * 1000.0],
    )
    .map_err(|e| e.to_string())?;
    let baseline_id: i64 = tx.query_row("SELECT id FROM baseline WHERE project_id = ?1", [pid], |r| r.get(0)).map_err(|e| e.to_string())?;
    {
        let mut st_bt = tx.prepare("INSERT INTO baseline_task (baseline_id, task_id, start, finish, cost) VALUES (?1, ?2, ?3, ?4, ?5)").map_err(|e| e.to_string())?;
        for (i, task_id) in task_ids.iter().enumerate() {
            let giorno_inizio = (i as i64) % 300;
            st_bt
                .execute(params![baseline_id, task_id, evm_db::tempo::iso_da_giorno(giorno_inizio), evm_db::tempo::iso_da_giorno(giorno_inizio + 5), 500.0])
                .map_err(|e| e.to_string())?;
        }
    }

    let mut snapshot_ids = Vec::with_capacity(N_SNAPSHOT as usize);
    {
        let mut st_snap = tx.prepare("INSERT INTO status_snapshot (project_id, status_date, source) VALUES (?1, ?2, 'manuale')").map_err(|e| e.to_string())?;
        for s in 0..N_SNAPSHOT {
            st_snap.execute(params![pid, evm_db::tempo::iso_da_giorno(s * 7)]).map_err(|e| e.to_string())?;
            snapshot_ids.push(tx.last_insert_rowid());
        }
    }
    {
        let mut st_prog = tx
            .prepare("INSERT INTO snapshot_task (snapshot_id, task_id, pct_complete, ac_cost) VALUES (?1, ?2, ?3, ?4)")
            .map_err(|e| e.to_string())?;
        for (si, snapshot_id) in snapshot_ids.iter().enumerate() {
            let pct = ((si + 1) as f64 / N_SNAPSHOT as f64).min(1.0);
            for task_id in &task_ids {
                st_prog.execute(params![snapshot_id, task_id, pct, pct * 500.0]).map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(pid)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Misura {
    ms: f64,
    #[serde(rename = "n")]
    scala: i64,
    #[serde(rename = "misuratoIl")]
    misurato_il: String,
}

type Baseline = HashMap<String, Misura>;

fn adesso_iso() -> String {
    evm_db::tempo::adesso_iso()
}

fn cronometra<T>(f: impl FnOnce() -> T) -> (T, f64) {
    let inizio = Instant::now();
    let risultato = f();
    (risultato, inizio.elapsed().as_secs_f64() * 1000.0)
}

/// Obiettivi in millisecondi dalla tabella della specifica §3 (solo le righe
/// raggiungibili da questo binario — le altre sono nel generatore TS o fuori ambito,
/// vedi il commento di modulo).
fn obiettivo_ms(nome: &str) -> Option<f64> {
    match nome {
        "apertura_progetto_2000" => Some(2000.0),
        _ => None,
    }
}

/// Sotto questa soglia il confronto con la baseline è spento: su un'operazione da
/// pochi millisecondi il rumore del sistema (altri processi, scheduling) supera da solo
/// il 20% di tolleranza, segnalando regressioni che non ci sono (osservato misurando:
/// `query_gantt_200` è passato da 4,7 a 6,5 ms tra due run consecutivi sulla stessa
/// macchina, senza nessuna modifica in mezzo).
const SOGLIA_RUMORE_MS: f64 = 20.0;

fn confronta(nome: &str, ms: f64, scala: i64, baseline: &Baseline, aggiornamenti: &mut Baseline) -> bool {
    let mut ok = true;
    if let Some(obiettivo) = obiettivo_ms(nome) {
        if ms > obiettivo {
            println!("  FALLITO {nome}: {ms:.1} ms > obiettivo {obiettivo:.0} ms");
            ok = false;
        }
    }
    if let Some(precedente) = baseline.get(nome) {
        let soglia = precedente.ms * 1.2;
        if ms > soglia && precedente.ms > SOGLIA_RUMORE_MS {
            println!("  FALLITO {nome}: {ms:.1} ms oltre il 20% della baseline registrata ({:.1} ms)", precedente.ms);
            ok = false;
        }
    }
    println!("  {nome}: {ms:.1} ms (scala {scala})");
    aggiornamenti.insert(nome.to_string(), Misura { ms, scala, misurato_il: adesso_iso() });
    ok
}

fn main() {
    let argomenti: Vec<String> = env::args().collect();
    let registra = argomenti.iter().any(|a| a == "--record");
    let scale: Vec<i64> = if argomenti.iter().any(|a| a == "--rapido") { vec![200] } else { vec![200, 2000, 20000] };

    let percorso_baseline = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("baseline.json");
    let baseline: Baseline = fs::read_to_string(&percorso_baseline).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    let mut aggiornamenti = baseline.clone();
    let mut tutto_ok = true;

    for n_task in scale {
        println!("\n== {n_task} task, {N_FILONI} filoni, {N_RISORSE} risorse, {N_SNAPSHOT} date di stato ==");
        let dir = tempfile::tempdir().unwrap();
        let percorso = dir.path().join("bench.evmproj");

        let (pid, ms_generazione) = cronometra(|| genera_progetto_sintetico(&percorso, n_task).unwrap());
        println!("  (generazione fixture: {ms_generazione:.0} ms, non è un obiettivo di prestazione)");

        // "Apertura progetto": riapre il file da zero (nuova Connection), come farebbe l'app.
        let (_, ms_apertura) = cronometra(|| {
            let conn = open_and_migrate(&percorso).unwrap();
            controllo::dati_monitoraggio(&conn, pid).unwrap()
        });
        let nome = if n_task == 2000 { "apertura_progetto_2000".to_string() } else { format!("apertura_progetto_{n_task}") };
        tutto_ok &= confronta(&nome, ms_apertura, n_task, &baseline, &mut aggiornamenti);

        let conn = Connection::open(&percorso).unwrap();
        let (_, ms_gantt) = cronometra(|| schermate::gantt(&conn, pid, None).unwrap());
        tutto_ok &= confronta(&format!("query_gantt_{n_task}"), ms_gantt, n_task, &baseline, &mut aggiornamenti);
    }

    if registra {
        fs::write(&percorso_baseline, serde_json::to_string_pretty(&aggiornamenti).unwrap()).unwrap();
        println!("\nBaseline aggiornata: {}", percorso_baseline.display());
    }

    if !tutto_ok && !registra {
        println!("\nAlcune misure superano l'obiettivo o la baseline di oltre il 20%.");
        std::process::exit(1);
    }
}
