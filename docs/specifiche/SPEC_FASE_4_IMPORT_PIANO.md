# SPECIFICA FASE 4 — Import del piano da export di MS Project (XML MSPDI, Excel, CSV)

Documento **autosufficiente**. Prerequisiti: Fasi 1–3 (guscio, DB, motore EVM, import/export del workbook). L'app **non** legge file `.mpp`, **non** usa MPXJ né Java, **non** supporta XER/PMXML. Il piano arriva da un **export** del software di pianificazione; l'app non scrive mai file di progetto.

## 0. Ambito
**Consegna:** parser XML MSPDI, parser Excel/CSV con mappatura delle colonne e profili, modello neutro del piano, procedura guidata di importazione (con riconciliazione del BAC e gestione delle tariffe), modalità «ri-sincronizza», tracciamento della sorgente (`source_sync`), test su fixture nei tre formati. **Fuori ambito:** avanzamento e feed (Fase 4-bis), perimetri e pacchetti (Fase 4-ter).

Regole di lavoro:
1. Backend **Rust**: `quick-xml` (+ `serde`) per l'XML, `calamine` per Excel, crate `csv` per CSV (+ `encoding_rs` per la codifica). Moduli: `import/model.rs`, `import/mspdi.rs`, `import/tabular.rs`, `import/profile.rs`, `import/reconcile.rs`, `import/commit.rs`.
2. Tutti i parser producono lo stesso **modello neutro** (§1); da lì in avanti il codice non conosce il formato di origine.
3. **Mai assumere**: se un campo non è presente, il valore è `None` e l'importazione prosegue con un avviso; il motore gestisce i dati mancanti. Nessun panic su file malformati.
4. Importazione = transazione unica (rollback in caso di errore fatale); nessuna scrittura nel DB prima della conferma finale della procedura guidata.
5. Comandi Tauri:
```rust
inspect_plan_file(path) -> PlanInspection        // formato, dimensione, intestazioni/colonne trovate, n. task stimato
preview_plan_import(path, ImportConfig) -> PlanPreview   // modello neutro riassunto + avvisi, senza scrivere
commit_plan_import(path, ImportConfig, Confirmations) -> ImportResult
resync_plan(project_id, path, ImportConfig) -> ResyncReport // vedi §6
```
`ImportConfig { format, profile_id?, column_mapping?, baseline_map, bac_options, rate_options, status_date, default_ev_method }`.

## 1. Modello neutro del piano
```rust
struct PlanModel {
  project: PlanProject,           // nome, start, finish, status_date?, minutes_per_day, currency
  calendars: Vec<PlanCalendar>,   // vuoto per Excel/CSV
  tasks: Vec<PlanTask>,
  resources: Vec<PlanResource>,
  assignments: Vec<PlanAssignment>,
  source: SourceInfo,             // file, formato, hash SHA-256, mtime, dimensione
  warnings: Vec<Warning>,
}
struct PlanTask {
  key: String,                    // chiave di aggancio (Unique ID di MS Project; vedi §4.4)
  row_id: Option<i64>,            // ID di riga (solo informativo)
  wbs: Option<String>, outline_level: Option<u8>,
  name: String, is_summary: bool, is_milestone: bool, is_active: bool,
  start: Option<ISODate>, finish: Option<ISODate>,
  duration_minutes: Option<i64>, work_minutes: Option<i64>, cost: Option<f64>,
  pct_complete: Option<f64>, physical_pct: Option<f64>,
  actual_start: Option<ISODate>, actual_finish: Option<ISODate>,
  actual_work_minutes: Option<i64>, remaining_work_minutes: Option<i64>, actual_cost: Option<f64>,
  predecessors: Vec<Dependency>,  // {pred_key, kind: FS|SS|FF|SF, lag_minutes}
  baselines: Vec<TaskBaseline>,   // {number 0..10, start, finish, work_minutes, cost, duration_minutes}
  critical: Option<bool>, total_slack_minutes: Option<i64>,
  resource_names: Vec<String>,
  custom: BTreeMap<String,String> // campi personalizzati (es. metodo di EV, control account)
}
struct PlanResource { key, name, kind: Work|Material|Cost, std_rate: Option<f64>, overtime_rate: Option<f64>, cost_per_use: Option<f64>, group: Option<String> }
struct PlanAssignment { task_key, resource_key, units_pct: Option<f64>, work_minutes: Option<i64>, cost: Option<f64>, baselines: Vec<..>, timephased: Vec<Timephased> }
```
Unità interne: **minuti** per lavoro/durata, **euro** per costi, date **ISO**.

## 2. Parser XML MSPDI
Namespace `http://schemas.microsoft.com/project`; documento radice `<Project>`. Elementi da leggere (**verifica nomi e unità su file reali esportati dalla versione di MS Project in uso**, e salva uno o due file di esempio sintetici in `fixtures/`):
- Progetto: `Name`, `StartDate`, `FinishDate`, `StatusDate`, `MinutesPerDay`, `MinutesPerWeek`, `DaysPerMonth`, `CurrencyDigits`, `CurrencySymbol`.
- Calendari: `Calendars/Calendar` con `UID`, `Name`, `IsBaselineCalendar`, `WeekDays/WeekDay` (`DayType`, `DayWorking`, `WorkingTimes/WorkingTime` con `FromTime`/`ToTime`), `Exceptions/Exception` (`TimePeriod`, `DayWorking`). Servono per la durata dei giorni lavorativi e per la distribuzione lineare dei costi.
- Task: `UID` (chiave), `ID`, `Name`, `WBS`, `OutlineNumber`, `OutlineLevel`, `Summary`, `Milestone`, `Active`, `Start`, `Finish`, `Duration`, `Work`, `Cost`, `PercentComplete`, `PhysicalPercentComplete`, `ActualStart`, `ActualFinish`, `ActualWork`, `RemainingWork`, `ActualCost`, `Critical`, `TotalSlack`, `PredecessorLink` (`PredecessorUID`, `Type` 0=FF,1=FS,2=SF,3=SS, `LinkLag` in decimi di minuto, `LagFormat`), `Baseline` ripetuto (`Number` 0=baseline principale, 1…10; `Start`, `Finish`, `Duration`, `Work`, `Cost`), `ExtendedAttribute` per i campi personalizzati (mappati tramite `ExtendedAttributes/ExtendedAttribute` con `FieldID` e `Alias`).
- Risorse: `UID`, `Name`, `Type` (1=lavoro, 0=materiale, 2=costo), `StandardRate`, `OvertimeRate`, `CostPerUse`, `Group`.
- Assegnazioni: `TaskUID`, `ResourceUID`, `Units`, `Work`, `Cost`, `ActualWork`, `Baseline`, `TimephasedData` (se presente: dati time-phased di lavoro e costo, per tipo; leggi solo i tipi di baseline e pianificato, verificandoli su un file reale).
- **Formati:** durate e lavoro in ISO 8601 (`PT8H0M0S`, `P1DT2H`) → minuti; date `YYYY-MM-DDThh:mm:ss` (senza fuso) → data ISO; booleani `0/1`.
- **Unità dei costi:** il campo `Cost` può essere espresso in unità di valuta o in centesimi a seconda dell'origine. **Non assumerlo**: determinalo confrontando `Cost` con `Work × StandardRate` su un task campione e, se il rapporto è 100, dividi per 100; registra la scelta e un avviso `PLAN_COST_SCALE`.
- Esclusioni: task con `UID = 0` (riga di riepilogo del progetto) → importato solo come informazione di progetto; task inattivi → importati con `is_active = false`, esclusi dal BAC.
- Streaming (nessun caricamento del DOM completo): file da 50 MB senza esaurire la memoria.

## 3. Parser Excel/CSV con mappatura e profili
### 3.1 Profilo di importazione (`profiles/*.json`)
```json
{
  "id": "msproject-it", "name": "MS Project (italiano)", "key_field": "Unique ID",
  "sheets": {"tasks": "Task_Table", "resources": "Resource_Table", "assignments": "Assignment_Table"},
  "columns": { "key": ["ID univoco","Unique ID","UID"], "name": ["Nome attività","Task Name","Name"],
    "wbs": ["WBS"], "outline_level": ["Livello struttura","Outline Level"], "start": ["Inizio","Start"],
    "finish": ["Fine","Finish"], "duration": ["Durata","Duration"], "work": ["Lavoro","Work"], "cost": ["Costo","Cost"],
    "predecessors": ["Predecessori","Predecessors"], "resource_names": ["Nomi risorse","Resource Names"],
    "pct_complete": ["% completamento","% Complete"], "physical_pct": ["% completamento fisico","Physical % Complete"],
    "actual_start": ["Inizio effettivo","Actual Start"], "actual_finish": ["Fine effettiva","Actual Finish"],
    "baseline_start": ["Inizio previsto","Baseline Start"], "baseline_finish": ["Fine prevista","Baseline Finish"],
    "baseline_work": ["Lavoro previsto","Baseline Work"], "baseline_cost": ["Costo previsto","Baseline Cost"],
    "summary": ["Riepilogo","Summary"], "milestone": ["Pietra miliare","Milestone"] },
  "formats": { "date": ["dd/MM/yyyy","yyyy-MM-dd","dd/MM/yy","excel_serial"], "decimal": ",", "thousands": ".", "duration_units": {"g":480,"d":480,"h":60,"ore":60,"hrs":60,"sett":2400,"w":2400,"m":1} },
  "encoding": "auto", "delimiter": "auto"
}
```
Profili forniti: `msproject-it`, `msproject-en`, `primavera-excel`, `smartsheet`, `generico`. I nomi dei campi Primavera/Smartsheet vanno **verificati** su un export reale (indicali come da validare in `docs/profiles.md`). I profili sono modificabili e importabili/esportabili dall'utente.

### 3.2 Regole
1. Intestazioni confrontate senza maiuscole/accenti/spazi multipli; la riga di intestazione è la prima riga con ≥ 3 etichette riconosciute (entro le prime 20 righe).
2. **Mappatura automatica** per sinonimi (profilo); le colonne non riconosciute si mappano a mano nel wizard (§5, passo 2). La mappatura si salva come profilo utente.
3. **Colonne obbligatorie:** chiave (`Unique ID` o equivalente), `name`. Raccomandate: `start`, `finish`, `duration`/`work`, `cost`, baseline. Mancanza di una obbligatoria = errore bloccante con elenco; mancanza di una raccomandata = avviso.
4. **Durate e lavoro testuali** («5 giorni», «40 ore», «2 sett», «0 giorni» per le milestone) → minuti con la tabella `duration_units` del profilo e `minutes_per_day` (default 480).
5. **Date:** serial Excel, testo secondo i formati del profilo (provati in ordine), ISO. Data ambigua (es. `03/04/2026`) → usa il formato del profilo e avvisa se ci sono date non valide.
6. **CSV:** rileva delimitatore (`;`, `,`, tab), codifica (UTF-8 con o senza BOM, Windows-1252), separatore decimale; mostra l'anteprima delle prime 20 righe nel wizard.
7. **Gerarchia WBS:** da `wbs`; se assente, da `outline_level` e ordine di riga; se assenti entrambe, albero piatto con avviso `PLAN_NO_HIERARCHY`.
8. **Task riepilogativi:** da `summary` o dedotti dalla presenza di figli.
9. **Predecessori testuali** (`3FS+2g;5`) → `Dependency` con tipo e ritardo; sintassi non riconosciuta → avviso, mai errore.
10. **Risorse:** da `resource_names` (separati da `;`) e, se presenti, dai fogli `Resource_Table`/`Assignment_Table`; senza fogli risorse, risorse create per nome senza tariffa (avviso `PLAN_NO_RATE`).
11. **Baseline:** colonne `Baseline …` → `baselines[0]`; colonne `Baseline1…10` se presenti; senza dati time-phased, **distribuzione lineare** di lavoro e costo sui giorni lavorativi tra inizio e fine della baseline (calendario di default `Lun–Ven 8:00–17:00`, configurabile) con avviso `PLAN_LINEAR_PV` visibile nella Qualità dati.

## 4. Persistenza e chiavi
1. **Chiave di aggancio per profilo:** `Unique ID` (MS Project), `Activity ID` (Primavera), colonna a scelta (generico). Deve essere **unica e stabile**: chiavi duplicate → errore bloccante; scarto di chiavi tra due import > 30% → avviso critico e richiesta di conferma.
2. Salva nel campo `task.uid_source` la chiave del profilo; non usare mai nome o ID di riga per agganciare.
3. `source_sync(project_id, source_file, file_hash, file_mtime, imported_at, task_count)`: una riga per import; l'hash (SHA-256) identifica l'export importato. `plan_hash` = hash dell'insieme ordinato `(key, wbs, name, baseline principale)` dei task, usato da pacchetti e perimetri.
4. Mappatura sul DB: `project`, `calendar`/`calendar_exception` (solo da XML), `wbs`, `control_account` (da campo personalizzato se mappato), `task` (con `ev_method` = campo personalizzato se mappato, altrimenti `default_ev_method` del progetto, default `zero_cento`), `dependency`, `resource`, `assignment`, `baseline` + `baseline_task` + `baseline_timephased`, `status_snapshot` (status date scelta nel wizard, `source = 'piano'`) + `snapshot_task` (valori di avanzamento presenti nell'export, inclusi attuali `pct_complete`, `actual_*`).

## 5. Procedura guidata di importazione
Passi (indicatore in alto; *Indietro* sempre disponibile):
1. **File e formato**: scelta file → `inspect_plan_file`; formato e profilo proposti; se `.mpp` o altro formato non supportato → messaggio che spiega come esportare (XML: *File ▸ Salva con nome ▸ XML*; Excel: *Salva con nome ▸ Cartella di lavoro di Excel ▸ esporta mappa*).
2. **Mappatura colonne** (solo Excel/CSV): tabella `Campo app | Colonna del file | Esempio | Stato` con elenco a discesa, anteprima, indicazione dei campi obbligatori; salvataggio come profilo.
3. **Anteprima**: n. task/risorse/assegnazioni, baseline trovate, avvisi, primi 50 task.
4. **Mappatura baseline**: quale baseline del file è «stima» e quale «startup» (o nessuna); scelta di bloccarla.
5. **Riconciliazione del BAC**: tabella `Costo diretto baseline sorgente | Overhead da applicare | Contingency da applicare | BAC risultante` con interruttori «applica overhead» / «applica contingency» (evita il doppio conteggio: se la sorgente contiene già indiretti, l'utente lo dichiara); salvataggio in `baseline` (`bac_direct`, `bac_indirect`, `bac_contingency`, `bac_total`). Mostra il confronto con il BAC del workbook se esiste.
6. **Tariffe e costo reale**: tabella risorse `Nome | Tariffa importata | Costo orario reale (opzionale) | Fonte`; se `real_hourly_cost` è valorizzato prevale; altrimenti usa la tariffa importata e **avvisa** («costo orario non verificato: possibile sotto-stima del costo reale»). Evita il doppio conteggio dell'overhead.
7. **Status date**: scelta o proposta (da `StatusDate` del file, altrimenti data odierna, modificabile).
8. **Conferma**: riepilogo finale; *Importa* scrive in transazione; esito con link alla Qualità dati.

## 6. Ri-sincronizzazione («stesso progetto, nuovo export»)
`resync_plan(project_id, path, config)`: stesso formato/profilo; aggancio per chiave; produce `ResyncReport`:
- task **aggiunti**, **rimossi**, **rinumerati** (stesso nome/WBS con chiave diversa → candidati, mai fusi automaticamente), **spostati** (nuova WBS), con **baseline modificata** (anomalia critica `Q016` se la baseline bloccata è cambiata fuori dall'app);
- aggiornamento dei valori di sola lettura (date, float, critico, avanzamento letto) nel nuovo `status_snapshot`; nessuna sovrascrittura dei dati di avanzamento inseriti nell'app;
- aggiornamento di `source_sync` e `plan_hash`; aggiornamento dei perimetri dinamici (Fase 4-ter): task nuovi/rimossi segnalati.
La verifica del feed (Fase 4-bis) riusa `resync_plan`.

## 7. Errori e robustezza
File vuoto, non XML valido, XML senza `<Tasks>`, password, formato non riconosciuto, intestazioni non trovate, delimitatore errato, codifica illeggibile → errore tipizzato con messaggio in italiano (causa + rimedio) e nessun panic. Annullamento durante l'importazione (flag cooperativo, controllo ogni 1.000 task). Timeout configurabile (default 120 s).

## 8. Test obbligatori
1. **Fixture sintetica** (30 task, 3 livelli WBS, 5 risorse, baseline principale, predecessori FS/SS con ritardo, 2 milestone, 1 summary con figli) in **tre formati equivalenti** (XML, XLSX, CSV, generati da uno script dei test): numero di task, somma dei costi baseline, date di inizio/fine progetto e struttura WBS **uguali** nei tre import.
2. **Durate testuali:** «5 giorni», «40 ore», «2 sett», «0 giorni» → minuti attesi con `minutes_per_day = 480`.
3. **Date:** formati misti; data non valida → avviso con riga.
4. **Chiavi duplicate** → errore bloccante; **colonna chiave mancante** → errore con elenco.
5. **Baseline lineare:** distribuzione dei costi su un task di 5 giorni lavorativi (lun–ven) → 20% al giorno; con festivo da calendario XML, il giorno festivo riceve 0.
6. **Scala dei costi** (×1 e ×100) rilevata correttamente.
7. **Ri-sincronizza:** aggiunta, rimozione e rinumerazione di task → `ResyncReport` corretto; dati di avanzamento dell'app intatti.
8. **File ostili:** `.mpp` rinominato, XML troncato, CSV con codifica Windows-1252, XLSX con intestazioni in italiano e in inglese miste.
9. **Prestazioni:** 2.000 task in < 5 s (XML/Excel); 20.000 task in < 30 s; memoria < 500 MB per 50 MB di XML.
10. **Riconciliazione BAC:** con sorgente diretto = 100.000, overhead 20%, contingency 10% e entrambi gli interruttori attivi → indiretto 20.000, contingency 12.000, BAC totale 132.000; solo overhead → 120.000; nessuno → 100.000.

## 9. Criteri di completamento
- Procedura guidata funzionante per i tre formati con anteprima e riconciliazione; profili di esempio e documentazione `docs/profiles.md` (con la lista dei campi minimi da esportare da MS Project e come farlo).
- Test sopra verdi in CI; `cargo clippy` senza warning; copertura dei moduli di importazione ≥ 80%.
- Messaggi di errore e avvisi presenti in `i18n/it.json`.
- `DECISIONS.md` aggiornato (scala dei costi, default del calendario, gestione task inattivi).

## 10. Ordine di lavoro consigliato
1. Modello neutro + utility (durate, date, chiavi). 2. Parser XML + fixture XML. 3. Parser CSV/Excel + profili + fixture. 4. Persistenza e `source_sync`. 5. Distribuzione lineare delle baseline. 6. Wizard (passi 1–3). 7. Riconciliazione BAC e tariffe (passi 4–6). 8. Ri-sincronizzazione. 9. Robustezza e prestazioni.
