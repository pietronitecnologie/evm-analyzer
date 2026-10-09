# Funcionality
- [x] Il menu di sinistra deve poter essere ridimentsionato. (fatto: AppShell/Sidebar, react-resizable-panels, drag + Ctrl+B collassa/espande come prima)
- [x] Rimuovere tutti i pulsanti attualmente morti nei menu, cosi da poter andare a visualizzare solo le funzionalità implementate.
      (fatto: rimossi i menu Edit/Feed/Tools (tutti placeholder), le voci morte in File/View/
      Project/Help, i 4 screenId sidebar senza schermo reale (feed-msproject, consolidamento,
      importa-esporta, impostazioni) e il gruppo "System" risultante vuoto — decisione 139)
- [x] Gantt: la tabella delle task deve poter essere ridimensionabile in larghezza nelle varie colonne.
      (fatto: `useColonneRidimensionabili` in GanttScreen.tsx, drag nativo, larghezze persistite
      in localStorage — decisione 140)

# Modifiche a funzioni gia implementate
- [x] Negli avanzamenti dammi la possibilita di inserire delle note e dei file.
      (fatto: campo Note + "Attach file…" al momento dell'invio in AvanzamentoScreen.tsx;
      migrazione 0011, colonna `author_note` e tabella `progress_entry_attachment` (blob,
      non percorsi esterni) — decisione 141)
- [x] Visualizzazione degli storici dei avanzamenti per le task con relative note e file allegati.
      (fatto: pulsante "History" per riga → AvanzamentoStorico.tsx, tutte le voci passate
      con nota autore/motivo di rifiuto/allegati scaricabili o rimovibili, allegabili anche
      a una voce già passata — decisione 142)

# Fase 6 (sottoinsieme: qualità dati, report, prestazioni — vedi SPEC_FASE_6_QUALITA_REPORT_RILASCIO.md)
Fuori da questo giro: §4 backup/sicurezza, §5 installer, §6 documentazione, §7 e2e, §8 criteri di
accettazione formali — solo §1 (qualità dati), §2 (report) e §3 (prestazioni).

- [x] 1. Registro unico delle anomalie (`data_quality_issue`): tabella + migrazione 0010,
      ricalcolo idempotente (`qualita.rs::ricalcola_problemi`) su un sottoinsieme di codici
      con input già assemblato (WBS_*, LOE_SHARE/GATE_NO_BUFFER, FLOW_WIP_EXCESS, RES_*/
      BUFFER_NO_PROGRESS, AGILE_*/VEL_*, Q007/Q013, EVM_* di progetto). Rimandati: Q001-Q006/
      Q008-Q011/Q014-Q016/Q020-Q021/Q030-Q031 (storico per task non ancora assemblato),
      XL_*/PLAN_* (import, non ancora codici puliti), V001-V016 (non esistono — vedi
      decisione 124 in DECISIONS.md). Ricalcolo manuale (pulsante), non automatico dopo ogni
      evento (decisione 126).
- [x] 2. Schermata «Qualità dati»: tabella Gravità/Regola/Task-WBS/Descrizione/Suggerimento/
      Stato/Utente, filtri (Critiche/Aperte/Mie/categoria), azioni Vai al task / Accetta con
      motivo (supervisore o coordinatore_piano, nuovo `richiede_uno_dei_ruoli`) / Riapri,
      contatori in barra di stato (poll ogni 15s), export CSV. Blocco snapshot finale con
      critiche aperte salvo motivo + ruolo coordinatore_piano (`marca_snapshot_finale`,
      nuove colonne `status_snapshot.state`/`final_override_*`).
- [x] 3. Schermata «Report»: opzioni a sinistra (sezioni attivabili, nome azienda),
      anteprima A4 HTML a destra in un `<iframe srcDoc>` (documento autosufficiente,
      niente Tailwind/variabili CSS dell'app), grafici SVG (ECharts in modalità SSR,
      verificato a runtime), filigrana Provvisorio, hash del contenuto + app_version a
      piè di pagina. Rimandata la sezione Monte Carlo (nessuna run "del report" senza
      un selettore dedicato — decisione 133).
- [x] 4. Export HTML/PDF del report: stampa della webview (`iframe.contentWindow.print()`),
      nessuna libreria Rust di riserva — una sola strada, documentata (decisione 131).
      Non verificabile sulle tre piattaforme da qui (solo Linux): annotato come rischio
      noto, non silenziato.
- [x] 5. Prestazioni: generatore di progetti sintetici in `bench/` (Rust, scala 200/2.000/
      20.000) + `bench/engine.bench.mjs` (TypeScript, scala 200/2.000/5.000), benchmark
      delle operazioni del §3, confronto con `bench/baseline.json` unico (soglia +20%,
      soglia di rumore 20ms), pannello diagnostico (Help ▸ Diagnostics…: versione app,
      task/nodi WBS/snapshot del progetto aperto). La suite ha trovato un vero bug di
      prestazioni in `monitoraggioEvm` (O(task×nodi) invece di O(task)), corretto —
      decisioni 136-138.

# Utenti: login reale (oltre la Fase 5/6: richiesta esplicita dell'utente)
- [x] 6. Pagina di login all'apertura di un progetto (i profili utente sono per-progetto, non
      globali — stessa tabella `user_profile` già esistente): password con hash (non in
      chiaro), utente "admin"/"admin" creato di default sui nuovi progetti.
      (fatto: migrazione 0012 (`password_hash`), modulo `auth.rs` (Argon2id),
      `auth::assicura_utente_default` seminata a ogni apertura se la tabella utenti è
      vuota — copre sia i progetti nuovi sia quelli già esistenti senza utenti,
      LoginScreen.tsx a tutto schermo, "Change password…"/"Reset password…" —
      decisioni 143-146)
- [x] 7. Sostituire il selettore "Acting as" (barra di contesto, decisione 88) con l'identità
      autenticata: stesso `attoreId` già cablato nei comandi di backend che richiedono
      coordinatore_piano, ora da un login vero invece di una scelta libera.
      (fatto: ContextBar.tsx, stesso attoreId/userName/userRole/userRuoli, nessuna
      modifica ai controlli di permesso lato backend — decisione 145). Nota: trovato
      (non corretto, fuori scope) un difetto preesistente nel layout della barra di
      contesto a finestra stretta — il gruppo a destra (ricerca/campanella/utente)
      esce dalla riga fissa e sparisce — decisione 146.

# Documetnazione
- [x] 8. Manuale utente del software nella sua interezza in formato .md visualizzabile anche da software.
      (fatto: MANUALE_UTENTE.md alla radice, 29 capitoli — ogni schermata, login, ruoli,
      glossario EVM, limiti noti; leggibile anche in-app da Help → Guide (GuideScreen.tsx,
      react-markdown) — decisioni 147-151)
- [x] 9. progetto di esmpio con relativi avanzamenti, changes, tasks etc.. da richiamare nel manuale
         utente come esempi e traccia.
      (fatto: fixtures/progetto-esempio.evmproj, generato da
      crates/evm-db/examples/progetto_esempio.rs (rieseguibile) chiamando le stesse funzioni
      di libreria dell'app — baseline, change request, avanzamenti con rifiuto/correzione,
      un allegato, un'anomalia di qualità dati accettata — decisione 147, capitolo 21 del manuale)

# Agile - Kanban
- [x] 10. Permettimi di gestire completamente gli sprint Agile dall'applicazione. Mentieni l éventuale importazione
      (fatto: crea_sprint/modifica_sprint/elimina_sprint in agile.rs, stessa tabella
      agile_sprint già popolata dall'import — decisione 152)
- [x] 11. Per ogni task dammi la possibilita di definire uno sprint Agile o una lavagna Kanban. Modifica le sezioni agile di conseguenza e crea la sezione Kanban (come tab della sezione Agile)
      (fatto: task.sprint_id/task.kanban, esclusivi (decisione 153), modulo "Assign a
      task to a sprint or the Kanban board" nella scheda Sprint, nuova colonna
      Sprint/Kanban in Tasks and resources)
- [x] 12. Nel kanban fammi poter creare le colonne relative ed aggiugnere sotto-task-kanban ad esse, crea punteggi alle singole sotto-task-kanban cosi da poter tracciare anche l'effort speso.
      (fatto: nuova scheda Kanban in Agile/Flow — colonne create/rinominate/riordinate/
      eliminate, sotto-task con punteggio di effort spostabili tra colonne, riepilogo
      punti totali/completati per task — decisione 154)
- [x] 13. prmetti di modificare le task direttametne i tabella, sia in date che in WBS e gli altri campi.
      (fatto: colonne WBS/Nome/Inizio pianificato/Fine pianificata editabili in Tasks and
      resources, 5 nuovi setter in task.rs — decisione 158)
- [x] 14. Rimuovi Monte Carlo (non utilizzata). Rendi Agile autosufficiente (niente import
      esterno necessario): avanzamento sprint e task tutto integrato nella sezione. Separa
      Agile e Kanban in due sezioni distinte (non più tab di un'unica schermata "Agile/Kanban").
      (fatto: Monte Carlo rimosso ovunque — pannello, comandi Tauri, modulo Rust, tabella DB
      (migrazione 0015) — decisione 159; AgileScreen.tsx/KanbanScreen.tsx separati, due voci
      di menu — decisione 160; card sprint con avanzamento calcolato dai task assegnati
      (pctReale), non più solo da SP completati manuali — decisione 161; colore
      personalizzabile per colonne e sotto-task Kanban (palette fissa di 8 tinte) — vedi
      anche decisione 154)

Via via che si procede: decisioni in DECISIONS.md, non solo qui.


# BUG
- [x] Cambiando la baseline con indirect bac e contingency, non cambia il BAC totale su dashboard e le altre funzioni ed analisi.
      (fatto: bug reale in dashboard()/riserve() — restavano agganciate alla baseline di
      tipo 'startup' invece che "l'ultima non archiviata", quindi non si aggiornavano
      dopo una change request approvata (sempre tipo 'altra') o una baseline di tipo
      diverso. Corretto + test di regressione. Wired anche il KPI "Budget baseline" nel
      Dashboard (dato già presente ma mai mostrato) e il badge "Base EV" ora è un
      pulsante vero — decisione 155)
- [x] Creando una nuova baseline, utente o quando modifico dei parametri o in generale quando faccio un inserimento in DB, il progetto si chiude e bisogna ricaricarlo.
      (mitigato: nessun codice trovato che azzera l'utente autenticato dopo una scrittura
      (indagine esclusiva), ma l'app non aveva NESSUN error boundary — un'eccezione di
      rendering non gestita durante un ricaricamento dopo scrittura smontava tutta la UI
      lasciando una pagina bianca, indistinguibile da "il progetto si chiude". Aggiunto
      ErrorBoundary.tsx (verificato con un crash deliberato) + PRAGMA busy_timeout=5000
      su ogni connessione (più connessioni parallele sullo stesso file, nessun timeout
      prima). Se si ripresenta, ora mostra l'errore invece di sparire — decisione 156)
- [x] Ho diverse contingency definibili, una nel baseline, una in buffer e reserver una in cost governance, spiega nel manuale come devono essere utilizzate
      (fatto: nuova sezione nel capitolo 15 del manuale, "Le tre contingency dell'app" —
      decisione 157)
- [x] Spiega nel manuale come devono essere utilizzate le baseline e le change request, come leggere il forecast, il cost governance e l'evm monitoring.
      (fatto: sezioni "Come usarle"/"Come leggerla/leggerlo" aggiunte ai capitoli 10, 16,
      17, 19 del manuale — decisione 157)
