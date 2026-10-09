// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Genera `fixtures/progetto-esempio.evmproj`: un piccolo progetto realistico
//! (rifacimento di un impianto elettrico) usato come esempio ricorrente nel
//! manuale utente (`MANUALE_UTENTE.md`). Costruito chiamando le stesse funzioni
//! pubbliche della libreria che usa l'app — nessun INSERT a mano, a parte poche
//! correzioni di data isolate e commentate (vedi `backdata`).
//!
//! Esecuzione: `cargo run --example progetto_esempio -p evm-db`

use std::fs;
use std::path::Path;

use evm_db::import::{salva_piano, BacOptions, CommitOptions, ImportedPlan, PlanLink, PlanTask, SourceInfo};
use evm_db::{controllo, filoni, qualita, schermate};
use rusqlite::{params, Connection};

const DESTINAZIONE: &str = "../../fixtures/progetto-esempio.evmproj";

fn link(pred_uid: &str) -> PlanLink {
    PlanLink { pred_uid: pred_uid.into(), kind: "FS".into(), lag_minutes: 0 }
}

fn piano() -> ImportedPlan {
    ImportedPlan {
        tasks: vec![
            // Fase 1 — Progettazione
            PlanTask { uid: "1".into(), name: "Progettazione".into(), wbs: Some("1".into()), is_summary: true, ..Default::default() },
            PlanTask {
                uid: "2".into(), name: "Analisi stato di fatto".into(), wbs: Some("1.1".into()),
                start: Some("2026-07-06".into()), finish: Some("2026-07-10".into()), cost: Some(1800.0),
                ..Default::default()
            },
            PlanTask {
                uid: "3".into(), name: "Progetto esecutivo".into(), wbs: Some("1.2".into()),
                start: Some("2026-07-13".into()), finish: Some("2026-07-24".into()), cost: Some(4200.0),
                predecessors: vec![link("2")],
                ..Default::default()
            },
            // Fase 2 — Lavori civili
            PlanTask { uid: "4".into(), name: "Lavori civili".into(), wbs: Some("2".into()), is_summary: true, ..Default::default() },
            PlanTask {
                uid: "5".into(), name: "Demolizioni".into(), wbs: Some("2.1".into()),
                start: Some("2026-07-27".into()), finish: Some("2026-08-07".into()), cost: Some(3500.0),
                predecessors: vec![link("3")],
                ..Default::default()
            },
            PlanTask {
                uid: "6".into(), name: "Tracce e cavidotti".into(), wbs: Some("2.2".into()),
                start: Some("2026-08-10".into()), finish: Some("2026-08-21".into()), cost: Some(5200.0),
                predecessors: vec![link("5")],
                ..Default::default()
            },
            // Fase 3 — Impianti elettrici
            PlanTask { uid: "7".into(), name: "Impianti elettrici".into(), wbs: Some("3".into()), is_summary: true, ..Default::default() },
            PlanTask {
                uid: "8".into(), name: "Posa cavi".into(), wbs: Some("3.1".into()),
                start: Some("2026-08-24".into()), finish: Some("2026-09-04".into()), cost: Some(6800.0),
                predecessors: vec![link("6")],
                ..Default::default()
            },
            PlanTask {
                uid: "9".into(), name: "Quadri elettrici".into(), wbs: Some("3.2".into()),
                start: Some("2026-09-07".into()), finish: Some("2026-09-11".into()), cost: Some(4500.0),
                predecessors: vec![link("8")],
                ..Default::default()
            },
            PlanTask {
                uid: "10".into(), name: "Corpi illuminanti".into(), wbs: Some("3.3".into()),
                start: Some("2026-09-14".into()), finish: Some("2026-09-25".into()), cost: Some(3900.0),
                predecessors: vec![link("9")],
                ..Default::default()
            },
            // Fase 4 — Collaudi
            PlanTask { uid: "11".into(), name: "Collaudi".into(), wbs: Some("4".into()), is_summary: true, ..Default::default() },
            PlanTask {
                uid: "12".into(), name: "Collaudo impianto".into(), wbs: Some("4.1".into()),
                start: Some("2026-09-28".into()), finish: Some("2026-10-02".into()), cost: Some(1600.0),
                predecessors: vec![link("10")],
                ..Default::default()
            },
            PlanTask {
                uid: "13".into(), name: "Certificazioni".into(), wbs: Some("4.2".into()),
                start: Some("2026-10-05".into()), finish: Some("2026-10-09".into()), cost: Some(900.0),
                predecessors: vec![link("12")],
                ..Default::default()
            },
            PlanTask {
                uid: "14".into(), name: "Consegna impianto".into(), wbs: Some("4".into()),
                is_milestone: true, start: Some("2026-10-09".into()), finish: Some("2026-10-09".into()),
                predecessors: vec![link("13")],
                ..Default::default()
            },
        ],
        ..Default::default()
    }
}

/// Un'unica correzione isolata di data via SQL: `registra_avanzamento`/`snapshot_manuale`
/// timbrano sempre con la data odierna reale (`tempo::oggi_iso()`), non programmabile
/// dalle funzioni pubbliche. Per raccontare tre cicli di monitoraggio su mesi diversi,
/// ogni ciclo si registra "oggi" e poi si retrodata — solo qui, solo per questo scopo
/// (un esempio statico per la documentazione, non una tecnica generale).
fn backdata(conn: &Connection, snapshot_id: i64, status_date: &str, entered_at: &str) {
    conn.execute("UPDATE status_snapshot SET status_date = ?2 WHERE id = ?1", params![snapshot_id, status_date]).unwrap();
    conn.execute(
        "UPDATE progress_entry SET entered_at = ?2 WHERE snapshot_id = ?1",
        params![snapshot_id, entered_at],
    )
    .unwrap();
}

fn registra_e_approva(
    conn: &mut Connection,
    pid: i64,
    uid: &str,
    pct: f64,
    inizio: Option<&str>,
    fine: Option<&str>,
    ac: f64,
    nota: Option<&str>,
) -> i64 {
    let entry_id = schermate::registra_avanzamento(
        conn, pid, uid, pct,
        inizio.map(String::from), fine.map(String::from),
        Some(ac), None, nota.map(String::from),
    )
    .unwrap_or_else(|e| panic!("registrazione avanzamento {uid}: {e}"));
    schermate::approva(conn, entry_id).unwrap_or_else(|e| panic!("approvazione {uid}: {e}"));
    entry_id
}

fn snapshot_id_di(conn: &Connection, entry_id: i64) -> i64 {
    conn.query_row("SELECT snapshot_id FROM progress_entry WHERE id = ?1", [entry_id], |r| r.get(0)).unwrap()
}

fn main() {
    let destinazione = Path::new(DESTINAZIONE);
    if destinazione.exists() {
        fs::remove_file(destinazione).expect("rimozione del file precedente");
    }
    let mut conn = evm_db::open_and_migrate(destinazione).expect("apertura del nuovo progetto");

    // --- Piano importato come baseline "stima" (bozza, non bloccata) -------------
    let esito = salva_piano(
        &mut conn,
        &piano(),
        &SourceInfo {
            project_name: "Rifacimento impianto elettrico — Edificio A",
            source_type: "manuale",
            import_kind: "piano_csv",
            source_file: "progetto-esempio",
            file_hash: String::new(),
        },
        &CommitOptions {
            bac: BacOptions::default(),
            baseline_kind: "stima".into(),
            lock_baseline: false,
            status_date: None,
        },
    )
    .expect("importazione del piano");
    let pid = esito.project_id;
    println!("Progetto creato (id {pid}), {} avvisi dall'importazione", esito.warnings.len());

    // --- Utenti: un coordinatore del piano e un supervisore, oltre ad admin ------
    schermate::crea_utente(&mut conn, "mrossi", "Mario Rossi", "cantiere1", &["project_engineer".into(), "coordinatore_piano".into()])
        .expect("creazione utente mrossi");
    schermate::crea_utente(&mut conn, "lverdi", "Luca Verdi", "cantiere2", &["supervisore".into()])
        .expect("creazione utente lverdi");
    let mrossi_id: i64 = conn.query_row("SELECT id FROM user_profile WHERE user_uid = 'mrossi'", [], |r| r.get(0)).unwrap();
    let lverdi_id: i64 = conn.query_row("SELECT id FROM user_profile WHERE user_uid = 'lverdi'", [], |r| r.get(0)).unwrap();

    // --- Workstreams (filoni): Civile e Impianti, con un gate fra i due ----------
    let filone_civile = filoni::crea_filone(&conn, pid, "Civile", "costruzione", "unita_fisiche", None, false).unwrap();
    let filone_impianti = filoni::crea_filone(&conn, pid, "Impianti", "costruzione", "unita_fisiche", None, false).unwrap();
    for uid in ["2", "3", "5", "6"] {
        filoni::assegna_task_a_filone(&conn, pid, uid, Some(filone_civile)).unwrap();
    }
    for uid in ["8", "9", "10", "12", "13"] {
        filoni::assegna_task_a_filone(&conn, pid, uid, Some(filone_impianti)).unwrap();
    }
    filoni::crea_gate(&conn, pid, filone_civile, filone_impianti, Some("Cavidotti pronti per la posa cavi"), Some("2026-08-21"), 2.0).unwrap();

    // --- Budget WBS: tutti i nodi tranne 4.2 (anomalia deliberata) ---------------
    for (codice, budget) in [
        ("1.1", 1800.0), ("1.2", 4200.0), ("2.1", 3500.0), ("2.2", 5200.0),
        ("3.1", 6800.0), ("3.2", 4500.0), ("3.3", 3900.0), ("4.1", 1600.0),
        // "4.2" resta senza budget: innesca l'anomalia WBS_NO_BUDGET, accettata più sotto.
    ] {
        controllo::imposta_budget_wbs(&conn, pid, codice, Some(budget)).unwrap();
    }

    // --- Baseline di budget "startup", bloccata dal coordinatore del piano -------
    controllo::blocca_baseline_budget(&conn, pid, Some(mrossi_id), "Startup", "startup", 1500.0, 3000.0)
        .expect("blocco baseline di budget");

    // === Ciclo di monitoraggio 1 (metà agosto): fasi 1-2 ========================
    registra_e_approva(&mut conn, pid, "2", 100.0, Some("2026-07-06"), Some("2026-07-10"), 1750.0, Some("Sopralluogo concluso, nessuna criticità."));
    registra_e_approva(&mut conn, pid, "3", 100.0, Some("2026-07-13"), Some("2026-07-25"), 4350.0, Some("Variante minore concordata con la direzione lavori."));
    let entry_21 = registra_e_approva(
        &mut conn, pid, "5", 100.0, Some("2026-07-27"), Some("2026-08-10"), 5100.0,
        Some("Rinvenute canalizzazioni interrate non censite: scavo aggiuntivo."),
    );
    registra_e_approva(&mut conn, pid, "6", 60.0, Some("2026-08-10"), None, 3000.0, Some("In corso: cavidotti secondari da completare."));

    // Allegato al verbale di sopralluogo del 10/08 (un file minimo creato al volo).
    let verbale = std::env::temp_dir().join("verbale-sopralluogo-20260810.txt");
    fs::write(
        &verbale,
        "Verbale di sopralluogo — 10/08/2026\n\n\
         Durante lo scavo per le demolizioni sono state rinvenute canalizzazioni\n\
         interrate non censite nelle planimetrie di progetto. Necessario uno scavo\n\
         aggiuntivo di circa 8 m lineari. Costo stimato extra: 2.500 EUR, 3 giorni.\n",
    )
    .unwrap();
    schermate::aggiungi_allegato(&conn, entry_21, verbale.to_str().unwrap()).unwrap();
    let _ = fs::remove_file(&verbale);

    let snap1 = snapshot_id_di(&conn, entry_21);
    backdata(&conn, snap1, "2026-08-14", "2026-08-14T17:30:00Z");

    // --- Change request per lo scavo aggiuntivo, approvata -----------------------
    let cr_id = controllo::crea_change_request(
        &conn, pid, "Mario Rossi",
        "Rinvenute canalizzazioni interrate non censite: necessario scavo aggiuntivo.",
        Some(2500.0), Some(3.0), None,
    )
    .expect("creazione change request");
    controllo::approva_change_request(&mut conn, pid, Some(mrossi_id), cr_id).expect("approvazione change request");

    // === Ciclo di monitoraggio 2 (metà settembre): fasi 2-3 =====================
    registra_e_approva(&mut conn, pid, "6", 100.0, None, Some("2026-08-21"), 5150.0, None);
    registra_e_approva(&mut conn, pid, "8", 100.0, Some("2026-08-24"), Some("2026-09-04"), 6700.0, None);
    registra_e_approva(&mut conn, pid, "9", 100.0, Some("2026-09-07"), Some("2026-09-11"), 4450.0, None);

    // Corpi illuminanti: prima proposta con una data incoerente, respinta, poi corretta.
    let proposta_errata = schermate::registra_avanzamento(
        &mut conn, pid, "10", 20.0, Some("2026-09-20".into()), None, Some(800.0), None,
        Some("Avviati i lavori.".into()),
    )
    .unwrap();
    schermate::respingi(&conn, proposta_errata, "Data di inizio effettivo incoerente con l'avanzamento del quadro elettrico: verificare.").unwrap();
    let entry_33 = registra_e_approva(&mut conn, pid, "10", 20.0, Some("2026-09-14"), None, 800.0, Some("Data corretta: lavori avviati regolarmente."));

    let snap2 = snapshot_id_di(&conn, entry_33);
    backdata(&conn, snap2, "2026-09-11", "2026-09-11T16:00:00Z");

    // === Ciclo di monitoraggio 3 (oggi): fase 3 in chiusura, fase 4 =============
    registra_e_approva(&mut conn, pid, "10", 100.0, None, Some("2026-09-25"), 3850.0, None);
    registra_e_approva(&mut conn, pid, "12", 100.0, Some("2026-09-28"), Some("2026-10-02"), 1550.0, None);
    registra_e_approva(&mut conn, pid, "13", 40.0, Some("2026-10-05"), None, 400.0, Some("Pratiche in corso presso l'ente certificatore."));
    // Lo snapshot di questo ciclo resta sulla data odierna reale: è il monitoraggio corrente.

    // --- Qualità dati: anomalia nota (4.2 senza budget), accettata dal supervisore
    qualita::ricalcola_problemi(
        &mut conn, pid, None, "motore",
        vec![qualita::NuovoProblema {
            code: "WBS_NO_BUDGET".into(),
            severity: "avviso".into(),
            category: "baseline".into(),
            task_uid: None,
            wbs_codice: Some("4.2".into()),
            scope_id: None,
            message: "Il nodo WBS 4.2 (Certificazioni) non ha un budget assegnato.".into(),
            suggestion: Some("Assegna un budget al nodo dalla schermata Cost governance.".into()),
        }],
    )
    .expect("ricalcolo problemi");
    let problema_id: i64 = conn
        .query_row(
            "SELECT id FROM data_quality_issue WHERE code = 'WBS_NO_BUDGET' AND wbs_id = (SELECT id FROM wbs WHERE project_id = ?1 AND code = '4.2')",
            [pid],
            |r| r.get(0),
        )
        .unwrap();
    qualita::accetta_problema(
        &conn, pid, Some(lverdi_id), problema_id,
        "Le certificazioni sono ancora in corso: il budget si assegna al collaudo finale.",
    )
    .expect("accettazione anomalia");

    println!("Esempio completo scritto in {}", destinazione.display());
}
