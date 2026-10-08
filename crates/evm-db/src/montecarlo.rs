// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Persistenza delle esecuzioni Monte Carlo (`monte_carlo_run`, specifica Fase 5,
//! §3.6/§3.9: "esecuzioni salvate ... e riproducibili"). La simulazione gira nel
//! motore TypeScript (`packages/engine/src/montecarlo.ts`): questo modulo si limita a
//! salvare/elencare seed, parametri e un riassunto del risultato (percentili e
//! istogramma, non le `periods`/`costs` grezze di ogni iterazione — bastano a
//! ri-mostrare una run passata senza ricalcolarla, e restano piccoli anche a 5.000+
//! iterazioni).

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::tempo;

type Esito<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

const TIPI: [&str; 2] = ["velocity", "throughput"];

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EsecuzioneMonteCarlo {
    pub id: i64,
    pub tipo: String,
    pub n_iter: i64,
    pub seed: i64,
    pub parametri_json: String,
    pub risultato_json: String,
    pub creato_il: String,
}

/// Salva un'esecuzione Monte Carlo (seed e parametri per riprodurla, riassunto del
/// risultato già calcolato dal motore per ri-mostrarla senza ricalcolo).
pub fn monte_carlo_salva(
    conn: &Connection,
    pid: i64,
    tipo: &str,
    n_iter: i64,
    seed: i64,
    parametri_json: &str,
    risultato_json: &str,
) -> Esito<i64> {
    if !TIPI.contains(&tipo) {
        return Err(format!("tipo di simulazione non valido: {tipo}"));
    }
    if n_iter <= 0 {
        return Err("il numero di iterazioni deve essere positivo".into());
    }
    conn.execute(
        "INSERT INTO monte_carlo_run (project_id, kind, n_iter, seed, params_json, result_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![pid, tipo, n_iter, seed, parametri_json, risultato_json, tempo::adesso_iso()],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

/// Esecuzioni salvate per il progetto, più recenti prima; `tipo` filtra per
/// `velocity`/`throughput` (`None` = tutte).
pub fn monte_carlo_elenco(conn: &Connection, pid: i64, tipo: Option<&str>) -> Esito<Vec<EsecuzioneMonteCarlo>> {
    let mut st = conn
        .prepare(
            "SELECT id, kind, n_iter, seed, params_json, result_json, created_at
             FROM monte_carlo_run WHERE project_id = ?1 AND (?2 IS NULL OR kind = ?2) ORDER BY id DESC",
        )
        .map_err(e)?;
    let righe = st
        .query_map(params![pid, tipo], |r| {
            Ok(EsecuzioneMonteCarlo {
                id: r.get(0)?,
                tipo: r.get(1)?,
                n_iter: r.get(2)?,
                seed: r.get(3)?,
                parametri_json: r.get(4)?,
                risultato_json: r.get(5)?,
                creato_il: r.get(6)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
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
        (dir, conn, info.id)
    }

    #[test]
    fn si_salva_e_si_elenca_filtrando_per_tipo() {
        let (_d, conn, pid) = progetto();
        assert!(monte_carlo_salva(&conn, pid, "altro", 5000, 42, "{}", "{}").is_err(), "tipo non valido");
        assert!(monte_carlo_salva(&conn, pid, "velocity", 0, 42, "{}", "{}").is_err(), "iterazioni non positive");
        let id_v = monte_carlo_salva(&conn, pid, "velocity", 5000, 42, "{\"backlog\":100}", "{\"p50\":10}").unwrap();
        monte_carlo_salva(&conn, pid, "throughput", 5000, 7, "{\"backlog\":50}", "{\"p50\":6}").unwrap();

        let tutte = monte_carlo_elenco(&conn, pid, None).unwrap();
        assert_eq!(tutte.len(), 2);
        assert_eq!(tutte[0].tipo, "throughput", "più recente prima");

        let solo_velocity = monte_carlo_elenco(&conn, pid, Some("velocity")).unwrap();
        assert_eq!(solo_velocity.len(), 1);
        assert_eq!(solo_velocity[0].id, id_v);
        assert_eq!(solo_velocity[0].seed, 42);
    }
}
