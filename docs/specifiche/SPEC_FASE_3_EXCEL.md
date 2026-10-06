# SPECIFICA FASE 3 — Import ed export del workbook Excel «Impresa Numerica»

Documento **autosufficiente**. Prerequisiti: Fase 1 (guscio, DB SQLite con migrazioni) e Fase 2 (`packages/engine`, già pronto e testato). Dove questo documento tace su una formula del template, **vince la formula della fixture** (`fixtures/Parte_III_Gestione_Progetti.xlsx`); dove corregge il template, **vince questo documento**.

## 0. Ambito
**Consegna:** (a) import del workbook nel DB, (b) export del progetto in un workbook nuovo con formule vive e grafici nativi, (c) pannello «Esito importazione», (d) test di round trip. **Fuori ambito:** import del piano MS Project (Fase 4), avanzamento per task (Fase 4-bis).

Regole di lavoro:
1. Backend **Rust**: lettura con `calamine`, scrittura con `rust_xlsxwriter`. Non usare librerie JS per l'Excel (perderebbero i grafici).
2. Tutti i calcoli passano dal **motore** (`packages/engine`), mai da formule duplicate in Rust: l'import carica gli *input*, il motore ricalcola. In Rust si converte solo formato (date, tipi, errori).
3. L'import è **tollerante** (avvisi, non errori) e **non distruttivo**: crea un nuovo snapshot, non sovrascrive i precedenti. Ogni avviso va in `import_log`.
4. Comandi Tauri esposti al frontend:
```rust
#[tauri::command] fn import_workbook(path: String, opts: ImportOpts) -> Result<ImportReport, AppError>;
#[tauri::command] fn preview_workbook(path: String) -> Result<WorkbookPreview, AppError>; // senza scrivere nel DB
#[tauri::command] fn export_workbook(project_id: i64, path: String, opts: ExportOpts) -> Result<ExportReport, AppError>;
```
`ImportOpts { ev_base_mode_override?, create_project: bool, project_id?: i64 }`, `ExportOpts { with_formulas: bool (default true), values_only: bool, status_date?: ISODate }`.
`ImportReport { project_id, schema_version_found, warnings: Warning[], counts: {tasks, risks, checkpoints, sprints}, recomputed_vs_cached: Diff[] }`.

## 1. Struttura del workbook
Fogli: `Guida`, `Parametri`, `WBS e Stima Costi`, `Monitoraggio EVM`, `Buffer e Contingency`, `Agile - Velocity`, `Dashboard`, `Glossario`, più `_meta` (nascosto, solo export).

**Celle di INPUT** (le uniche importate):
| Foglio | Campi di input |
|---|---|
| Parametri | overhead, contingency, management reserve, soglie verde/giallo, data inizio, data fine pianificata, buffer di tempo, durata sprint, costo team per sprint, finestra velocity; **nuovi**: `Base di misura EV`, `SP pianificati per sprint`, `Costo per SP di baseline` |
| WBS e Stima Costi | `ID`, `Attività`, `Fase`, `Risorsa`, `CostoOrario`, `O`, `M`, `P`, `OreGiorno`, `Materiali`, `ServiziEsterni`, `DataInizio`; **nuova colonna** `Filone` |
| Monitoraggio EVM | `Data`, `Nota`, `PctPianificato`, `PctReale`, `AC` |
| Buffer e Contingency | tabella rischi: `Rischio`, `Probabilità`, `ImpattoStimato`, `ContingenzaStanziata`, `DataUtilizzo`, `ImportoUtilizzato`; management reserve (stanziata, utilizzata); buffer di tempo consumato |
| Agile - Velocity | per sprint: `SPPianificati`, `SPCompletati`, `CostoTeamSprint`; dati Kanban (se presenti) |

**Colonne calcolate (ignorate in import, rigenerate in export con formule):** PERT, Sigma, costi, PesoPct, PV, EV, CPI, SPI, ETC, EAC, VAC, TCPI, residui, totali.

## 2. Import — regole obbligatorie
1. **Colonne per nome di intestazione, non per posizione.** Cerca la riga di intestazione nel foglio individuando le etichette attese (confronto senza maiuscole/spazi/accenti); colonne extra o riordinate non rompono l'import. Etichetta attesa mancante → avviso `XL_MISSING_COLUMN` e uso del valore di default.
2. **Fine tabella:** ferma la lettura alla **prima riga con `ID` (o `Data`) vuoto**: il template contiene righe vuote di riserva.
3. **Errori di cella** (`#VALUE!`, `#DIV/0!`, …): `calamine` li restituisce come `Data::Error`; trattali come «non disponibile», mai come fallimento.
4. **Date**: converti i serial Excel (sistema 1900 con il bug del 29/02/1900): per `serial ≥ 61`, `data = 1899-12-30 + serial giorni`; per `serial < 61`, `data = 1899-12-31 + serial giorni`. Prova: `46023 → 2026-01-01`. Accetta anche date già testuali ISO o `gg/mm/aaaa` (avviso `XL_DATE_TEXT`). Memorizza **ISO-8601**.
5. **Percentuali:** accetta sia `0,15` sia `15%` come celle numeriche formattate; valori > 1 per campi percentuali di parametro (es. `15`) → interpreta come percento con avviso `XL_PCT_SCALE`.
6. **Foglio nascosto `_meta`**: contiene `schema_version`, `project_id`, `exported_at`, `app_version`. Se presente, verifica la versione e applica le migrazioni di schema; se assente, il file è un «template manuale» (import best-effort con avviso `XL_NO_META`).
7. **Coerenza con i valori in cache:** leggi anche i valori già calcolati dal file e confrontali con il ricalcolo del motore; scostamento > 0,01 € o > 0,001 sugli indici → `recomputed_vs_cached` e avviso `XL_CACHE_DIFF`. (Il valore del motore prevale.)
8. **Schema precedente:** se mancano i parametri nuovi, applica i default (`Base di misura EV = bac_con_contingency` per riprodurre i numeri del file; `Costo per SP di baseline` = `CostoTeamSprint / SPPianificati` del primo sprint con avviso `AGILE_COST_PER_SP_DERIVED`; `Filone` = «Costruzione» o il filone di default del progetto con avviso).
9. **Avvisi di coerenza** (pannello «Esito importazione», **non bloccanti**), con codice, foglio, cella, messaggio, suggerimento:
   - `XL_DATE_MISMATCH`: date incoerenti tra fogli (nella fixture `Parametri` inizia il 01/01/2027, mentre WBS e primo check-point partono dal 01/01/2026 ⇒ `PctTempo` negativo);
   - `XL_CONT_MISMATCH`: contingency a budget (da WBS) ≠ somma delle contingenze stanziate rischio per rischio (fixture: 7.296 € vs 15.000 €);
   - check-point con data fuori intervallo, `PctReale > 100%`, `AC` decrescente, `PctPianificato` decrescente;
   - righe WBS con `O > M` o `M > P`;
   - foglio Agile con CPI agile sempre = 1 (costo/SP circolare): applica il costo per SP non circolare (specifica Fase 2, §7) e avvisa;
   - EAC/VAC con `#VALUE!` per EV = 0: il motore usa `null`, non è un errore.
10. **Mappatura sul DB** (una transazione; in caso di errore fatale rollback totale):
    - `Parametri` → `project_params` (+ `ev_base_mode`, `baseline_cost_per_sp`);
    - `WBS e Stima Costi` → `wbs` (da `ID` gerarchico, es. `1.2.3`; se piatto, un nodo per `Fase`), `task` (`uid_source = ID`, `ev_method` default `unita_fisiche`), `resource` (distinte per nome; `std_rate = CostoOrario`), `assignment`, `workstream` (da `Filone`), `baseline` di tipo `stima` con `baseline_task` (ore, costo) **bloccata** solo se l'utente lo sceglie;
    - `Monitoraggio EVM` → tabella nuova `project_checkpoint(id, project_id, date, note, pct_planned, pct_actual, ac)` (crea la migrazione se manca) e, per ogni data, uno `status_snapshot` (`source = 'workbook'`) con valori **di progetto** (non per task);
    - `Buffer e Contingency` → `risk`, `reserve_usage`;
    - `Agile - Velocity` → `agile_sprint`, `kanban_flow`.
11. **Idempotenza:** reimportare lo stesso file nello stesso progetto (stesso `project_id` in `_meta`) **aggiorna** gli input e aggiunge snapshot nuovi senza duplicare task/rischi (chiave: `ID`, `Rischio`, `Data`, numero sprint). Se `_meta.project_id` appartiene a un altro progetto → chiedi se creare un nuovo progetto.
12. Limiti e robustezza: file protetto da password, corrotto, non xlsx → messaggio chiaro, nessun crash; file fino a 20 MB in < 5 s; operazione annullabile.

## 3. Export — regole obbligatorie
1. **Rigenera il workbook da zero** con `rust_xlsxwriter`, replicando layout, intestazioni e formattazione della fixture: celle di input (sfondo blu chiaro), calcolate (grigio), intestazioni di gruppo, come nel foglio `Guida`.
2. **Formule vive** nelle colonne calcolate, con **valore in cache** calcolato dal motore (`Formula::set_result`), così anteprime e lettori che non ricalcolano mostrano i numeri. Le formule devono essere **equivalenti** a quelle della fixture (estraile leggendo gli XML dello zip del `.xlsx` con un piccolo script, documentale in `docs/excel-formulas.md`: per ogni formula, «riprodotta» o «corretta» con il riferimento alla specifica).
3. **Grafici nativi** nel foglio `Dashboard`: curva S (PV, EV, AC) e trend CPI/SPI, con serie collegate alle celle del foglio `Monitoraggio EVM`.
4. **Differenze volute rispetto al template**, da elencare nel foglio `Guida` esportato: parametri nuovi (`Base di misura EV`, `SP pianificati per sprint`, `Costo per SP di baseline`), colonna `Filone`, formule agile corrette (costo per SP non circolare), BAC di misura mostrato accanto al BAC totale.
5. Foglio nascosto `_meta` con `schema_version` (incrementata rispetto al template), `project_id`, `exported_at`, `app_version`.
6. **Gestione dei null:** le celle con indici non definiti (CPI con EV=0) mostrano `—` o restano vuote con la formula protetta da `SE(…;"")`; niente `#VALUE!` né `#DIV/0!` nel file esportato.
7. Modalità `values_only`: stesso layout senza formule (sola lettura). Modalità con `status_date`: esporta solo i check-point fino a quella data.
8. Nomi dei fogli e delle intestazioni identici al template (così il file resta importabile anche da versioni precedenti dell'app).

## 4. Pannello «Esito importazione» (frontend)
Dialogo a due colonne: a sinistra riepilogo (n. attività, rischi, check-point, sprint; schema trovato; progetto di destinazione); a destra tabella avvisi `Gravità | Foglio | Cella | Codice | Messaggio | Suggerimento`, filtrabile per gravità; pulsanti *Annulla*, *Importa comunque* (se solo avvisi), *Esporta log (CSV)*. Gli avvisi critici (file illeggibile, nessuna riga di stima) disabilitano *Importa comunque*. Anteprima possibile prima di scrivere nel DB (`preview_workbook`).

## 5. Test obbligatori
1. **Import della fixture:** `bacTotal = 55.933,87 €` (con `bac_con_contingency`), BAC di misura senza contingency = `48.638,15 €`, effort = `77,17 giorni-persona`, `σ progetto = 2,06 giorni`; nessun `#VALUE!`/`NaN` nei risultati; presenza degli avvisi `XL_DATE_MISMATCH` e `XL_CONT_MISMATCH` con i valori della fixture.
2. **Colonne riordinate/aggiunte:** copia della fixture con colonne scambiate e una colonna extra → stesso risultato.
3. **Righe vuote di riserva:** la lettura si ferma alla prima riga vuota.
4. **Date:** `46023 → 2026-01-01`; `1 → 1900-01-01`; `59 → 1900-02-28`; `60` (29/02/1900 inesistente) → errore di cella con avviso; `61 → 1900-03-01`; testo `01/02/2026` → `2026-02-01` con avviso.
5. **Round trip:** fixture → import → export → re-import: i dati di **input identici** (confronto campo per campo) e le metriche ricalcolate uguali a quelle del file originale (salvo le correzioni elencate nel §3.4).
6. **Export:** il file si apre senza errori in LibreOffice (conversione headless in PDF/CSV nei test di CI se disponibile); i grafici sono presenti nel XML (`xl/charts/chart*.xml`); nessuna cella con errore.
7. **Idempotenza:** importare due volte la fixture nello stesso progetto non duplica task/rischi.
8. **Schema vecchio** (senza parametri nuovi) → default e avvisi come in §2.8.
9. **File ostili:** non-xlsx, protetto, foglio mancante, intestazioni assenti → errore tipizzato, nessun panic.
10. **Prestazioni:** file da 5.000 righe WBS in < 5 s.

## 6. Criteri di completamento
- Test sopra verdi in CI; `cargo clippy` senza warning; copertura dei moduli `xlsx_import`/`xlsx_export` ≥ 80%.
- `docs/excel-formulas.md` completo (ogni formula della fixture classificata).
- Schermata Importa/Esporta (sezione «Workbook Excel») e voce di menu *File ▸ Importa/Esporta ▸ Workbook Excel…* funzionanti con il pannello di esito.
- Voce in `DECISIONS.md` per le scelte non determinate (default dei campi mancanti, formato di errore).

## 7. Ordine di lavoro consigliato
1. Utility date/percentuali + test. 2. Lettura per intestazione con `calamine` + fixture. 3. Mappatura sul DB + migrazione `project_checkpoint`. 4. Ricalcolo con il motore e confronto cache. 5. Avvisi e pannello. 6. Export: fogli e formattazione. 7. Formule con valore in cache. 8. Grafici. 9. Round trip e prestazioni.
