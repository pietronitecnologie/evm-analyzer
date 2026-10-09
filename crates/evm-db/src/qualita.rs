// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Registro unico delle anomalie (specifica Fase 6, §1): il motore TypeScript calcola
//! già da tempo molti di questi avvisi (`packages/engine/src`), ma finora restavano
//! liste transitorie per schermata — nessuna persistenza, nessuna accettazione, nessuno
//! storico. Il motore resta l'unica fonte di verità sul *calcolo*: questo modulo si
//! limita a salvare il risultato in modo idempotente (`ricalcola_problemi`, chiamato dal
//! frontend con la lista fresca appena calcolata) così un'anomalia accettata non
//! scompare/riappare a ogni ricalcolo se la causa non cambia.

use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::controllo::{richiede_coordinatore_piano, richiede_uno_dei_ruoli};
use crate::tempo;

type Esito<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NuovoProblema {
    pub code: String,
    pub severity: String,
    pub category: String,
    pub task_uid: Option<String>,
    pub wbs_codice: Option<String>,
    pub scope_id: Option<i64>,
    pub message: String,
    pub suggestion: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProblemaRiga {
    pub id: i64,
    pub snapshot_id: Option<i64>,
    pub code: String,
    pub severity: String,
    pub category: String,
    pub task_uid: Option<String>,
    pub wbs_codice: Option<String>,
    pub scope_id: Option<i64>,
    pub message: String,
    pub suggestion: Option<String>,
    pub state: String,
    pub accepted_by: Option<String>,
    pub accepted_reason: Option<String>,
    pub accepted_at: Option<String>,
    pub resolved_at: Option<String>,
    pub source: String,
    pub created_at: String,
}

const SEVERITA: [&str; 3] = ["info", "avviso", "critico"];
const CATEGORIE: [&str; 10] = [
    "baseline", "metodo_ev", "costi", "date", "perimetro", "import", "avanzamento", "riserve", "agile", "flusso",
];
const FONTI: [&str; 5] = ["motore", "import_workbook", "import_piano", "avanzamento", "resync"];

pub fn elenco_problemi(conn: &Connection, pid: i64) -> Esito<Vec<ProblemaRiga>> {
    let mut st = conn
        .prepare(
            "SELECT i.id, i.snapshot_id, i.code, i.severity, i.category, t.uid_source, w.code, i.scope_id,
                    i.message, i.suggestion, i.state, i.accepted_by, i.accepted_reason, i.accepted_at,
                    i.resolved_at, i.source, i.created_at
             FROM data_quality_issue i
             LEFT JOIN task t ON t.id = i.task_id
             LEFT JOIN wbs w ON w.id = i.wbs_id
             WHERE i.project_id = ?1
             ORDER BY i.id DESC",
        )
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| {
            Ok(ProblemaRiga {
                id: r.get(0)?,
                snapshot_id: r.get(1)?,
                code: r.get(2)?,
                severity: r.get(3)?,
                category: r.get(4)?,
                task_uid: r.get(5)?,
                wbs_codice: r.get(6)?,
                scope_id: r.get(7)?,
                message: r.get(8)?,
                suggestion: r.get(9)?,
                state: r.get(10)?,
                accepted_by: r.get(11)?,
                accepted_reason: r.get(12)?,
                accepted_at: r.get(13)?,
                resolved_at: r.get(14)?,
                source: r.get(15)?,
                created_at: r.get(16)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(righe)
}

#[derive(Debug, Serialize, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConteggioProblemi {
    pub critici: i64,
    pub avvisi: i64,
    pub info: i64,
}

/// Conteggio delle anomalie aperte per gravità (barra di stato, specifica §1.3).
pub fn conteggio_problemi(conn: &Connection, pid: i64) -> Esito<ConteggioProblemi> {
    let mut c = ConteggioProblemi::default();
    let mut st = conn
        .prepare("SELECT severity, COUNT(*) FROM data_quality_issue WHERE project_id = ?1 AND state = 'aperta' GROUP BY severity")
        .map_err(e)?;
    let righe = st
        .query_map([pid], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    for (sev, n) in righe {
        match sev.as_str() {
            "critico" => c.critici = n,
            "avviso" => c.avvisi = n,
            "info" => c.info = n,
            _ => {}
        }
    }
    Ok(c)
}

fn id_task_da_uid(conn: &Connection, pid: i64, uid: Option<&str>) -> Esito<Option<i64>> {
    let Some(uid) = uid else { return Ok(None) };
    conn.query_row("SELECT id FROM task WHERE project_id = ?1 AND uid_source = ?2", params![pid, uid], |r| r.get(0))
        .optional()
        .map_err(e)
}

fn id_wbs_da_codice(conn: &Connection, pid: i64, codice: Option<&str>) -> Esito<Option<i64>> {
    let Some(codice) = codice else { return Ok(None) };
    conn.query_row("SELECT id FROM wbs WHERE project_id = ?1 AND code = ?2", params![pid, codice], |r| r.get(0))
        .optional()
        .map_err(e)
}

#[derive(Debug, Serialize, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RiepilogoRicalcolo {
    pub nuove: i64,
    pub riaperte: i64,
    pub risolte: i64,
}

/// Ricalcolo idempotente delle anomalie di una fonte (specifica §1.2): la lista fresca
/// (`freschi`, già calcolata dal motore nel frontend) sostituisce lo stato *aperto* delle
/// anomalie di questa fonte/snapshot — le `accettata` non toccate se ancora presenti, le
/// `aperta` non più presenti diventano `risolta`, le `risolta` che riappaiono tornano
/// `aperta`.
pub fn ricalcola_problemi(
    conn: &mut Connection,
    pid: i64,
    snapshot_id: Option<i64>,
    source: &str,
    freschi: Vec<NuovoProblema>,
) -> Esito<RiepilogoRicalcolo> {
    if !FONTI.contains(&source) {
        return Err(format!("fonte non valida: {source}"));
    }
    for p in &freschi {
        if !SEVERITA.contains(&p.severity.as_str()) {
            return Err(format!("gravità non valida: {}", p.severity));
        }
        if !CATEGORIE.contains(&p.category.as_str()) {
            return Err(format!("categoria non valida: {}", p.category));
        }
    }
    let tx = conn.transaction().map_err(e)?;
    let mut st = tx
        .prepare(
            "SELECT id, code, task_id, wbs_id, state FROM data_quality_issue
             WHERE project_id = ?1 AND source = ?2 AND (snapshot_id = ?3 OR (snapshot_id IS NULL AND ?3 IS NULL))
               AND state IN ('aperta', 'accettata')",
        )
        .map_err(e)?;
    let esistenti: Vec<(i64, String, Option<i64>, Option<i64>)> = st
        .query_map(params![pid, source, snapshot_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    drop(st);
    let mut rimaste: HashMap<(String, Option<i64>, Option<i64>), i64> =
        esistenti.into_iter().map(|(id, code, tid, wid)| ((code, tid, wid), id)).collect();

    let mut riepilogo = RiepilogoRicalcolo::default();
    for p in freschi {
        let task_id = id_task_da_uid(&tx, pid, p.task_uid.as_deref())?;
        let wbs_id = id_wbs_da_codice(&tx, pid, p.wbs_codice.as_deref())?;
        let chiave = (p.code.clone(), task_id, wbs_id);
        if let Some(id) = rimaste.remove(&chiave) {
            tx.execute(
                "UPDATE data_quality_issue SET severity = ?2, category = ?3, message = ?4, suggestion = ?5 WHERE id = ?1",
                params![id, p.severity, p.category, p.message, p.suggestion],
            )
            .map_err(e)?;
            continue;
        }
        let gia_risolta: Option<i64> = tx
            .query_row(
                "SELECT id FROM data_quality_issue
                 WHERE project_id = ?1 AND source = ?2 AND (snapshot_id = ?3 OR (snapshot_id IS NULL AND ?3 IS NULL))
                   AND code = ?4 AND (task_id = ?5 OR (task_id IS NULL AND ?5 IS NULL))
                   AND (wbs_id = ?6 OR (wbs_id IS NULL AND ?6 IS NULL)) AND state = 'risolta'",
                params![pid, source, snapshot_id, p.code, task_id, wbs_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(e)?;
        if let Some(id) = gia_risolta {
            tx.execute(
                "UPDATE data_quality_issue SET state = 'aperta', resolved_at = NULL, severity = ?2, category = ?3, message = ?4, suggestion = ?5 WHERE id = ?1",
                params![id, p.severity, p.category, p.message, p.suggestion],
            )
            .map_err(e)?;
            riepilogo.riaperte += 1;
        } else {
            tx.execute(
                "INSERT INTO data_quality_issue (project_id, snapshot_id, code, severity, category, task_id, wbs_id, scope_id, message, suggestion, state, source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'aperta', ?11, ?12)",
                params![pid, snapshot_id, p.code, p.severity, p.category, task_id, wbs_id, p.scope_id, p.message, p.suggestion, source, tempo::adesso_iso()],
            )
            .map_err(e)?;
            riepilogo.nuove += 1;
        }
    }
    for (_, id) in rimaste {
        tx.execute(
            "UPDATE data_quality_issue SET state = 'risolta', resolved_at = ?2 WHERE id = ?1",
            params![id, tempo::adesso_iso()],
        )
        .map_err(e)?;
        riepilogo.risolte += 1;
    }
    tx.commit().map_err(e)?;
    Ok(riepilogo)
}

/// Accetta un'anomalia con motivo obbligatorio; riservato a `supervisore`/`coordinatore_piano`.
pub fn accetta_problema(conn: &Connection, pid: i64, attore_id: Option<i64>, id: i64, motivo: &str) -> Esito<()> {
    let nome = richiede_uno_dei_ruoli(conn, attore_id, &["supervisore", "coordinatore_piano"])?;
    if motivo.trim().is_empty() {
        return Err("il motivo dell'accettazione è obbligatorio".into());
    }
    let cambiate = conn
        .execute(
            "UPDATE data_quality_issue SET state = 'accettata', accepted_by = ?3, accepted_reason = ?4, accepted_at = ?5
             WHERE id = ?1 AND project_id = ?2 AND state = 'aperta'",
            params![id, pid, nome, motivo.trim(), tempo::adesso_iso()],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("anomalia non trovata o non aperta".into());
    }
    Ok(())
}

/// Riapre un'anomalia accettata o risolta (nessun ruolo richiesto, a differenza dell'accettazione).
pub fn riapri_problema(conn: &Connection, pid: i64, id: i64) -> Esito<()> {
    let cambiate = conn
        .execute(
            "UPDATE data_quality_issue SET state = 'aperta', accepted_by = NULL, accepted_reason = NULL, accepted_at = NULL, resolved_at = NULL
             WHERE id = ?1 AND project_id = ?2 AND state != 'aperta'",
            params![id, pid],
        )
        .map_err(e)?;
    if cambiate == 0 {
        return Err("anomalia non trovata o già aperta".into());
    }
    Ok(())
}

/// Marca una data di stato come definitiva. Bloccato se ci sono anomalie critiche aperte,
/// a meno di un motivo esplicito del coordinatore del piano (specifica §1.3).
pub fn marca_snapshot_finale(conn: &Connection, pid: i64, attore_id: Option<i64>, snapshot_id: i64, motivo_override: Option<&str>) -> Esito<()> {
    let critiche_aperte: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM data_quality_issue WHERE project_id = ?1 AND snapshot_id = ?2 AND severity = 'critico' AND state = 'aperta'",
            params![pid, snapshot_id],
            |r| r.get(0),
        )
        .map_err(e)?;
    if critiche_aperte > 0 {
        let motivo = motivo_override
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| format!("{critiche_aperte} anomalie critiche aperte: indica un motivo per forzare lo stato finale"))?;
        let nome = richiede_coordinatore_piano(conn, attore_id)?;
        conn.execute(
            "UPDATE status_snapshot SET state = 'finale', final_override_by = ?3, final_override_reason = ?4 WHERE id = ?1 AND project_id = ?2",
            params![snapshot_id, pid, nome, motivo],
        )
        .map_err(e)?;
        return Ok(());
    }
    conn.execute(
        "UPDATE status_snapshot SET state = 'finale', final_override_by = NULL, final_override_reason = NULL WHERE id = ?1 AND project_id = ?2",
        params![snapshot_id, pid],
    )
    .map_err(e)?;
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
        (dir, conn, info.id)
    }

    fn supervisore(conn: &Connection) -> i64 {
        conn.execute("INSERT INTO user_profile (user_uid, display_name) VALUES ('sup', 'Supervisore')", []).unwrap();
        let id = conn.last_insert_rowid();
        conn.execute("INSERT INTO user_role (user_profile_id, role) VALUES (?1, 'supervisore')", [id]).unwrap();
        id
    }

    fn problema(code: &str, severity: &str) -> NuovoProblema {
        NuovoProblema {
            code: code.into(),
            severity: severity.into(),
            category: "costi".into(),
            task_uid: None,
            wbs_codice: None,
            scope_id: None,
            message: format!("messaggio {code}"),
            suggestion: None,
        }
    }

    #[test]
    fn ricalcolo_crea_mantiene_accettate_e_risolve_le_sparite() {
        let (_d, mut conn, pid) = progetto();
        let r = ricalcola_problemi(&mut conn, pid, None, "motore", vec![problema("WBS_NO_BUDGET", "avviso"), problema("Q007", "avviso")]).unwrap();
        assert_eq!(r.nuove, 2);
        let elenco = elenco_problemi(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 2);
        let id_wbs = elenco.iter().find(|p| p.code == "WBS_NO_BUDGET").unwrap().id;

        let coord = supervisore(&conn);
        accetta_problema(&conn, pid, Some(coord), id_wbs, "Budget in arrivo dal cliente").unwrap();

        // Ricalcolo: Q007 sparisce (risolto), WBS_NO_BUDGET resta (ancora prodotto) e deve restare accettata.
        let r2 = ricalcola_problemi(&mut conn, pid, None, "motore", vec![problema("WBS_NO_BUDGET", "avviso")]).unwrap();
        assert_eq!(r2.risolte, 1, "Q007 non più prodotto");
        let elenco = elenco_problemi(&conn, pid).unwrap();
        let wbs = elenco.iter().find(|p| p.code == "WBS_NO_BUDGET").unwrap();
        assert_eq!(wbs.state, "accettata", "non deve perdere l'accettazione");
        let q007 = elenco.iter().find(|p| p.code == "Q007").unwrap();
        assert_eq!(q007.state, "risolta");

        // Ricalcolo: Q007 riappare -> torna aperta, non duplicata.
        let r3 = ricalcola_problemi(&mut conn, pid, None, "motore", vec![problema("WBS_NO_BUDGET", "avviso"), problema("Q007", "avviso")]).unwrap();
        assert_eq!(r3.riaperte, 1);
        let elenco = elenco_problemi(&conn, pid).unwrap();
        assert_eq!(elenco.len(), 2, "nessuna riga duplicata");
    }

    #[test]
    fn accettazione_richiede_ruolo_e_motivo() {
        let (_d, mut conn, pid) = progetto();
        ricalcola_problemi(&mut conn, pid, None, "motore", vec![problema("WBS_NO_BUDGET", "critico")]).unwrap();
        let id = elenco_problemi(&conn, pid).unwrap()[0].id;
        assert!(accetta_problema(&conn, pid, None, id, "motivo").is_err(), "richiede attore");
        let coord = supervisore(&conn);
        assert!(accetta_problema(&conn, pid, Some(coord), id, "  ").is_err(), "richiede motivo");
        accetta_problema(&conn, pid, Some(coord), id, "Rischio noto, mitigato altrove").unwrap();
        assert!(riapri_problema(&conn, pid, id).is_ok());
        assert_eq!(elenco_problemi(&conn, pid).unwrap()[0].state, "aperta");
    }

    #[test]
    fn snapshot_finale_bloccato_da_critiche_salvo_motivo_del_coordinatore() {
        let (_d, mut conn, pid) = progetto();
        conn.execute("INSERT INTO status_snapshot (project_id, status_date, source) VALUES (?1, '2026-01-10', 'manuale')", [pid]).unwrap();
        let snap = conn.last_insert_rowid();
        ricalcola_problemi(&mut conn, pid, Some(snap), "motore", vec![problema("Q001", "critico")]).unwrap();

        assert!(marca_snapshot_finale(&conn, pid, None, snap, None).is_err(), "critica aperta senza motivo");
        let coord = supervisore(&conn); // ruolo supervisore non basta per forzare il finale
        assert!(marca_snapshot_finale(&conn, pid, Some(coord), snap, Some("forzo")).is_err(), "richiede coordinatore_piano");

        conn.execute("INSERT INTO user_role (user_profile_id, role) VALUES (?1, 'coordinatore_piano')", [coord]).unwrap();
        marca_snapshot_finale(&conn, pid, Some(coord), snap, Some("Accettato il rischio residuo")).unwrap();
        let stato: String = conn.query_row("SELECT state FROM status_snapshot WHERE id = ?1", [snap], |r| r.get(0)).unwrap();
        assert_eq!(stato, "finale");
    }
}
