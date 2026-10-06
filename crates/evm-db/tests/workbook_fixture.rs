// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Test di import/export del workbook (specifica fase 3, §5): fixture reale, round trip,
// idempotenza, colonne riordinate, righe vuote di riserva, file ostili.

use std::path::{Path, PathBuf};

use evm_db::export::{esporta_workbook, CacheExport, OpzioniExport};
use evm_db::workbook::{aggiorna_progetto, anteprima, importa_workbook, input_progetto};
use evm_db::open_and_migrate;
use rust_xlsxwriter::Workbook;
use tempfile::tempdir;

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/Parte_III_Gestione_Progetti.xlsx")
}

fn avvisi_codici(w: &evm_db::workbook::WorkbookImportato) -> Vec<String> {
    w.avvisi.iter().map(|a| a.codice.clone()).collect()
}

#[test]
fn fixture_legge_input_e_segnala_la_data_incoerente() {
    let w = anteprima(&fixture()).expect("fixture leggibile");
    assert_eq!(w.attivita.len(), 9, "nove attività, la riga vuota chiude la tabella");
    assert_eq!(w.checkpoint.len(), 1);
    assert_eq!(w.rischi.len(), 1);
    assert_eq!(w.sprint.len(), 3);
    assert_eq!(w.parametri.overhead, Some(10.0), "overhead 10% in intero");
    assert_eq!(w.parametri.contingency, Some(15.0));
    assert_eq!(w.parametri.riserva_gestione, Some(5.0));
    assert_eq!(w.parametri.inizio.as_deref(), Some("2027-01-01"), "Parametri inizia il 01/01/2027");
    assert_eq!(w.attivita[0].data_inizio.as_deref(), Some("2026-01-01"));
    assert!(avvisi_codici(&w).contains(&"XL_DATE_MISMATCH".to_string()));
    assert!(w.meta.is_none(), "la fixture non ha _meta: template manuale");
    assert!(avvisi_codici(&w).contains(&"XL_NO_META".to_string()));
}

#[test]
fn fixture_cache_dei_totali_per_il_confronto_col_motore() {
    let w = anteprima(&fixture()).unwrap();
    assert!((w.cache.totali["bac"] - 55933.8725).abs() < 1e-3, "BAC del file");
    assert!((w.cache.totali["diretto"] - 44_216.5).abs() < 1e-6);
    assert!((w.cache.totali["effort"] - 77.1666).abs() < 1e-3);
    assert_eq!(w.attivita[0].id, "1.1", "ID numerico reso come 1.1");
}

#[test]
fn import_crea_un_progetto_e_non_sovrascrive() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("p.evmproj");
    let (esito, _w) = importa_workbook(&fixture(), &dest, "Fixture").expect("import");
    let conn = open_and_migrate(&dest).unwrap();
    let w = input_progetto(&conn, esito.project_id).unwrap();
    assert_eq!(w.attivita.len(), 9);
    assert!(importa_workbook(&fixture(), &dest, "Doppio").is_err(), "destinazione esistente");
}

#[test]
fn round_trip_export_poi_reimport_mantiene_gli_input() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("p.evmproj");
    let (esito, _) = importa_workbook(&fixture(), &dest, "RT").unwrap();
    let conn = open_and_migrate(&dest).unwrap();
    let originale = input_progetto(&conn, esito.project_id).unwrap();

    let xlsx = dir.path().join("export.xlsx");
    esporta_workbook(&conn, esito.project_id, &xlsx, &CacheExport::default(), OpzioniExport { con_formule: true, data_di_stato: None }).expect("export");

    let dest2 = dir.path().join("rt.evmproj");
    let (esito2, _) = importa_workbook(&xlsx, &dest2, "RT2").expect("reimport dell'export");
    let conn2 = open_and_migrate(&dest2).unwrap();
    let rilettura = input_progetto(&conn2, esito2.project_id).unwrap();

    assert_eq!(rilettura.attivita, originale.attivita, "attività identiche campo per campo");
    assert_eq!(rilettura.checkpoint, originale.checkpoint, "checkpoint identici");
    assert_eq!(rilettura.rischi, originale.rischi, "rischi identici");
    assert_eq!(rilettura.sprint, originale.sprint, "sprint identici");
    assert_eq!(rilettura.parametri.overhead, originale.parametri.overhead);
    assert_eq!(rilettura.parametri.contingency, originale.parametri.contingency);
    assert_eq!(rilettura.parametri.riserva_gestione, originale.parametri.riserva_gestione);
    assert_eq!(rilettura.parametri.inizio, originale.parametri.inizio);
}

#[test]
fn export_contiene_fogli_formule_grafici_e_meta_nascosto() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("p.evmproj");
    let (esito, _) = importa_workbook(&fixture(), &dest, "F").unwrap();
    let conn = open_and_migrate(&dest).unwrap();
    let xlsx = dir.path().join("e.xlsx");
    esporta_workbook(&conn, esito.project_id, &xlsx, &CacheExport::default(), OpzioniExport { con_formule: true, data_di_stato: None }).unwrap();
    let entrate = zip_entrate(&xlsx);
    assert!(entrate.iter().any(|n| n.starts_with("xl/charts/chart")), "grafici nativi presenti");
    let wb = String::from_utf8(read_entry(&xlsx, "xl/workbook.xml")).unwrap();
    for foglio in ["Guida", "Parametri", "WBS e Stima Costi", "Monitoraggio EVM", "Buffer e Contingency", "Agile - Velocity", "Dashboard", "Glossario", "_meta"] {
        assert!(wb.contains(&format!("name=\"{foglio}\"")), "foglio {foglio}");
    }
    assert!(wb.contains("state=\"hidden\""), "_meta nascosto");
}

#[test]
fn colonne_riordinate_e_extra_danno_lo_stesso_risultato() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("riordinato.xlsx");
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.set_name("WBS e Stima Costi").unwrap();
    // Colonne in ordine diverso e una colonna extra.
    let intestazioni = ["Extra", "ID", "CostoOrario", "Attivita", "O", "M", "P", "OreGiorno", "Materiali", "ServiziEsterni", "DataInizio"];
    for (c, t) in intestazioni.iter().enumerate() {
        ws.write_string(2, c as u16, *t).unwrap();
    }
    ws.write_string(3, 0, "nota libera").unwrap();
    ws.write_string(3, 1, "1.1").unwrap();
    ws.write_number(3, 2, 71.625).unwrap();
    ws.write_string(3, 3, "C451").unwrap();
    ws.write_number(3, 4, 8.0).unwrap();
    ws.write_number(3, 5, 11.0).unwrap();
    ws.write_number(3, 6, 13.0).unwrap();
    ws.write_number(3, 7, 8.0).unwrap();
    ws.write_number(3, 8, 0.0).unwrap();
    ws.write_number(3, 9, 0.0).unwrap();
    ws.write_number(3, 10, 46023.0).unwrap();
    // Riga vuota di riserva e poi una riga successiva: non va letta.
    ws.write_string(5, 1, "9.9").unwrap();
    wb.save(&file).unwrap();

    let w = anteprima(&file).unwrap();
    assert_eq!(w.attivita.len(), 1, "la lettura si ferma alla prima riga con ID vuoto");
    assert_eq!(w.attivita[0].id, "1.1");
    assert_eq!(w.attivita[0].costo_orario, Some(71.625));
    assert_eq!(w.attivita[0].data_inizio.as_deref(), Some("2026-01-01"));
}

#[test]
fn schema_vecchio_senza_parametri_nuovi_usa_default_e_avvisa() {
    let w = anteprima(&fixture()).unwrap();
    assert!(w.parametri.base_ev.is_none(), "la fixture non ha Base di misura EV");
    assert!(w.parametri.costo_per_sp.is_none());
    assert!(avvisi_codici(&w).contains(&"AGILE_COSTO_SP".to_string()));
}

#[test]
fn reimport_nello_stesso_progetto_non_duplica_le_righe() {
    let dir = tempdir().unwrap();
    let dest = dir.path().join("p.evmproj");
    let (esito, _) = importa_workbook(&fixture(), &dest, "Idem").unwrap();
    let (_, _) = aggiorna_progetto(&fixture(), &dest).unwrap();
    let (_, _) = aggiorna_progetto(&fixture(), &dest).unwrap();
    let conn = open_and_migrate(&dest).unwrap();
    let w = input_progetto(&conn, esito.project_id).unwrap();
    assert_eq!(w.attivita.len(), 9, "attività non duplicate");
    assert_eq!(w.checkpoint.len(), 1);
    assert_eq!(w.rischi.len(), 1);
    assert_eq!(w.sprint.len(), 3);
}

#[test]
fn file_ostili_danno_errore_senza_panico() {
    let dir = tempdir().unwrap();
    let testo = dir.path().join("non_excel.xlsx");
    std::fs::write(&testo, b"questo non e' uno zip").unwrap();
    assert!(anteprima(&testo).is_err());
    let mancante = dir.path().join("nessuno.xlsx");
    assert!(anteprima(&mancante).is_err());
}

fn zip_entrate(p: &Path) -> Vec<String> {
    let f = std::fs::File::open(p).unwrap();
    let mut z = zip::ZipArchive::new(f).unwrap();
    (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect()
}

fn read_entry(p: &Path, nome: &str) -> Vec<u8> {
    use std::io::Read;
    let f = std::fs::File::open(p).unwrap();
    let mut z = zip::ZipArchive::new(f).unwrap();
    let mut e = z.by_name(nome).unwrap();
    let mut out = Vec::new();
    e.read_to_end(&mut out).unwrap();
    out
}
