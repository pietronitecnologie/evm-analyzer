// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Calendari di lavoro (schemi). Uno schema definisce i giorni lavorativi
//! della settimana (maschera a bit, bit 0 = lunedì … bit 6 = domenica) e
//! un elenco di festivi: date non lavorative anche se cadono in un giorno
//! lavorativo. Il progetto usa lo schema marcato come predefinito, e le
//! durate dei task si contano solo sui giorni lavorativi di quello schema.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::tempo::{giorno_da_iso, iso_da_giorno, normalizza_data};

/// Lunedì–venerdì: la maschera predefinita del database.
pub const LUN_VEN: i64 = 0b001_1111;

/// Limite di sicurezza nella ricerca del prossimo giorno lavorativo: evita
/// cicli infiniti con uno schema senza giorni lavorativi.
const MAX_SALTI: i64 = 3_660;

/// Regole di calendario già caricate: maschera e eccezioni per giorno.
#[derive(Debug, Clone, PartialEq)]
pub struct Regole {
    pub maschera: i64,
    /// Giorno (dall'epoca) → true se lavorativo per eccezione, false se festivo.
    pub eccezioni: HashMap<i64, bool>,
}

impl Regole {
    pub fn lun_ven() -> Self {
        Self { maschera: LUN_VEN, eccezioni: HashMap::new() }
    }

    pub fn e_lavorativo(&self, giorno: i64) -> bool {
        if let Some(&lavorativo) = self.eccezioni.get(&giorno) {
            return lavorativo;
        }
        // 1970-01-01 è giovedì: con lunedì = 0 il giorno della settimana è (g + 3) mod 7.
        let giorno_settimana = (giorno + 3).rem_euclid(7);
        self.maschera & (1 << giorno_settimana) != 0
    }

    /// Primo giorno lavorativo a partire da `giorno` (incluso).
    fn prossimo_lavorativo(&self, giorno: i64) -> Option<i64> {
        (0..MAX_SALTI).map(|i| giorno + i).find(|&g| self.e_lavorativo(g))
    }

    /// Numero di giorni lavorativi tra due giorni, estremi inclusi.
    pub fn giorni_lavorativi(&self, inizio: i64, fine: i64) -> i64 {
        if fine < inizio {
            return 0;
        }
        (inizio..=fine).filter(|&g| self.e_lavorativo(g)).count() as i64
    }

    /// Giorno di fine di una durata di `durata` giorni lavorativi che parte da
    /// `inizio`. Se `inizio` non è lavorativo la durata parte dal giorno lavorativo
    /// successivo. Una durata di 0 (milestone) finisce il giorno stesso.
    pub fn fine_da_durata(&self, inizio: i64, durata: i64) -> Option<i64> {
        if durata <= 0 {
            return Some(inizio);
        }
        let mut g = self.prossimo_lavorativo(inizio)?;
        let mut conteggio = 1;
        while conteggio < durata {
            g = self.prossimo_lavorativo(g + 1)?;
            conteggio += 1;
        }
        Some(g)
    }
}

/// Carica le regole di uno schema.
pub fn regole_di(conn: &Connection, calendario_id: i64) -> Result<Regole, String> {
    let maschera: i64 = conn
        .query_row("SELECT working_days_mask FROM calendar WHERE id = ?1", [calendario_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT date, is_working FROM calendar_exception WHERE calendar_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut eccezioni = HashMap::new();
    let righe = stmt
        .query_map([calendario_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    for riga in righe {
        let (data, lavorativo) = riga.map_err(|e| e.to_string())?;
        if let Some(g) = giorno_da_iso(&data) {
            eccezioni.insert(g, lavorativo != 0);
        }
    }
    Ok(Regole { maschera, eccezioni })
}

/// Regole dello schema predefinito del progetto (lun–ven se non ne esiste uno).
pub fn regole_predefinite(conn: &Connection, pid: i64) -> Result<Regole, String> {
    let id: Option<i64> = conn
        .query_row(
            "SELECT id FROM calendar WHERE project_id = ?1 AND is_default = 1 ORDER BY id LIMIT 1",
            [pid],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match id {
        Some(id) => regole_di(conn, id),
        None => Ok(Regole::lun_ven()),
    }
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Calendario {
    pub id: i64,
    pub nome: String,
    pub predefinito: bool,
    /// Maschera dei giorni lavorativi (bit 0 = lunedì).
    pub maschera: i64,
    /// Festivi espliciti dello schema, in ordine di data.
    pub festivi: Vec<String>,
}

pub fn calendari(conn: &Connection, pid: i64) -> Result<Vec<Calendario>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, is_default, working_days_mask FROM calendar WHERE project_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let base = stmt
        .query_map([pid], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)? != 0, r.get::<_, i64>(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for (id, nome, predefinito, maschera) in base {
        let mut festivi_stmt = conn
            .prepare("SELECT date FROM calendar_exception WHERE calendar_id = ?1 AND is_working = 0 ORDER BY date")
            .map_err(|e| e.to_string())?;
        let festivi = festivi_stmt
            .query_map([id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<String>>>()
            .map_err(|e| e.to_string())?;
        out.push(Calendario { id, nome, predefinito, maschera, festivi });
    }
    Ok(out)
}

/// Crea uno schema con i giorni lavorativi indicati e i festivi (date ISO o gg/mm/aaaa).
pub fn crea_calendario(
    conn: &mut Connection,
    pid: i64,
    nome: &str,
    maschera: i64,
    festivi: &[String],
) -> Result<i64, String> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Err("il nome dello schema è obbligatorio".into());
    }
    if !(1..=0b111_1111).contains(&maschera) {
        return Err("scegli almeno un giorno lavorativo".into());
    }
    let mut date: Vec<String> = Vec::new();
    let mut viste = HashSet::new();
    for grezza in festivi {
        let data = normalizza_data(grezza).ok_or_else(|| format!("festivo non valido: {grezza}"))?;
        if viste.insert(data.clone()) {
            date.push(data);
        }
    }
    date.sort();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let ha_predefinito: bool = tx
        .query_row(
            "SELECT count(*) FROM calendar WHERE project_id = ?1 AND is_default = 1",
            [pid],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;
    tx.execute(
        "INSERT INTO calendar (project_id, name, is_default, working_days_mask) VALUES (?1, ?2, ?3, ?4)",
        params![pid, nome, (!ha_predefinito) as i64, maschera],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    for data in &date {
        tx.execute(
            "INSERT INTO calendar_exception (calendar_id, date, is_working) VALUES (?1, ?2, 0)",
            params![id, data],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(id)
}

/// Assegna lo schema al progetto: diventa il predefinito e gli altri non lo sono più.
pub fn imposta_predefinito(conn: &mut Connection, pid: i64, calendario_id: i64) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let appartiene: bool = tx
        .query_row(
            "SELECT count(*) FROM calendar WHERE id = ?1 AND project_id = ?2",
            params![calendario_id, pid],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;
    if !appartiene {
        return Err("lo schema non appartiene a questo progetto".into());
    }
    tx.execute("UPDATE calendar SET is_default = 0 WHERE project_id = ?1", [pid])
        .map_err(|e| e.to_string())?;
    tx.execute("UPDATE calendar SET is_default = 1 WHERE id = ?1", [calendario_id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Ricalcola la durata in giorni lavorativi di ogni task con date di inizio e fine.
/// Restituisce il numero di task aggiornati. Le baseline non cambiano.
pub fn ricalcola_durate(conn: &mut Connection, pid: i64) -> Result<usize, String> {
    let regole = regole_predefinite(conn, pid)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let coppie: Vec<(i64, String, String)> = {
        let mut stmt = tx
            .prepare(
                "SELECT id, start_planned, finish_planned FROM task
                 WHERE project_id = ?1 AND is_summary = 0
                   AND start_planned IS NOT NULL AND finish_planned IS NOT NULL",
            )
            .map_err(|e| e.to_string())?;
        let righe = stmt
            .query_map([pid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        righe
    };
    let mut aggiornati = 0;
    for (id, inizio, fine) in coppie {
        let (Some(i), Some(f)) = (giorno_da_iso(&inizio), giorno_da_iso(&fine)) else { continue };
        let durata = regole.giorni_lavorativi(i, f) as f64;
        tx.execute(
            "UPDATE task SET duration_planned_days = ?2 WHERE id = ?1",
            params![id, durata],
        )
        .map_err(|e| e.to_string())?;
        aggiornati += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(aggiornati)
}

/// Data di fine calcolata da inizio e durata in giorni lavorativi, come ISO.
pub fn data_fine(regole: &Regole, inizio_iso: &str, durata: f64) -> Result<String, String> {
    let i = giorno_da_iso(inizio_iso).ok_or_else(|| format!("data non valida: {inizio_iso}"))?;
    let giorni = durata.ceil() as i64;
    let f = regole
        .fine_da_durata(i, giorni)
        .ok_or_else(|| "lo schema di calendario non ha giorni lavorativi".to_string())?;
    Ok(iso_da_giorno(f))
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-01-05 è lunedì.
    fn g(iso: &str) -> i64 {
        giorno_da_iso(iso).unwrap()
    }

    #[test]
    fn il_fine_settimana_non_conta() {
        let r = Regole::lun_ven();
        assert_eq!(r.giorni_lavorativi(g("2026-01-05"), g("2026-01-11")), 5, "lun–dom");
        assert_eq!(r.fine_da_durata(g("2026-01-09"), 2), Some(g("2026-01-12")), "ven + 2 gg = lun");
    }

    #[test]
    fn i_festivi_dello_schema_non_contano() {
        let mut r = Regole::lun_ven();
        r.eccezioni.insert(g("2026-01-07"), false); // mercoledì festivo
        assert_eq!(r.giorni_lavorativi(g("2026-01-05"), g("2026-01-09")), 4);
        assert_eq!(r.fine_da_durata(g("2026-01-05"), 3), Some(g("2026-01-08")));
    }

    #[test]
    fn un_giorno_di_sabato_puo_essere_lavorativo_per_eccezione() {
        let mut r = Regole::lun_ven();
        r.eccezioni.insert(g("2026-01-10"), true);
        assert_eq!(r.giorni_lavorativi(g("2026-01-09"), g("2026-01-10")), 2);
    }

    #[test]
    fn durata_e_fine_si_invertono() {
        let r = Regole::lun_ven();
        let fine = r.fine_da_durata(g("2026-01-05"), 7).unwrap();
        assert_eq!(r.giorni_lavorativi(g("2026-01-05"), fine), 7);
    }

    #[test]
    fn uno_schema_senza_giorni_lavorativi_non_blocca_il_calcolo() {
        let r = Regole { maschera: 0, eccezioni: HashMap::new() };
        assert_eq!(r.fine_da_durata(g("2026-01-05"), 2), None);
    }
}
