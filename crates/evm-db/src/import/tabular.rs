// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Import tabellare (CSV ed Excel) del piano. La riga di intestazione è
//! riconosciuta per nome di colonna, in italiano o in inglese, nell'ordine
//! che produce MS Project ("Salva come → CSV / Excel"). Le colonne non
//! riconosciute sono ignorate; mancano solo UID e nome, che sono obbligatori.

use super::{giorni_in_minuti, ImportedPlan, PlanAssignment, PlanLink, PlanResource, PlanTask};
use crate::tempo;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Campo {
    Uid,
    Nome,
    Wbs,
    Riepilogo,
    Milestone,
    Critico,
    Inizio,
    Fine,
    Durata,
    Predecessori,
    Avanzamento,
    InizioEffettivo,
    FineEffettiva,
    Risorse,
    Costo,
    Lavoro,
    Galleggiamento,
}

fn riconosci(intestazione: &str) -> Option<Campo> {
    let normalizzata = intestazione.trim().to_lowercase();
    Some(match normalizzata.as_str() {
        "uid" | "id" | "unique id" | "activity id" | "id attività" | "id attivita" | "codice" => {
            Campo::Uid
        }
        "nome" | "name" | "task name" | "nome attività" | "nome attivita" | "attività"
        | "attivita" | "task" => Campo::Nome,
        "wbs" | "wbs code" => Campo::Wbs,
        "riepilogo" | "summary" | "task riepilogo" | "summary task" => Campo::Riepilogo,
        "milestone" => Campo::Milestone,
        "critica" | "critico" | "critical" => Campo::Critico,
        "inizio" | "start" | "data inizio" | "inizio pianificato" | "start date" => Campo::Inizio,
        "fine" | "finish" | "data fine" | "fine pianificata" | "finish date" => Campo::Fine,
        "durata" | "duration" => Campo::Durata,
        "predecessori" | "predecessors" | "predecessor" => Campo::Predecessori,
        "% completamento" | "% completato" | "% complete" | "completamento" | "percent complete" => {
            Campo::Avanzamento
        }
        "inizio effettivo" | "actual start" => Campo::InizioEffettivo,
        "fine effettiva" | "actual finish" => Campo::FineEffettiva,
        "nomi risorse" | "risorse" | "resource names" | "resources" => Campo::Risorse,
        "costo" | "cost" | "costo pianificato" | "planned cost" => Campo::Costo,
        "lavoro" | "work" => Campo::Lavoro,
        "margine totale" | "total slack" | "galleggiamento" => Campo::Galleggiamento,
        _ => return None,
    })
}

/// Legge un CSV esportato da MS Project. Gestisce UTF-8 (con o senza BOM) e
/// le codifiche latin-1/Windows-1252 dei sistemi italiani, e rileva il
/// separatore (`;` o `,`) dalla riga di intestazione.
pub fn leggi_csv(bytes: &[u8]) -> Result<ImportedPlan, String> {
    let testo: String = match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        // Senza UTF-8 valido ogni byte è un carattere latin-1 (Windows-1252 quasi ovunque).
        Err(_) => bytes.iter().map(|&b| b as char).collect(),
    };
    let testo = testo.strip_prefix('\u{feff}').unwrap_or(&testo);
    let primo_rigo = testo.lines().next().unwrap_or("");
    let separatore = if primo_rigo.matches(';').count() > primo_rigo.matches(',').count() {
        b';'
    } else {
        b','
    };

    let mut lettore = csv::ReaderBuilder::new()
        .delimiter(separatore)
        .has_headers(false)
        .flexible(true)
        .from_reader(testo.as_bytes());
    let mut righe = Vec::new();
    for record in lettore.records() {
        let record = record.map_err(|e| format!("CSV non valido: {e}"))?;
        righe.push(record.iter().map(str::to_string).collect::<Vec<String>>());
    }
    da_righe(righe)
}

/// Costruisce il piano da righe di celle di testo. La prima riga con UID o
/// nome riconosciuti è l'intestazione; le righe senza nome sono vuote e
/// vengono saltate.
pub fn da_righe(righe: Vec<Vec<String>>) -> Result<ImportedPlan, String> {
    let mut plan = ImportedPlan::default();

    let Some((indice_intestazione, mappa)) = righe.iter().take(10).enumerate().find_map(|(i, r)| {
        let mut mappa: Vec<(Campo, usize)> = Vec::new();
        for (colonna, cella) in r.iter().enumerate() {
            if let Some(campo) = riconosci(cella) {
                if !mappa.iter().any(|(c, _)| *c == campo) {
                    mappa.push((campo, colonna));
                }
            }
        }
        let ha_base = mappa.iter().any(|(c, _)| *c == Campo::Nome);
        ha_base.then_some((i, mappa))
    }) else {
        return Err("intestazione non riconosciuta: servono almeno le colonne Nome e UID/ID".into());
    };

    let colonna = |campo: Campo| mappa.iter().find(|(c, _)| *c == campo).map(|(_, i)| *i);
    let cella = |riga: &[String], campo: Campo| -> Option<String> {
        colonna(campo)
            .and_then(|i| riga.get(i))
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    };

    if colonna(Campo::Uid).is_none() {
        return Err("colonna UID/ID non trovata: serve per collegare predecessori e assegnazioni".into());
    }

    for (n, riga) in righe.iter().enumerate().skip(indice_intestazione + 1) {
        let numero_riga = n + 1;
        let Some(nome) = cella(riga, Campo::Nome) else { continue };
        let Some(uid) = cella(riga, Campo::Uid) else {
            plan.warnings.push(format!("riga {numero_riga} ({nome}): UID mancante, riga scartata"));
            continue;
        };

        let predecessori = cella(riga, Campo::Predecessori)
            .map(|v| parse_predecessori(&v, &mut plan.warnings, numero_riga))
            .unwrap_or_default();

        let durata = cella(riga, Campo::Durata).and_then(|v| parse_durata_giorni(&v));
        let avanzamento = cella(riga, Campo::Avanzamento).and_then(|v| parse_numero(&v));

        plan.tasks.push(PlanTask {
            uid: uid.clone(),
            name: nome,
            wbs: cella(riga, Campo::Wbs),
            is_summary: cella(riga, Campo::Riepilogo).is_some_and(|v| vero(&v)),
            is_milestone: cella(riga, Campo::Milestone).is_some_and(|v| vero(&v)),
            is_critical: cella(riga, Campo::Critico).is_some_and(|v| vero(&v)),
            start: cella(riga, Campo::Inizio).and_then(|v| tempo::normalizza_data(&v)),
            finish: cella(riga, Campo::Fine).and_then(|v| tempo::normalizza_data(&v)),
            duration_days: durata,
            float_days: cella(riga, Campo::Galleggiamento)
                .and_then(|v| parse_durata_giorni(&v)),
            pct_complete: avanzamento,
            actual_start: cella(riga, Campo::InizioEffettivo)
                .and_then(|v| tempo::normalizza_data(&v)),
            actual_finish: cella(riga, Campo::FineEffettiva)
                .and_then(|v| tempo::normalizza_data(&v)),
            work_hours: cella(riga, Campo::Lavoro).and_then(|v| parse_ore(&v)),
            cost: cella(riga, Campo::Costo).and_then(|v| parse_numero(&v)),
            predecessors: predecessori,
        });

        if let Some(nomi) = cella(riga, Campo::Risorse) {
            for voce in nomi.split([';', ',']).map(str::trim).filter(|v| !v.is_empty()) {
                let (nome_risorsa, unita) = separa_unita(voce);
                if !plan.resources.iter().any(|r| r.uid == nome_risorsa) {
                    plan.resources.push(PlanResource {
                        uid: nome_risorsa.to_string(),
                        name: nome_risorsa.to_string(),
                        kind: Some("lavoro".into()),
                        ..PlanResource::default()
                    });
                }
                plan.assignments.push(PlanAssignment {
                    task_uid: uid.clone(),
                    resource_uid: nome_risorsa.to_string(),
                    units: unita,
                });
            }
        }
    }

    if plan.tasks.is_empty() {
        return Err("nessuna riga di attività trovata sotto l'intestazione".into());
    }
    Ok(plan)
}

fn vero(v: &str) -> bool {
    matches!(v.trim().to_lowercase().as_str(), "sì" | "si" | "yes" | "true" | "1" | "x" | "vero")
}

/// Numero con separatori locali: `1.234,56` e `1234.56` sono entrambi validi.
fn parse_numero(v: &str) -> Option<f64> {
    let pulito: String = v
        .chars()
        .filter(|c| c.is_ascii_digit() || matches!(c, '.' | ',' | '-'))
        .collect();
    let normalizzato = match (pulito.contains(','), pulito.contains('.')) {
        (true, true) => pulito.replace('.', "").replace(',', "."),
        (true, false) => pulito.replace(',', "."),
        _ => pulito,
    };
    normalizzato.parse::<f64>().ok()
}

/// Durata in giorni: `5`, `5 g`, `5d`, `5 days`, `40h` (convertite a 8 h/giorno).
fn parse_durata_giorni(v: &str) -> Option<f64> {
    let minuscolo = v.trim().to_lowercase();
    let numero = parse_numero(&minuscolo)?;
    if minuscolo.contains('h') || minuscolo.contains("ore") {
        Some(numero / super::ORE_PER_GIORNO)
    } else {
        Some(numero)
    }
}

/// Lavoro in ore: `40h`, `40 ore`, oppure un numero già in ore.
fn parse_ore(v: &str) -> Option<f64> {
    parse_numero(v)
}

/// Lista di predecessori `3FS+2g, 5SS-1h`. Il tipo di collegamento è FS se omesso.
fn parse_predecessori(v: &str, avvisi: &mut Vec<String>, riga: usize) -> Vec<PlanLink> {
    let mut link = Vec::new();
    for voce in v.split([';', ',']).map(str::trim).filter(|s| !s.is_empty()) {
        let cifre: String = voce.chars().take_while(|c| c.is_ascii_digit()).collect();
        if cifre.is_empty() {
            avvisi.push(format!("riga {riga}: predecessore «{voce}» non riconosciuto"));
            continue;
        }
        let resto = voce[cifre.len()..].trim();
        let maiuscolo = resto.to_uppercase();
        let (tipo, dopo_tipo) = ["FS", "SS", "FF", "SF"]
            .into_iter()
            .find(|t| maiuscolo.starts_with(t))
            .map_or(("FS", resto), |t| (t, &resto[t.len()..]));
        let dopo_tipo = dopo_tipo.trim();
        let lag_minuti = if dopo_tipo.is_empty() {
            0
        } else {
            let segno = if dopo_tipo.starts_with('-') { -1.0 } else { 1.0 };
            match parse_durata_giorni(dopo_tipo.trim_start_matches(['+', '-'])) {
                Some(g) => giorni_in_minuti(segno * g),
                None => {
                    avvisi.push(format!("riga {riga}: ritardo di «{voce}» non riconosciuto"));
                    0
                }
            }
        };
        link.push(PlanLink {
            pred_uid: cifre,
            kind: tipo.to_string(),
            lag_minutes: lag_minuti,
        });
    }
    link
}

/// `Mario[50%]` → (`Mario`, 0.5). Senza percentuale le unità sono 1.
fn separa_unita(voce: &str) -> (&str, f64) {
    match voce.split_once('[') {
        Some((nome, resto)) => {
            let unita = parse_numero(resto).map_or(1.0, |p| p / 100.0);
            (nome.trim(), unita)
        }
        None => (voce, 1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn riga(celle: &[&str]) -> Vec<String> {
        celle.iter().map(|c| c.to_string()).collect()
    }

    #[test]
    fn importa_csv_italiano_con_separatore_punto_e_virgola() {
        let csv = "ID;Nome;WBS;Durata;Inizio;Fine;Predecessori;Nomi risorse;% completamento\n\
                   1;Fase A;1;10 g;05/01/2026;16/01/2026;;;50\n\
                   2;Scavo;1.1;5 g;05/01/2026;09/01/2026;1FS+1g;Mario[50%];100\n";
        let plan = leggi_csv(csv.as_bytes()).unwrap();
        assert_eq!(plan.tasks.len(), 2);
        assert_eq!(plan.tasks[1].duration_days, Some(5.0));
        assert_eq!(plan.tasks[1].start.as_deref(), Some("2026-01-05"));
        assert_eq!(plan.tasks[1].predecessors[0].pred_uid, "1");
        assert_eq!(plan.tasks[1].predecessors[0].lag_minutes, 480);
        assert_eq!(plan.tasks[1].pct_complete, Some(100.0));
        assert_eq!(plan.resources[0].name, "Mario");
        assert_eq!(plan.assignments[0].units, 0.5);
    }

    #[test]
    fn riconosce_intestazione_dopo_righe_di_titolo() {
        let righe = vec![
            riga(&["Piano di progetto", "", ""]),
            riga(&["UID", "Task Name", "Duration"]),
            riga(&["7", "Collaudo", "3 days"]),
        ];
        let plan = da_righe(righe).unwrap();
        assert_eq!(plan.tasks[0].uid, "7");
        assert_eq!(plan.tasks[0].duration_days, Some(3.0));
    }

    #[test]
    fn durate_in_ore_diventano_giorni() {
        assert_eq!(parse_durata_giorni("40h"), Some(5.0));
        assert_eq!(parse_durata_giorni("2,5"), Some(2.5));
    }

    #[test]
    fn senza_colonna_uid_l_import_si_ferma() {
        let righe = vec![riga(&["Nome", "Durata"]), riga(&["Scavo", "5"])];
        assert!(da_righe(righe).is_err());
    }
}
