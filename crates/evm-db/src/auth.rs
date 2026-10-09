// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Autenticazione per-progetto (richiesta esplicita, oltre le Fasi 5/6): il profilo
//! utente (user_profile/user_role, Fase 4-ter) porta ora una password con hash
//! (Argon2id via la crate `argon2`, mai in chiaro). Nessuna sessione persistita su
//! disco: il login vale per l'apertura corrente del progetto (project-context-store
//! lato UI, reimpostato a ogni apertura/chiusura di progetto — invariato da questa
//! funzionalità, già così dalla selezione "Acting as" che questa sostituisce).

use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::Argon2;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

type Esito<T> = Result<T, String>;

fn errore<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Argon2id con parametri di default e salto casuale generato internamente
/// (`getrandom`, feature di `argon2` abilitata di default) a ogni chiamata.
pub(crate) fn hash_password(password: &str) -> Esito<String> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(errore)
}

fn verifica_password(password: &str, hash: &str) -> bool {
    Argon2::default().verify_password(password.as_bytes(), hash).is_ok()
}

/// Se il progetto non ha ancora nessun utente (nuovo, o mai popolato prima di questa
/// funzionalità), crea l'amministratore di default `admin`/`admin`. Gira a ogni
/// apertura (vedi `open_and_migrate`): economico (un `COUNT`) e autoriparante — un
/// progetto rimasto senza utenti non lascerebbe altrimenti più entrare nessuno,
/// perché la UI nasconde tutto dietro la pagina di login non appena un progetto è
/// aperto (nessun percorso per creare il primo utente da uno stato non autenticato).
pub fn assicura_utente_default(conn: &Connection) -> rusqlite::Result<()> {
    let totale: i64 = conn.query_row("SELECT COUNT(*) FROM user_profile", [], |r| r.get(0))?;
    if totale > 0 {
        return Ok(());
    }
    // Hash di una password fissa e nota: non può fallire per input dell'utente,
    // solo per un generatore di numeri casuali del sistema operativo assente.
    let hash = hash_password("admin").expect("hash di 'admin' con Argon2 di default");
    conn.execute(
        "INSERT INTO user_profile (user_uid, display_name, password_hash, active)
         VALUES ('admin', 'Administrator', ?1, 1)",
        [hash],
    )?;
    let id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO user_role (user_profile_id, role) VALUES (?1, 'amministratore')",
        [id],
    )?;
    Ok(())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UtenteAutenticato {
    pub id: i64,
    pub uid: String,
    pub nome: String,
    pub ruoli: Vec<String>,
}

fn ruoli_di(conn: &Connection, user_id: i64) -> Esito<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT role FROM user_role WHERE user_profile_id = ?1 ORDER BY role")
        .map_err(errore)?;
    let ruoli = stmt
        .query_map([user_id], |r| r.get(0))
        .map_err(errore)?
        .collect::<rusqlite::Result<Vec<String>>>()
        .map_err(errore)?;
    Ok(ruoli)
}

/// Verifica le credenziali e restituisce l'identità autenticata. Lo stesso messaggio
/// generico per utente inesistente, disattivato o password sbagliata: non svela quali
/// identificativi esistono nel progetto.
pub fn accedi(conn: &Connection, user_uid: &str, password: &str) -> Esito<UtenteAutenticato> {
    let riga: Option<(i64, String, Option<String>, bool)> = conn
        .query_row(
            "SELECT id, display_name, password_hash, active FROM user_profile WHERE user_uid = ?1",
            [user_uid],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i64>(3)? != 0)),
        )
        .optional()
        .map_err(errore)?;
    let non_valido = || "identificativo o password non validi".to_string();
    let (id, nome, hash, attivo) = riga.ok_or_else(non_valido)?;
    if !attivo {
        return Err(non_valido());
    }
    let hash = hash.ok_or_else(non_valido)?;
    if !verifica_password(password, &hash) {
        return Err(non_valido());
    }
    let ruoli = ruoli_di(conn, id)?;
    Ok(UtenteAutenticato { id, uid: user_uid.to_string(), nome, ruoli })
}

/// Cambia la password di un utente: richiede la password attuale (chi è già
/// autenticato come un altro utente non può cambiare la password altrui da qui —
/// quello è un reset, azione distinta riservata all'amministratore).
pub fn cambia_password(conn: &Connection, user_id: i64, attuale: &str, nuova: &str) -> Esito<()> {
    if nuova.len() < 4 {
        return Err("la nuova password deve avere almeno 4 caratteri".into());
    }
    let hash: Option<String> = conn
        .query_row(
            "SELECT password_hash FROM user_profile WHERE id = ?1",
            [user_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(errore)?
        .flatten();
    let hash = hash.ok_or("utente non trovato")?;
    if !verifica_password(attuale, &hash) {
        return Err("password attuale non corretta".into());
    }
    let nuovo_hash = hash_password(nuova)?;
    conn.execute(
        "UPDATE user_profile SET password_hash = ?2 WHERE id = ?1",
        params![user_id, nuovo_hash],
    )
    .map_err(errore)?;
    Ok(())
}

/// Reset della password di un utente da parte di un amministratore: nessuna verifica
/// della password attuale (è il percorso per sbloccare un utente che l'ha persa).
pub fn reimposta_password(conn: &Connection, attore_id: Option<i64>, user_id: i64, nuova: &str) -> Esito<()> {
    crate::controllo::richiede_uno_dei_ruoli(conn, attore_id, &["amministratore"])?;
    if nuova.len() < 4 {
        return Err("la nuova password deve avere almeno 4 caratteri".into());
    }
    let nuovo_hash = hash_password(nuova)?;
    let cambiate = conn
        .execute(
            "UPDATE user_profile SET password_hash = ?2 WHERE id = ?1",
            params![user_id, nuovo_hash],
        )
        .map_err(errore)?;
    if cambiate == 0 {
        return Err("utente non trovato".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn_con_utenti() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE user_profile (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_uid TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                password_hash TEXT,
                active INTEGER NOT NULL DEFAULT 1
             );
             CREATE TABLE user_role (
                user_profile_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                PRIMARY KEY (user_profile_id, role)
             );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn un_progetto_vuoto_riceve_l_amministratore_di_default() {
        let conn = conn_con_utenti();
        assicura_utente_default(&conn).unwrap();
        let utente = accedi(&conn, "admin", "admin").unwrap();
        assert_eq!(utente.ruoli, vec!["amministratore".to_string()]);

        // Idempotente: non raddoppia l'utente se chiamata di nuovo (es. a ogni apertura).
        assicura_utente_default(&conn).unwrap();
        let totale: i64 = conn.query_row("SELECT COUNT(*) FROM user_profile", [], |r| r.get(0)).unwrap();
        assert_eq!(totale, 1);
    }

    #[test]
    fn un_progetto_con_utenti_gia_propri_non_riceve_l_amministratore() {
        let conn = conn_con_utenti();
        conn.execute(
            "INSERT INTO user_profile (user_uid, display_name, password_hash) VALUES ('mario', 'Mario Rossi', 'x')",
            [],
        )
        .unwrap();
        assicura_utente_default(&conn).unwrap();
        let totale: i64 = conn.query_row("SELECT COUNT(*) FROM user_profile", [], |r| r.get(0)).unwrap();
        assert_eq!(totale, 1, "non deve aggiungere admin se esistono già utenti");
    }

    #[test]
    fn credenziali_sbagliate_danno_lo_stesso_messaggio_generico() {
        let conn = conn_con_utenti();
        assicura_utente_default(&conn).unwrap();
        let errore_pw = accedi(&conn, "admin", "sbagliata").unwrap_err();
        let errore_uid = accedi(&conn, "fantasma", "qualsiasi").unwrap_err();
        assert_eq!(errore_pw, errore_uid);
    }

    #[test]
    fn un_utente_disattivato_non_entra() {
        let conn = conn_con_utenti();
        assicura_utente_default(&conn).unwrap();
        conn.execute("UPDATE user_profile SET active = 0 WHERE user_uid = 'admin'", []).unwrap();
        assert!(accedi(&conn, "admin", "admin").is_err());
    }

    #[test]
    fn si_puo_cambiare_la_propria_password_solo_conoscendo_quella_attuale() {
        let conn = conn_con_utenti();
        assicura_utente_default(&conn).unwrap();
        let id = accedi(&conn, "admin", "admin").unwrap().id;
        assert!(cambia_password(&conn, id, "sbagliata", "nuovapw").is_err());
        cambia_password(&conn, id, "admin", "nuovapw").unwrap();
        assert!(accedi(&conn, "admin", "admin").is_err(), "la vecchia password non funziona più");
        accedi(&conn, "admin", "nuovapw").unwrap();
    }

    #[test]
    fn il_reset_richiede_il_ruolo_amministratore_e_non_la_password_attuale() {
        let conn = conn_con_utenti();
        assicura_utente_default(&conn).unwrap();
        conn.execute(
            "INSERT INTO user_profile (user_uid, display_name, password_hash) VALUES ('mario', 'Mario Rossi', NULL)",
            [],
        )
        .unwrap();
        let mario_id = conn.last_insert_rowid();
        let admin_id = accedi(&conn, "admin", "admin").unwrap().id;

        assert!(
            reimposta_password(&conn, None, mario_id, "nuovapw").is_err(),
            "senza attore non è amministratore"
        );
        reimposta_password(&conn, Some(admin_id), mario_id, "nuovapw").unwrap();
        accedi(&conn, "mario", "nuovapw").unwrap();
    }
}
