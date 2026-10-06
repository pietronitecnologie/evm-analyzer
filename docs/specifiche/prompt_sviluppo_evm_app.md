# PROMPT DI SVILUPPO — Analizzatore EVM desktop (Tauri + TypeScript)

## 0. Come lavorare
Sei un ingegnere software senior. Sviluppa l'applicazione descritta sotto **a fasi** (sez. 9). Alla fine di ogni fase: tutti i test passano, riassumi in 5 righe cosa è stato fatto, poi fermati e attendi conferma. Non anticipare le fasi successive. Se un requisito è ambiguo, scegli il default ragionevole, dichiaralo in `DECISIONS.md` e prosegui; chiedi solo se la scelta è irreversibile.

Ti allego come riferimento il file **`Parte_III_Gestione_Progetti.xlsx`** (template del libro "Impresa Numerica", Cap. 3). Copialo in `fixtures/` e usalo come fixture di test e come specifica del formato di import/export.

Il **Capitolo 3 del libro** (matematica dei progetti) è la fonte autorevole delle formule e del metodo. Dove questo prompt corregge o estende il libro o il template Excel, lo dichiara esplicitamente nella **sez. 6-bis**: quelle correzioni prevalgono sul template. Il libro è un manuale tecnico: ogni numero mostrato all'utente deve avere la sua **interpretazione reale** (vedi sez. 8, tooltip).

## 1. Obiettivo del prodotto
App desktop **GPL-3.0** per **project engineer** e **supervisore** (inteso come **direttore tecnico / site supervisor**, non come project manager), che funziona da **feeder (alimentatore) per MS Project**. Il **piano resta in MS Project** (schedule, precedenze, calendari, baseline, calcolo del cammino critico): l'app NON è un editor di pianificazione e NON ha motore CPM né editor Gantt. L'app è invece il **luogo dove si registra l'avanzamento lavori** (sorgente dei dati di avanzamento e costi consuntivi) e dove si fa l'**analisi Earned Value**; poi **produce il file Excel/CSV con cui il PM aggiorna MS Project a mano**. Non esistono né il file `.mpp` né MPXJ né Java: il piano arriva da un **export di MS Project** (XML MSPDI o Excel/CSV) e l'aggiornamento di MS Project è sempre manuale, eseguito dal PM.

Ciclo di lavoro (vedi 6-ter): 1) import del piano esportato da MS Project (XML o Excel) → 2) inserimento dell'avanzamento nell'app a ogni status date → 3) approvazione → 4) generazione del feed Excel/CSV e aggiornamento manuale di MS Project da parte del PM → 5) re-import del nuovo export di MS Project (nuove date, cammino critico) → 6) verifica di coerenza e snapshot EVM. Funzioni:
1. importa il piano da un **export** del software di pianificazione dell'utente: **XML (MSPDI)** (MS Project e programmi che lo esportano) come formato principale, **Excel** e **CSV** con **mappatura delle colonne** e **profili** salvabili (MS Project, Primavera P6 via Excel, Smartsheet, generico), con parser nativi in Rust (nessun MPXJ, nessun Java, nessun `.mpp`, nessun XER);
2. importa/esporta il **workbook Excel Impresa Numerica** (formato in sez. 5);
3. conserva baseline e storico degli aggiornamenti (status date) in un DB **SQLite**, un file per progetto;
4. ricalcola in modo uniforme tutte le metriche EVM, con controlli di qualità dei dati;
5. mostra curve S, trend CPI/SPI, forecast e report;
6. registra l'**avanzamento lavori** (task, % fisica, date reali, ore e costi consuntivi) con workflow di approvazione e audit trail;
7. produce il **feed Excel/CSV** con l'avanzamento approvato, che il PM applica a mano a MS Project, e verifica poi dal nuovo export che sia stato applicato correttamente;
8. ogni utente lavora **solo su una sottoselezione (perimetro) dei task del progetto**: supervisori e project engineer sono più di uno e ciascuno vede, modifica e alimenta solo i propri task (6-quater);
9. un **coordinatore** consolida i pacchetti di avanzamento dei vari utenti, risolve i conflitti, calcola l'EVM di progetto e produce il feed Excel/CSV per MS Project.

Il Gantt è solo una **vista di sola lettura** (barre baseline vs attuale), non modificabile: **date pianificate, durate, precedenze, baseline e calendari si modificano esclusivamente in MS Project**; l'app li legge e non li scrive mai (eccezione: i campi di avanzamento del feed, 6-ter).

## 2. Stack (vincolante)
- **Tauri 2** (backend Rust), frontend **React + TypeScript + Vite**, UI in **italiano**.
- **SQLite** (un file `.evmproj` per progetto). Accesso dal backend Rust con `rusqlite`; migrazioni versionate (`PRAGMA user_version`).
- **Motore EVM**: pacchetto TypeScript puro, senza dipendenze da UI/Tauri (`packages/engine`), testato con **Vitest**. Funzioni pure, input → output.
- **Import del piano**: nessun MPXJ e nessun Java. **XML MSPDI** (formato principale, salvato da MS Project con *Salva con nome → XML*) letto in Rust con **`quick-xml`** (+ `serde`); **Excel** (esportazione con mappa) con **`calamine`**; **CSV** con il crate **`csv`** (rileva separatore, codifica e formato data della lingua di Windows). Il file `.mpp` non è supportato: se l'utente lo seleziona, mostra un messaggio che spiega come esportare in XML o Excel. Le specifiche dei campi richiesti (soprattutto `Unique ID`) sono in sez. 7. Il backend Rust valida i dati letti con uno schema versionato e li scrive nel DB SQLite.
- **Excel**: backend Rust, crate **`calamine`** (lettura) e **`rust_xlsxwriter`** (scrittura con formule e grafici nativi). Non usare librerie JS che perdono i grafici.
- **Tabelle**: TanStack Table. **Grafici**: Apache ECharts. **Stato**: Zustand. **Test E2E**: Playwright (o WebdriverIO per Tauri).
- Verifica che ogni dipendenza abbia licenza compatibile con GPL-3.0 e genera `THIRD_PARTY_LICENSES.md`. Aggiungi il file `LICENSE` (testo integrale GPL-3.0) e l'intestazione di copyright/licenza in ogni file sorgente. Il `README.md` contiene il link al repository del sorgente e la nota che ogni binario distribuito corrisponde a un tag del sorgente. L'installer include `LICENSE` e `THIRD_PARTY_LICENSES.md`.

## 3. Struttura del repository
```
/packages/engine        # motore EVM TS puro + test
/src                    # frontend React
/src-tauri              # Rust: comandi Tauri, DB, import (XML/Excel/CSV), export Excel/CSV
/fixtures               # xlsx del libro, export di esempio sintetici di MS Project in .xml, .xlsx e .csv
DECISIONS.md  README.md  LICENSE  THIRD_PARTY_LICENSES.md
```

## 4. Modello dati SQLite (punto di partenza, puoi migliorarlo)
- `project(id, name, source_type, source_file, imported_at, schema_version)`
- `calendar` e `calendar_exception` (letti dall'XML MSPDI, servono per Earned Schedule; assenti nell'import Excel/CSV: l'app usa un calendario di default configurabile)
- `wbs(id, project_id, parent_id, code, name)` e `control_account(id, wbs_id, name)`
- `workstream(id, project_id, name, kind, measure_method, planned_unit_value, ...)` — **filone** (§3.9.2); kind: `costruzione`, `automazione`, `software`, altro; measure_method: `unita_fisiche`, `milestone_pesate`, `story_point`, `flusso`
- `task(id, project_id, wbs_id, workstream_id, uid_source, name, phase, is_summary, is_milestone, ev_method, weight_pct, ...)`
- `dependency(pred_id, succ_id, type FS/SS/FF/SF, lag_minutes)` (solo informativa)
- `resource(id, name, type, std_rate, overtime_rate, cost_per_use, real_hourly_cost, rate_source)` — `std_rate` è la tariffa importata (es. MS Project); `real_hourly_cost` è il **costo orario reale del Cap. 2** (§2.3) e, se valorizzato, prevale; `rate_source` ∈ {`importata`, `costo_reale`}
- `assignment(id, task_id, resource_id, units)`
- `baseline(id, project_id, name, kind, created_at, locked, bac_direct, bac_indirect, bac_contingency, bac_total)` — **snapshot immutabili**; kind: `stima`, `startup`, altre
- `baseline_scope(baseline_id, wbs_id, included, note)` — baseline di scope (§3.4): cosa è e cosa non è incluso
- `change_request(id, project_id, baseline_from_id, baseline_to_id, requested_at, approved_at, approved_by, reason, delta_cost, delta_duration_days, delta_scope_note)` — l'unico modo per creare una nuova baseline a partire da una bloccata (§3.4): nessuno spostamento silenzioso
- `baseline_task(baseline_id, task_id, start, finish, duration, work, cost)`
- `baseline_timephased(baseline_id, task_id, resource_id, period_start, work, cost)` ← base del PV
- `status_snapshot(id, project_id, status_date, label, source)` — uno per ogni aggiornamento
- `snapshot_task(snapshot_id, task_id, actual_start, actual_finish, pct_complete, physical_pct, remaining_work, ac_cost, ev_override)`
- `snapshot_timephased(snapshot_id, task_id, resource_id, period_start, actual_work, actual_cost)`
- `progress_entry(id, snapshot_id, task_id, entered_by, entered_at, measure_method, units_done, units_total, milestones_json, subjective_pct, independent_signal_json, physical_pct, pct_complete, actual_start, actual_finish, actual_work_h, actual_cost, remaining_work_h, note, state)` — avanzamento inserito nell'app; `state` ∈ {`bozza`, `inviato`, `approvato`, `applicato`, `respinto`}
- `feed_batch(id, project_id, snapshot_id, status_date, created_at, created_by, channel, source_file_hash, schema_version, applied_at, verified_at, verify_result_json)` e `feed_batch_item(batch_id, task_id, uid_source, field, old_value, new_value)` — ogni feed è tracciato campo per campo; i valori sono **assoluti** (mai delta) per rendere l'applicazione idempotente
- `audit_log(id, ts, user, entity, entity_id, action, before_json, after_json)` — nessuna modifica di avanzamento senza traccia
- `source_sync(id, project_id, source_file, file_hash, file_mtime, imported_at, task_count)` — stato dell'ultimo import del piano, per rilevare se MS Project è cambiato dopo l'ultimo import
- `user_profile(id, user_uid, display_name, role, public_key, active)` — `roles` = insieme non vuoto di {`project_engineer`, `supervisore`, `coordinatore_piano`, `amministratore`} (**ruoli cumulabili**: nei progetti piccoli una sola persona li ricopre tutti; nei progetti grandi sono persone diverse); `user_uid` stabile e univoco, `public_key` opzionale (firma pacchetti)
- `scope(id, project_id, name, rule_kind, rule_json, owner_user_id, approver_user_id, plan_hash, resolved_at)` — **perimetro di lavoro**; rule_kind ∈ {`wbs`, `filone`, `control_account`, `task_list`, `risorsa`, `mista`}
- `scope_task(scope_id, task_id, uid_source, added_by, added_at)` — risoluzione del perimetro in elenco di Unique ID (a un dato `plan_hash`)
- `progress_package(id, project_id, kind, scope_id, from_user_id, created_at, status_date, plan_hash, schema_version, content_hash, signature, imported_at, import_result_json)` — kind ∈ {`lavoro`, `avanzamento`, `aggiornamento_piano`}; `id` univoco globale (UUID) per importare **una sola volta** lo stesso pacchetto
- `package_conflict(id, project_id, snapshot_id, task_id, package_a_id, package_b_id, field, value_a, value_b, resolution, resolved_by, resolved_at)` — conflitti tra pacchetti sullo stesso task, con risoluzione tracciata
- `progress_entry` e `feed_batch` portano anche `scope_id` e `package_id` (provenienza)
- `project_params(project_id, overhead_pct, contingency_pct, mgmt_reserve_pct, green_threshold, yellow_threshold, start_date, planned_end_date, time_buffer_days, sprint_days, team_cost_per_sprint, velocity_window, ev_base_mode, planned_sp_per_sprint, baseline_cost_per_sp)` — `ev_base_mode` ∈ {`bac_con_contingency`, `bac_senza_contingency`} (vedi 6-bis.1); `baseline_cost_per_sp` si fissa in baseline (vedi 6-bis.2)
- `workstream_gate(id, project_id, from_workstream_id, to_workstream_id, description, buffer_days)` — gate di dipendenza tra filoni e buffer di programma (§3.9.2, §3.9.7)
- `monte_carlo_run(id, project_id, kind, n_iter, seed, params_json, result_json, created_at)` — esecuzioni riproducibili (seed salvato)
- `risk(...)`, `reserve_usage(...)`, `agile_sprint(...)`, `kanban_flow(...)` per i fogli Buffer e Agile
- `import_log(id, kind, file, timestamp, warnings_json)`

Regole: le baseline sono **immutabili** (trigger che blocca UPDATE/DELETE quando `locked=1`). Ogni importazione di aggiornamento crea un nuovo `status_snapshot`; non sovrascrive mai i precedenti. Le date si memorizzano in ISO-8601; i serial Excel si convertono solo ai bordi (import/export).

## 5. Formato Excel "Impresa Numerica" — import ed export
**Fogli**: `Guida`, `Parametri`, `WBS e Stima Costi`, `Monitoraggio EVM`, `Buffer e Contingency`, `Agile - Velocity`, `Dashboard`, `Glossario`.

### Import — regole obbligatorie
1. **Leggi le colonne per nome dell'intestazione, non per posizione.** Trova la riga di intestazione cercando le etichette attese; colonne extra o riordinate non devono rompere l'import.
2. **Importa solo le celle di INPUT e ricalcola tutto con il motore.** Input:
   - Parametri: overhead, contingency, management reserve, soglie, date inizio/fine, buffer, parametri Agile.
   - WBS: ID, Attività, Fase, Risorsa, CostoOrario, O, M, P, OreGiorno, Materiali, ServiziEsterni, DataInizio.
   - Monitoraggio EVM: Data, Nota, PctPianificato, PctReale, AC.
   - Buffer e Contingency: rischi (Probabilità, ImpattoStimato, ContingenzaStanziata, DataUtilizzo, ImportoUtilizzato), management reserve, buffer consumato.
   - Agile: sprint (SPPianificati, SPCompletati, CostoTeamSprint), dati Kanban.
   - Ignora le colonne calcolate (PERT, Sigma, costi, PesoPct, PV, EV, CPI, SPI, ETC, EAC, VAC, TCPI, residui, totali).
3. **Fermati alla prima riga con ID (o Data) vuoto** in ogni tabella: il template ha righe vuote di riserva.
4. **Tollera i valori di errore** (`#VALUE!`, `#DIV/0!`): `calamine` li restituisce come `Data::Error`; trattali come "non disponibile", non come fallimento.
5. **Date**: converti i serial Excel in date reali (46023 = 01/01/2026, sistema 1900 con il bug del 29/02/1900).
6. **Foglio nascosto `_meta`**: contiene `schema_version`, `project_id`, `exported_at`, `app_version`. In import: se presente, verifica la versione e applica eventuali migrazioni; se assente, tratta il file come "template manuale" (import best-effort con avvisi).
7. **Test di coerenza**: leggi anche i valori già calcolati dal file (cache) e confrontali con quelli del motore; scostamenti > 0,01 € o > 0,001 sugli indici vanno in `import_log` come avviso.
8. **Controlli di coerenza in import (avvisi, non errori bloccanti)**, mostrati in un pannello "Esito importazione":
   - Date incoerenti tra fogli (nel file di esempio `Parametri` inizia il 01/01/2027, mentre WBS e primo check-point partono dal 01/01/2026 → `PctTempo` negativo).
   - Contingency a budget (da WBS) diversa dalla somma delle contingenze stanziate rischio per rischio (nel file di esempio: 7.296 € vs 15.000 €).
   - Check-point con data fuori dall'intervallo di progetto, PctReale > 100%, AC decrescente, PctPianificato decrescente.
   - Righe WBS con O > M o M > P.
   - Foglio Agile del template: CPI agile sempre = 1 (costo/SP circolare) → applica 6-bis.2 e avvisa.
   - EAC/VAC con `#VALUE!` per EV = 0 → gestiti come `null` (sez. 6), non come errore.

**Differenze volute rispetto al template (documentale in `docs/excel-formulas.md` e riportale nel foglio `Guida` esportato):** parametri nuovi in `Parametri` (`Base di misura EV`, `SP pianificati per sprint`, `Costo per SP di baseline`), colonna `Filone` nella WBS, formule agile corrette (6-bis.2). L'import di un file con schema precedente funziona (valori di default + avvisi); l'export scrive sempre lo schema nuovo con `schema_version` incrementata in `_meta`.

### Export — regole obbligatorie
- **Rigenera il workbook da zero con `rust_xlsxwriter`**, replicando layout, intestazioni, formattazione (celle input / calcolate / intestazioni di gruppo, come nella Guida), **formule vive** (con valore in cache calcolato dal motore, così anteprime e lettori senza ricalcolo mostrano i numeri) e i **grafici nativi** del Dashboard (curva S PV/EV/AC, trend CPI/SPI).
- Le formule devono essere equivalenti a quelle del file di riferimento (ricavale leggendo le formule dalla fixture con un piccolo script di ispezione dello zip XML; documentale in `docs/excel-formulas.md`).
- Aggiungi il foglio `_meta` nascosto (vedi sopra).
- **Round-trip test**: importa la fixture → esporta → reimporta → i dati di input devono essere identici, e le metriche ricalcolate uguali a quelle del file originale (salvo le correzioni di sez. 6).
- Se l'utente lo chiede, esporta anche in sola-lettura (valori, senza formule).

## 6. Motore EVM (`packages/engine`)
Funzioni pure, tutte con test su casi tratti da manuale (PMI Practice Standard for EVM / ANSI-748) e sulla fixture.

- **Stima (Cap. 3.1–3.4)**: PERT = (O+4M+P)/6; σ = (P−O)/6; σ progetto = √Σσ²; costo diretto = Σ(ore×costo orario) + materiali + servizi; indiretto = diretto × overhead; contingency; **BAC**; management reserve; budget totale approvato.
- **EVM (3.5–3.8)**: PV, EV, AC, CV, SV, CPI, SPI, ETC = (BAC−EV)/CPI, EAC = AC+ETC, varianti EAC **come nel compendio del libro**: base EAC = AC + ETC; ottimistica = AC + (BAC − EV) (il residuo torna al ritmo di piano); lineare = BAC/CPI. La variante lineare è matematicamente identica alla base (AC = EV/CPI): implementala come **identità verificata nei test**, non come scenario distinto nell'UI. Non implementare varianti non presenti nel libro (es. CPI×SPI) a meno di richiesta esplicita. VAC, TCPI, Burn Rate, Forecast Accuracy (a consuntivo).
- **Casi limite (correggono il file di esempio)**: con EV = 0 o AC = 0 il CPI è indefinito → `null`, e ETC ripiega su BAC−EV (ipotesi "ritmo di piano") con avviso; mai `#VALUE!`/NaN. Nessuna divisione per zero. TCPI con BAC=AC → `null`.
- **Metodi di EV per task**: 0/100, 50/50, 20/80, unità fisiche, milestone pesate, LOE, % soggettiva. Il metodo è un attributo del task e **non può cambiare a metà progetto** senza avviso. Aggregazione per WBS, control account, risorsa, filone e periodo.
  - **LOE**: per costruzione EV = PV; l'app lo segnala con un badge "non può rilevare ritardi" e lo esclude dal calcolo dello SPI di filone se la sua quota di BAC supera una soglia configurabile (default 15%).
  - **% soggettiva (§3.5)**: l'app **richiede un segnale indipendente di incrocio** (ore consumate/stimate, deliverable prodotti, difetti o blocchi aperti) e segnala l'anomalia classica "90% fatto" se la % resta ≥ 90% per più di 3 status date consecutive o se la % cresce senza consumo di ore.
  - **Cadenza e fonte unica (§3.5)**: avvisa se l'intervallo tra status date non è regolare o se cambia il metodo di misura di un task.
- **Earned Schedule**: ES, SPI(t) = ES/AT, SV(t), stima della data di fine. Interpolazione lineare sulla curva PV time-phased.
- **Semaforo** con soglie da `project_params` (verde ≥ 0,95; giallo ≥ 0,85; altrimenti rosso).
- **Buffer (3.7)**: indice di salute = %buffer consumato / %completato.
- **Agile (3.9)**: velocity, velocity media mobile su N sprint, sprint residui, EAC tempo/costo, Legge di Little (WIP = throughput × cycle time / 7). **Costo per SP e EV agile: usa la formula corretta di 6-bis.2, non quella circolare del template.** **EV di programma = Σ EV dei filoni**, idem AC e PV; CPI e SPI di programma (§3.9.4).
- **Monte Carlo sulla velocity (§3.9.6)** e **Cumulative Flow Diagram (§3.9.5)**: vedi 6-bis.5.
- **Controlli qualità dati** (output: elenco di anomalie con gravità e riferimento al task): task senza baseline, EV method assente o incoerente, AC mancante con avanzamento > 0, % complete anomale, avanzamento senza actual start, date reali nel futuro rispetto alla status date, risorse senza tariffa.
- **Ricalcola sempre dai dati time-phased** (non fidarti dei valori EVM precalcolati di MS Project/P6, che usano convenzioni diverse); mostra comunque lo scostamento rispetto ai valori della sorgente come informazione.

## 6-bis. Coerenza con il libro: correzioni, estensioni e regole di metodo
Queste regole prevalgono sul template Excel dove lo contraddicono.

**6-bis.1 — Contingency e base di misura dell'EV.** Il BAC del libro include la contingency (§3.2), quindi EV = % × BAC conta come "lavoro" anche una riserva rischi. Implementa il parametro `ev_base_mode`:
- `bac_senza_contingency` (**default consigliato**): PV, EV e BAC di misura = costo diretto + indiretto; la contingency resta un conto separato (§3.2: va consumata rischio per rischio) e NON entra nello SPI/CPI.
- `bac_con_contingency`: comportamento del template (compatibilità).
Mostra sempre entrambi i valori (BAC totale e BAC di misura) e indica nel report quale base è in uso. Il fixture Excel va importato con `bac_con_contingency` per riprodurre i suoi numeri (BAC = 55.933,87 €).

**6-bis.2 — Costo per story point non circolare (correzione di §3.9.4).** Con costo/SP = costo team ÷ velocity media *reale*, EV agile = AC per costruzione e il CPI agile vale sempre 1. Correzione:
- `baseline_cost_per_sp = team_cost_per_sprint ÷ planned_sp_per_sprint`, **fissato in baseline** (esempio fixture: 12.000 ÷ 30 = 400 €/SP).
- EV agile = SP cumulati completati × `baseline_cost_per_sp`; AC = costo team sostenuto; PV = SP pianificati cumulati × `baseline_cost_per_sp`.
- La velocity media reale serve solo per il forecast (sprint residui, EAC), non per valorizzare l'EV.
- Il valore cambia solo tramite change request (6-bis.4).
- Test: fixture, allo sprint 3: SP cumulati 83 → EV = 33.200 €, AC = 36.000 €, CPI agile ≈ 0,92 (il template darebbe 1,00). Import del vecchio template senza il parametro: deriva `baseline_cost_per_sp` da CostoTeamSprint / SPPianificati del primo sprint e **avvisa**.

**6-bis.3 — Filoni (§3.9.2) e modello a due livelli.** Ogni task appartiene a un `workstream`. Il livello di programma riceve da ciascun filone **un solo numero periodico: il valore completato in euro** (EV), con il suo PV e AC. Ogni filone ha il proprio metodo nativo: costruzione = unità fisiche; automazione = milestone pesate + test superati/previsti; software = story point/flusso. L'app aggrega EV, AC, PV di programma e calcola CPI/SPI di programma e per filone. I **gate** (`workstream_gate`) rappresentano le dipendenze tra filoni: avvisa se il filone a scope variabile (software) consegna dopo la data del gate senza un buffer di programma (§3.9.7).

**6-bis.4 — Baseline e change request (§3.4).** Le baseline bloccate non si modificano. Una nuova baseline si crea **solo** tramite `change_request` con motivo, approvatore e delta di costo/durata/scope; l'app impedisce spostamenti silenziosi e mostra nel report la cronologia delle baseline. Gestisci anche la **baseline di scope** (`baseline_scope`).

**6-bis.5 — Strumenti probabilistici e di flusso.**
- **Monte Carlo sulla velocity/throughput (§3.9.6)**: ricampiona (con reinserimento) le velocity storiche per generare N scenari (default 5.000, seed riproducibile e salvato) di completamento del backlog residuo; output = distribuzione di date/costi finali e percentili P50/P80/P90 ("80% di probabilità di finire entro il …"). Calcolo in Rust o in un Web Worker, con barra di avanzamento.
- **Cumulative Flow Diagram (§3.9.5)** e **Legge di Little** per i filoni a flusso; diagnosi: Cycle Time in crescita con throughput stabile ⇒ WIP eccessivo.
- **Range di stima (§3.3)**: oltre al BAC puntuale, mostra BAC ± 1σ e ± 2σ (68% / 95%) dalla stima a tre punti.

**6-bis.6 — Stima e baseline come controlli incrociati (§3.1).** Quando esistono sia la baseline `stima` (top-down/analogica) sia la `startup` (bottom-up), calcola lo scostamento e **segnala come anomalia uno scostamento > 20% (avviso) o > 30% (critico)**, come prescrive il libro.

**6-bis.7 — Costi: tariffe e costo orario reale (§3.2, Cap. 2).** Le tariffe importate da MS Project/P6 non sono il costo orario reale del Cap. 2 (RAL + oneri + benefit ÷ ore produttive). Regole:
- Se `real_hourly_cost` è valorizzato prevale sulla tariffa importata; altrimenti usa la tariffa importata e **avvisa** ("costo orario non verificato: possibile sotto-stima del costo reale").
- Evita il doppio conteggio: l'overhead di progetto si applica una sola volta; se la sorgente contiene già costi indiretti, chiedi all'utente come trattarli in fase di mappatura.

**6-bis.8 — Riconciliazione del BAC tra sorgenti.** Il BAC del workbook = diretto + indiretto + contingency; la baseline di MS Project/P6 normalmente contiene solo costi diretti. Nel wizard di import mostra una tabella di riconciliazione (costo diretto baseline sorgente, overhead da applicare, contingency da applicare, BAC risultante) e fai scegliere se applicare overhead e contingency ai valori importati. Salva la scelta in `baseline` (campi `bac_*`).

## 6-ter. Modalità feeder: dall'app a MS Project

**6-ter.1 — Cosa si registra nell'app e cosa passa a MS Project.**
- Si inserisce per ogni task attivo: metodo di misura (0/100, 50/50, unità fisiche, milestone pesate, LOE, % soggettiva con segnale indipendente), % fisica, date reali di inizio/fine, ore consuntive, costo consuntivo, ore residue, note. Per i task con unità fisiche o milestone pesate l'app **calcola** la % fisica dai dati di base (l'utente inserisce unità o milestone chiuse, non la percentuale).
- **Campi da alimentare in MS Project** (livello task): `Actual Start`, `Actual Finish`, `% Complete`, `Physical % Complete`, `Actual Work`, `Remaining Work`, e (con i limiti sotto) `Actual Cost`; più la **Status Date** di progetto. Livello assegnazione (ore reali per risorsa, time-phased) come funzione opzionale in una fase successiva.
- Il **campo `Earned Value Method`** di MS Project determina se il BCWP usa % Complete o Physical % Complete: l'app segnala se il metodo configurato nel piano non coincide con quello usato nell'app e propone quale campo alimentare.
- Il **costo consuntivo (AC)** nell'app proviene dalla contabilità/timesheet e fa fede per l'EVM calcolato dall'app. In MS Project, per default (opzione "Actual costs are always calculated by Microsoft Project", in Opzioni › Avanzate; verificala sulla versione in uso) il costo reale è calcolato dalle ore consuntive e dalle tariffe, e un valore inserito a mano può essere sovrascritto. Quindi: il feed alimenta sempre `Actual Work`; `Actual Cost` solo se l'opzione lo consente, altrimenti l'app **avvisa** che il costo in MS Project può divergere da quello dell'app (divergenza mostrata e documentata nel report, mai nascosta).

**6-ter.2 — Ruoli e workflow di approvazione.** Ruoli: *project engineer* (inserisce l'avanzamento, stato `bozza`→`inviato`), *supervisore* = direttore tecnico (verifica la coerenza con lo stato reale dei lavori; approva o respinge con motivo, stato `approvato`/`respinto`), *amministratore*. Solo i dati `approvati` entrano nel feed; dopo l'applicazione lo stato passa a `applicato`. Ogni cambio di stato e di valore finisce in `audit_log`. Il divieto di approvare i propri inserimenti è **configurabile** e, di default, si applica solo agli utenti che non hanno anche il ruolo `supervisore`. Applicazione a utente singolo possibile via impostazione. Con più utenti e perimetri distinti valgono le regole di 6-quater.

**6-ter.3 — Validazioni prima del feed (bloccanti salvo indicazione).** % fisica non decrescente tra status date successive (avviso se decresce, con motivo obbligatorio); `Actual Finish` richiede 100%; 100% richiede `Actual Finish`; avanzamento > 0 richiede `Actual Start`; `Actual Start`/`Actual Finish` ≤ status date; ore consuntive coerenti con il periodo; task non attivi, riepilogativi o milestone con regole proprie; task senza UID corrispondente nel piano importato → **blocco** con elenco. Controlli di qualità di sez. 6 (segnale indipendente, "90% fatto") inclusi come avvisi.

**6-ter.4 — Canale di aggiornamento di MS Project: file Excel/CSV, applicato a mano dal PM.** Non esistono script, automazioni né scrittura di file di progetto: l'app produce solo il feed e il PM aggiorna MS Project manualmente.
- **File di merge Excel/CSV (indipendente dal software e dal sistema operativo).** Il feed è un `.xlsx`/`.csv` con una riga per task e colonne i cui **nomi dipendono dal profilo di destinazione** (`feed_profile`). Profilo **MS Project** (predefinito): `Unique ID` (chiave), `Actual Start`, `Actual Finish`, `% Complete`, `Physical % Complete`, `Actual Work`, `Remaining Work`, `Actual Cost`; l'utente lo applica con l'importazione guidata (**"Unisci i dati nel progetto attivo"**, chiave `Unique ID`). Profilo **Primavera P6**: `Activity ID` (chiave), `Actual Start`, `Actual Finish`, `Physical % Complete`, `Actual Labor Units`, `Remaining Labor Units`, nomi da verificare sulla versione in uso, applicato con l'importazione Excel di P6. Profilo **Generico**: colonne definite dall'utente. I profili sono file JSON (`profiles/*.json`) modificabili e importabili/esportabili, con chiave di aggancio, nomi di colonna, formati di data e numero. L'app genera anche un file di istruzioni passo-passo (`LEGGIMI_feed.md`) specifico per il profilo, e un foglio `_meta` con `batch_id`, `status_date`, profilo, hash del file sorgente, schema.
- In ogni feed: **anteprima delle differenze** (task, campo, valore attuale in MS Project, nuovo valore) prima di generare il feed; i valori sono assoluti, quindi riapplicare lo stesso feed non duplica nulla.

**6-ter.5 — Sincronizzazione e riconciliazione dopo l'aggiornamento.**
- Dopo l'applicazione l'utente salva in MS Project e **esporta di nuovo il piano (XML o Excel) e lo re-importa** (wizard di sez. 7, modalità "ri-sincronizza"). L'app confronta, campo per campo, quanto alimentato (`feed_batch_item`) con quanto presente ora nel piano: scostamenti elencati nel `verify_result_json` e nel report ("applicato correttamente", "valore diverso: ricalcolato da MS Project", "non applicato").
- Dal piano ricalcolato l'app **legge** nuove date di inizio/fine, durate residue, float e cammino critico (sola lettura) per Earned Schedule e forecast.
- **Rilevamento di cambiamenti non attesi**: se l'hash dell'ultimo export importato è diverso da `source_sync` all'apertura o prima di generare il feed, elenca task aggiunti, rimossi, rinumerati, spostati o con baseline modificata, e chiedi di ri-sincronizzare **prima** di produrre un nuovo feed. La chiave di aggancio è `Unique ID`, mai il nome o l'ID di riga. Una baseline di MS Project modificata fuori dall'app genera un'anomalia critica (§3.4: niente baseline spostate in silenzio).
- L'app **non scrive mai** baseline, durate, precedenze, calendari, vincoli o risorse in MS Project.

**6-ter.6 — Test.** In CI non c'è MS Project: testa il feed con export sintetici (XML/Excel/CSV di fixture → import → inserimento avanzamento → feed → applicazione simulata da test, che modifica i campi dell'export → re-import → verifica che i campi coincidano). Fornisci una **checklist di test manuale** (`docs/test-manuale-ms-project.md`) per la versione reale di MS Project: esportazione con mappa, importazione guidata del feed ("Unisci i dati nel progetto attivo"), comportamento di `Actual Cost`, effetto di `Earned Value Method`.

## 6-quater. Più utenti, ciascuno su una sottoselezione di task

**Principio.** Ogni utente lavora su un **perimetro** (scope) e non vede né modifica l'avanzamento dei task altrui. L'app è **desktop, offline e senza server**: più utenti = più installazioni, che si scambiano **pacchetti file**. Non usare un file SQLite condiviso su cartella di rete (rischio di corruzione e di perdita di dati); la scelta è documentata in `DECISIONS.md`.

**6-quater.1 — Definizione del perimetro.**
- Un perimetro si definisce per sottoalbero WBS, filone, control account, elenco esplicito di task, risorsa/responsabile, o combinazione; può essere **dinamico** (regola, es. "tutti i task sotto WBS 2.3") o **statico** (elenco di Unique ID). È risolto in `scope_task` a un dato `plan_hash`.
- Un task appartiene a **un solo perimetro attivo per status date** (default). Rileva sovrapposizioni (avviso o blocco, configurabile) e **task orfani** non coperti da alcun perimetro (elenco al coordinatore).
- I task riepilogativi (summary) **non sono mai editabili né alimentati**: la loro % la calcola MS Project dai figli; nell'app si mostra la % di roll-up calcolata dal motore.
- Se dopo una ri-sincronizzazione del piano compaiono task nuovi sotto un nodo di un perimetro dinamico, o ne scompaiono, l'app lo segnala all'utente e al coordinatore ("nuovo task nel tuo perimetro", "task rimosso dal piano").
- Per ogni utente l'interfaccia mostra **solo il proprio perimetro in modifica**; i task fuori perimetro sono nascosti o in sola lettura attenuati (impostazione), per dare contesto senza permettere modifiche.

**6-quater.2 — Distribuzione del lavoro e consolidamento (due modalità di partenza).**
- **Modalità pacchetto (consigliata):** il **coordinatore** importa l'export del piano, definisce i perimetri ed esporta per ciascun utente un `pacchetto di lavoro` (`.evmwork`, zip con JSON: task del perimetro, dati di baseline e ultimo stato approvato, status date, definizione del perimetro, `plan_hash`, versione schema). L'utente lo importa nella propria installazione e inserisce l'avanzamento; esporta un `pacchetto di avanzamento` (`.evmprog`) con le sue entry in stato `inviato`, estratto dell'`audit_log`, `content_hash` e, se attiva, firma.
- **Modalità diretta:** l'utente importa l'export del piano e seleziona il proprio perimetro; l'app registra `plan_hash` e perimetro e, in esportazione, produce comunque un `.evmprog`.
- Il coordinatore importa i `.evmprog` (anche parziali o a più riprese). Importazione **idempotente** per `package.id`: lo stesso pacchetto importato due volte non duplica nulla.
- **Pacchetto di aggiornamento piano** (`kind = aggiornamento_piano`): dopo il re-import dell'export di MS Project (6-ter.5) il coordinatore può esportare agli utenti le nuove date, i float e il cammino critico dei loro task, così che non servano il file di piano né MS Project.

**6-quater.3 — Validazioni e conflitti all'importazione di un pacchetto (coordinatore del piano).**
- Entry su task **fuori dal perimetro dichiarato** del mittente → rifiutate e registrate.
- `plan_hash` diverso da quello corrente → **blocco** o avviso con elenco dei task interessati (scelta del coordinatore), mai applicazione silenziosa.
- Due pacchetti con lo stesso task e valori diversi per la stessa status date → record in `package_conflict`; il coordinatore sceglie (valore A / valore B / valore manuale) con motivo obbligatorio; nulla viene sovrascritto senza traccia.
- Status date del pacchetto diversa da quella aperta → richiede conferma; pacchetti più vecchi dell'ultimo approvato → segnalati.
- Le validazioni di 6-ter.3 si applicano a ogni entry importata.

**6-quater.4 — Copertura e EVM parziale.**
- Per ogni status date mostra la **copertura** per perimetro e per utente: % di task e % di BAC con avanzamento approvato, task non aggiornati ("stale", con età in status date), pacchetti attesi e non ricevuti.
- L'**EVM di perimetro** (PV/EV/AC/CV/SV/CPI/SPI/EAC) si calcola sui soli task del perimetro. Vale l'identità: se i perimetri partizionano il piano e la copertura è completa, **Σ EV/PV/AC dei perimetri = EV/PV/AC di progetto** (test obbligatorio).
- L'**EVM di progetto** usa l'ultimo avanzamento approvato di ciascun task e viene marcato `provvisorio` se la copertura (in % di BAC) è sotto la soglia di parametro (default 100% per `finale`), mostrando quanta parte del BAC non è aggiornata. Uno snapshot `finale` richiede copertura sopra soglia o approvazione esplicita del coordinatore con motivo.
- Gli indici di un perimetro non completo non devono essere confrontati con la soglia di semaforo senza mostrare la copertura accanto.

**6-quater.5 — Feed parziale verso MS Project.**
- Il feed si genera **solo per task approvati** del perimetro scelto (`feed_batch.scope_id`), o consolidato per più perimetri; mai per task fuori perimetro, mai per task summary.
- Poiché i valori sono assoluti e i perimetri sono disgiunti, **l'applicazione di più feed parziali è commutativa e idempotente**: l'ordine non cambia il risultato (test). Il feed (merge per `Unique ID`) tocca solo le righe presenti nel file.
- La **Status Date** di progetto la scrive solo il feed consolidato del coordinatore (o un feed parziale con opzione esplicita), per evitare che due feed impostino date diverse.
- La verifica post-aggiornamento (6-ter.5) è per batch/perimetro; il coordinatore vede un riepilogo complessivo per utente.

**6-quater.6 — Ruoli, permessi e fiducia.**
- *Project engineer*: ispeziona i lavori e inserisce l'avanzamento nel proprio perimetro. I tre ruoli operativi sono **cumulabili senza vincoli** sulla stessa persona. Il *coordinatore del piano* definisce perimetri, importa/esporta pacchetti, risolve conflitti, gestisce baseline e change request, produce feed e snapshot `finale`. *Supervisore (direttore tecnico)*: dirige l'esecuzione e approva l'avanzamento nei perimetri assegnati; legge l'EVM per decidere azioni di recupero, ma non gestisce baseline né change request. Se la stessa persona ha sia `project_engineer` sia `supervisore`, può approvare i propri inserimenti: l'app lo consente (default `auto_approvazione = consentita` quando l'utente ha entrambi i ruoli), ma registra nell'`audit_log` che inserimento e approvazione sono dello stesso utente e lo evidenzia nei report. Il divieto di auto-approvazione resta un'impostazione attivabile per i progetti con più persone. Permessi applicati nel backend Rust (non solo nell'interfaccia).
- Sono **identità locali** (nessun server di autenticazione): documenta che non sono un confine di sicurezza contro un utente malevolo. Per l'integrità, ogni pacchetto ha `content_hash`; opzionale: **firma Ed25519** del pacchetto con chiave per utente (chiavi pubbliche registrate dal coordinatore in `user_profile.public_key`), verificata all'importazione; pacchetti non firmati o con firma non valida → avviso o blocco secondo impostazione.
- Un utente non approva le proprie entry se così configurato (separazione dei ruoli).

**6-quater.7 — Test obbligatori.** (a) partizione: Σ perimetri = progetto; (b) pacchetti sovrapposti producono conflitti, mai sovrascritture silenziose; (c) importare due volte lo stesso pacchetto = nessuna modifica; (d) due feed parziali applicati in ordine diverso → stesso stato finale; (e) entry fuori perimetro rifiutate; (f) ri-sincronizzazione con task aggiunti/rimossi nei perimetri dinamici; (g) firma non valida respinta.

## 7. Import del piano da export di MS Project (XML, Excel, CSV)
- **Formati**, in ordine di preferenza: (1) **XML MSPDI** (*Salva con nome → XML*): contiene task, risorse, assegnazioni, calendari, precedenze e baseline; (2) **Excel** da *Salva con nome → Cartella di lavoro di Excel* con una **mappa di esportazione** (task, risorse, assegnazioni); (3) **CSV**, più fragile (separatore, codifica e date dipendono dalla lingua di Windows). Il `.mpp` non è supportato. L'import supporta la modalità **ri-sincronizza**: stesso progetto, aggancio per `Unique ID`, nessuna duplicazione, confronto con `source_sync` (hash dell'ultimo export). Per i programmi che non producono MSPDI (Primavera P6, Smartsheet, altri) si usa l'**export Excel/CSV con mappatura**. Altri formati nativi (XER, PMXML) non sono supportati in questa versione e restano un possibile sviluppo futuro.
- Estrai (dall'XML tutto quanto presente; da Excel/CSV solo i campi esportati): calendari, task (WBS, summary/milestone, date, durate, % complete, % fisica, actual start/finish), dipendenze, risorse e tariffe, assegnazioni, **tutte le baseline presenti (Baseline, Baseline1…10)** con costi e lavoro, **dati time-phased** (planned, baseline, actual) con granularità giornaliera o settimanale, campi personalizzati rilevanti (metodo di EV, control account).
- Wizard di importazione: scelta file → anteprima (n. task, n. risorse, baseline trovate) → **mappatura baseline** (quale è "stima", quale "startup") → scelta status date → conferma. Importare lo stesso progetto in una data successiva aggiunge un nuovo `status_snapshot` agganciando i task per `uid_source`; elenca i task nuovi, rimossi e rinumerati. Se il formato è Excel/CSV, il wizard apre prima la **mappatura delle colonne**: associa le colonne del file ai campi dell'app (chiave di aggancio, WBS, nome, inizio, fine, durata, lavoro, costo, predecessori, risorse, % completamento, baseline), propone una mappatura automatica per nome di colonna (italiano e inglese), mostra un'anteprima e salva la mappatura come **profilo di importazione** riutilizzabile.
- **Campi minimi dell'export Excel/CSV** (l'app mostra questo elenco nella guida di importazione e controlla ogni colonna, segnalando quelle mancanti con un messaggio chiaro): *Task*: `Unique ID` (**obbligatorio**, chiave di aggancio), `WBS`, `Name`, `Outline Level`, `Summary`, `Milestone`, `Start`, `Finish`, `Duration`, `Work`, `Cost`, `Predecessors`, `Resource Names`, `% Complete`, `Physical % Complete`, `Actual Start`, `Actual Finish`, `Actual Work`, `Actual Cost`, `Baseline Start/Finish/Work/Cost` (e `Baseline1…10` se usate); *Risorse*: `Unique ID`, `Name`, `Type`, `Group`, `Standard Rate`, `Overtime Rate`, `Cost/Use`; *Assegnazioni*: `Task Unique ID`, `Resource Unique ID`, `Work`, `Units`. Dati time-phased e calendari non sono disponibili da Excel/CSV: l'app **distribuisce baseline e lavoro linearmente** sui giorni lavorativi del calendario di default e lo segnala come avviso di qualità dati (nell'XML, se i dati time-phased sono presenti, li usa).
- **Chiave di aggancio per profilo**: `Unique ID` per MS Project, `Activity ID` (o codice task) per Primavera, colonna a scelta per il profilo generico. La chiave deve essere unica e stabile: se si ripetono valori o se tra due import molte chiavi cambiano, l'app blocca l'importazione e lo segnala. Il campo `uid_source` del modello dati contiene la chiave del profilo.
- Gestisci file corrotti, password, versioni non supportate: messaggi chiari, nessun crash. Timeout e annullamento dell'import.
- Test: fixture sintetiche in XML MSPDI, Excel e CSV (con lo stesso piano in tre formati); verifica che i tre import diano lo stesso risultato per i campi comuni, e che il numero di task, la somma dei costi baseline e le date coincidano. Test negativi: `.mpp` selezionato, colonna `Unique ID` mancante, separatore CSV errato, date in formato diverso.

## 8. Interfaccia utente (specifica grafica e di navigazione)

### 8.1 Principi di design
- **Strumento professionale denso di dati**, non un'app consumer: molte tabelle, poco spazio sprecato, stile vicino a Excel/MS Project/strumenti di controllo. Finestra minima 1280×720, ottimizzata per 1920×1080 e per due monitor (ogni scheda può staccarsi in una finestra a parte).
- **Codice colore semantico, sempre uguale in tutta l'app**: verde/giallo/rosso = semaforo CPI/SPI (soglie da parametri); **blu chiaro = cella di input modificabile**; **grigio = valore calcolato (non modificabile)**; **arancione = provvisorio / non approvato**; viola = in conflitto; testo barrato = task rimosso dal piano. Mai solo colore: ogni stato ha anche icona e testo (accessibilità).
- Numeri **allineati a destra**, cifre tabulari, formato italiano (1.234,56 €; 12,5%; date `gg/mm/aaaa`); negativi in rosso con segno; indici (CPI, SPI) con 2 decimali; valori non calcolabili mostrati come `—` con tooltip del motivo (es. "CPI non definito: EV = 0"), mai `#VALUE!` o `NaN`.
- Tema chiaro/scuro, scala del font regolabile, tutto utilizzabile da tastiera.
- Componenti: **React + Tailwind + shadcn/ui (Radix)**, **TanStack Table + TanStack Virtual** (tabelle virtualizzate), **Apache ECharts** (grafici), **react-resizable-panels** (pannelli ridimensionabili), **cmdk** (palette comandi), **dnd-kit** (riordino colonne). Design token (colori, spaziature, raggi) definiti in un unico file; Storybook per i componenti di base; test visivi Playwright con screenshot per le schermate principali.

### 8.2 Layout generale della finestra
```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Menu: File  Modifica  Vista  Progetto  Avanzamento  Feed  Analisi  Strumenti  Aiuto       │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ [Progetto ▾ Impianto X]  Status date [30/09/2026 ▾ ●Provvisorio]  Perimetro [Mio ▾]       │
│ Baseline [Startup ▾]  Base EV [senza contingency]   🔍 Cerca task (Ctrl+K)  🔔3  👤 Rossi  │
├────────┬──────────────────────────────────────────────────────────┬───────────────────────┤
│ SIDE   │ ┌ Scheda1 ┐┌ Scheda2 ┐┌ + ┐                              │ PANNELLO DETTAGLIO    │
│ BAR    │ ├─ barra strumenti della schermata (filtri, azioni) ─────┤ │ (ispettore, chiudibile│
│ (icone │ │                                                        │ │  con Ctrl+I)          │
│ + testo│ │            AREA DI LAVORO                              │ │ Tab: Dettaglio |      │
│ comprim│ │     (tabelle, grafici, form)                           │ │ Storico | Audit |     │
│ ibile) │ │                                                        │ │ Anomalie              │
│        │ │                                                        │ │                       │
├────────┴──────────────────────────────────────────────────────────┴───────────────────────┤
│ Stato: Copertura 82% BAC · Piano: sincronizzato ✔ (hash a3f9…) · ⚠ 7 anomalie · Salvato  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Barra superiore di contesto (sempre visibile)**: selettore progetto; **Status date** (elenco degli snapshot con icona di stato: bozza/provvisorio/finale); **Perimetro** (Tutto il progetto / Il mio perimetro / altri perimetri, secondo i permessi); **Baseline** di riferimento; badge della **base di misura EV** (con/senza contingency); ricerca globale task (per nome, Unique ID, WBS); centro notifiche; utente e ruolo. Cambiare uno di questi selettori aggiorna tutte le schede aperte.
- **Sidebar sinistra** comprimibile (icone + etichette), con gruppi: *Lavoro* (Avanzamento, Approvazioni, Feed MS Project), *Analisi* (Dashboard, WBS, Task e risorse, Gantt, Forecast, Filoni e programma, Agile/Flow, Buffer e riserve), *Governo* (Baseline e change request, Qualità dati, Report), *Coordinamento* (Perimetri e utenti, Consolidamento pacchetti), *Sistema* (Importa/Esporta, Impostazioni). Un pallino numerico sulle voci indica elementi da gestire (es. approvazioni in attesa, conflitti aperti, anomalie critiche).
- **Schede (tab) di documento** nell'area centrale: si possono aprire più schermate in parallelo, riordinare, chiudere e **staccare in una finestra** separata. Le schede si ricordano all'apertura successiva del progetto.
- **Pannello di dettaglio destro** (ispettore): mostra la riga selezionata con tab *Dettaglio*, *Storico* (valori per status date), *Audit* (chi/quando/prima/dopo), *Anomalie*. Ridimensionabile e comprimibile.
- **Barra di stato in basso**: copertura % del BAC aggiornato, stato di sincronizzazione del piano (hash, data ultimo import, avviso se l'ultimo export importato è più vecchio di quello presente nella cartella monitorata o l'utente segnala che il piano è cambiato), numero di anomalie (clic = apre la Qualità dati filtrata), stato di salvataggio (le modifiche si salvano automaticamente nel DB; indicatore "Salvato"), operazioni lunghe in corso con barra di avanzamento e pulsante Annulla.

### 8.3 Barra dei menu (con scorciatoie)
- **File**: Nuovo progetto…, Apri progetto… (Ctrl+O), Progetti recenti ›, Importa › (Piano da export MS Project (XML/Excel/CSV)… · Workbook Excel Impresa Numerica… · Pacchetto `.evmwork`/`.evmprog`…), Esporta › (Workbook Excel… · Report PDF… · Pacchetto di lavoro… · Pacchetto di avanzamento… · CSV della vista corrente), Chiudi progetto, Esci.
- **Modifica**: Annulla/Ripeti (Ctrl+Z / Ctrl+Y, vale per le entry in bozza), Copia/Incolla (anche blocchi da Excel), Trova (Ctrl+F nella tabella), Vai al task… (Ctrl+G).
- **Vista**: Tema chiaro/scuro, Dimensione testo, Mostra/nascondi sidebar (Ctrl+B), Mostra/nascondi pannello dettaglio (Ctrl+I), Colonne…, Salva vista corrente…, Ripristina layout, Schermo intero (F11).
- **Progetto**: Parametri e soglie…, Base di misura EV…, Calendario status date…, Crea snapshot…, Blocca baseline…, Nuova change request…, Ri-sincronizza piano (Ctrl+R).
- **Avanzamento**: Vai a Avanzamento lavori, Invia per approvazione, Approva selezione, Respingi selezione…, Copia avanzamento dalla status date precedente.
- **Feed**: Procedura guidata feed MS Project…, Verifica aggiornamento (carica il nuovo export)…, Storico feed.
- **Analisi**: Dashboard, Forecast, Earned Schedule, Monte Carlo…, Confronta baseline…, Esegui controlli di qualità dati.
- **Strumenti**: Gestione utenti e perimetri (coordinatore del piano), Log di importazione, Cartella dati.
- **Aiuto**: Guida, Glossario KPI (le interpretazioni del libro), Scorciatoie da tastiera (Ctrl+/), Informazioni (versione, copyright, **link al codice sorgente** del tag corrispondente alla versione installata), Licenza GPL e terze parti.
- **Palette comandi (Ctrl+K)**: ricerca di qualsiasi comando, schermata o task.

### 8.4 Comportamento comune di tutte le tabelle
- Intestazione fissa, prime colonne congelabili (WBS/Task), **ridimensionamento e riordino colonne** (trascinamento), selettore colonne, ordinamento multiplo (Maiusc+clic), filtro per colonna (testo, intervallo, valori) e **filtri rapidi a chip** (es. "Solo critici", "Non aggiornati", "In anomalia", "Fuori soglia").
- **Raggruppamento** per WBS (albero espandibile con livelli 1–5), filone, perimetro, responsabile, fase; riga di **totali/aggregati** a piè di tabella (somme per BAC/PV/EV/AC, indici ricalcolati — non medie di indici).
- **Viste salvate** con nome (colonne, filtri, ordinamento) per utente.
- Modifica **in cella** per le colonne di input (sfondo blu chiaro): Invio/Tab/frecce per spostarsi, F2 per modificare, Esc annulla, incolla blocchi da Excel con validazione riga per riga prima di confermare, riempimento verso il basso (Ctrl+D). Celle non modificabili in grigio con lucchetto e tooltip del motivo (es. "Task fuori dal tuo perimetro", "Avanzamento già approvato").
- Menu contestuale (tasto destro): Apri dettaglio, Copia valore, Copia riga, Vai nel Gantt, Mostra storico, Segnala anomalia, Esporta selezione in CSV.
- Colonne in avviso/critico evidenziate con barra laterale colorata e icona; hover = tooltip con valore, soglia e interpretazione.
- Virtualizzazione obbligatoria: scorrimento fluido con ≥ 20.000 righe.

### 8.5 Schermate

**1. Home / Progetti (avvio).** Elenco dei progetti recenti (scheda con nome, sorgente (XML/Excel/CSV), ultima status date, stato snapshot, copertura, anomalie), pulsanti *Nuovo da export di MS Project*, *Apri*, *Importa workbook Excel*, *Importa pacchetto*. Se il file di export collegato al progetto è stato modificato dall'ultimo import: banner arancione "Il piano è cambiato → Ri-sincronizza".

**2. Dashboard.** Barra filtri (status date, perimetro, baseline). Riga di **card KPI** (grandi, clic = apre il dettaglio): BAC di misura, PV, EV, AC, CPI, SPI, EAC, VAC, TCPI, SPI(t) — ognuna con valore, semaforo, variazione rispetto alla status date precedente, **mini-sparkline** e icona "?" con interpretazione. Sotto, griglia a due colonne:
 - *Curva S* (PV, EV, AC, proiezione EAC tratteggiata, banda ±σ, linea della status date, selettore baseline);
 - *Trend CPI/SPI* per status date con fasce verde/giallo/rosso delle soglie;
 - *Top 10 scostamenti* (tabella: WBS/task, CV, SV, CPI, SPI, impatto sull'EAC) con link al task;
 - *Copertura per perimetro/utente* (barre orizzontali % BAC aggiornato, con segnalazione `provvisorio`/`finale`);
 - *Riserve* (indicatori a barra: contingency usata/stanziata, management reserve, buffer di tempo — indice di salute %consumato/%completato);
 - *Filoni* (mini-tabella EV/AC/PV/CPI/SPI per filone) e *Anomalie critiche* (elenco con clic per aprire).

**3. Avanzamento lavori (schermata principale di inserimento).** Barra strumenti: selettore status date, filtri a chip (*Miei*, *Da aggiornare*, *In bozza*, *Respinti*, *In anomalia*, *In ritardo*), ricerca, pulsanti *Salva bozza*, *Invia per approvazione*, *Copia da periodo precedente*, *Importa da Excel/timesheet*. Griglia con colonne (le modificabili in blu):
 `☐ | Stato (bozza/inviato/approvato/applicato/respinto) | UID | WBS | Task | Filone | Responsabile | Metodo EV | Inizio pian. | Fine pian. | % fisica prec. | **% fisica** | **Unità fatte / totali** (visibile se metodo = unità) | **Milestone chiuse** (apre mini-elenco pesato se metodo = milestone) | **Inizio reale** | **Fine reale** | **Ore reali** | **Ore residue** | **AC €** | PV € | EV € | SPI task | CPI task | Anomalie | Nota`
 La % fisica è calcolata e bloccata (grigia) quando il metodo la deriva da unità o milestone; resta editabile per 0/100 (solo 0 o 100), 50/50, LOE e % soggettiva. Per la **% soggettiva** compare in riga l'icona "segnale indipendente richiesto" che apre un mini-form (ore consumate/stimate, deliverable, difetti aperti). Riga di totali in fondo (BAC task, PV, EV, AC del filtro). I task fuori perimetro sono nascosti o attenuati e non editabili; i task summary mostrano i valori di roll-up in sola lettura. Validazioni 6-ter.3 mostrate **in riga** (icona + tooltip) e nel pannello Anomalie; non si può inviare se ci sono errori bloccanti.
 Pannello destro: *Dettaglio* (metodo, peso, dati di baseline, risorse assegnate), *Storico* (valori per status date), *Audit*, *Note*.

**4. Approvazioni.** Tabella raggruppata per utente/perimetro con le entry in stato *inviato*: `Task | Utente | Valore precedente → nuovo | Δ % | Anomalie | Segnale indipendente | Azione`. Azioni di riga e di gruppo: *Approva*, *Respingi (motivo obbligatorio)*, *Modifica e approva*. Vista affiancata "prima/dopo" nel pannello destro. Filtro "solo con anomalie".

**5. Feed MS Project (procedura guidata a 5 passi, indicatore di avanzamento in alto).**
 1. *Verifica piano*: hash e data dell'ultimo export importato vs file indicato dall'utente; elenco di task aggiunti/rimossi/rinumerati; pulsante *Ri-sincronizza*; avanzamento bloccato se il piano è cambiato.
 2. *Selezione dati*: perimetro, status date, solo approvati (non disattivabile), campi da alimentare (Actual Start/Finish, % Complete, Physical % Complete, Actual Work, Remaining Work, Actual Cost — con avviso sull'opzione di MS Project per il costo).
 3. *Anteprima differenze* (tabella `UID | Task | Campo | Valore attuale in MS Project | Nuovo valore | Esito/avviso`), con filtro per campo e conteggio modifiche.
 4. *Genera*: scelta profilo di destinazione (MS Project, Primavera P6, Generico), formato (**Excel `.xlsx`** o **CSV**), cartella di destinazione, generazione del file + `LEGGIMI_feed.md` con le istruzioni passo-passo, riepilogo del batch.
 5. *Applicazione e verifica*: caricamento del nuovo export di MS Project (dopo l'applicazione manuale del PM), confronto campo per campo (verde = applicato, giallo = valore ricalcolato da MS Project, rosso = non applicato), report esportabile. Lo storico dei feed è consultabile da *Feed ▸ Storico feed*.

**6. WBS e control account (tabella ad albero).** Colonne: `WBS | Nome | BAC | PV | EV | AC | CV | SV | CPI | SPI | EAC | VAC | % pian. | % reale | Copertura | Semaforo`. Selettore del livello (1–5), filtro "solo fuori soglia", ordinamento per scostamento, clic su riga = apre i task nella scheda Task con filtro applicato. Barra sottile in riga che mostra % pian. vs % reale.

**7. Task e risorse (tab: Task · Risorse · Assegnazioni).**
 - *Task*: `UID | WBS | Nome | Filone | Metodo EV | Inizio pian. | Fine pian. | Inizio base. | Fine base. | Δ fine (gg) | % reale | BAC | PV | EV | AC | CV | SV | CPI | SPI | Float | Critico (sola lettura da MS Project) | Anomalie`.
 - *Risorse*: `Nome | Tipo | Tariffa importata | Costo orario reale | Fonte tariffa | Ore pian. | Ore reali | Costo pian. | AC | CV | Utilizzo %` con avviso se manca il costo reale.
 - *Assegnazioni*: `Task | Risorsa | Unità % | Ore pian. | Ore reali | Ore residue | Costo pian. | AC`.

**8. Gantt (sola lettura).** A sinistra una tabella (WBS, Nome, Inizio, Fine, % reale) con le stesse regole delle tabelle; a destra la **timeline**: barra *baseline* (sottile, grigia, sotto), barra *attuale* (blu) con **riempimento scuro = % reale**, task critici con contorno rosso, milestone a rombo, **linea verticale della status date**, frecce di dipendenza attivabili, evidenza dei task del proprio perimetro. Zoom (giorno/settimana/mese/trimestre), selettore baseline, scorrimento sincronizzato con la tabella. Tooltip su barra: date pianificate/baseline/reali, durata, % pian. vs reale, SPI.

**9. Baseline e change request (tab: Baseline · Confronto · Change request · Scope).**
 - *Baseline*: `Nome | Tipo (stima/startup/altra) | Creata il | Bloccata 🔒 | BAC diretto | BAC indiretto | Contingency | BAC totale | Creata da`.
 - *Confronto*: due selettori (es. stima vs startup), tabella per WBS `Δ costo | Δ % | Δ durata | Δ date`, segnalazione di scostamento > 20% (giallo) o > 30% (rosso) come da libro.
 - *Change request*: `# | Data | Richiedente | Motivo | Δ costo | Δ durata | Δ scope | Approvata da | Stato` + modulo di creazione; nessuna nuova baseline senza change request.
 - *Scope*: elenco dei WBS inclusi/esclusi nella baseline di scope.

**10. Forecast (tab: EAC · Earned Schedule · Monte Carlo).**
 - *EAC*: affiancamento di **base** (AC + ETC) e **ottimistica**; tabella `ETC | EAC | VAC | TCPI` e grafico a confronto con il BAC; messaggio guida "TCPI > 1,1: il budget residuo richiede un'efficienza superiore al 110% — considera riprogrammare, rinegoziare o correggere (§3.6)".
 - *Earned Schedule*: ES, SPI(t), SV(t), data di fine prevista vs pianificata, grafico PV/EV con ES evidenziato.
 - *Monte Carlo*: parametri (iterazioni, seed, finestra di velocity/throughput), pulsante *Esegui* con progresso e annulla, **istogramma delle date/costi finali** con marcatori P50/P80/P90 e tabella dei percentili.

**11. Filoni e programma.** Tabella `Filone | Tipo | Metodo di misura | BAC | PV | EV | AC | CPI | SPI | Peso sul programma | Semaforo` con riga di **programma** (somma) e ricalcolo degli indici di programma; sotto, elenco dei **gate** tra filoni (`Da filone → A filone | Data gate | Buffer (gg) | Stato`) con avviso se il filone a scope variabile consegna dopo il gate senza buffer.

**12. Buffer e riserve (tab: Contingency · Management reserve · Buffer di tempo).** Tabelle come nel foglio del libro (`Rischio | Probabilità | Impatto | Stanziata | Utilizzata | Residuo | Stato`), indicatori a barra di consumo, indice di salute del buffer con soglie colorate.

**13. Agile/Flow (tab: Sprint · Velocity · Flusso · Monte Carlo).** *Sprint*: `Sprint | SP pianificati | SP completati | Velocity | Velocity media | Costo/SP di baseline | EV agile | AC | CPI agile | Backlog residuo | Sprint residui | EAC tempo | EAC costo`; *Velocity*: grafico a barre con media mobile; *Flusso*: throughput, cycle time, WIP osservato vs teorico (Legge di Little), **Cumulative Flow Diagram**; *Monte Carlo*: come in Forecast, sulla velocity.

**14. Perimetri e utenti (coordinatore del piano).** Due pannelli: a sinistra elenco dei perimetri (`Nome | Tipo regola | Proprietario | Approvatore | N. task | % BAC`); a destra editor con tab *Regola* (costruttore a condizioni: WBS, filone, control account, risorsa, elenco task), *Task risolti* (tabella con rimozioni/aggiunte manuali), *Utenti*. In alto una **mappa di copertura del progetto** (treemap della WBS colorata per perimetro; task orfani in rosso tratteggiato; sovrapposizioni in viola) e il pulsante *Esporta pacchetto di lavoro*. Sotto, tab *Utenti e ruoli* (`Nome | Ruolo | Perimetri | Chiave pubblica | Attivo`).

**15. Consolidamento pacchetti (coordinatore del piano).** Tabella `Utente | Perimetro | Tipo | Status date | Ricevuto il | Firma | Entry | Conflitti | Stato | Azioni`, con righe "atteso ma non ricevuto" evidenziate. *Risolutore di conflitti* a due colonne affiancate (valore pacchetto A | valore pacchetto B | valore manuale + motivo). Riepilogo di copertura e pulsante *Dichiara snapshot finale* (disabilitato sotto soglia salvo approvazione con motivo).

**16. Qualità dati.** Tabella `Gravità | Regola | Task/WBS | Descrizione | Suggerimento | Stato (aperta/accettata/risolta) | Utente`, raggruppabile per categoria (baseline, metodo EV, costi, date, perimetro, import), filtri per gravità, azione *Accetta con motivo* (tracciata), contatore per gravità nella barra di stato.

**17. Report.** A sinistra le opzioni (status date, perimetro, sezioni da includere: riepilogo, curva S, top scostamenti, anomalie, riserve, filoni, Monte Carlo, interpretazioni dei KPI), a destra **anteprima A4** in tempo reale; esporta PDF/HTML.

**18. Importa/Esporta (procedure guidate).** *Piano da export (XML MSPDI, Excel, CSV)*: scelta file, formato e profilo → mappatura colonne (per Excel/CSV) → controllo colonne obbligatorie → anteprima (n. task, risorse, baseline trovate) → mappatura baseline (stima/startup) → riconciliazione BAC (diretto, overhead, contingency) → tariffe/costo reale → status date → conferma; *Workbook Excel*: scelta file → riepilogo input riconosciuti → pannello **Esito importazione** con avvisi di coerenza (date, contingency, EV=0, schema precedente) → conferma; *Pacchetti*: esito per entry accettata/rifiutata/in conflitto.

**19. Impostazioni (tab).** *Progetto* (parametri del foglio Parametri, date, buffer), *Soglie semaforo*, *Base di misura EV*, *Agile* (durata sprint, costo team, SP pianificati, finestra velocity), *Utenti e ruoli*, *Feed e profili* (profilo di destinazione e di importazione, editor dei profili JSON, formato predefinito Excel/CSV, separatore e codifica CSV, controllo opzione Actual Cost), *Aspetto e lingua*, *Avanzate* (cartelle, log, diagnostica).

### 8.6 Matrice schermate × ruoli
Le colonne sono **ruoli**, non persone: i permessi di un utente sono l'unione dei suoi ruoli (una persona unica con tutti e tre i ruoli vede e fa tutto).

| Schermata | Project engineer | Supervisore (direttore tecnico) | Coordinatore del piano |
|---|---|---|---|
| Avanzamento lavori | modifica (proprio perimetro) | modifica/approva (perimetri assegnati) | tutto |
| Approvazioni | — | sì | sì |
| Feed MS Project | genera feed parziale (se abilitato) | genera feed del perimetro | tutto + consolidato |
| Dashboard, WBS, Task, Gantt, Forecast | sola lettura sul proprio perimetro | perimetri assegnati | tutto il progetto |
| Baseline e change request | sola lettura | sola lettura | gestione |
| Perimetri e utenti, Consolidamento | — | — | sì |
| Qualità dati | proprio perimetro | perimetri assegnati | tutto |
| Impostazioni | solo aspetto | aspetto | complete |
I permessi sono applicati nel backend (6-quater.6), non solo nascondendo le voci.

### 8.7 Feedback, stati e accessibilità
- **Stati vuoti** illustrati con un'azione ("Nessun avanzamento per questa status date → *Copia dal periodo precedente*"); **skeleton** durante il caricamento; **toast** per esiti rapidi; **finestre modali** solo per azioni distruttive o decisioni (conferma di blocco baseline, snapshot finale).
- **Operazioni lunghe** (import del piano, Monte Carlo, esportazione) sempre in background con barra di avanzamento, annullabili, senza bloccare l'interfaccia.
- **Errori** in linguaggio chiaro con causa e rimedio; dettagli tecnici in un pannello espandibile e nel log.
- Etichette e testi in italiano da file di risorse (`i18n/it.json`); ogni KPI ha il tooltip di interpretazione (`i18n/kpi_interpretazioni.it.json`) con il riferimento al paragrafo del libro; navigazione completa da tastiera, focus visibile, contrasto AA, nessuna informazione affidata al solo colore.
- Le preferenze di layout (schede aperte, colonne, viste salvate, tema) si salvano **per utente** e non nel file di progetto.

## 9. Fasi di sviluppo
- **Fase 1 — Fondamenta**: scaffold Tauri+React+TS, workspace `packages/engine`, DB SQLite con migrazioni, CI, licenze; **guscio UI** (sez. 8.2–8.4): design token, tema chiaro/scuro, layout con menu, barra di contesto, sidebar, schede staccabili, pannello dettaglio, barra di stato, palette comandi, componente tabella comune (virtualizzata, colonne, filtri, modifica in cella, viste salvate) con Storybook.
- **Fase 2 — Motore EVM**: stima, EVM, casi limite, Earned Schedule, semafori, buffer, Agile corretto, filoni e aggregazione di programma, `ev_base_mode`, Monte Carlo (seed riproducibile), CFD; test completi con la fixture e con i casi 6-bis.
- **Fase 3 — Excel**: import (tutte le regole sez. 5) ed export con formule e grafici; round-trip test; pannello esito importazione.
- **Fase 4 — Import del piano**: parser XML MSPDI (`quick-xml`), Excel (mappa di esportazione) e CSV, controllo colonne obbligatorie, wizard di import con riconciliazione del BAC (6-bis.8) e gestione tariffe (6-bis.7), baseline e status snapshot, test sulle fixture nei tre formati.
- **Fase 4-bis — Feeder**: tabelle `progress_entry`/`feed_batch`/`audit_log`/`source_sync`, schermata di inserimento avanzamento con workflow di approvazione, validazioni 6-ter.3, feed xlsx/csv per l'importazione guidata di MS Project e istruzioni (`LEGGIMI_feed.md`), ri-sincronizzazione e verifica 6-ter.5, test di round trip 6-ter.6.
- **Fase 4-ter — Perimetri e multi-utente**: `user_profile`, `scope`/`scope_task`, risoluzione e regole di perimetro, permessi nel backend, pacchetti `.evmwork`/`.evmprog`/aggiornamento piano, importazione idempotente, conflitti, copertura e EVM di perimetro/provvisorio-finale, feed parziale e consolidato; poi firma Ed25519 opzionale. Test 6-quater.7.
- **Fase 5 — UI di analisi** (schermate 8.5: Dashboard, WBS, Task/Risorse, Gantt, Baseline, Forecast, Filoni, Agile, Buffer, Qualità dati, Report; test visivi Playwright): Dashboard, WBS, Task/Risorse, Gantt sola lettura, Baseline/Snapshot/Change request, Forecast, Filoni e programma, Agile/Monte Carlo, tooltip di interpretazione dei KPI.
- **Fase 6 — Qualità e report**: controlli qualità, report PDF, performance, installer (MSI/DMG/AppImage), documentazione utente.

## 10. Criteri di accettazione generali
- Importare la fixture Excel e ricalcolare: BAC = 55.933,87 €, effort 77,17 gg-persona, σ progetto 2,06 gg (come nel file), senza errori `#VALUE!` e con gli avvisi di coerenza della sez. 5.
- CPI agile di sprint 3 della fixture ≈ 0,92 (EV 33.200 €, AC 36.000 €) con `baseline_cost_per_sp` = 400 €/SP; con `bac_senza_contingency` il BAC di misura della fixture = 48.638,15 €.
- Round trip feeder: piano di fixture → avanzamento inserito e approvato → feed (xlsx e csv) → applicazione simulata → re-import: tutti i campi alimentati risultano uguali nel `verify_result_json`; riapplicare lo stesso feed non cambia nulla (idempotenza).
- Il feed non contiene mai date pianificate, baseline, precedenze o calendari; il feed viene bloccato se l'export importato non è più quello attuale (hash diverso) o se esistono task privi di `Unique ID` corrispondente.
- Ogni modifica di avanzamento è presente in `audit_log`; solo i dati `approvati` finiscono nel feed.
- Multi-utente: con tre utenti su perimetri disgiunti, dopo l'importazione dei tre pacchetti l'EVM di progetto coincide con la somma degli EVM di perimetro; un pacchetto mancante rende lo snapshot `provvisorio` con la copertura in % di BAC; un utente non vede né può alimentare task fuori dal proprio perimetro.
- Nessuna sovrascrittura silenziosa: ogni conflitto tra pacchetti richiede una risoluzione registrata; ogni pacchetto è importabile una sola volta.
- Identità testata: EAC lineare (BAC/CPI) = EAC base (AC + ETC) per ogni input valido con CPI > 0.
- Nessuna baseline bloccata modificabile da UI o da SQL diretto senza `change_request`; una variazione di stima/startup > 30% genera un'anomalia critica.
- Round-trip Excel senza perdita di input; i grafici del Dashboard restano presenti e si aggiornano.
- Import di un export (XML/Excel) con ≥ 2.000 task in < 15 s; apertura del progetto < 2 s.
- Coverage del motore ≥ 90%; nessun warning del linter; licenze verificate.
- UI: tutte le tabelle sono virtualizzate (scorrimento fluido con 20.000 righe), supportano ordinamento, filtri, colonne riordinabili e viste salvate; nessuna schermata mostra `#VALUE!`/`NaN`; ogni KPI ha il tooltip di interpretazione; un utente di perimetro non vede e non può modificare celle fuori dal proprio perimetro (celle in grigio con lucchetto); tutte le funzioni principali sono raggiungibili da tastiera e dalla palette comandi (Ctrl+K); screenshot di riferimento Playwright per le schermate 8.5 in tema chiaro e scuro.
- Ogni formula del motore ha un commento con il riferimento al paragrafo del libro (es. `// §3.6`).
