// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Risorse e assegnazioni: tariffe importate, costo orario reale (Cap. 2, §6-bis.7),
//! assegnazioni task-risorsa con unità. Le risorse vengono dal piano importato o
//! dall'utente. Ogni scrittura è validata contro il progetto.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

type Esito<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

fn importo(v: Option<f64>, nome: &str) -> Esito<Option<f64>> {
    match v {
        Some(x) if !x.is_finite() || x < 0.0 => Err(format!("{nome} deve essere un importo positivo o zero")),
        other => Ok(other),
    }
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RisorsaRiga {
    pub id: i64,
    pub nome: String,
    pub tipo: Option<String>,
    /// Tariffa importata (€/h).
    pub tariffa: Option<f64>,
    pub tariffa_straordinario: Option<f64>,
    pub costo_per_uso: Option<f64>,
    /// Costo orario reale (€/h), se verificato: prevale sulla tariffa (§6-bis.7).
    pub costo_orario_reale: Option<f64>,
    /// `importata` o `costo_reale`.
    pub fonte: String,
    /// Numero di task a cui è assegnata.
    pub task: i64,
    /// Somma delle unità assegnate.
    pub unita: f64,
}

pub fn risorse(conn: &Connection, pid: i64) -> Esito<Vec<RisorsaRiga>> {
    let mut st = conn
        .prepare(
            "SELECT r.id, r.name, r.type, r.std_rate, r.overtime_rate, r.cost_per_use,
                    r.real_hourly_cost, r.rate_source, COUNT(a.id), COALESCE(SUM(a.units), 0)
             FROM resource r LEFT JOIN assignment a ON a.resource_id = r.id
             WHERE r.project_id = ?1
             GROUP BY r.id ORDER BY r.name",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(RisorsaRiga {
                id: r.get(0)?,
                nome: r.get(1)?,
                tipo: r.get(2)?,
                tariffa: r.get(3)?,
                tariffa_straordinario: r.get(4)?,
                costo_per_uso: r.get(5)?,
                costo_orario_reale: r.get(6)?,
                fonte: r.get(7)?,
                task: r.get(8)?,
                unita: r.get(9)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

pub fn crea_risorsa(
    conn: &Connection,
    pid: i64,
    nome: &str,
    tipo: Option<&str>,
    tariffa: Option<f64>,
    tariffa_straordinario: Option<f64>,
) -> Esito<i64> {
    if nome.trim().is_empty() {
        return Err("il nome della risorsa è obbligatorio".into());
    }
    let tariffa = importo(tariffa, "la tariffa")?;
    let straordinario = importo(tariffa_straordinario, "la tariffa straordinaria")?;
    let gia: bool = conn
        .query_row(
            "SELECT count(*) FROM resource WHERE project_id = ?1 AND name = ?2",
            params![pid, nome.trim()],
            |r| r.get::<_, i64>(0),
        )
        .map_err(e)?
        > 0;
    if gia {
        return Err(format!("esiste già una risorsa «{}»", nome.trim()));
    }
    conn.execute(
        "INSERT INTO resource (project_id, name, type, std_rate, overtime_rate) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![pid, nome.trim(), tipo.filter(|t| !t.trim().is_empty()), tariffa, straordinario],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Imposta la tariffa importata di una risorsa.
pub fn imposta_tariffa(conn: &Connection, pid: i64, id: i64, tariffa: Option<f64>) -> Esito<()> {
    let tariffa = importo(tariffa, "la tariffa")?;
    let n = conn
        .execute("UPDATE resource SET std_rate = ?3 WHERE id = ?1 AND project_id = ?2", params![id, pid, tariffa])
        .map_err(e)?;
    if n == 0 {
        return Err("risorsa non trovata".into());
    }
    Ok(())
}

/// Imposta il costo orario reale verificato (Cap. 2). `None` lo rimuove e torna alla tariffa importata.
pub fn imposta_costo_reale(conn: &Connection, pid: i64, id: i64, costo: Option<f64>) -> Esito<()> {
    let costo = importo(costo, "il costo orario reale")?;
    let fonte = if costo.is_some() { "costo_reale" } else { "importata" };
    let n = conn
        .execute(
            "UPDATE resource SET real_hourly_cost = ?3, rate_source = ?4 WHERE id = ?1 AND project_id = ?2",
            params![id, pid, costo, fonte],
        )
        .map_err(e)?;
    if n == 0 {
        return Err("risorsa non trovata".into());
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssegnazioneRiga {
    pub id: i64,
    pub task_uid: String,
    pub task_nome: String,
    pub risorsa_id: i64,
    pub risorsa_nome: String,
    pub unita: f64,
}

pub fn assegnazioni(conn: &Connection, pid: i64) -> Esito<Vec<AssegnazioneRiga>> {
    let mut st = conn
        .prepare(
            "SELECT a.id, t.uid_source, t.name, r.id, r.name, a.units
             FROM assignment a
             JOIN task t ON t.id = a.task_id
             JOIN resource r ON r.id = a.resource_id
             WHERE t.project_id = ?1
             ORDER BY CAST(t.uid_source AS INTEGER), r.name",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(AssegnazioneRiga {
                id: r.get(0)?,
                task_uid: r.get(1)?,
                task_nome: r.get(2)?,
                risorsa_id: r.get(3)?,
                risorsa_nome: r.get(4)?,
                unita: r.get(5)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

/// Assegna una risorsa a un task di lavoro (non riepilogo) con unità positive.
pub fn crea_assegnazione(conn: &Connection, pid: i64, task_uid: &str, risorsa_id: i64, unita: f64) -> Esito<i64> {
    if !unita.is_finite() || unita <= 0.0 {
        return Err("le unità devono essere maggiori di zero (1 = 100%)".into());
    }
    let task_id: i64 = conn
        .query_row(
            "SELECT id FROM task WHERE project_id = ?1 AND uid_source = ?2 AND is_summary = 0",
            params![pid, task_uid],
            |r| r.get(0),
        )
        .optional()
        .map_err(e)?
        .ok_or_else(|| format!("task UID {task_uid} non trovato o di riepilogo"))?;
    let risorsa_del_progetto: bool = conn
        .query_row(
            "SELECT count(*) FROM resource WHERE id = ?1 AND project_id = ?2",
            params![risorsa_id, pid],
            |r| r.get::<_, i64>(0),
        )
        .map_err(e)?
        > 0;
    if !risorsa_del_progetto {
        return Err("risorsa non trovata".into());
    }
    conn.execute(
        "INSERT INTO assignment (task_id, resource_id, units) VALUES (?1, ?2, ?3)",
        params![task_id, risorsa_id, unita],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Modifica le unità di un'assegnazione esistente (1 = 100%).
pub fn imposta_unita_assegnazione(conn: &Connection, pid: i64, id: i64, unita: f64) -> Esito<()> {
    if !unita.is_finite() || unita <= 0.0 {
        return Err("le unità devono essere maggiori di zero (1 = 100%)".into());
    }
    let n = conn
        .execute(
            "UPDATE assignment SET units = ?3 WHERE id = ?1 AND task_id IN (SELECT id FROM task WHERE project_id = ?2)",
            params![id, pid, unita],
        )
        .map_err(e)?;
    if n == 0 {
        return Err("assegnazione non trovata".into());
    }
    Ok(())
}

pub fn elimina_assegnazione(conn: &Connection, pid: i64, id: i64) -> Esito<()> {
    let n = conn
        .execute(
            "DELETE FROM assignment WHERE id = ?1 AND task_id IN (SELECT id FROM task WHERE project_id = ?2)",
            params![id, pid],
        )
        .map_err(e)?;
    if n == 0 {
        return Err("assegnazione non trovata".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progetto::crea_progetto;
    use tempfile::tempdir;

    fn progetto() -> (tempfile::TempDir, Connection, i64) {
        let dir = tempdir().unwrap();
        let percorso = dir.path().join("p.evmproj");
        let info = crea_progetto(&percorso, "Prova").unwrap();
        let conn = crate::open_and_migrate(&percorso).unwrap();
        conn.execute("INSERT INTO task (project_id, uid_source, name) VALUES (?1, '1', 'Scavo')", [info.id]).unwrap();
        conn.execute("INSERT INTO task (project_id, uid_source, name, is_summary) VALUES (?1, '2', 'Fase', 1)", [info.id]).unwrap();
        (dir, conn, info.id)
    }

    #[test]
    fn risorsa_con_tariffa_e_costo_reale_che_prevale() {
        let (_d, conn, pid) = progetto();
        let id = crea_risorsa(&conn, pid, "Operaio", Some("lavoro"), Some(35.0), Some(52.5)).unwrap();
        assert!(crea_risorsa(&conn, pid, "Operaio", None, None, None).is_err(), "nome duplicato");
        imposta_costo_reale(&conn, pid, id, Some(48.0)).unwrap();
        let r = &risorse(&conn, pid).unwrap()[0];
        assert_eq!(r.fonte, "costo_reale");
        assert_eq!(r.costo_orario_reale, Some(48.0));
        imposta_costo_reale(&conn, pid, id, None).unwrap();
        assert_eq!(risorse(&conn, pid).unwrap()[0].fonte, "importata");
    }

    #[test]
    fn assegnazione_solo_a_task_di_lavoro_con_unita_positive() {
        let (_d, conn, pid) = progetto();
        let r = crea_risorsa(&conn, pid, "Ingegnere", None, Some(60.0), None).unwrap();
        assert!(crea_assegnazione(&conn, pid, "2", r, 1.0).is_err(), "riepilogo");
        assert!(crea_assegnazione(&conn, pid, "1", r, 0.0).is_err(), "unità nulle");
        let a = crea_assegnazione(&conn, pid, "1", r, 0.5).unwrap();
        let elenco = assegnazioni(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 1);
        assert_eq!(risorse(&conn, pid).unwrap()[0].unita, 0.5);
        elimina_assegnazione(&conn, pid, a).unwrap();
        assert!(assegnazioni(&conn, pid).unwrap().is_empty());
    }

    #[test]
    fn imposta_unita_valida_e_scrive() {
        let (_d, conn, pid) = progetto();
        let r = crea_risorsa(&conn, pid, "Ingegnere", None, Some(60.0), None).unwrap();
        let a = crea_assegnazione(&conn, pid, "1", r, 0.5).unwrap();
        assert!(imposta_unita_assegnazione(&conn, pid, a, 0.0).is_err(), "unità nulle");
        assert!(imposta_unita_assegnazione(&conn, pid, a, -1.0).is_err(), "unità negative");
        assert!(imposta_unita_assegnazione(&conn, pid, a + 999, 1.0).is_err(), "assegnazione inesistente");
        imposta_unita_assegnazione(&conn, pid, a, 1.0).unwrap();
        assert_eq!(assegnazioni(&conn, pid).unwrap()[0].unita, 1.0);
    }

    #[test]
    fn tariffa_negativa_rifiutata() {
        let (_d, conn, pid) = progetto();
        assert!(crea_risorsa(&conn, pid, "X", None, Some(-1.0), None).is_err());
    }
}
