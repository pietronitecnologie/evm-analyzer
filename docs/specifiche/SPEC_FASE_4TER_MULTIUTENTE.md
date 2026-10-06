# SPECIFICA FASE 4-ter — Perimetri, pacchetti e consolidamento multi-utente

Documento **autosufficiente**. Prerequisiti: Fasi 1–4-bis (DB, motore, import del piano, avanzamento con approvazione, feed, verifica). L'app è **desktop, offline, senza server**: più utenti = più installazioni che si scambiano **file pacchetto**. **Non usare mai** un file SQLite condiviso su cartella di rete (rischio di corruzione): la scelta va in `DECISIONS.md`.

## 0. Ambito
**Consegna:** profili utente e ruoli cumulabili, perimetri (regole, risoluzione, sovrapposizioni, orfani), pacchetti `.evmwork`, `.evmprog`, `aggiornamento_piano`, importazione idempotente con conflitti, copertura e EVM per perimetro/progetto (provvisorio/finale), feed parziale e consolidato, firma Ed25519 opzionale, schermate *Perimetri e utenti* e *Consolidamento pacchetti*. **Fuori ambito:** sincronizzazione in tempo reale, server, autenticazione forte (le identità sono locali).

## 1. Modello dati (migrazione)
```sql
user_profile(id, user_uid TEXT UNIQUE, display_name, roles_json, public_key NULL, active);   -- roles: project_engineer|supervisore|coordinatore_piano|amministratore (insieme non vuoto)
scope(id, project_id, name, rule_kind, rule_json, owner_user_id, approver_user_id, plan_hash, resolved_at);
scope_task(scope_id, task_id, uid_source, added_by, added_at);
progress_package(id TEXT PRIMARY KEY /*UUID v4*/, project_id, kind, scope_id, from_user_id, created_at,
                 status_date, plan_hash, schema_version, content_hash, signature NULL,
                 imported_at NULL, import_result_json NULL);
package_conflict(id, project_id, snapshot_id, task_id, package_a_id, package_b_id, field,
                 value_a, value_b, resolution NULL, resolution_value NULL, reason NULL, resolved_by NULL, resolved_at NULL);
```
`progress_entry` e `feed_batch` portano anche `scope_id` e `package_id` (provenienza). `rule_kind` ∈ `wbs`, `filone`, `control_account`, `task_list`, `risorsa`, `mista`. Le identità sono **locali** (nessun server): documentalo nelle Informazioni e in `DECISIONS.md` — non sono un confine di sicurezza contro un utente malevolo.

## 2. Ruoli e permessi (applicati nel backend Rust)
Ruoli **cumulabili senza vincoli** (nei progetti piccoli una sola persona li ricopre tutti). I permessi di un utente sono l'**unione** dei suoi ruoli.
| Azione | project_engineer | supervisore (direttore tecnico) | coordinatore_piano | amministratore |
|---|---|---|---|---|
| Inserire/inviare avanzamento nel proprio perimetro | ✔ | | | |
| Approvare/respingere avanzamento (perimetri assegnati) | | ✔ | | |
| Definire perimetri, utenti, esportare `.evmwork` | | | ✔ | |
| Importare `.evmprog`, risolvere conflitti | | | ✔ | |
| Generare feed (parziale del proprio perimetro / consolidato) | parziale se abilitato | feed del perimetro | consolidato | |
| Baseline, change request, snapshot `finale` | sola lettura | sola lettura | gestione | |
| Impostazioni complete | solo aspetto | solo aspetto | | ✔ |
Auto-approvazione: come in Fase 4-bis (consentita se l'utente ha anche `supervisore`, sempre tracciata).
L'**utente corrente** è scelto all'avvio (profilo locale) e mostrato nella barra di contesto; le azioni scrivono sempre `user_uid` in `audit_log`.

## 3. Perimetri
1. **Definizione:** per sottoalbero WBS, filone, control account, elenco esplicito di task (chiavi `uid_source`), risorsa/responsabile, o combinazione (`mista`, con operatori E/O). **Dinamico** (regola, es. «tutti i task sotto WBS 2.3») o **statico** (elenco di chiavi). Risolto in `scope_task` a un dato `plan_hash`.
2. **Un solo perimetro attivo per task e status date** (default). Sovrapposizioni: avviso o blocco (impostazione), elencate; **task orfani** (non coperti da alcun perimetro) elencati al coordinatore.
3. I task `summary` **non sono mai** editabili né alimentati: mostrano il roll-up del motore.
4. **Ri-sincronizzazione del piano:** per i perimetri dinamici ricalcola `scope_task`; task nuovi → notifica «nuovo task nel tuo perimetro»; task spariti → «task rimosso dal piano» (le entry già approvate restano per storico, marcate `orfane`).
5. Per ogni utente l'interfaccia mostra **solo il proprio perimetro in modifica**; i task fuori perimetro sono nascosti o in sola lettura attenuati (impostazione). Celle bloccate con lucchetto e tooltip «Task fuori dal tuo perimetro».
6. **Verifica di partizione** (test e controllo in UI): `Σ perimetri = progetto` (nessun orfano, nessuna sovrapposizione); mostra la **mappa di copertura** (treemap della WBS colorata per perimetro; orfani in rosso tratteggiato; sovrapposizioni in viola).

## 4. Pacchetti
### 4.1 Formato comune
File ZIP con estensione `.evmwork` | `.evmprog` | `.evmplan`, contenente: `manifest.json`, `payload.json`, (opz.) `audit_extract.json`, (opz.) `signature.sig`.
`manifest.json`:
```json
{ "package_id":"<uuid v4>", "kind":"lavoro|avanzamento|aggiornamento_piano", "schema_version":1,
  "app_version":"x.y.z", "project_id":"<uuid progetto>", "project_name":"…",
  "scope":{"id":"…","name":"…","rule_kind":"…","rule_json":{}}, "from_user":{"user_uid":"…","display_name":"…"},
  "created_at":"ISO-8601 UTC", "status_date":"YYYY-MM-DD", "plan_hash":"sha256:…",
  "content_hash":"sha256:…", "signature":{"alg":"ed25519","public_key":"base64","sig":"base64"} }
```
- `content_hash` = SHA-256 della forma **canonica** del `payload.json` (JSON ordinato per chiave, UTF-8, senza spazi superflui; JCS RFC 8785) ⇒ stesso payload, stesso hash su ogni piattaforma.
- **`.evmwork` (pacchetto di lavoro, coordinatore → utente):** `payload` = task del perimetro (chiave, WBS, nome, metodo EV, peso, date pianificate, dati di baseline, risorse), ultimo stato **approvato** per ciascun task, parametri necessari al motore (soglie, base EV, calendario), definizione del perimetro.
- **`.evmprog` (pacchetto di avanzamento, utente → coordinatore):** `payload` = elenco di `progress_entry` in stato `inviato` o `approvato` per la status date, con tutti i campi (chiave del task, metodo, %, unità, milestone, date, ore, AC, segnale indipendente, nota, autore, timestamp, eventuale approvazione); estratto di `audit_log` relativo alle entry.
- **`.evmplan` (aggiornamento piano, coordinatore → utenti):** `payload` = per i task del perimetro nuove date, durate residue, float, flag critico, dopo il re-import (Fase 4-bis, §7.3); l'utente non ha bisogno del file di piano né di MS Project.
- **Dimensioni:** pacchetto di 5.000 entry < 5 MB; creazione e importazione < 3 s.

### 4.2 Modalità di lavoro
- **Pacchetto (consigliata):** il coordinatore importa l'export del piano, definisce i perimetri, esporta un `.evmwork` per utente; l'utente lo importa nella propria installazione (si crea un progetto locale di sola lavorazione, `plan_hash` registrato), inserisce l'avanzamento e, quando ha l'approvazione, esporta un `.evmprog`.
- **Diretta:** l'utente importa l'export del piano e seleziona il proprio perimetro; registra `plan_hash` e perimetro; in esportazione produce comunque un `.evmprog`.

### 4.3 Importazione di un pacchetto (coordinatore)
Idempotente per `package_id`: lo stesso pacchetto importato due volte non cambia nulla (secondo import → messaggio «già importato il …»). Controlli, nell'ordine:
1. **Struttura e schema:** `schema_version` supportata (altrimenti blocco con messaggio), JSON valido, campi obbligatori.
2. **Integrità:** ricalcola `content_hash` e confronta. Diverso → **blocco**.
3. **Firma** (se presente): verifica Ed25519 contro la chiave pubblica registrata in `user_profile.public_key`; firma non valida → blocco (o avviso, secondo impostazione `firma_obbligatoria`); pacchetto non firmato → avviso o blocco secondo impostazione.
4. **Progetto:** `project_id` diverso → blocco.
5. **`plan_hash`** diverso da quello corrente → **blocco** o avviso con l'elenco dei task interessati (scelta del coordinatore), mai applicazione silenziosa.
6. **Status date** diversa da quella aperta → richiede conferma; pacchetto più vecchio dell'ultimo approvato → segnalato.
7. **Perimetro:** entry con chiave fuori dal perimetro dichiarato → **rifiutate** una per una (elenco).
8. **Validazioni di entry** (V001–V016 della Fase 4-bis) a ogni entry importata.
9. **Conflitti:** due pacchetti con lo stesso task e valori diversi per la stessa status date → record in `package_conflict`; nulla viene sovrascritto senza traccia.
Esito: per entry *accettata / rifiutata / in conflitto* (mostrato nel pannello di consolidamento) e salvato in `import_result_json`.

### 4.4 Risoluzione dei conflitti
Per ogni conflitto il coordinatore sceglie **valore A**, **valore B** o **valore manuale**, con **motivo obbligatorio**; `resolved_by/at` registrati; la scelta entra in `audit_log`. I campi in conflitto restano in stato `in_conflitto` (colore viola) e **non** entrano nel feed né nell'EVM finale finché non risolti.

### 4.5 Firma opzionale
Ogni utente può generare una coppia **Ed25519** (crate `ed25519-dalek`): chiave privata salvata nel **portachiavi del sistema** (`keyring`) o in file cifrato con password; chiave pubblica in `user_profile.public_key` e registrata dal coordinatore. Firma sul `content_hash` (stringa esadecimale). Schermata *Utenti e ruoli*: genera/importa/esporta la chiave pubblica; mostra l'impronta (primi 16 caratteri dell'hash SHA-256 della chiave) per la verifica a voce.

## 5. Copertura ed EVM parziale
- Per ogni status date mostra la **copertura** per perimetro e per utente: % di task e % di BAC con avanzamento **approvato**, task «stale» (età in status date), pacchetti **attesi e non ricevuti**.
- **EVM di perimetro** (PV/EV/AC/CV/SV/CPI/SPI/EAC): calcolato sui soli task del perimetro dal motore.
- **Identità da testare:** se i perimetri partizionano il piano e la copertura è completa, **Σ EV/PV/AC dei perimetri = EV/PV/AC di progetto**.
- **EVM di progetto:** usa l'ultimo avanzamento approvato di ciascun task ed è marcato **`provvisorio`** se la copertura (in % di BAC) è sotto la soglia di parametro (default 100% per `finale`); mostra la quota di BAC non aggiornata. Snapshot **`finale`** solo con copertura sopra soglia o con approvazione esplicita del coordinatore con motivo (registrata).
- Gli indici di un perimetro incompleto non si confrontano con le soglie di semaforo **senza mostrare la copertura accanto** (badge «Provvisorio» in arancione).
- I task senza avanzamento approvato per la status date usano l'ultimo valore approvato precedente («stale») ed entrano nel conteggio con avviso.

## 6. Feed parziale e consolidato
- Feed generato **solo per task approvati** del perimetro scelto (`feed_batch.scope_id`), o consolidato per più perimetri; mai per task fuori perimetro o `summary`.
- I valori sono assoluti e i perimetri disgiunti ⇒ l'applicazione di più feed parziali è **commutativa e idempotente**: l'ordine non cambia il risultato (test).
- La **Status Date di progetto** la scrive solo il feed consolidato del coordinatore (o un feed parziale con opzione esplicita), per evitare date diverse.
- Verifica post-aggiornamento per batch/perimetro; il coordinatore vede un riepilogo complessivo per utente (applicato/ricalcolato/non applicato).

## 7. Schermate
- **Perimetri e utenti** (coordinatore): a sinistra elenco perimetri (`Nome | Tipo regola | Proprietario | Approvatore | N. task | % BAC`); a destra editor con tab *Regola* (costruttore a condizioni), *Task risolti* (rimozioni/aggiunte manuali), *Utenti*. In alto la mappa di copertura e il pulsante *Esporta pacchetto di lavoro*. Sotto la tab *Utenti e ruoli* (`Nome | Ruoli | Perimetri | Chiave pubblica | Attivo`).
- **Consolidamento pacchetti** (coordinatore): tabella `Utente | Perimetro | Tipo | Status date | Ricevuto il | Firma | Entry | Conflitti | Stato | Azioni`, righe «atteso ma non ricevuto» evidenziate; **risolutore di conflitti** a due colonne affiancate (valore A | valore B | valore manuale + motivo); riepilogo di copertura; pulsante *Dichiara snapshot finale* (disabilitato sotto soglia salvo approvazione con motivo).
- Menu: *File ▸ Importa ▸ Pacchetto `.evmwork`/`.evmprog`/`.evmplan`…*, *File ▸ Esporta ▸ Pacchetto di lavoro… / di avanzamento…*, *Strumenti ▸ Gestione utenti e perimetri*.

## 8. Test obbligatori
1. **Partizione:** Σ perimetri = progetto; orfani e sovrapposizioni rilevati.
2. **Sovrapposti:** due pacchetti sullo stesso task con valori diversi → conflitto, mai sovrascrittura silenziosa.
3. **Idempotenza:** importare due volte lo stesso pacchetto = nessuna modifica; stesso `package_id` con `content_hash` diverso → blocco.
4. **Commutatività:** due feed parziali applicati in ordine diverso → stesso stato finale (simulazione sul modello).
5. **Fuori perimetro:** entry rifiutate; un utente di perimetro non vede né modifica celle fuori dal proprio.
6. **Ri-sincronizzazione** con task aggiunti/rimossi nei perimetri dinamici → notifiche e `scope_task` aggiornato.
7. **Firma:** pacchetto con firma valida accettato; firma non valida respinta; payload modificato dopo la firma → blocco per `content_hash`.
8. **Copertura/EVM:** con tre utenti su perimetri disgiunti, dopo l'import dei tre pacchetti l'EVM di progetto = somma degli EVM di perimetro; un pacchetto mancante ⇒ snapshot `provvisorio` con copertura in % di BAC; `finale` bloccato sotto soglia salvo approvazione con motivo.
9. **Permessi:** matrice §2 verificata sul backend (chiamate dirette ai comandi, non via UI).
10. **Ruoli cumulati:** una persona con tutti e tre i ruoli completa il ciclo (inserisce, approva, consolida, genera feed) senza altri utenti.
11. **Canonicalizzazione:** lo stesso payload su macchine diverse produce lo stesso `content_hash` (test con vettori fissi).
12. **Prestazioni** come in §4.1.

## 9. Criteri di completamento
- Test verdi in CI; clippy senza warning; copertura ≥ 80% dei moduli `scope`, `package`, `signature`.
- Schermate *Perimetri e utenti* e *Consolidamento pacchetti* funzionanti; menu e voci collegate.
- Documentazione `docs/multiutente.md`: flusso coordinatore ↔ utenti con esempi di pacchetti (JSON di esempio in `fixtures/pacchetti/`), limiti di sicurezza (identità locali), come ruotare le chiavi.
- `DECISIONS.md` aggiornato (canonicalizzazione, impostazioni di blocco/avviso, gestione delle chiavi).

## 10. Ordine di lavoro consigliato
1. Migrazione, `user_profile`, ruoli e permessi nel backend. 2. Perimetri (regole, risoluzione, partizione). 3. Formato pacchetto + canonicalizzazione + `content_hash`. 4. Esportazione `.evmwork`/`.evmprog`. 5. Importazione con validazioni e conflitti. 6. Copertura ed EVM provvisorio/finale. 7. Feed parziale/consolidato. 8. Firma Ed25519. 9. Schermate. 10. `.evmplan` e test completi.
