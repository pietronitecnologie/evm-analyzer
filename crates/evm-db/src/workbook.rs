// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Import del workbook Excel «Impresa Numerica» (specifica fase 3, §2).
//!
//! Il backend converte solo il formato: date, percentuali, errori di cella,
//! colonne per intestazione, righe fino alla prima con ID vuoto. Ogni calcolo
//! (stima, EVM, contingency) passa dal motore TypeScript: qui i totali del file
//! vengono solo letti come cache, per il confronto fatto dal frontend.

use std::collections::HashMap;
use std::path::Path;

use calamine::{open_workbook_auto, Data, Range, Reader, Sheets};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::import::ImportOutcome;
use crate::migrations::latest_version;
use crate::{open_and_migrate, tempo};

type Foglio = Range<Data>;
type Cartella = Sheets<std::io::BufReader<std::fs::File>>;

/// Avviso non bloccante dell'import (specifica fase 3, §2.9).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Avviso {
    /// `critico`, `avviso` o `info`.
    pub gravita: String,
    pub foglio: String,
    pub cella: String,
    pub codice: String,
    pub messaggio: String,
    pub suggerimento: String,
}

fn avviso(gravita: &str, foglio: &str, cella: &str, codice: &str, messaggio: String, suggerimento: &str) -> Avviso {
    Avviso {
        gravita: gravita.into(),
        foglio: foglio.into(),
        cella: cella.into(),
        codice: codice.into(),
        messaggio,
        suggerimento: suggerimento.into(),
    }
}

/// Riferimento A1 di una cella (riga e colonna 0-based del foglio letto).
fn riferimento(riga: usize, colonna: usize) -> String {
    let mut c = colonna;
    let mut lettere = String::new();
    loop {
        lettere.insert(0, (b'A' + (c % 26) as u8) as char);
        if c < 26 {
            break;
        }
        c = c / 26 - 1;
    }
    format!("{lettere}{}", riga + 1)
}

/// Chiave di confronto delle intestazioni: senza maiuscole, spazi, punteggiatura né accenti.
pub fn chiave(s: &str) -> String {
    s.chars()
        .filter_map(|c| {
            let c = match c {
                'à' | 'á' | 'â' | 'ä' | 'À' | 'Á' | 'Â' | 'Ä' => 'a',
                'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => 'e',
                'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => 'i',
                'ò' | 'ó' | 'ô' | 'ö' | 'Ò' | 'Ó' | 'Ô' | 'Ö' => 'o',
                'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => 'u',
                other => other,
            };
            c.is_alphanumeric().then(|| c.to_ascii_lowercase())
        })
        .collect()
}

/// Testo di cella; gli ID numerici diventano testo stabile (1.1 e non 1.1000000000000001).
fn testo(cella: &Data) -> Option<String> {
    match cella {
        Data::String(s) | Data::DateTimeIso(s) => Some(s.trim().to_string()).filter(|s| !s.is_empty()),
        Data::Int(i) => Some(i.to_string()),
        Data::Float(f) => Some(codice_id(*f)),
        _ => None,
    }
}

/// Identificatore numerico del workbook in forma testuale stabile (es. 1.1).
pub fn codice_id(f: f64) -> String {
    let s = format!("{f:.6}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// Numero di cella. Gli errori Excel (`#VALUE!`, `#DIV/0!`, …) sono «non disponibile».
fn numero(cella: &Data) -> Option<f64> {
    match cella {
        Data::Int(i) => Some(*i as f64),
        Data::Float(f) => Some(*f),
        Data::DateTime(d) => Some(d.as_f64()),
        _ => None,
    }
}

/// Esito della lettura di una cella data: valore, e se il testo ha richiesto una conversione.
struct DataLetta {
    iso: Option<String>,
    testuale: bool,
}

fn data(cella: &Data) -> DataLetta {
    match cella {
        Data::DateTime(d) => DataLetta { iso: tempo::seriale_excel_a_iso(d.as_f64()), testuale: false },
        Data::Float(f) => DataLetta { iso: tempo::seriale_excel_a_iso(*f), testuale: false },
        Data::Int(i) => DataLetta { iso: tempo::seriale_excel_a_iso(*i as f64), testuale: false },
        Data::DateTimeIso(s) | Data::String(s) => DataLetta { iso: tempo::normalizza_data(s), testuale: true },
        _ => DataLetta { iso: None, testuale: false },
    }
}

/// Intestazione trovata in un foglio: riga, mappa chiave → colonna.
struct Intestazione {
    riga: usize,
    colonne: HashMap<String, usize>,
}

impl Intestazione {
    fn colonna(&self, nome: &str) -> Option<usize> {
        self.colonne.get(&chiave(nome)).copied()
    }
}

/// Cerca la riga che contiene l'etichetta attesa, in una qualsiasi colonna (nelle prime 30 righe).
fn trova_intestazione(foglio: &Foglio, etichetta: &str) -> Option<Intestazione> {
    for (r, riga) in foglio.rows().enumerate().take(30) {
        if riga.iter().filter_map(testo).any(|t| chiave(&t) == chiave(etichetta)) {
            let mut colonne = HashMap::new();
            for (c, cella) in riga.iter().enumerate() {
                if let Some(t) = testo(cella) {
                    colonne.entry(chiave(&t)).or_insert(c);
                }
            }
            return Some(Intestazione { riga: r, colonne });
        }
    }
    None
}

/// Cella con un valore qualsiasi (testo, numero, data): non vuota.
fn valorizzata(cella: &Data) -> bool {
    match cella {
        Data::Empty => false,
        Data::String(s) | Data::DateTimeIso(s) => !s.trim().is_empty(),
        _ => true,
    }
}

/// Righe della tabella sotto l'intestazione, fino alla prima con ID (o Data) vuoto (§2.2).
/// Restituisce anche l'indice di riga del foglio per le segnalazioni.
fn righe_tabella<'a>(foglio: &'a Foglio, intestazione: &Intestazione, colonna_id: usize) -> Vec<(usize, &'a [Data])> {
    let mut out = Vec::new();
    for (r, riga) in foglio.rows().enumerate().skip(intestazione.riga + 1) {
        if !riga.get(colonna_id).is_some_and(valorizzata) {
            break;
        }
        out.push((r, riga));
    }
    out
}

fn cella<'a>(riga: &'a [Data], intestazione: &Intestazione, nome: &str) -> Option<&'a Data> {
    intestazione.colonna(nome).and_then(|i| riga.get(i))
}

/// Controlla la presenza delle colonne attese; ritorna gli avvisi `XL_MISSING_COLUMN`.
fn colonne_mancanti(foglio_nome: &str, intestazione: &Intestazione, attese: &[&str], avvisi: &mut Vec<Avviso>) {
    for nome in attese {
        if intestazione.colonna(nome).is_none() {
            avvisi.push(avviso(
                "avviso",
                foglio_nome,
                &riferimento(intestazione.riga, 0),
                "XL_MISSING_COLUMN",
                format!("Colonna «{nome}» non trovata: valore di default"),
                "Verifica l'intestazione del foglio o usa il template Impresa Numerica",
            ));
        }
    }
}

/// Metadati del foglio nascosto `_meta` (§2.6).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub schema_version: Option<i64>,
    pub project_id: Option<i64>,
    pub exported_at: Option<String>,
    pub app_version: Option<String>,
}

/// Parametri del foglio *Parametri*. Le percentuali sono in intero positivo (0..100).
#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParametriImportati {
    /// Percentuali in intero positivo (0..100), come nel database.
    pub overhead: Option<f64>,
    pub contingency: Option<f64>,
    pub riserva_gestione: Option<f64>,
    pub soglia_verde: Option<f64>,
    pub soglia_gialla: Option<f64>,
    pub inizio: Option<String>,
    pub fine: Option<String>,
    pub buffer_giorni: Option<f64>,
    pub durata_sprint: Option<f64>,
    pub costo_team_sprint: Option<f64>,
    pub finestra_velocity: Option<f64>,
    /// Parametri introdotti dalla fase 3 (assenti nel template vecchio).
    pub base_ev: Option<String>,
    pub sp_per_sprint: Option<f64>,
    pub costo_per_sp: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttivitaImportata {
    pub id: String,
    pub attivita: Option<String>,
    pub fase: Option<String>,
    pub risorsa: Option<String>,
    pub costo_orario: Option<f64>,
    pub o: Option<f64>,
    pub m: Option<f64>,
    pub p: Option<f64>,
    pub ore_giorno: Option<f64>,
    pub materiali: Option<f64>,
    pub servizi_esterni: Option<f64>,
    pub data_inizio: Option<String>,
    pub filone: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointImportato {
    pub date: String,
    pub note: Option<String>,
    pub pct_planned: Option<f64>,
    pub pct_actual: Option<f64>,
    pub ac: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RischioImportato {
    pub descrizione: String,
    /// Probabilità in percento intero (0..100).
    pub probabilita: Option<f64>,
    pub impatto: Option<f64>,
    pub contingenza: Option<f64>,
    pub data_utilizzo: Option<String>,
    pub importo_utilizzato: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SprintImportato {
    pub numero: i64,
    pub sp_pianificati: Option<f64>,
    pub sp_completati: Option<f64>,
    pub costo_team: Option<f64>,
}

/// Totali e valori di monitoraggio già calcolati nel file: cache per il confronto (§2.7).
#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheFile {
    /// Chiavi: effort, sigma, diretto, indiretto, contingency, bac, riserva, budget.
    pub totali: HashMap<String, f64>,
    /// Per checkpoint (stesso ordine): cpi, spi, eac, pv, ev.
    pub checkpoint: Vec<HashMap<String, f64>>,
}

/// Contenuto del workbook letto, prima della scrittura nel database.
#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookImportato {
    pub meta: Option<Meta>,
    pub parametri: ParametriImportati,
    pub attivita: Vec<AttivitaImportata>,
    pub checkpoint: Vec<CheckpointImportato>,
    pub rischi: Vec<RischioImportato>,
    pub sprint: Vec<SprintImportato>,
    pub cache: CacheFile,
    pub avvisi: Vec<Avviso>,
}

/// Percentuale di parametro in intero positivo (0..100). Una frazione (`0,15` o
/// `15%` in Excel) è ≤ 1 e diventa `15`; un valore > 1 è già in percento (`15`) e
/// resta `15`, con un avviso `XL_PCT_SCALE`.
fn percentuale(cella: &Data, foglio: &str, rif: &str, avvisi: &mut Vec<Avviso>) -> Option<f64> {
    let v = numero(cella)?;
    if v <= 1.0 {
        Some((v * 100.0).round())
    } else {
        avvisi.push(avviso(
            "info",
            foglio,
            rif,
            "XL_PCT_SCALE",
            format!("Valore {v} letto come percento intero ({v}%)"),
            "Inserisci la percentuale come 15% o 0,15",
        ));
        Some(v.round())
    }
}

fn leggi_meta(cartella: &mut Cartella, avvisi: &mut Vec<Avviso>) -> Option<Meta> {
    let Some(f) = foglio(cartella, "_meta") else {
        avvisi.push(avviso(
            "info",
            "_meta",
            "",
            "XL_NO_META",
            "Foglio _meta assente: file trattato come template manuale".into(),
            "Esporta il progetto dall'app per avere il foglio _meta",
        ));
        return None;
    };
    let mut meta = Meta::default();
    for riga in f.rows() {
        let chiave_riga = riga.first().and_then(testo).unwrap_or_default();
        let valore = riga.get(1);
        match chiave_riga.as_str() {
            "schema_version" => meta.schema_version = valore.and_then(numero).map(|v| v as i64),
            "project_id" => meta.project_id = valore.and_then(numero).map(|v| v as i64),
            "exported_at" => meta.exported_at = valore.and_then(testo),
            "app_version" => meta.app_version = valore.and_then(testo),
            _ => {}
        }
    }
    Some(meta)
}

fn foglio(cartella: &mut Cartella, nome: &str) -> Option<Foglio> {
    let trovato = cartella.sheet_names().into_iter().find(|n| chiave(n) == chiave(nome))?;
    cartella.worksheet_range(&trovato).ok()
}

/// Legge il workbook: fogli per nome, intestazioni per etichetta, input e cache.
pub fn leggi_workbook(percorso: &Path) -> Result<WorkbookImportato, String> {
    let mut cartella = open_workbook_auto(percorso).map_err(|e| {
        format!("file non leggibile come Excel (protetto da password, corrotto o non .xlsx): {e}")
    })?;
    let mut w = WorkbookImportato::default();
    let mut avvisi = Vec::new();
    w.meta = leggi_meta(&mut cartella, &mut avvisi);

    if let Some(f) = foglio(&mut cartella, "Parametri") {
        leggi_parametri(&f, &mut w.parametri, &mut avvisi);
    }
    if let Some(f) = foglio(&mut cartella, "WBS e Stima Costi") {
        leggi_wbs(&f, &mut w, &mut avvisi);
    }
    if let Some(f) = foglio(&mut cartella, "Monitoraggio EVM") {
        leggi_monitoraggio(&f, &mut w, &mut avvisi);
    }
    if let Some(f) = foglio(&mut cartella, "Buffer e Contingency") {
        leggi_buffer(&f, &mut w, &mut avvisi);
    }
    if let Some(f) = foglio(&mut cartella, "Agile - Velocity") {
        leggi_agile(&f, &mut w, &mut avvisi);
    }
    if w.attivita.is_empty() && w.parametri.overhead.is_none() && w.sprint.is_empty() {
        return Err("nessun foglio riconosciuto: non sembra un workbook Impresa Numerica".into());
    }
    w.avvisi = avvisi;
    Ok(w)
}

fn leggi_parametri(f: &Foglio, p: &mut ParametriImportati, avvisi: &mut Vec<Avviso>) {
    const FOGLIO: &str = "Parametri";
    for (r, riga) in f.rows().enumerate() {
        let Some(etichetta) = riga.first().and_then(testo).map(|t| chiave(&t)) else { continue };
        let Some(valore) = riga.get(1) else { continue };
        let rif = riferimento(r, 1);
        let e = etichetta.as_str();
        if e.starts_with("tassodioverhead") {
            p.overhead = percentuale(valore, FOGLIO, &rif, avvisi);
        } else if e.starts_with("contingencyriservarischi") {
            p.contingency = percentuale(valore, FOGLIO, &rif, avvisi);
        } else if e.starts_with("managementreserve") {
            p.riserva_gestione = percentuale(valore, FOGLIO, &rif, avvisi);
        } else if e.starts_with("sogliaverde") {
            p.soglia_verde = percentuale(valore, FOGLIO, &rif, avvisi);
        } else if e.starts_with("sogliagialla") {
            p.soglia_gialla = percentuale(valore, FOGLIO, &rif, avvisi);
        } else if e.starts_with("datainizioprogetto") {
            p.inizio = leggi_data(valore, FOGLIO, &rif, avvisi);
        } else if e.starts_with("datafinepianificata") {
            p.fine = leggi_data(valore, FOGLIO, &rif, avvisi);
        } else if e.starts_with("bufferdiprogetto") {
            p.buffer_giorni = numero(valore);
        } else if e.starts_with("durata") && e.contains("sprint") && !e.contains("costo") {
            p.durata_sprint = numero(valore);
        } else if e.starts_with("costoteamper") {
            p.costo_team_sprint = numero(valore);
        } else if e.starts_with("nsprintpervelocity") {
            p.finestra_velocity = numero(valore);
        } else if e.starts_with("basedimisuraev") {
            p.base_ev = testo(valore);
        } else if e.starts_with("spp") && e.contains("sprint") {
            p.sp_per_sprint = numero(valore);
        } else if e.starts_with("costoperspdibaseline") {
            p.costo_per_sp = numero(valore);
        }
    }
    let _ = avvisi;
}

/// Data di cella con avviso `XL_DATE_TEXT` se è testo convertito.
fn leggi_data(cella: &Data, foglio: &str, rif: &str, avvisi: &mut Vec<Avviso>) -> Option<String> {
    let d = data(cella);
    if d.testuale && d.iso.is_some() {
        avvisi.push(avviso(
            "info",
            foglio,
            rif,
            "XL_DATE_TEXT",
            "Data scritta come testo: convertita in ISO".into(),
            "Usa una data vera di Excel (formato data)",
        ));
    }
    d.iso
}

fn leggi_wbs(f: &Foglio, w: &mut WorkbookImportato, avvisi: &mut Vec<Avviso>) {
    const FOGLIO: &str = "WBS e Stima Costi";
    let Some(h) = trova_intestazione(f, "ID") else {
        avvisi.push(avviso("critico", FOGLIO, "", "XL_NO_STIMA", "Intestazione «ID» non trovata: nessuna riga di stima".into(), "Verifica il foglio WBS e Stima Costi"));
        return;
    };
    colonne_mancanti(FOGLIO, &h, &["ID", "Attivita", "CostoOrario", "O", "M", "P", "OreGiorno"], avvisi);
    let colonna_id = h.colonna("ID").unwrap_or(0);
    for (r, riga) in righe_tabella(f, &h, colonna_id) {
        let g = |n: &str| cella(riga, &h, n);
        let a = AttivitaImportata {
            id: g("ID").and_then(testo).unwrap_or_default(),
            attivita: g("Attivita").and_then(testo),
            fase: g("Fase").and_then(testo),
            risorsa: g("Risorsa").and_then(testo),
            costo_orario: g("CostoOrario").and_then(numero),
            o: g("O").and_then(numero),
            m: g("M").and_then(numero),
            p: g("P").and_then(numero),
            ore_giorno: g("OreGiorno").and_then(numero),
            materiali: g("Materiali").and_then(numero),
            servizi_esterni: g("ServiziEsterni").and_then(numero),
            data_inizio: g("DataInizio").and_then(|c| leggi_data(c, FOGLIO, &riferimento(r, h.colonna("DataInizio").unwrap_or(0)), avvisi)),
            filone: g("Filone").and_then(testo),
        };
        if let (Some(o), Some(m), Some(p)) = (a.o, a.m, a.p) {
            if o > m || m > p {
                avvisi.push(avviso("avviso", FOGLIO, &riferimento(r, h.colonna("O").unwrap_or(0)), "XL_WBS_ORDER", format!("Attività {}: O > M o M > P", a.id), "Verifica le stime a tre punti"));
            }
        }
        w.attivita.push(a);
    }
    // Totali in cache: etichetta in A, valore in B.
    for riga in f.rows() {
        let et = riga.first().and_then(testo).unwrap_or_default();
        let val = riga.get(1).and_then(numero);
        let chiave_totale = if et.starts_with("Effort totale") {
            Some("effort")
        } else if et.starts_with("Deviazione standard") {
            Some("sigma")
        } else if et.starts_with("Costo diretto totale") {
            Some("diretto")
        } else if et.starts_with("Costo indiretto totale") {
            Some("indiretto")
        } else if et.starts_with("Contingency") {
            Some("contingency")
        } else if et.starts_with("BAC") {
            Some("bac")
        } else if et.starts_with("Management Reserve") {
            Some("riserva")
        } else if et.starts_with("Budget totale approvato") {
            Some("budget")
        } else {
            None
        };
        if let (Some(k), Some(v)) = (chiave_totale, val) {
            w.cache.totali.insert(k.to_string(), v);
        }
    }
}

fn leggi_monitoraggio(f: &Foglio, w: &mut WorkbookImportato, avvisi: &mut Vec<Avviso>) {
    const FOGLIO: &str = "Monitoraggio EVM";
    let Some(h) = trova_intestazione(f, "Data") else { return };
    colonne_mancanti(FOGLIO, &h, &["Data", "PctPianificato", "PctReale", "AC"], avvisi);
    let colonna_data = h.colonna("Data").unwrap_or(0);
    for (r, riga) in righe_tabella(f, &h, colonna_data) {
        let g = |n: &str| cella(riga, &h, n);
        let Some(d) = g("Data").and_then(|c| leggi_data(c, FOGLIO, &riferimento(r, colonna_data), avvisi)) else { continue };
        let mut cache = HashMap::new();
        for (campo, chiave_cache) in [("CPI", "cpi"), ("SPI", "spi"), ("EAC", "eac"), ("PV", "pv"), ("EV", "ev")] {
            if let Some(v) = g(campo).and_then(numero) {
                cache.insert(chiave_cache.to_string(), v);
            }
        }
        w.cache.checkpoint.push(cache);
        w.checkpoint.push(CheckpointImportato {
            date: d,
            note: g("Nota").and_then(testo),
            pct_planned: g("PctPianificato").and_then(numero),
            pct_actual: g("PctReale").and_then(numero),
            ac: g("AC").and_then(numero),
        });
    }
}

fn leggi_buffer(f: &Foglio, w: &mut WorkbookImportato, avvisi: &mut Vec<Avviso>) {
    const FOGLIO: &str = "Buffer e Contingency";
    let Some(h) = trova_intestazione(f, "Rischio") else { return };
    colonne_mancanti(FOGLIO, &h, &["Rischio", "ContingenzaStanziata"], avvisi);
    let colonna = h.colonna("Rischio").unwrap_or(0);
    for (r, riga) in righe_tabella(f, &h, colonna) {
        let g = |n: &str| cella(riga, &h, n);
        let prob = g("Probabilita").and_then(|c| percentuale(c, FOGLIO, &riferimento(r, h.colonna("Probabilita").unwrap_or(0)), avvisi));
        w.rischi.push(RischioImportato {
            descrizione: g("Rischio").and_then(testo).unwrap_or_default(),
            probabilita: prob,
            impatto: g("ImpattoStimato").and_then(numero),
            contingenza: g("ContingenzaStanziata").and_then(numero),
            data_utilizzo: g("DataUtilizzo").and_then(|c| leggi_data(c, FOGLIO, &riferimento(r, h.colonna("DataUtilizzo").unwrap_or(0)), avvisi)),
            importo_utilizzato: g("ImportoUtilizzato").and_then(numero),
        });
    }
}

fn leggi_agile(f: &Foglio, w: &mut WorkbookImportato, avvisi: &mut Vec<Avviso>) {
    const FOGLIO: &str = "Agile - Velocity";
    let Some(h) = trova_intestazione(f, "Sprint") else { return };
    colonne_mancanti(FOGLIO, &h, &["SPPianificati", "SPCompletati", "CostoTeamSprint"], avvisi);
    let colonna = h.colonna("Sprint").unwrap_or(0);
    for (_r, riga) in righe_tabella(f, &h, colonna) {
        let g = |n: &str| cella(riga, &h, n);
        let nome = g("Sprint").and_then(testo).unwrap_or_default();
        let Some(numero_sprint) = nome.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse::<i64>().ok() else {
            continue;
        };
        w.sprint.push(SprintImportato {
            numero: numero_sprint,
            sp_pianificati: g("SPPianificati").and_then(numero),
            sp_completati: g("SPCompletati").and_then(numero),
            costo_team: g("CostoTeamSprint").and_then(numero),
        });
    }
    if !w.sprint.is_empty() && w.parametri.costo_per_sp.is_none() {
        avvisi.push(avviso(
            "info",
            FOGLIO,
            "",
            "AGILE_COSTO_SP",
            "Costo per SP di baseline assente: derivato come costo team ÷ SP pianificati, non dalla velocity reale".into(),
            "Fissa il costo per SP in Parametri (§6-bis.2)",
        ));
    }
}

/// Controlli strutturali di coerenza tra fogli (§2.9). I controlli che richiedono
/// calcoli (contingency, cache) li fa il frontend con il motore.
pub fn controlli_strutturali(w: &mut WorkbookImportato) {
    let inizio = w.parametri.inizio.clone();
    let fine = w.parametri.fine.clone();
    if let (Some(inizio), Some(prima)) = (&inizio, w.attivita.iter().filter_map(|a| a.data_inizio.clone()).min()) {
        if *inizio != prima {
            w.avvisi.push(avviso(
                "critico",
                "Parametri",
                "B6",
                "XL_DATE_MISMATCH",
                format!("Inizio progetto {inizio} diverso dalla prima data della WBS {prima}: PctTempo negativo"),
                "Allinea la data di inizio di Parametri alla WBS",
            ));
        }
    }
    for c in &w.checkpoint {
        if let (Some(i), Some(f)) = (&inizio, &fine) {
            if c.date < *i || c.date > *f {
                w.avvisi.push(avviso("avviso", "Monitoraggio EVM", "A", "XL_CHECKPOINT_RANGE", format!("Checkpoint {} fuori dall'intervallo di progetto", c.date), "Verifica la data del checkpoint"));
            }
        }
        if c.pct_actual.is_some_and(|p| p > 1.0) {
            w.avvisi.push(avviso("critico", "Monitoraggio EVM", "E", "XL_CHECKPOINT_PCT", format!("Checkpoint {}: PctReale oltre 100%", c.date), "Correggi la percentuale reale"));
        }
    }
    for coppia in w.checkpoint.windows(2) {
        let (a, b) = (&coppia[0], &coppia[1]);
        if matches!((a.pct_planned, b.pct_planned), (Some(x), Some(y)) if y < x) {
            w.avvisi.push(avviso("avviso", "Monitoraggio EVM", "C", "XL_CHECKPOINT_PV", format!("PctPianificato decrescente al checkpoint {}", b.date), "Verifica la curva pianificata"));
        }
        if matches!((a.ac, b.ac), (Some(x), Some(y)) if y < x) {
            w.avvisi.push(avviso("avviso", "Monitoraggio EVM", "G", "XL_CHECKPOINT_AC", format!("AC decrescente al checkpoint {}", b.date), "Il costo consuntivo non può diminuire"));
        }
    }
}

/// Conteggi per la conferma di importazione.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conteggi {
    pub attivita: usize,
    pub rischi: usize,
    pub checkpoint: usize,
    pub sprint: usize,
}

impl WorkbookImportato {
    pub fn conteggi(&self) -> Conteggi {
        Conteggi {
            attivita: self.attivita.len(),
            rischi: self.rischi.len(),
            checkpoint: self.checkpoint.len(),
            sprint: self.sprint.len(),
        }
    }
}

/// Anteprima senza scrivere nel database (`preview_workbook`).
pub fn anteprima(percorso: &Path) -> Result<WorkbookImportato, String> {
    let mut w = leggi_workbook(percorso)?;
    controlli_strutturali(&mut w);
    Ok(w)
}

/// Importa il workbook in un nuovo `.evmproj`. Non sovrascrive mai la destinazione.
pub fn importa_workbook(origine: &Path, destinazione: &Path, nome: &str) -> Result<(ImportOutcome, WorkbookImportato), String> {
    if destinazione.exists() {
        return Err(format!("il file {} esiste già: scegli un altro nome", destinazione.display()));
    }
    let mut w = anteprima(origine)?;
    if w.attivita.is_empty() {
        return Err("nessuna attività nel foglio WBS e Stima Costi".into());
    }
    let nome_file = origine.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
    let mut conn = open_and_migrate(destinazione).map_err(|e| e.to_string())?;
    let risultato = tx_nuovo(&mut conn, &w, nome, &nome_file);
    drop(conn);
    match risultato {
        Ok(project_id) => {
            let _ = &mut w;
            Ok((
                ImportOutcome { project_id, warnings: w.avvisi.iter().map(|a| format!("{}: {}", a.codice, a.messaggio)).collect() },
                w,
            ))
        }
        Err(e) => {
            let _ = std::fs::remove_file(destinazione);
            Err(format!("scrittura del progetto: {e}"))
        }
    }
}

fn tx_nuovo(conn: &mut Connection, w: &WorkbookImportato, nome: &str, nome_file: &str) -> rusqlite::Result<i64> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO project (name, source_type, source_file, imported_at, schema_version)
         VALUES (?1, 'excel', ?2, ?3, ?4)",
        params![nome, nome_file, tempo::adesso_iso(), latest_version()],
    )?;
    let pid = tx.last_insert_rowid();
    tx.execute("INSERT INTO project_params (project_id, green_threshold, yellow_threshold) VALUES (?1, 95, 85)", [pid])?;
    tx.execute("INSERT INTO calendar (project_id, name, is_default) VALUES (?1, 'Standard', 1)", [pid])?;
    scrivi_input(&tx, pid, w)?;
    tx.execute(
        "INSERT INTO source_sync (project_id, source_file, file_hash, file_mtime, imported_at, task_count)
         VALUES (?1, ?2, '', NULL, ?3, ?4)",
        params![pid, nome_file, tempo::adesso_iso(), w.attivita.len() as i64],
    )?;
    tx.commit()?;
    Ok(pid)
}

/// Aggiorna gli input di un progetto esistente (idempotente: §2.11). Sostituisce le
/// righe di input e non duplica attività, rischi, checkpoint o sprint.
pub fn aggiorna_progetto(origine: &Path, progetto: &Path) -> Result<(ImportOutcome, WorkbookImportato), String> {
    if !progetto.exists() {
        return Err(format!("il progetto {} non esiste", progetto.display()));
    }
    let mut w = anteprima(origine)?;
    if w.attivita.is_empty() {
        return Err("nessuna attività nel foglio WBS e Stima Costi".into());
    }
    let mut conn = open_and_migrate(progetto).map_err(|e| e.to_string())?;
    let pid: i64 = conn
        .query_row("SELECT id FROM project ORDER BY id LIMIT 1", [], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("il file di progetto non contiene un progetto")?;
    if let Some(meta_pid) = w.meta.as_ref().and_then(|m| m.project_id) {
        if meta_pid != pid {
            return Err("il workbook appartiene a un altro progetto (project_id in _meta diverso): crea un nuovo progetto".into());
        }
    }
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    scrivi_input(&tx, pid, &w).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let _ = &mut w;
    Ok((
        ImportOutcome { project_id: pid, warnings: w.avvisi.iter().map(|a| format!("{}: {}", a.codice, a.messaggio)).collect() },
        w,
    ))
}

/// Scrive gli input nel progetto: sostituisce le righe di input precedenti.
fn scrivi_input(tx: &rusqlite::Transaction, pid: i64, w: &WorkbookImportato) -> rusqlite::Result<()> {
    let p = &w.parametri;
    let base_ev = match p.base_ev.as_deref() {
        Some(t) if chiave(t).contains("senza") => "bac_senza_contingency",
        _ => "bac_con_contingency",
    };
    tx.execute(
        "UPDATE project_params SET overhead_pct = ?2, contingency_pct = ?3, mgmt_reserve_pct = ?4,
             green_threshold = ?5, yellow_threshold = ?6, start_date = ?7, planned_end_date = ?8,
             time_buffer_days = ?9, sprint_days = ?10, team_cost_per_sprint = ?11,
             velocity_window = ?12, ev_base_mode = ?13, planned_sp_per_sprint = ?14, baseline_cost_per_sp = ?15
         WHERE project_id = ?1",
        params![
            pid,
            p.overhead.unwrap_or(0.0),
            p.contingency.unwrap_or(0.0),
            p.riserva_gestione.unwrap_or(0.0),
            p.soglia_verde.unwrap_or(95.0),
            p.soglia_gialla.unwrap_or(85.0),
            p.inizio,
            p.fine,
            p.buffer_giorni.unwrap_or(0.0),
            p.durata_sprint.unwrap_or(14.0) as i64,
            p.costo_team_sprint,
            p.finestra_velocity.unwrap_or(3.0) as i64,
            base_ev,
            p.sp_per_sprint,
            p.costo_per_sp,
        ],
    )?;
    tx.execute("DELETE FROM wbs_attivita WHERE project_id = ?1", [pid])?;
    tx.execute("DELETE FROM project_checkpoint WHERE project_id = ?1", [pid])?;
    tx.execute("DELETE FROM risk WHERE project_id = ?1", [pid])?;
    tx.execute("DELETE FROM agile_sprint WHERE project_id = ?1", [pid])?;
    for (i, a) in w.attivita.iter().enumerate() {
        tx.execute(
            "INSERT INTO wbs_attivita (project_id, ordine, id_attivita, attivita, fase, risorsa,
                 costo_orario, o, m, p, ore_giorno, materiali, servizi_esterni, data_inizio, filone)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![pid, i as i64, a.id, a.attivita, a.fase, a.risorsa, a.costo_orario, a.o, a.m, a.p, a.ore_giorno, a.materiali, a.servizi_esterni, a.data_inizio, a.filone],
        )?;
    }
    for (i, c) in w.checkpoint.iter().enumerate() {
        tx.execute(
            "INSERT INTO project_checkpoint (project_id, ordine, date, note, pct_planned, pct_actual, ac)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![pid, i as i64, c.date, c.note, c.pct_planned, c.pct_actual, c.ac],
        )?;
    }
    for r in &w.rischi {
        tx.execute(
            "INSERT INTO risk (project_id, description, probability_pct, impact_estimated,
                 contingency_allocated, usage_date, usage_amount)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![pid, r.descrizione, r.probabilita, r.impatto, r.contingenza, r.data_utilizzo, r.importo_utilizzato],
        )?;
    }
    for s in &w.sprint {
        tx.execute(
            "INSERT INTO agile_sprint (project_id, sprint_number, sp_planned, sp_completed, team_cost)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![pid, s.numero, s.sp_pianificati, s.sp_completati, s.costo_team],
        )?;
    }
    Ok(())
}

/// Rilegge gli input di un progetto nella stessa forma di `WorkbookImportato` (round trip, export).
pub fn input_progetto(conn: &Connection, pid: i64) -> Result<WorkbookImportato, String> {
    let e = |err: rusqlite::Error| err.to_string();
    let parametri = conn
        .query_row(
            "SELECT overhead_pct, contingency_pct, mgmt_reserve_pct, green_threshold, yellow_threshold,
                    start_date, planned_end_date, time_buffer_days, sprint_days, team_cost_per_sprint,
                    velocity_window, ev_base_mode, planned_sp_per_sprint, baseline_cost_per_sp
             FROM project_params WHERE project_id = ?1",
            [pid],
            |r| {
                Ok(ParametriImportati {
                    overhead: r.get(0)?,
                    contingency: r.get(1)?,
                    riserva_gestione: r.get(2)?,
                    soglia_verde: r.get(3)?,
                    soglia_gialla: r.get(4)?,
                    inizio: r.get(5)?,
                    fine: r.get(6)?,
                    buffer_giorni: r.get(7)?,
                    durata_sprint: r.get::<_, i64>(8).ok().map(|v| v as f64),
                    costo_team_sprint: r.get(9)?,
                    finestra_velocity: r.get::<_, i64>(10).ok().map(|v| v as f64),
                    base_ev: r.get(11)?,
                    sp_per_sprint: r.get(12)?,
                    costo_per_sp: r.get(13)?,
                })
            },
        )
        .map_err(e)?;
    let mut out = WorkbookImportato { parametri, ..Default::default() };
    let mut st = conn
        .prepare("SELECT id_attivita, attivita, fase, risorsa, costo_orario, o, m, p, ore_giorno, materiali, servizi_esterni, data_inizio, filone FROM wbs_attivita WHERE project_id = ?1 ORDER BY ordine")
        .map_err(e)?;
    out.attivita = st
        .query_map([pid], |r| {
            Ok(AttivitaImportata {
                id: r.get(0)?,
                attivita: r.get(1)?,
                fase: r.get(2)?,
                risorsa: r.get(3)?,
                costo_orario: r.get(4)?,
                o: r.get(5)?,
                m: r.get(6)?,
                p: r.get(7)?,
                ore_giorno: r.get(8)?,
                materiali: r.get(9)?,
                servizi_esterni: r.get(10)?,
                data_inizio: r.get(11)?,
                filone: r.get(12)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)?;
    let mut st = conn
        .prepare("SELECT date, note, pct_planned, pct_actual, ac FROM project_checkpoint WHERE project_id = ?1 ORDER BY ordine")
        .map_err(e)?;
    out.checkpoint = st
        .query_map([pid], |r| {
            Ok(CheckpointImportato { date: r.get(0)?, note: r.get(1)?, pct_planned: r.get(2)?, pct_actual: r.get(3)?, ac: r.get(4)? })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)?;
    let mut st = conn
        .prepare("SELECT description, probability_pct, impact_estimated, contingency_allocated, usage_date, usage_amount FROM risk WHERE project_id = ?1 ORDER BY id")
        .map_err(e)?;
    out.rischi = st
        .query_map([pid], |r| {
            Ok(RischioImportato {
                descrizione: r.get(0)?,
                probabilita: r.get(1)?,
                impatto: r.get(2)?,
                contingenza: r.get(3)?,
                data_utilizzo: r.get(4)?,
                importo_utilizzato: r.get(5)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)?;
    let mut st = conn
        .prepare("SELECT sprint_number, sp_planned, sp_completed, team_cost FROM agile_sprint WHERE project_id = ?1 ORDER BY sprint_number")
        .map_err(e)?;
    out.sprint = st
        .query_map([pid], |r| Ok(SprintImportato { numero: r.get(0)?, sp_pianificati: r.get(1)?, sp_completati: r.get(2)?, costo_team: r.get(3)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)?;
    Ok(out)
}
