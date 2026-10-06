// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Lettura del primo foglio di un workbook Excel (`.xlsx`, `.xlsm`, `.xls`)
//! con lo stesso profilo delle colonne del CSV (vedi [`super::tabular`]).

use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};

use super::tabular::da_righe;
use super::ImportedPlan;
use crate::tempo;

pub fn leggi(percorso: &Path) -> Result<ImportedPlan, String> {
    let mut workbook = open_workbook_auto(percorso).map_err(|e| format!("Excel non leggibile: {e}"))?;
    let primo_foglio = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "il workbook non contiene fogli".to_string())?;
    let intervallo = workbook
        .worksheet_range(&primo_foglio)
        .map_err(|e| format!("foglio «{primo_foglio}» non leggibile: {e}"))?;

    let righe: Vec<Vec<String>> = intervallo
        .rows()
        .map(|riga| riga.iter().map(cella_come_testo).collect())
        .collect();
    da_righe(righe)
}

/// Le celle sono convertite in testo: le date diventano `YYYY-MM-DD` così il
/// parser tabellare le tratta come le date dei CSV; i numeri interi senza
/// decimali restano senza `.0`.
fn cella_come_testo(cella: &Data) -> String {
    match cella {
        Data::Empty => String::new(),
        Data::String(s) | Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
        Data::Int(i) => i.to_string(),
        Data::Float(f) => {
            if f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                f.to_string()
            }
        }
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => {
            let seriale = dt.as_f64();
            tempo::seriale_excel_a_iso(seriale).unwrap_or_else(|| seriale.to_string())
        }
        Data::Error(e) => format!("{e:?}"),
    }
}
