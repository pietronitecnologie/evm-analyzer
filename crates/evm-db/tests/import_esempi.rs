// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Import dei file di esempio in fixtures/import (stesso piano in XML, CSV ed Excel) e
// dei file errati di controllo. Verifica che i tre formati producano lo stesso piano.

use std::path::{Path, PathBuf};

use evm_db::import::importa_piano;
use evm_db::open_and_migrate;
use tempfile::tempdir;

fn esempio(nome: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/import").join(nome)
}

/// Conteggi del progetto importato: (task, dipendenze, risorse, assegnazioni, somma costi baseline).
fn conteggi(origine: &Path) -> (i64, i64, i64, i64, f64) {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("p.evmproj");
    importa_piano(origine, &dest, "Esempio").expect("import dell'esempio");
    let conn = open_and_migrate(&dest).unwrap();
    let c = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap() };
    let costo: f64 = conn
        .query_row("SELECT COALESCE(SUM(cost), 0) FROM baseline_task", [], |r| r.get(0))
        .unwrap();
    (
        c("SELECT count(*) FROM task"),
        c("SELECT count(*) FROM dependency"),
        c("SELECT count(*) FROM resource"),
        c("SELECT count(*) FROM assignment"),
        costo,
    )
}

#[test]
fn xml_csv_ed_excel_danno_lo_stesso_piano() {
    let xml = conteggi(&esempio("piano-msproject-esempio.xml"));
    let csv = conteggi(&esempio("piano-msproject-esempio.csv"));
    let xlsx = conteggi(&esempio("piano-msproject-esempio.xlsx"));
    assert_eq!(xml, (12, 9, 3, 7, 20700.0), "XML: 12 attività, 9 precedenze, 3 risorse, 7 assegnazioni");
    assert_eq!(csv.0, xml.0, "CSV: stesse attività");
    assert_eq!(xlsx.0, xml.0, "Excel: stesse attività");
    assert_eq!(csv.1, xml.1, "stesse precedenze in CSV");
    assert_eq!(xlsx.1, xml.1, "stesse precedenze in Excel");
    assert_eq!(csv.3, xml.3, "stesse assegnazioni in CSV");
    assert_eq!(xlsx.3, xml.3, "stesse assegnazioni in Excel");
    assert!((csv.4 - xml.4).abs() < 0.01, "stessa somma costi: CSV");
    assert!((xlsx.4 - xml.4).abs() < 0.01, "stessa somma costi: Excel");
}

#[test]
fn file_errati_danno_errore_chiaro() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("x.evmproj");
    let senza_task = importa_piano(&esempio("esempio-xml-senza-task.xml"), &dest, "X").unwrap_err();
    assert!(senza_task.contains("nessun task"), "{senza_task}");
    let senza_uid = importa_piano(&esempio("esempio-csv-senza-uid.csv"), &dest, "X").unwrap_err();
    assert!(senza_uid.contains("UID"), "{senza_uid}");
    let mpp = importa_piano(&esempio("esempio-non-supportato.mpp"), &dest, "X").unwrap_err();
    assert!(mpp.contains("formato non supportato"), "{mpp}");
    assert!(!dest.exists(), "nessun file creato in caso di errore");
}
