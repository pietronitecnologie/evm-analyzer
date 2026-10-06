// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Export del progetto in un workbook Excel «Impresa Numerica» nuovo (specifica
//! fase 3, §3). Layout, intestazioni ed etichette come nel template, così il file
//! resta importabile. Le formule sono vive e portano il valore in cache calcolato
//! dal motore TypeScript (`CacheExport`): il backend non ricalcola.

use std::collections::HashMap;
use std::path::Path;

use rust_xlsxwriter::{Chart, ChartType, Format, Formula, Workbook, Worksheet, XlsxError};
use serde::Deserialize;

use crate::workbook::{input_progetto, WorkbookImportato};
use crate::{tempo, progetto};
use rusqlite::Connection;

/// Valori calcolati dal motore, per le celle con formula (stessi ordini delle righe di input).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheExport {
    /// Per attività: pert, sigma, effortOre, costoPersone, diretto, indiretto, attivita, durata, fine, pesoPct.
    #[serde(default)]
    pub righe: Vec<HashMap<String, f64>>,
    /// Totali: effort, sigmaProject, diretto, indiretto, subtotale, contingency, bac, bacMisura, riserva, budget.
    #[serde(default)]
    pub sintesi: HashMap<String, f64>,
    /// Per checkpoint: pv, ev, cv, sv, cpi, spi, etc, eac, eacOtt, eacLin, vac, tcpi.
    #[serde(default)]
    pub checkpoint: Vec<HashMap<String, f64>>,
    /// Per sprint: costoPerSp, ev, cpi.
    #[serde(default)]
    pub sprint: Vec<HashMap<String, f64>>,
    /// Buffer: stanziata, usata.
    #[serde(default)]
    pub buffer: HashMap<String, f64>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct OpzioniExport {
    /// Formule vive con valore in cache (default). Falso: solo valori (sola lettura).
    pub con_formule: bool,
    /// Esporta solo i checkpoint fino a questa data (ISO), se presente.
    pub data_di_stato: Option<i64>,
}

fn e(err: XlsxError) -> String {
    err.to_string()
}

/// Formati del workbook: input in blu chiaro, calcolate in grigio, intestazioni in grassetto.
struct Stili {
    titolo: Format,
    intestazione: Format,
    input: Format,
    input_pct: Format,
    input_data: Format,
    input_num: Format,
    calcolo: Format,
    calcolo_num: Format,
    calcolo_pct: Format,
    nota: Format,
}

impl Stili {
    fn new() -> Self {
        let input = Format::new().set_background_color(rust_xlsxwriter::Color::RGB(0xDDEBF7));
        let calc = Format::new().set_background_color(rust_xlsxwriter::Color::RGB(0xEDEDED));
        Self {
            titolo: Format::new().set_bold().set_font_size(13.0),
            intestazione: Format::new().set_bold().set_background_color(rust_xlsxwriter::Color::RGB(0xD9E1F2)),
            input: input.clone(),
            input_pct: input.clone().set_num_format("0.0%"),
            input_data: input.clone().set_num_format("dd/mm/yyyy"),
            input_num: input.set_num_format("#,##0.00"),
            calcolo: calc.clone(),
            calcolo_num: calc.clone().set_num_format("#,##0.00"),
            calcolo_pct: calc.set_num_format("0.0%"),
            nota: Format::new().set_italic(),
        }
    }
}

/// Serial Excel di una data ISO (sistema 1900, date dopo il 1900-03-01).
fn serial(iso: &str) -> Option<f64> {
    tempo::giorno_da_iso(iso).map(|g| (g + 25_569) as f64)
}

fn get(m: &HashMap<String, f64>, k: &str) -> Option<f64> {
    m.get(k).copied()
}

/// Scrive una formula con il valore in cache, o solo il valore se le formule sono disattivate.
fn scrivi_calcolo(ws: &mut Worksheet, r: u32, c: u16, formula: &str, cache: Option<f64>, fmt: &Format, con_formule: bool) -> Result<(), String> {
    if con_formule {
        let f = match cache {
            Some(v) => Formula::new(formula).set_result(v.to_string()),
            None => Formula::new(formula).set_result(""),
        };
        ws.write_formula_with_format(r, c, f, fmt).map_err(e)?;
    } else if let Some(v) = cache {
        ws.write_number_with_format(r, c, v, fmt).map_err(e)?;
    } else {
        ws.write_string_with_format(r, c, "", fmt).map_err(e)?;
    }
    Ok(())
}

/// Scrive un numero se presente, altrimenti una cella vuota con il formato.
fn scrivi_numero(ws: &mut Worksheet, r: u32, c: u16, v: Option<f64>, fmt: &Format) -> Result<(), String> {
    match v {
        Some(v) => ws.write_number_with_format(r, c, v, fmt).map_err(e).map(|_| ()),
        None => ws.write_blank(r, c, fmt).map_err(e).map(|_| ()),
    }
}

fn scrivi_testo(ws: &mut Worksheet, r: u32, c: u16, v: Option<&str>, fmt: &Format) -> Result<(), String> {
    match v {
        Some(v) => ws.write_string_with_format(r, c, v, fmt).map_err(e).map(|_| ()),
        None => ws.write_blank(r, c, fmt).map_err(e).map(|_| ()),
    }
}

/// Esporta il progetto nel workbook `destinazione`. Non sovrascrive un file esistente.
pub fn esporta_workbook(
    conn: &Connection,
    pid: i64,
    destinazione: &Path,
    cache: &CacheExport,
    opzioni: OpzioniExport,
) -> Result<(), String> {
    if destinazione.exists() {
        return Err(format!("il file {} esiste già", destinazione.display()));
    }
    let info = progetto::leggi_progetto(conn)?;
    let mut input: WorkbookImportato = input_progetto(conn, pid)?;

    // Checkpoint filtrati per data di stato; la cache è allineata per indice.
    let indici_checkpoint: Vec<usize> = input
        .checkpoint
        .iter()
        .enumerate()
        .filter(|(_, c)| match opzioni.data_di_stato {
            Some(limite) => tempo::giorno_da_iso(&c.date).is_some_and(|g| g <= limite),
            None => true,
        })
        .map(|(i, _)| i)
        .collect();
    let checkpoint: Vec<_> = indici_checkpoint.iter().map(|&i| input.checkpoint[i].clone()).collect();
    let cache_cp: Vec<HashMap<String, f64>> = indici_checkpoint
        .iter()
        .map(|&i| cache.checkpoint.get(i).cloned().unwrap_or_default())
        .collect();
    input.checkpoint = checkpoint;

    let stili = Stili::new();
    let mut wb = Workbook::new();
    let con = opzioni.con_formule;
    let base_misura_con_contingency = input.parametri.base_ev.as_deref().is_none_or(|b| !b.to_lowercase().contains("senza"));
    // Riga di sintesi della WBS (0-based): dopo le attività più due righe vuote.
    let ultima_wbs = 3 + input.attivita.len().max(1) as u32 - 1;
    let s0 = ultima_wbs + 3;
    // Sintesi: indice 6 = contingency, 7 = BAC, 8 = misura EV (vedi sotto).
    let cella_contingency = format!("'WBS e Stima Costi'!$B${}", s0 + 7);
    let cella_bac_totale = format!("'WBS e Stima Costi'!$B${}", s0 + 8);
    let cella_misura = format!("'WBS e Stima Costi'!$B${}", s0 + 9);
    let bac_ref = if base_misura_con_contingency { cella_bac_totale } else { cella_misura };

    // --- Guida ---
    {
        let ws = wb.add_worksheet();
        ws.set_name("Guida").map_err(e)?;
        ws.set_column_width(0, 110).map_err(e)?;
        let righe: Vec<(String, &Format)> = vec![
            ("Impresa Numerica — workbook di analisi EVM".into(), &stili.titolo),
            (format!("Esportato dall'app il {} (progetto «{}»).", tempo::adesso_iso(), info.name), &stili.nota),
            (String::new(), &stili.nota),
            ("Fogli: Guida, Parametri, WBS e Stima Costi, Monitoraggio EVM, Buffer e Contingency, Agile - Velocity, Dashboard, Glossario; _meta (nascosto).".into(), &stili.nota),
            ("Celle blu = input (importati); celle grigie = calcolate (formule vive con valore in cache dal motore).".into(), &stili.nota),
            (String::new(), &stili.nota),
            ("Differenze volute rispetto al template:".into(), &stili.titolo),
            ("• Parametri nuovi: Base di misura EV, SP pianificati per sprint, Costo per SP di baseline.".into(), &stili.nota),
            ("• Colonna Filone nella WBS e Stima Costi.".into(), &stili.nota),
            ("• Costo per SP non circolare: Costo team ÷ SP pianificati (o il costo di baseline), non velocity reale (§6-bis.2).".into(), &stili.nota),
            ("• BAC di misura (senza contingency) mostrato accanto al BAC totale.".into(), &stili.nota),
            ("• Foglio _meta nascosto con schema_version, project_id, exported_at e app_version.".into(), &stili.nota),
            ("• Gestione dei null: CPI o EAC non definiti mostrano una cella vuota, mai #VALUE! o #DIV/0!.".into(), &stili.nota),
        ];
        for (i, (testo, fmt)) in righe.iter().enumerate() {
            ws.write_string_with_format(i as u32, 0, testo.as_str(), fmt).map_err(e)?;
        }
    }

    // --- Parametri ---
    {
        let ws = wb.add_worksheet();
        ws.set_name("Parametri").map_err(e)?;
        ws.set_column_width(0, 46).map_err(e)?;
        ws.set_column_width(1, 16).map_err(e)?;
        ws.set_column_width(3, 60).map_err(e)?;
        ws.write_string_with_format(0, 0, "Parametri di progetto", &stili.titolo).map_err(e)?;
        for (c, t) in ["Parametro", "Valore", "Unità", "Descrizione"].iter().enumerate() {
            ws.write_string_with_format(4, c as u16, *t, &stili.intestazione).map_err(e)?;
        }
        let p = &input.parametri;
        let righe_pct: [(u32, &str, Option<f64>, &str); 3] = [
            (5, "Tasso di overhead (costi indiretti)", p.overhead, "Percentuale dei costi diretti allocata a struttura"),
            (6, "Contingency (riserva rischi noti)", p.contingency, "Riserva per rischi noti"),
            (7, "Management Reserve (riserva di gestione)", p.riserva_gestione, "Riserva esterna al BAC"),
        ];
        for (r, etichetta, valore, descr) in righe_pct {
            ws.write_string(r, 0, etichetta).map_err(e)?;
            scrivi_numero(ws, r, 1, valore, &stili.input_pct)?;
            ws.write_string(r, 2, "%").map_err(e)?;
            ws.write_string(r, 3, descr).map_err(e)?;
        }
        let altri: [(u32, &str, Option<f64>, &str); 8] = [
            (10, "Soglia verde (in linea)", p.soglia_verde, "CPI/SPI ≥ questo valore: sano"),
            (11, "Soglia gialla (attenzione)", p.soglia_gialla, "Tra questo valore e la soglia verde"),
            (17, "Buffer di progetto iniziale (Critical Chain)", p.buffer_giorni, "Buffer aggregato in giorni"),
            (19, "Durata sprint", p.durata_sprint, "Lunghezza standard di uno sprint, in giorni"),
            (20, "Costo team per sprint (fully loaded)", p.costo_team_sprint, "Costo pieno del team per sprint"),
            (21, "N. sprint per velocity media mobile", p.finestra_velocity, "Finestra della media mobile"),
            (24, "SP pianificati per sprint", p.sp_per_sprint, "Story point pianificati per sprint (nuovo)"),
            (25, "Costo per SP di baseline", p.costo_per_sp, "Fissato in baseline; vuoto = costo team ÷ SP pianificati (nuovo)"),
        ];
        for (r, etichetta, valore, descr) in altri {
            ws.write_string(r, 0, etichetta).map_err(e)?;
            scrivi_numero(ws, r, 1, valore, &stili.input_num)?;
            ws.write_string(r, 3, descr).map_err(e)?;
        }
        ws.write_string(14, 0, "Data inizio progetto").map_err(e)?;
        match p.inizio.as_deref().and_then(serial) {
            Some(d) => ws.write_number_with_format(14, 1, d, &stili.input_data).map_err(e).map(|_| ())?,
            None => ws.write_blank(14, 1, &stili.input_data).map_err(e).map(|_| ())?,
        }
        ws.write_string(15, 0, "Data fine pianificata progetto").map_err(e)?;
        match p.fine.as_deref().and_then(serial) {
            Some(d) => ws.write_number_with_format(15, 1, d, &stili.input_data).map_err(e).map(|_| ())?,
            None => ws.write_blank(15, 1, &stili.input_data).map_err(e).map(|_| ())?,
        }
        ws.write_string(23, 0, "Base di misura EV (6-bis.1)").map_err(e)?;
        ws.write_string(23, 1, if base_misura_con_contingency { "BAC con contingency" } else { "BAC senza contingency" }).map_err(e)?;
        ws.write_string(23, 3, "BAC con contingency: come nel template. Scelta di progetto.").map_err(e)?;
    }

    // --- WBS e Stima Costi ---
    let ultima_riga_wbs: u32;
    {
        let ws = wb.add_worksheet();
        ws.set_name("WBS e Stima Costi").map_err(e)?;
        ws.write_string_with_format(0, 0, "WBS e Stima Costi — pianificazione (§3.1–§3.4)", &stili.titolo).map_err(e)?;
        let intestazioni = [
            "ID", "Attivita", "Fase", "Risorsa", "CostoOrario", "O", "M", "P", "PERT", "Sigma", "OreGiorno", "EffortOre",
            "CostoPersone", "Materiali", "ServiziEsterni", "CostoDiretto", "CostoIndiretto", "CostoAttivita", "DataInizio",
            "DurataGg", "DataFine", "PesoPct", "Filone",
        ];
        for (c, t) in intestazioni.iter().enumerate() {
            ws.write_string_with_format(2, c as u16, *t, &stili.intestazione).map_err(e)?;
        }
        ws.set_column_width(1, 28).map_err(e)?;
        let primo: u32 = 3;
        let n = input.attivita.len() as u32;
        ultima_riga_wbs = primo + n.max(1) - 1;
        let excel_primo = primo + 1;
        let excel_ultimo = ultima_riga_wbs + 1;
        for (i, a) in input.attivita.iter().enumerate() {
            let r = primo + i as u32;
            let x = r + 1; // riga Excel
            let rc = cache.righe.get(i).cloned().unwrap_or_default();
            ws.write_string_with_format(r, 0, &a.id, &stili.input).map_err(e)?;
            scrivi_testo(ws, r, 1, a.attivita.as_deref(), &stili.input)?;
            scrivi_testo(ws, r, 2, a.fase.as_deref(), &stili.input)?;
            scrivi_testo(ws, r, 3, a.risorsa.as_deref(), &stili.input)?;
            scrivi_numero(ws, r, 4, a.costo_orario, &stili.input_num)?;
            scrivi_numero(ws, r, 5, a.o, &stili.input_num)?;
            scrivi_numero(ws, r, 6, a.m, &stili.input_num)?;
            scrivi_numero(ws, r, 7, a.p, &stili.input_num)?;
            scrivi_calcolo(ws, r, 8, &format!("=IF(A{x}=\"\",\"\",(F{x}+4*G{x}+H{x})/6)"), get(&rc, "pert"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 9, &format!("=IF(A{x}=\"\",\"\",(H{x}-F{x})/6)"), get(&rc, "sigma"), &stili.calcolo_num, con)?;
            scrivi_numero(ws, r, 10, a.ore_giorno, &stili.input_num)?;
            scrivi_calcolo(ws, r, 11, &format!("=IF(A{x}=\"\",\"\",I{x}*K{x})"), get(&rc, "effortOre"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 12, &format!("=IF(A{x}=\"\",\"\",L{x}*E{x})"), get(&rc, "costoPersone"), &stili.calcolo_num, con)?;
            scrivi_numero(ws, r, 13, a.materiali, &stili.input_num)?;
            scrivi_numero(ws, r, 14, a.servizi_esterni, &stili.input_num)?;
            scrivi_calcolo(ws, r, 15, &format!("=IF(A{x}=\"\",\"\",M{x}+N{x}+O{x})"), get(&rc, "diretto"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 16, &format!("=IF(A{x}=\"\",\"\",P{x}*Parametri!$B$6)"), get(&rc, "indiretto"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 17, &format!("=IF(A{x}=\"\",\"\",P{x}+Q{x})"), get(&rc, "attivita"), &stili.calcolo_num, con)?;
            match a.data_inizio.as_deref().and_then(serial) {
                Some(d) => ws.write_number_with_format(r, 18, d, &stili.input_data).map_err(e).map(|_| ())?,
                None => ws.write_blank(r, 18, &stili.input_data).map_err(e).map(|_| ())?,
            }
            scrivi_calcolo(ws, r, 19, &format!("=IF(A{x}=\"\",\"\",I{x})"), get(&rc, "durata"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 20, &format!("=IF(A{x}=\"\",\"\",S{x}+T{x})"), get(&rc, "fine"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 21, &format!("=IF(A{x}=\"\",\"\",IFERROR(R{x}/SUM($R${excel_primo}:$R${excel_ultimo}),\"\"))"), get(&rc, "pesoPct"), &stili.calcolo_pct, con)?;
            scrivi_testo(ws, r, 22, a.filone.as_deref(), &stili.input)?;
        }
        // Sintesi di progetto: etichetta in A, valore in B. Le etichette ricalcano il template.
        debug_assert_eq!(s0, ultima_riga_wbs + 3);
        let riga = |k: u32| s0 + k;
        let xs = |k: u32| riga(k) + 1;
        let rng = |c: char| format!("{c}{excel_primo}:{c}{excel_ultimo}");
        let sint = |k: &str| cache.sintesi.get(k).copied();
        let righe_sintesi: [(&str, String, Option<f64>); 11] = [
            ("Effort totale (giorni-persona, somma PERT)", format!("=SUM({})", rng('I')), sint("effort")),
            ("Deviazione standard di progetto (σ, attività indipendenti)", format!("=SQRT(SUMSQ({}))", rng('J')), sint("sigmaProject")),
            ("Costo persone totale", format!("=SUM({})", rng('M')), None),
            ("Costo diretto totale", format!("=SUM({})", rng('P')), sint("diretto")),
            ("Costo indiretto totale (overhead)", format!("=SUM({})", rng('Q')), sint("indiretto")),
            ("Sub-totale (diretto + indiretto)", format!("=B{}+B{}", xs(3), xs(4)), sint("subtotale")),
            ("Contingency (riserva rischi noti)", format!("=B{}*Parametri!$B$7", xs(5)), sint("contingency")),
            ("BAC — Budget At Completion", format!("=B{}+B{}", xs(5), xs(6)), sint("bac")),
            ("Misura EV (senza contingency, base di misura)", format!("=B{}", xs(5)), sint("bacMisura")),
            ("Management Reserve (extra, a disposizione dello sponsor)", format!("=B{}*Parametri!$B$8", xs(7)), sint("riserva")),
            ("Budget totale approvato (BAC + Management Reserve)", format!("=B{}+B{}", xs(7), xs(9)), sint("budget")),
        ];
        for (k, (etichetta, formula, valore)) in righe_sintesi.iter().enumerate() {
            ws.write_string(riga(k as u32), 0, *etichetta).map_err(e)?;
            scrivi_calcolo(ws, riga(k as u32), 1, formula, *valore, &stili.calcolo_num, con)?;
        }
        ws.set_column_width(0, 40).map_err(e)?;
    }

    // --- Monitoraggio EVM ---
    let n_cp = input.checkpoint.len() as u32;
    {
        let ws = wb.add_worksheet();
        ws.set_name("Monitoraggio EVM").map_err(e)?;
        ws.write_string_with_format(0, 0, "Monitoraggio EVM — esecuzione (valori di progetto)", &stili.titolo).map_err(e)?;
        let intestazioni = ["Data", "Nota", "PctPianificato", "PV", "PctReale", "EV", "AC", "CV", "SV", "CPI", "SPI", "ETC", "EAC", "EACott", "EAClin", "VAC", "TCPI"];
        for (c, t) in intestazioni.iter().enumerate() {
            ws.write_string_with_format(2, c as u16, *t, &stili.intestazione).map_err(e)?;
        }
        ws.set_column_width(0, 14).map_err(e)?;
        ws.set_column_width(1, 26).map_err(e)?;
        for (i, c) in input.checkpoint.iter().enumerate() {
            let r = 3 + i as u32;
            let x = r + 1;
            let rc = cache_cp.get(i).cloned().unwrap_or_default();
            match serial(&c.date) {
                Some(d) => ws.write_number_with_format(r, 0, d, &stili.input_data).map_err(e).map(|_| ())?,
                None => ws.write_blank(r, 0, &stili.input_data).map_err(e).map(|_| ())?,
            }
            scrivi_testo(ws, r, 1, c.note.as_deref(), &stili.input)?;
            scrivi_numero(ws, r, 2, c.pct_planned, &stili.input_pct)?;
            scrivi_calcolo(ws, r, 3, &format!("=IF(A{x}=\"\",\"\",C{x}*{bac_ref})"), get(&rc, "pv"), &stili.calcolo_num, con)?;
            scrivi_numero(ws, r, 4, c.pct_actual, &stili.input_pct)?;
            scrivi_calcolo(ws, r, 5, &format!("=IF(A{x}=\"\",\"\",E{x}*{bac_ref})"), get(&rc, "ev"), &stili.calcolo_num, con)?;
            scrivi_numero(ws, r, 6, c.ac, &stili.input_num)?;
            scrivi_calcolo(ws, r, 7, &format!("=IF(A{x}=\"\",\"\",F{x}-G{x})"), get(&rc, "cv"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 8, &format!("=IF(A{x}=\"\",\"\",F{x}-D{x})"), get(&rc, "sv"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 9, &format!("=IF(A{x}=\"\",\"\",IF(OR(F{x}<=0,G{x}<=0),\"\",F{x}/G{x}))"), get(&rc, "cpi"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 10, &format!("=IF(A{x}=\"\",\"\",IF(OR(F{x}<=0,D{x}<=0),\"\",F{x}/D{x}))"), get(&rc, "spi"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 11, &format!("=IF(A{x}=\"\",\"\",IFERROR(({bac_ref}-F{x})/J{x},{bac_ref}-F{x}))"), get(&rc, "etc"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 12, &format!("=IF(A{x}=\"\",\"\",G{x}+L{x})"), get(&rc, "eac"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 13, &format!("=IF(A{x}=\"\",\"\",G{x}+({bac_ref}-F{x}))"), get(&rc, "eacOtt"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 14, &format!("=IF(A{x}=\"\",\"\",IFERROR({bac_ref}/J{x},\"\"))"), get(&rc, "eacLin"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 15, &format!("=IF(A{x}=\"\",\"\",{bac_ref}-M{x})"), get(&rc, "vac"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 16, &format!("=IF(A{x}=\"\",\"\",IFERROR(({bac_ref}-F{x})/({bac_ref}-G{x}),\"\"))"), get(&rc, "tcpi"), &stili.calcolo_num, con)?;
        }
        let _ = n_cp;
    }

    // --- Buffer e Contingency ---
    {
        let ws = wb.add_worksheet();
        ws.set_name("Buffer e Contingency").map_err(e)?;
        ws.write_string_with_format(0, 0, "Buffer e Contingency — riserve", &stili.titolo).map_err(e)?;
        ws.write_string_with_format(2, 0, "Contingency — riserva rischi noti", &stili.titolo).map_err(e)?;
        let intestazioni = ["Rischio", "Probabilita", "ImpattoStimato", "ContingenzaStanziata", "DataUtilizzo", "ImportoUtilizzato", "Residuo", "Stato"];
        for (c, t) in intestazioni.iter().enumerate() {
            ws.write_string_with_format(3, c as u16, *t, &stili.intestazione).map_err(e)?;
        }
        ws.set_column_width(0, 34).map_err(e)?;
        let primo_rischio = 4u32;
        for (i, r) in input.rischi.iter().enumerate() {
            let rr = primo_rischio + i as u32;
            let x = rr + 1;
            ws.write_string_with_format(rr, 0, &r.descrizione, &stili.input).map_err(e)?;
            scrivi_numero(ws, rr, 1, r.probabilita, &stili.input_pct)?;
            scrivi_numero(ws, rr, 2, r.impatto, &stili.input_num)?;
            scrivi_numero(ws, rr, 3, r.contingenza, &stili.input_num)?;
            match r.data_utilizzo.as_deref().and_then(serial) {
                Some(d) => ws.write_number_with_format(rr, 4, d, &stili.input_data).map_err(e).map(|_| ())?,
                None => ws.write_blank(rr, 4, &stili.input_data).map_err(e).map(|_| ())?,
            }
            scrivi_numero(ws, rr, 5, r.importo_utilizzato, &stili.input_num)?;
            scrivi_calcolo(ws, rr, 6, &format!("=IF(A{x}=\"\",\"\",D{x}-F{x})"), None, &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, rr, 7, &format!("=IF(A{x}=\"\",\"\",IF(G{x}<=0,\"Esaurito\",IF(F{x}>0,\"Parziale\",\"Non attivato\")))"), None, &stili.calcolo, con)?;
        }
        let ultimo = primo_rischio + input.rischi.len().max(1) as u32 - 1;
        let s = ultimo + 3;
        let bu = |k: &str| cache.buffer.get(k).copied();
        ws.write_string(s, 0, "Totale contingency stanziata (somma rischi)").map_err(e)?;
        scrivi_calcolo(ws, s, 1, &format!("=SUM(D{}:D{})", primo_rischio + 1, ultimo + 1), bu("stanziata"), &stili.calcolo_num, con)?;
        ws.write_string(s + 1, 0, "Totale utilizzato").map_err(e)?;
        scrivi_calcolo(ws, s + 1, 1, &format!("=SUM(F{}:F{})", primo_rischio + 1, ultimo + 1), bu("usata"), &stili.calcolo_num, con)?;
        ws.write_string(s + 2, 0, "Contingency a budget (da WBS)").map_err(e)?;
        scrivi_calcolo(ws, s + 2, 1, &format!("={cella_contingency}"), cache.sintesi.get("contingency").copied(), &stili.calcolo_num, con)?;
    }

    // --- Agile - Velocity ---
    {
        let ws = wb.add_worksheet();
        ws.set_name("Agile - Velocity").map_err(e)?;
        ws.write_string_with_format(0, 0, "Agile / Flow — velocity ed Earned Value (§6-bis.2)", &stili.titolo).map_err(e)?;
        let intestazioni = ["Sprint", "DataInizio", "DataFine", "SPPianificati", "SPCompletati", "Velocity", "VelocityMedia", "CostoTeamSprint", "CostoPerSP", "SPCumulati", "EVAgile", "ACCumulato", "CPIAgile"];
        for (c, t) in intestazioni.iter().enumerate() {
            ws.write_string_with_format(3, c as u16, *t, &stili.intestazione).map_err(e)?;
        }
        ws.set_column_width(0, 14).map_err(e)?;
        let primo = 4u32;
        for (i, s) in input.sprint.iter().enumerate() {
            let r = primo + i as u32;
            let x = r + 1;
            let rc = cache.sprint.get(i).cloned().unwrap_or_default();
            ws.write_string_with_format(r, 0, format!("Sprint {}", s.numero), &stili.input).map_err(e)?;
            ws.write_blank(r, 1, &stili.input).map_err(e)?;
            ws.write_blank(r, 2, &stili.input).map_err(e)?;
            scrivi_numero(ws, r, 3, s.sp_pianificati, &stili.input_num)?;
            scrivi_numero(ws, r, 4, s.sp_completati, &stili.input_num)?;
            scrivi_calcolo(ws, r, 5, &format!("=E{x}"), s.sp_completati, &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 6, &format!("=IFERROR(AVERAGE(INDEX(E${primo1}:E{x},MAX(1,ROWS(E${primo1}:E{x})-Parametri!$B$22+1)):E{x}),\"\")", primo1 = primo + 1), None, &stili.calcolo_num, con)?;
            scrivi_numero(ws, r, 7, s.costo_team, &stili.input_num)?;
            scrivi_calcolo(ws, r, 8, &format!("=IF(Parametri!$B$26=\"\",IFERROR(H{x}/D{x},\"\"),Parametri!$B$26)"), get(&rc, "costoPerSp"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 9, &format!("=SUM(E${}:E{x})", primo + 1), None, &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 10, &format!("=IF(I{x}=\"\",\"\",J{x}*I{x})"), get(&rc, "ev"), &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 11, &format!("=SUM(H${}:H{x})", primo + 1), None, &stili.calcolo_num, con)?;
            scrivi_calcolo(ws, r, 12, &format!("=IF(OR(K{x}<=0,L{x}<=0),\"\",K{x}/L{x})"), get(&rc, "cpi"), &stili.calcolo_num, con)?;
        }
    }

    // --- Dashboard con grafici ---
    {
        let ws = wb.add_worksheet();
        ws.set_name("Dashboard").map_err(e)?;
        ws.write_string_with_format(0, 0, "Dashboard — curve e trend (grafici collegati a Monitoraggio EVM)", &stili.titolo).map_err(e)?;
        if n_cp == 0 {
            ws.write_string(2, 0, "Nessun checkpoint: i grafici compaiono quando il monitoraggio ha almeno una data.").map_err(e)?;
        } else {
            let ultimo = 3 + n_cp; // riga Excel dell'ultimo checkpoint
            let cat = format!("='Monitoraggio EVM'!$A$4:$A${ultimo}");
            let mut curva = Chart::new(ChartType::Line);
            curva.title().set_name("Curva S: PV, EV, AC");
            for (nome, col) in [("PV", "D"), ("EV", "F"), ("AC", "G")] {
                curva.add_series().set_name(nome).set_categories(cat.as_str()).set_values(format!("='Monitoraggio EVM'!${col}$4:${col}${ultimo}").as_str());
            }
            ws.insert_chart(2, 0, &curva).map_err(e)?;
            let mut trend = Chart::new(ChartType::Line);
            trend.title().set_name("Trend CPI / SPI");
            for (nome, col) in [("CPI", "J"), ("SPI", "K")] {
                trend.add_series().set_name(nome).set_categories(cat.as_str()).set_values(format!("='Monitoraggio EVM'!${col}$4:${col}${ultimo}").as_str());
            }
            ws.insert_chart(22, 0, &trend).map_err(e)?;
        }
    }

    // --- Glossario ---
    {
        let ws = wb.add_worksheet();
        ws.set_name("Glossario").map_err(e)?;
        ws.set_column_width(0, 14).map_err(e)?;
        ws.set_column_width(1, 100).map_err(e)?;
        let voci = [
            ("PV", "Valore pianificato: lavoro che doveva essere fatto alla data di stato (§3.5)."),
            ("EV", "Valore guadagnato: lavoro effettivamente fatto, valorizzato al budget (§3.5)."),
            ("AC", "Costo consuntivo: quanto è stato speso (§3.5)."),
            ("CPI", "EV / AC: efficienza di costo. Sotto 1 si spende più del valore prodotto (§3.6)."),
            ("SPI", "EV / PV: efficienza di tempo. Sotto 1 si è in ritardo (§3.6)."),
            ("BAC", "Budget At Completion: budget totale del progetto (§3.2)."),
            ("EAC", "Estimate At Completion: costo finale previsto (§3.7)."),
            ("ETC", "Estimate To Complete: costo ancora da sostenere (§3.7)."),
            ("VAC", "Variance At Completion: BAC − EAC (§3.8)."),
            ("TCPI", "Efficienza richiesta sul residuo per restare nel budget (§3.8)."),
        ];
        ws.write_string_with_format(0, 0, "Termine", &stili.intestazione).map_err(e)?;
        ws.write_string_with_format(0, 1, "Significato", &stili.intestazione).map_err(e)?;
        for (i, (t, d)) in voci.iter().enumerate() {
            ws.write_string(i as u32 + 1, 0, *t).map_err(e)?;
            ws.write_string(i as u32 + 1, 1, *d).map_err(e)?;
        }
    }

    // --- _meta (nascosto) ---
    {
        let ws = wb.add_worksheet();
        ws.set_name("_meta").map_err(e)?;
        ws.write_string(0, 0, "schema_version").map_err(e)?;
        ws.write_number(0, 1, 2.0).map_err(e)?;
        ws.write_string(1, 0, "project_id").map_err(e)?;
        ws.write_number(1, 1, pid as f64).map_err(e)?;
        ws.write_string(2, 0, "exported_at").map_err(e)?;
        ws.write_string(2, 1, tempo::adesso_iso()).map_err(e)?;
        ws.write_string(3, 0, "app_version").map_err(e)?;
        ws.write_string(3, 1, env!("CARGO_PKG_VERSION")).map_err(e)?;
        ws.set_hidden(true);
    }

    wb.save(destinazione).map_err(e)?;
    Ok(())
}

impl WorkbookImportato {
    /// Helper per i test: numero di checkpoint e di attività.
    pub fn riepilogo(&self) -> (usize, usize) {
        (self.attivita.len(), self.checkpoint.len())
    }
}
