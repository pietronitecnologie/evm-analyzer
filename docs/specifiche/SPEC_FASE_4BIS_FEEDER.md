# SPECIFICA FASE 4-bis — Feeder: avanzamento lavori, approvazione, feed Excel/CSV, verifica

Documento **autosufficiente**. Prerequisiti: Fasi 1–4 (guscio, DB, motore EVM, import del piano con `Unique ID`/chiave di aggancio, `source_sync`, ri-sincronizzazione). Il **piano resta in MS Project** (o altro software); l'app **registra l'avanzamento**, lo fa approvare, produce un **file Excel/CSV** che il **PM applica a mano** e poi **verifica** il risultato da un nuovo export. L'app **non scrive mai** file di progetto e non esegue script su MS Project.

## 0. Ambito
**Consegna:** tabelle di avanzamento e feed, schermate *Avanzamento lavori*, *Approvazioni*, *Feed* (procedura guidata a 5 passi) e *Storico feed*, validazioni, audit trail, generazione del feed per profilo, verifica post-aggiornamento, test di round trip. **Fuori ambito:** perimetri e pacchetti multi-utente (Fase 4-ter: qui il perimetro è «tutto il progetto» o un elenco semplice), analisi (Fase 5).

Regole di lavoro:
1. Il motore (`packages/engine`) calcola % fisica derivata, PV/EV/AC/indici di riga e di totale; il frontend non duplica formule.
2. I valori del feed sono **assoluti** (mai delta): riapplicare lo stesso feed non duplica nulla (idempotenza).
3. Ogni modifica di avanzamento passa da `audit_log` (chi, quando, prima, dopo). Nessuna scrittura senza traccia.
4. Permessi applicati nel **backend Rust** (non solo nell'interfaccia).

## 1. Modello dati (migrazione)
```sql
progress_entry(
  id, project_id, snapshot_id, task_id, uid_source, scope_id NULL, package_id NULL,
  state TEXT CHECK(state IN ('bozza','inviato','approvato','applicato','respinto')),
  ev_method TEXT, pct_physical REAL, units_done REAL, units_total REAL,
  milestones_closed_json TEXT, actual_start TEXT, actual_finish TEXT,
  actual_hours REAL, remaining_hours REAL, ac_cost REAL,
  independent_signal_json TEXT,      -- ore consumate/stimate, deliverable, difetti aperti
  note TEXT, entered_by, entered_at, submitted_at, approved_by, approved_at,
  rejected_reason TEXT, applied_batch_id NULL,
  UNIQUE(snapshot_id, task_id)       -- una entry per task e status date
);
feed_batch(id, project_id, snapshot_id, status_date, created_at, created_by, profile_id, format,
           scope_id NULL, package_id NULL, source_file_hash, schema_version, file_path, file_hash,
           applied_at NULL, verified_at NULL, verify_result_json NULL);
feed_batch_item(batch_id, task_id, uid_source, field, old_value, new_value);
audit_log(id, ts, user, entity, entity_id, action, before_json, after_json);
```
`source_sync` esiste già (Fase 4). Le tabelle `feed_batch`/`audit_log` come in Fase 1; aggiungi gli indici su `(snapshot_id, state)` e `(project_id, uid_source)`.

## 2. Stati e workflow
```
bozza ──invia──▶ inviato ──approva──▶ approvato ──feed generato──▶ (resta approvato)
   ▲                 │                                            │
   └──── modifica ───┘◀── respingi (motivo) ◀──┘          verifica OK ──▶ applicato
```
- `bozza`: modificabile dall'autore. `inviato`: bloccato in modifica; l'autore può richiamarlo in bozza finché non è approvato. `approvato`: immutabile salvo nuova entry per una status date successiva (correzione = nuova entry). `respinto`: motivo obbligatorio, torna modificabile dall'autore. `applicato`: impostato dalla verifica del feed (§7).
- **Ruoli** (cumulabili): *project engineer* inserisce/invia; *supervisore* approva/respinge; *coordinatore del piano* genera i feed; *amministratore* configura. Una persona con più ruoli ha l'unione dei permessi. **Auto-approvazione:** consentita solo se l'utente ha anche il ruolo `supervisore` (default) e viene registrata in `audit_log` (`self_approved = true`) ed evidenziata nei report; il divieto si attiva da Impostazioni.
- Solo entry `approvato` entrano nel feed.
- **Annulla/Ripeti** (Ctrl+Z/Ctrl+Y) vale per le modifiche in bozza della sessione.

## 3. Regole di calcolo dell'avanzamento (per task)
- Metodo del task (`ev_method`): `zero_cento`, `cinquanta_cinquanta`, `venti_ottanta`, `unita_fisiche`, `milestone_pesate`, `loe`, `soggettiva` (come nella specifica del motore).
- **% fisica derivata** per `unita_fisiche` (= `units_done / units_total`) e `milestone_pesate` (= somma pesi chiusi): cella **bloccata** (grigia). Per `zero_cento` solo 0 o 100; per `cinquanta_cinquanta`/`venti_ottanta` stati 0/50/100 o 0/20/100; `loe`: derivata dal tempo trascorso; `soggettiva`: editabile con **segnale indipendente richiesto** (mini-form: ore consumate/stimate, deliverable prodotti, difetti/blocchi aperti).
- Task `summary`: mai editabili né alimentati; mostrano il roll-up del motore. Task inattivi: nascosti per default.
- `% Complete` (di MS Project) = % **di durata** completata; `Physical % Complete` = % **fisica**. L'app alimenta `Physical % Complete` con la % fisica; `% Complete` secondo regola del profilo (default: stessa % fisica, con avviso se il campo `Earned Value Method` del piano non coincide col metodo scelto).

## 4. Validazioni (prima di *Invia* e prima del feed)
Bloccanti (✖) impediscono l'invio; avvisi (⚠) richiedono conferma o motivo.
| Codice | Regola | Tipo |
|---|---|---|
| V001 | % fisica non decrescente tra status date successive (se decresce: motivo obbligatorio) | ⚠ |
| V002 | `Actual Finish` richiede 100% | ✖ |
| V003 | 100% richiede `Actual Finish` | ✖ |
| V004 | Avanzamento > 0 richiede `Actual Start` | ✖ |
| V005 | `Actual Start`/`Actual Finish` ≤ status date | ✖ |
| V006 | `Actual Finish` ≥ `Actual Start` | ✖ |
| V007 | Ore consuntive coerenti con il periodo (non superiori a `giorni lavorativi × ore/giorno × unità` con tolleranza 20%) | ⚠ |
| V008 | Task senza chiave corrispondente nel piano importato | ✖ |
| V009 | Task fuori perimetro o `summary` | ✖ |
| V010 | Ore consuntive < 90% di quelle attese per la % dichiarata, oppure % > 0 con ore = 0 | ⚠ |
| V011 | `% soggettiva` senza segnale indipendente | ✖ |
| V012 | «90% fatto» (≥ 90% per > 3 status date consecutive) | ⚠ |
| V013 | Metodo cambiato rispetto alla status date precedente | ⚠ (grave) |
| V014 | Milestone pesate: somma pesi ≠ 100% | ⚠ (normalizza) |
| V015 | `Actual Cost` presente ma opzione di MS Project «Actual costs are always calculated by Microsoft Project» attiva (o sconosciuta) | ⚠ |
| V016 | Piano cambiato dall'ultimo import (hash diverso o tentativo con `plan_hash` diverso) | ✖ per il feed |
Il feed viene bloccato se esiste anche un solo ✖ tra i task selezionati; gli ✖ sono elencati con link al task.

## 5. Schermata «Avanzamento lavori»
Descrizione completa nella specifica UI (Fase 5, schermata 3); qui il **contratto funzionale**:
- Barra strumenti: status date, filtri a chip (*Miei*, *Da aggiornare*, *In bozza*, *Respinti*, *In anomalia*, *In ritardo*), ricerca, *Salva bozza*, *Invia per approvazione*, *Copia da periodo precedente* (copia % e date, non ore/AC), *Importa da Excel/timesheet*.
- Griglia virtualizzata (≥ 20.000 righe), colonne editabili in blu: % fisica, unità fatte/totali, milestone chiuse, inizio/fine reale, ore reali, ore residue, AC €, nota. Colonne calcolate dal motore: PV, EV, SPI e CPI di riga, anomalie. Totali di filtro (BAC task, PV, EV, AC) con indici ricalcolati **dai totali**.
- **Incolla blocchi da Excel** con validazione riga per riga prima di confermare; riempimento in basso (Ctrl+D); Invio/Tab/frecce/F2/Esc.
- Salvataggio automatico delle bozze nel DB; indicatore «Salvato».
- Pannello destro: Dettaglio (metodo, peso, baseline, risorse), Storico, Audit, Anomalie.
- *Invia* disabilitato con errori bloccanti, con il motivo visibile in riga e nel pannello.

## 6. Schermata «Approvazioni»
Tabella raggruppata per utente/perimetro con le entry `inviato`: `Task | Utente | Valore precedente → nuovo | Δ % | Anomalie | Segnale indipendente | Azione`. Azioni di riga e di gruppo: *Approva*, *Respingi (motivo obbligatorio)*, *Modifica e approva* (la modifica registra l'originale in `audit_log`). Vista «prima/dopo» nel pannello destro. Filtro «solo con anomalie». Notifica all'autore a ogni respinta.

## 7. Feed (procedura guidata a 5 passi) e verifica
### 7.1 Passi
1. **Verifica piano:** hash e data dell'ultimo export importato vs file indicato dall'utente; elenco task aggiunti/rimossi/rinumerati; *Ri-sincronizza*; avanzamento **bloccato** se il piano è cambiato.
2. **Selezione dati:** perimetro, status date, solo `approvato` (non disattivabile), campi da alimentare: `Actual Start`, `Actual Finish`, `% Complete`, `Physical % Complete`, `Actual Work`, `Remaining Work`, `Actual Cost` (con avviso V015).
3. **Anteprima differenze:** tabella `UID | Task | Campo | Valore attuale (dall'ultimo export) | Nuovo valore | Esito` con filtro per campo e conteggio; esiti: *Nuovo* (campo vuoto), *Modifica*, *Invariato* (escluso dal file), *Avviso*.
4. **Genera:** profilo di destinazione (MS Project, Primavera P6, Generico), formato (`.xlsx` o `.csv`), cartella, generazione di `feed_<progetto>_<statusdate>_<batch>.xlsx|csv` + `LEGGIMI_feed.md` specifico del profilo, riepilogo del batch.
5. **Applicazione e verifica:** il PM applica a mano; l'utente carica il **nuovo export**; confronto campo per campo (verde = applicato, giallo = ricalcolato da MS Project, rosso = non applicato); report esportabile.

### 7.2 Contenuto del file (profilo MS Project, predefinito)
- Una riga per task approvato **con almeno un campo modificato**; solo le righe presenti nel file vengono toccate in MS Project («Unisci i dati nel progetto attivo», chiave `Unique ID`).
- Colonne (nomi in inglese per il profilo `msproject-en`, localizzabili): `Unique ID`, `Actual Start`, `Actual Finish`, `% Complete`, `Physical % Complete`, `Actual Work`, `Remaining Work`, `Actual Cost`. Mai campi di pianificazione (date pianificate, durata, baseline, predecessori, calendari).
- **Formati** (parametri del profilo, da verificare con la checklist manuale): date come vere date Excel (CSV: `dd/MM/yyyy`); `% Complete` come numero 0–100 (`pct_format = integer_0_100`) oppure come cella percentuale (`excel_percent`); ore come numero (`work_format = number_hours`) oppure testo con unità (`text_with_unit`, es. «91 ore»), a seconda della versione/lingua.
- Foglio `_meta`: `batch_id`, `status_date`, `profile`, hash del sorgente, `schema_version`, `app_version`. In CSV: file `…_meta.json` accanto.
- `LEGGIMI_feed.md`: istruzioni passo-passo per il profilo (aprire Project, *File ▸ Apri*, scegliere il file, *Unisci i dati nel progetto attivo*, chiave `Unique ID`, mappatura campo→campo con elenco da selezionare, salvare, riesportare e tornare all'app).
- Profilo **Primavera P6:** chiave `Activity ID`, campi `Actual Start`, `Actual Finish`, `Physical % Complete`, `Actual Labor Units`, `Remaining Labor Units` (**nomi da verificare** sulla versione in uso e documentare in `docs/profiles.md`). Profilo **Generico:** colonne scelte dall'utente.
- La **Status Date di progetto** non è nel file per i feed parziali; il feed consolidato include una riga/campo `Status Date` indicato nelle istruzioni (non scritta automaticamente).

### 7.3 Verifica post-aggiornamento (`verify_feed(batch_id, export_path)`)
Usa `resync_plan` (Fase 4) per leggere il nuovo export, poi per ogni `feed_batch_item`:
- **applicato:** valore trovato = nuovo valore entro tolleranza (date: stesso giorno; percentuali ±0,5 punti; ore ±0,01 h; costi ±0,01 €);
- **ricalcolato da MS Project:** diverso dal nuovo valore e dal vecchio (tipico per `Actual Cost`, `Remaining Work`, `% Complete`): mostrato in giallo con entrambi i valori e riportato in `verify_result_json`;
- **non applicato:** uguale al vecchio valore.
Se tutti gli item sono *applicato* o *ricalcolato*, le entry diventano `applicato` e il batch `verified_at`. Dal nuovo export l'app **legge** le nuove date, durate residue, float e cammino critico (sola lettura) per Earned Schedule e forecast.
- **Cambiamenti non attesi:** se l'hash del nuovo export differisce da `source_sync` e compaiono task aggiunti/rimossi/rinumerati/spostati o baseline modificata, elencali e chiedi di ri-sincronizzare **prima** di produrre un nuovo feed (chiave di aggancio sempre `Unique ID`; baseline modificata ⇒ anomalia critica Q016).
- Il feed non contiene mai date pianificate, baseline, precedenze o calendari.

### 7.4 Storico feed
Tabella `Data | Utente | Perimetro | Profilo | Formato | N. task | N. campi | Stato (generato / applicato / verificato / con scostamenti) | File`. Dettaglio: elenco item e risultato della verifica; possibilità di rigenerare lo stesso file (stessi valori) e di esportare il report.

## 8. Test obbligatori
1. **Round trip:** piano di fixture → entry inserite e approvate → feed → applicazione **simulata da test** (modifica dei campi nel file di export) → re-import → tutti i campi alimentati risultano uguali in `verify_result_json`; riapplicare lo stesso feed non cambia nulla (idempotenza).
2. **Workflow:** transizioni valide e non valide (es. approvare una `bozza` → errore), motivo obbligatorio nel rifiuto, auto-approvazione consentita solo con ruolo `supervisore` e registrata.
3. **Validazioni:** un test positivo e uno negativo per ogni codice V001–V016.
4. **Metodi:** `unita_fisiche` (18/20 → 90%), `milestone_pesate` (20+30+30 chiuse su 20/30/30/20 → 80%), `zero_cento` (solo 0/100), `soggettiva` senza segnale → V011.
5. **Feed:** contiene solo task approvati e solo campi selezionati; nessun campo di pianificazione; un task senza modifiche non compare; i valori sono assoluti.
6. **Piano cambiato:** hash diverso → feed bloccato (V016); `Unique ID` non corrispondente → V008.
7. **Verifica:** casi *applicato*, *ricalcolato* (`Actual Cost` diverso), *non applicato*; tolleranze.
8. **Permessi:** un utente senza il ruolo non può approvare né generare il feed (test sul backend, non solo UI).
9. **Prestazioni:** griglia con 20.000 task scorrevole; generazione feed di 5.000 righe in < 3 s.
10. **Test visivi Playwright** delle tre schermate in tema chiaro/scuro.
11. **Checklist manuale** `docs/test-manuale-ms-project.md` (non automatica): esportazione con mappa, applicazione con *Unisci i dati nel progetto attivo*, comportamento di `Actual Cost`, effetto del campo `Earned Value Method`, formato di date/percentuali/ore con la versione e la lingua reali di MS Project.

## 9. Criteri di completamento
- Test sopra verdi; schermate *Avanzamento*, *Approvazioni*, *Feed* e *Storico feed* funzionanti; `LEGGIMI_feed.md` generato per ogni profilo.
- `audit_log` contiene ogni cambio di stato e di valore; solo `approvato` finisce nel feed.
- `DECISIONS.md` aggiornato (formati di data/percentuale/ore dei profili, tolleranze di verifica).

## 10. Ordine di lavoro consigliato
1. Migrazione e repository (`progress_entry`, `feed_batch*`, `audit_log`). 2. Macchina a stati e permessi nel backend. 3. Validazioni V001–V016 + test. 4. Schermata Avanzamento (griglia, incolla, bozze). 5. Approvazioni. 6. Generatore del feed (profilo MS Project, poi P6/Generico). 7. Wizard a 5 passi con anteprima differenze. 8. Verifica con `resync_plan`. 9. Storico feed. 10. Test di round trip e checklist manuale.
