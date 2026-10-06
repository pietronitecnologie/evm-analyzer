// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Date e orari in ISO-8601 (sez. 4): utilità per normalizzare le date dei
//! file importati e per registrare istanti di importazione. Nessuna
//! dipendenza esterna: le conversioni civili usano l'algoritmo di H. Hinnant.

use std::time::{SystemTime, UNIX_EPOCH};

/// Giorni tra il 1899-12-30 (origine dei serial Excel) e il 1970-01-01.
const GIORNI_EXCEL_A_UNIX: i64 = 25_569;

fn secondi_adesso() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Data odierna `YYYY-MM-DD` (in UTC).
pub fn oggi_iso() -> String {
    let (y, m, d) = civile_da_giorni(secondi_adesso().div_euclid(86_400));
    format!("{y:04}-{m:02}-{d:02}")
}

/// Istante corrente `YYYY-MM-DDTHH:MM:SSZ` (in UTC).
pub fn adesso_iso() -> String {
    let s = secondi_adesso();
    let (y, m, d) = civile_da_giorni(s.div_euclid(86_400));
    let ore = s.rem_euclid(86_400);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        ore / 3600,
        (ore % 3600) / 60,
        ore % 60
    )
}

/// Converte un serial Excel in `YYYY-MM-DD` (specifica fase 3, §2.4): sistema 1900
/// con il bug del 29/02/1900. Per `serial ≥ 61` la base è 1899-12-30; per
/// `serial < 61` è 1899-12-31. Il serial 60 (29/02/1900, inesistente) è `None`.
pub fn seriale_excel_a_iso(serial: f64) -> Option<String> {
    if !serial.is_finite() || serial < 1.0 {
        return None;
    }
    let s = serial.floor() as i64;
    if s == 60 {
        return None;
    }
    let giorni = if s >= 61 { s - GIORNI_EXCEL_A_UNIX } else { s - GIORNI_EXCEL_A_UNIX + 1 };
    let (y, m, d) = civile_da_giorni(giorni);
    Some(format!("{y:04}-{m:02}-{d:02}"))
}

/// Normalizza una data testuale proveniente da un file di import. Accetta
/// `YYYY-MM-DD` (anche seguita da ora, come `2026-01-05T08:00:00`) e le forme
/// italiane `gg/mm/aaaa`, `gg-mm-aaaa`, `gg.mm.aaaa`, con anno a due cifre.
pub fn normalizza_data(grezzo: &str) -> Option<String> {
    let testo = grezzo.trim();
    let parte = testo
        .split(['T', ' '])
        .next()
        .unwrap_or("");

    let (y, m, d) = if parte.len() == 10 && parte.as_bytes()[4] == b'-' {
        let campi: Vec<&str> = parte.split('-').collect();
        if campi.len() != 3 {
            return None;
        }
        (
            campi[0].parse::<i64>().ok()?,
            campi[1].parse::<u32>().ok()?,
            campi[2].parse::<u32>().ok()?,
        )
    } else {
        let campi: Vec<&str> = parte.split(['/', '-', '.']).collect();
        if campi.len() != 3 {
            return None;
        }
        let anno = campi[2].parse::<i64>().ok()?;
        let anno = if anno < 100 { anno + 2000 } else { anno };
        (anno, campi[1].parse::<u32>().ok()?, campi[0].parse::<u32>().ok()?)
    };

    // Controllo di validità: la data deve sopravvivere al giro andata/ritorno
    // (scarta per esempio il 31/02).
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let giorni = giorni_da_civile(y, m, d);
    if civile_da_giorni(giorni) != (y, m, d) {
        return None;
    }
    Some(format!("{y:04}-{m:02}-{d:02}"))
}

/// Durata ISO-8601 di MS Project (`PT40H0M0S`) convertita in ore.
pub fn durata_iso_in_ore(testo: &str) -> Option<f64> {
    let corpo = testo.trim().strip_prefix("PT")?;
    let mut totale = 0.0;
    let mut numero = String::new();
    for c in corpo.chars() {
        match c {
            'H' => totale += numero.parse::<f64>().ok()?,
            'M' => totale += numero.parse::<f64>().ok()? / 60.0,
            'S' => totale += numero.parse::<f64>().ok()? / 3600.0,
            _ => numero.push(c),
        }
        if matches!(c, 'H' | 'M' | 'S') {
            numero.clear();
        }
    }
    Some(totale)
}

/// Numero di giorni dall'epoca (1970-01-01) per una data ISO; `None` se non valida.
pub fn giorno_da_iso(testo: &str) -> Option<i64> {
    let iso = normalizza_data(testo)?;
    let mut campi = iso.split('-').map(|c| c.parse::<i64>().ok());
    let y = campi.next()??;
    let m = campi.next()?? as u32;
    let d = campi.next()?? as u32;
    Some(giorni_da_civile(y, m, d))
}

/// Data ISO `YYYY-MM-DD` del giorno `giorno` dall'epoca.
pub fn iso_da_giorno(giorno: i64) -> String {
    let (y, m, d) = civile_da_giorni(giorno);
    format!("{y:04}-{m:02}-{d:02}")
}

// Algoritmo di H. Hinnant (days_from_civil / civil_from_days).

fn giorni_da_civile(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = m as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civile_da_giorni(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizza_le_forme_di_data_piu_comuni() {
        assert_eq!(normalizza_data("2026-01-05T08:00:00").as_deref(), Some("2026-01-05"));
        assert_eq!(normalizza_data("05/01/2026").as_deref(), Some("2026-01-05"));
        assert_eq!(normalizza_data("5/1/26 08:00").as_deref(), Some("2026-01-05"));
        assert_eq!(normalizza_data("31/02/2026"), None);
        assert_eq!(normalizza_data("non una data"), None);
    }

    #[test]
    fn converte_i_serial_excel() {
        // 1 gennaio 2026 è il serial 46023 in Excel.
        assert_eq!(seriale_excel_a_iso(46_023.0).as_deref(), Some("2026-01-01"));
        assert_eq!(seriale_excel_a_iso(0.0), None);
    }

    #[test]
    fn serial_prima_del_bug_1900_e_il_29_febbraio_inesistente() {
        // Casi della specifica fase 3, §4.
        assert_eq!(seriale_excel_a_iso(1.0).as_deref(), Some("1900-01-01"));
        assert_eq!(seriale_excel_a_iso(59.0).as_deref(), Some("1900-02-28"));
        assert_eq!(seriale_excel_a_iso(60.0), None, "29/02/1900 non esiste");
        assert_eq!(seriale_excel_a_iso(61.0).as_deref(), Some("1900-03-01"));
    }

    #[test]
    fn giorno_e_data_sono_inversi() {
        let g = giorno_da_iso("2026-01-05").unwrap();
        assert_eq!(iso_da_giorno(g), "2026-01-05");
        assert_eq!(giorno_da_iso("31/02/2026"), None);
    }

    #[test]
    fn legge_le_durate_iso_di_ms_project() {
        assert_eq!(durata_iso_in_ore("PT40H0M0S"), Some(40.0));
        assert_eq!(durata_iso_in_ore("PT4H30M0S"), Some(4.5));
        assert_eq!(durata_iso_in_ore("PT0H0M0S"), Some(0.0));
    }
}
