# Decisioni di sviluppo

Registro delle scelte prese quando un requisito del prompt di sviluppo era
ambiguo o quando l'ambiente di sviluppo ha imposto un vincolo pratico.
Aggiornato a ogni fase.

## Fase 1 — Fondamenta

1. **Posizione del progetto**: sottocartella `evm-analyzer/` nel repository
   `PietroniTecnologie-ImpresaNumerica` (sito e materiali del libro),
   scelta esplicita dell'utente invece di un repository separato.

2. **Gestore di package npm**: workspace npm nativi (`"workspaces":
   ["packages/*"]`), non pnpm/yarn — pnpm non era preinstallato
   nell'ambiente e il prompt non impone un gestore specifico.

3. **Node.js non preinstallato nell'ambiente di sviluppo**: installato in
   locale (`~/.local/node`, binari aggiunti a `~/.local/bin`), senza
   privilegi di root. Chi clona il repository deve installare Node.js 22+
   sul proprio sistema (vedi README § Prerequisiti).

4. **`@tanstack/react-table` pinnato a `8.21.3`** (non la `9.x` più
   recente al momento dell'installazione): la v9 è una riscrittura con
   un'architettura "a feature" e una API (`ColumnDef<TFeatures, TData,
   TValue>`) sostanzialmente diversa da quella documentata/matura della
   v8. Per la tabella comune (sez. 8.4), che è un componente critico
   riusato da tutte le schermate, si è preferita la API v8 stabile. Da
   rivalutare in una fase successiva.

5. **Tailwind CSS v4** (CSS-first, `@theme`) invece di v3: era la
   versione corrente al momento dell'installazione. I design token (sez.
   8.1) sono variabili CSS HSL su `:root`/`[data-theme="dark"]`, mappate a
   colori Tailwind via `@theme inline` in `src/styles/globals.css`.

6. **Tema chiaro/scuro** pilotato dall'attributo `data-theme` su
   `<html>` (store `theme-store.ts`), non da `prefers-color-scheme`: la
   sez. 8.1/8.3 richiede un comando utente esplicito (Vista → Tema), non
   solo una preferenza di sistema.

7. **Addon Storybook rimossi dal default di `storybook init`**:
   `@storybook/addon-vitest`, `@storybook/addon-mcp`,
   `@chromatic-com/storybook`. Causavano conflitti di peer-dependency con
   la versione di `vitest` già usata da `packages/engine` e non servono
   al guscio UI della Fase 1 (i test visivi Playwright sono previsti in
   Fase 5, sez. 9).

8. **Intestazione di copyright/licenza nei file sorgente**: formato
   compatto a due righe —
   `SPDX-License-Identifier: GPL-3.0-or-later` +
   `Copyright (C) 2026 Pietroni Tecnologie` — invece del blocco di
   licenza completo raccomandato dalla FSF, per restare leggibile su
   centinaia di file. Il testo integrale della licenza resta in
   `LICENSE`. Non applicato ai file di configurazione JSON (non
   supportano commenti) né ai file autogenerati non modificati
   (`vite-env.d.ts`).

9. **Anno di copyright**: 2026 (anno corrente nell'ambiente di sviluppo).

10. **Schema SQLite iniziale completo in un'unica migrazione**
    (`crates/evm-db/migrations/0001_schema_iniziale.sql`): la Fase 1
    richiede solo l'infrastruttura di migrazione, ma lo schema di sez. 4
    è già interamente specificato dal prompt, quindi è stato implementato
    per intero da subito (evita di dover riaprire la stessa migrazione
    più volte nelle fasi successive). Le tabelle che sez. 4 lascia
    indicate con "..." (`risk`, `reserve_usage`, `agile_sprint`,
    `kanban_flow`) sono state progettate leggendo le schermate
    corrispondenti (sez. 8.5 #12 Buffer e riserve, #13 Agile/Flow).

11. **`user_profile.role` → tabella `user_role` separata**: la sez. 4
    scrive `role` al singolare nella colonna ma la sez. 6-quater.6
    descrive ruoli cumulabili ("insieme non vuoto"); normalizzato come
    relazione uno-a-molti invece di un campo singolo o una lista
    serializzata.

12. **`progress_package`**: la sez. 4 chiede un "id univoco globale
    (UUID)" per evitare la doppia importazione dello stesso pacchetto.
    Implementato con una colonna `package_uid TEXT UNIQUE` distinta dalla
    chiave primaria interna `id INTEGER AUTOINCREMENT`, così le altre
    tabelle (`progress_entry`, `package_conflict`) possono continuare a
    referenziarlo con una FK intera.

13. **Logica SQLite isolata in un crate Rust separato**
    (`crates/evm-db`, workspace Cargo con `src-tauri`), senza dipendenza
    da Tauri. Motivo: l'ambiente di sviluppo non ha le librerie di
    sistema richieste da Tauri su Linux (`libwebkit2gtk-4.1-dev` e
    affini) né accesso `sudo` senza password per installarle, quindi
    `cargo test` sull'intero workspace (incluso `src-tauri`) non è
    eseguibile qui. Isolare l'accesso ai dati in un crate senza
    dipendenze grafiche permette di compilarlo e testarlo per davvero
    (6 test, tutti verdi) invece di scrivere codice Rust mai verificato.
    `src-tauri` dipende da `evm-db` via path relativo.

14. **`rusqlite` con la feature `bundled`**: compila SQLite da sorgente
    invece di collegarsi a una `libsqlite3` di sistema — più portabile e
    non richiede pacchetti di sviluppo SQLite sulla macchina di build.

15. **Limite di verifica in questo ambiente**: non è stato possibile
    eseguire `cargo check`/`cargo test` su `src-tauri` né `npm run tauri
    dev`/`npm run tauri build`, perché mancano i pacchetti di sistema
    WebKitGTK richiesti da Tauri su Linux e non c'è `sudo` senza
    password per installarli (vedi README § Prerequisiti per i pacchetti
    esatti). Verificato invece con successo: `cargo test -p evm-db` (6
    test), `npm run test:engine` (Vitest, 1 test), `npx tsc --noEmit`
    (frontend), `npm run build` (bundle Vite di produzione), `npm run
    build-storybook`. **Da verificare dall'utente** (o in un ambiente con
    i prerequisiti installati) prima di considerare la Fase 1 davvero
    conclusa: che `npm run tauri dev` apra effettivamente la finestra e
    che il comando Tauri `apri_progetto` funzioni da un vero webview.

16. **Voci di menu/palette non ancora implementate**: restano visibili
    (sez. 8.3 elenca tutte le voci) e invocabili, ma eseguono un toast
    "disponibile in una fase successiva" invece di essere nascoste o
    disabilitate — così la struttura della UI è quella finale fin da
    subito, senza dover ritoccare menu e palette comandi a ogni fase.

17. **Distacco di una scheda in una finestra separata** (sez. 8.2):
    implementato con l'API Tauri `WebviewWindow` (richiede i permessi
    `core:window:allow-create` e `core:webview:allow-create-webview-window`
    aggiunti a `src-tauri/capabilities/default.json`), con fallback a un
    toast quando l'app non gira in runtime Tauri (es. in Storybook o con
    `npm run dev` nel browser). Non verificabile a runtime per il motivo
    del punto 15: va controllato con i prerequisiti Linux installati.

18. **Preferenze di layout per utente** (tema, dimensione font, sidebar,
    pannello dettaglio, schede aperte, viste salvate delle tabelle):
    persistite in `localStorage`, non nel file `.evmproj` di progetto
    (sez. 8.7). Un eventuale storage di sistema "per utente" (es. una
    cartella di configurazione del sistema operativo) è un'evoluzione
    possibile ma non richiesta esplicitamente dal prompt.

19. **Dati di contesto progetto nella barra superiore** (nome progetto,
    status date, perimetro, baseline, copertura, anomalie, utente) sono
    segnaposto statici (`project-context-store.ts`): l'aggancio al
    database SQLite reale del progetto arriva con le Fasi 2-4, quando
    esistono import del piano e motore EVM da cui leggerli.

## Creazione, apertura e importazione del piano (Fase 2, avvio)

20. **Creazione e apertura di un progetto**: un file `.evmproj` per
    progetto. "Nuovo progetto…" crea un file vuoto con migrazioni, parametri
    e calendario standard; non sovrascrive mai un file esistente. "Apri
    progetto…" migra il file se serve. Il nome del progetto è il nome del file.

21. **Importazione del piano** (menu File → Importa piano, anche dalla home):
    crea un nuovo `.evmproj` dal file scelto, formato dall'estensione
    `.xml` (MS Project MSPDI), `.csv`, `.xlsx`/`.xlsm`/`.xls`. Se l'import
    fallisce il file di destinazione non viene lasciato a metà.

22. **Ore per giorno = 8**: MS Project esporta le durate in ore; per
    convertirle in giorni si usa 8 h/giorno (calendario standard). I
    calendari di MS Project non sono importati: restano quelli standard.

23. **Profilo di importazione CSV/Excel**: la riga di intestazione è
    riconosciuta per nome di colonna, in italiano o in inglese (es. `UID`/`ID`,
    `Nome`/`Name`, `WBS`, `Inizio`/`Start`, `Fine`/`Finish`, `Durata`/`Duration`,
    `Predecessori`/`Predecessors`, `Nomi risorse`/`Resource Names`,
    `% completamento`/`% Complete`). Servono almeno Nome e UID; le altre colonne
    sono facoltative. Il separatore del CSV è `;` o `,` (rilevato). Le
    risorse nei CSV/Excel hanno come UID il proprio nome; `Nome[50%]` indica
    le unità. Il profilo è provvisorio: va confermato con un export reale.

24. **Mappatura nel database**: task, dipendenze, risorse, assegnazioni e WBS
    (gerarchia dal codice: `1.2` è figlio di `1`) entrano nelle tabelle di
    sez. 4. L'avanzamento presente nel piano genera uno snapshot
    `import_piano` datato al giorno dell'import (la status date reale del piano
    non è ancora letta). Il piano genera anche una baseline `Startup` non
    bloccata con i costi dei task. Work e costo di MS Project non hanno una
    colonna dedicata nello schema dei task: il lavoro è in `baseline_task.work`.

25. **Avvisi non bloccanti**: predecessori inesistenti, UID duplicati e righe
    senza UID sono scartati e registrati in `import_log.warnings_json`; il
    messaggio di esito ne mostra il primo.

26. **Limite di verifica**: il parser XML è coperto da test su un export di
    esempio costruito a mano, non su un export reale di MS Project; il
    percorso Excel è verificato solo fino al riconoscimento delle colonne (il
    workbook di prova in `fixtures/` non è un export di piano). Da verificare
    con un export reale prima di considerare l'import chiuso.

27. **Creazione di task da interfaccia** (menu Progetto → Nuovo task…, e
    schermata "Task e risorse"): nome obbligatorio; WBS, inizio, fine, durata
    e milestone facoltativi. L'UID è progressivo (massimo esistente + 1). Il
    codice WBS deve esistere nel progetto. Ogni creazione va in `audit_log`
    con utente `locale`, in attesa dell'identità utente della fase di governo.
    Il task non è collegato a predecessori né assegnato a risorse: queste
    operazioni arrivano con la schermata Gantt/risorse.

## Schermate di lavoro e calendari (Fase 4-bis, 4-ter e 5, parziale)

28. **Schermate implementate**: Dashboard (indicatori di base, anomalie),
    WBS (struttura e nuovi nodi), Gantt in sola lettura, Avanzamento,
    Approvazioni, Perimetri e utenti, Buffer e riserve, Calendari di lavoro.
    Non ancora implementati: indici EVM (CPI/SPI, semafori, Earned Schedule)
    della Fase 2; Baseline/Forecast/Filoni/Agile/Qualità dati/Report della
    Fase 5; import Excel completo, wizard e feed della Fase 3 e 4-bis.

29. **Flusso dell'avanzamento** (fase 4-bis): ogni modifica crea una voce
    `progress_entry` in stato `bozza`; "Invia per approvazione" la porta a
    `inviato`; l'approvazione la applica allo snapshot del giorno e la marca
    `applicato`; il rifiuto richiede un motivo e la marca `respinto`. Lo
    snapshot manuale del giorno copia lo stato precedente, così l'avanzamento
    degli altri task non va perso. Il chi-ha-approvato non è ancora tracciato:
    arriverà con l'identità utente della fase 4-ter.

30. **Perimetri**: un perimetro è un sottoalbero WBS; i task di lavoro del
    sottoalbero sono fissati alla creazione (non ricalcolati dopo). I
    riepiloghi non entrano nel perimetro.

31. **Calendari di lavoro**: uno schema è una maschera dei giorni lavorativi e
    un elenco di festivi (tabella `calendar_exception` con `is_working = 0`).
    Lo schema predefinito del progetto fissa le durate. Creando un task con
    inizio e durata la fine si calcola sui giorni lavorativi; con inizio e fine
    la durata è il numero di giorni lavorativi tra le due date. Durate frazionarie
    si arrotondano per eccesso sul calcolo della fine. "Ricalcola durate dei task"
    applica lo schema ai task con date, anche importati da MS Project; le baseline
    non cambiano. Le durate importate da MS Project restano in ore/8 finché non
    si ricalcolano. I giorni lavorativi eccezionali (es. un sabato lavorato) sono
    supportati dalle regole ma non ancora dalla UI.

## Fase 2 — Motore EVM (`packages/engine`), secondo docs/specifiche/SPEC_FASE_2_MOTORE_EVM.md

32. **Struttura e API.** I file seguono la sez. 0 della specifica (types, estimate,
    evm, ev-methods, earned-schedule, buffers, agile, montecarlo, flow, program,
    quality, index). Aggiunto `dates.ts` per la conversione ISO ↔ giorni (aritmetica
    civile, senza `Date`). Alcune firme estendono la specifica: `agileMetrics(sprint,
    params, backlogSp)` riceve il backlog, che nella specifica manca; `programRollup`
    riceve `forecasts` opzionali per verificare i gate; `simulateThroughput` usa
    settimane come periodo.

33. **Soglia degli importi nulli (EURO_ZERO = 1e-9 €).** Importi sotto questa soglia
    sono trattati come zero nel calcolo dei CPI/SPI. Senza soglia i numeri subnormali
    producono indici senza significato (scoperto dalle proprietà di fast-check).

34. **Tolleranza dell'identità EAC lineare = EAC base.** La tolleranza relativa
    1e-9 è misurata sulla scala dei termini (AC, BAC): in virgola mobile la
    cancellazione può lasciare residui proporzionali ai termini, non a `eac`.

35. **Riserva di gestione.** `mgmtReserve = BAC × mgmtReservePct`, come nella colonna
    B32 del workbook (fixture: 2.796,69 €). Risolve il punto aperto della specifica.

36. **Costo di deviazione σ (sigmaCost).** `√Σ(σᵢ·hᵢ·cᵢ)² · (1 + overhead)`: la radice
    si applica alla somma e il fattore di overhead resta fuori. È l'unica lettura che
    riproduce 1.160,85 € del caso A. Contingency e materiali sono esclusi.

37. **Soglie di default non fissate dalla specifica** (configurabili nelle funzioni):
    - indice di salute del buffer: giallo oltre 1, rosso oltre 1,5 (§6);
    - LOE: quota BAC oltre 15% esclude i LOE dallo SPI di filone (§4);
    - cadenza irregolare: intervallo oltre il 50% dalla mediana (§4);
    - «90% fatto» (Q020): quattro status date consecutive ≥ 90%, cioè più di tre;
    - diagnosi WIP (FLOW_WIP_EXCESS): sulle ultime k=4 finestre, cycle time in
      crescita oltre 20% tra prima e seconda metà con throughput entro ±10%;
    - scostamento stima/startup (Q012): avviso oltre 20%, critico oltre 30%.

38. **Definizioni operative.** Burn rate = AC del periodo / PV del periodo.
    Accuratezza della previsione = 1 − |EAC − costo finale| / costo finale: il libro
    non la fissa in forma chiusa. Il TCPI è `null` quando BAC − AC non è positivo
    (non solo quando è zero), perché un denominatore negativo non ha significato.

39. **Earned Schedule.** Il tempo è in giorni di calendario da `startDate`. La curva
    PV si interpreta a gradini lineari. Se EV supera il BAC, ES = PD. La versione su
    periodi (`earnedSchedulePoints`) serve ai test di riferimento della specifica.

40. **Monte Carlo.** Il generatore è mulberry32 con le costanti della specifica
    (verificato: 0,601104 · 0,448291 · 0,852466). Nearest-rank per i percentili. I
    valori di riferimento (P50 11, P80 12, P90 13, media 11,4112) coincidono con la
    specifica: conferma che campionamento e ordine di iterazione sono quelli attesi.

41. **Fixture e golden.** I test di fixture leggono `Parte_III_Gestione_Progetti.xlsx`
    a runtime con un lettore minimo dello zip (`test/helpers/xlsx.ts`, solo test).
    La regressione è in `test/fixtures/golden.json`: generato una volta e poi
    immutabile. Le formule della fixture sono in `docs/excel-formulas.md`.

42. **Gap noti rispetto alla specifica.** Il test di `RES_CONT_MISMATCH` sui 7.296 €
    contro i 15.000 € richiede il foglio *Buffer e Contingency*, non ancora letto
    dal test di fixture: il controllo esiste e ha test unitari.

43. **Punti da integrare nella fase successiva (non ancora risolti).**
    - Unità: il motore usa frazioni 0..1 per `overheadPct`, `contingencyPct` e
      `mgmtReservePct`; il database oggi memorizza percentuali (es. 10,0 per 10%).
      Va scelta la conversione al confine con il backend.
    - Metodi di misura: i nomi del motore (`zero_cento`, `soggettiva`, …) differiscono
      dai valori del database (`0_100`, `pct_soggettiva`, …): va definita la mappa.
    - La spec chiede `EngineInputError` per gli input invalidi: il motore lo lancia
      solo per input strutturali; le proprietà coprono gli input matematici degeneri.

44. **Lint del motore.** La configurazione radice ora include `packages/engine/src`
    con `no-restricted-globals` su `Date` e `no-restricted-properties` su
    `Math.random` e `Date.now` (sez. 0 regola 1). I pacchetti non sono più ignorati
    nel loro insieme. `fast-check` è una dipendenza di sviluppo; il pacchetto non
    ha dipendenze di runtime.

45. **Esempio d'uso.** `packages/engine/examples/demo.ts` si esegue con
    `npx tsx packages/engine/examples/demo.ts`. `tsx` è uno strumento di sviluppo e
    non è aggiunto alle dipendenze del pacchetto.

## Fase 3 — Import ed export del workbook Excel (docs/specifiche/SPEC_FASE_3_EXCEL.md)

46. **Comandi e modello di progetto.** La specifica chiede `import_workbook(path, opts)`
    con `project_id` in un database unico. L'app usa un file `.evmproj` per progetto
    (decisione 6-quater). I comandi esposti sono `anteprima_workbook`,
    `importa_workbook(origine, destinazione, nome)`, `aggiorna_workbook(origine,
    progetto)` (import idempotente nello stesso progetto), `input_workbook` ed
    `esporta_workbook(percorso, destinazione, cache, opzioni)`. Il file di destinazione
    non viene mai sovrascritto.

47. **Calcoli nel motore, non nel backend.** Il backend legge e scrive e basta. I
    confronti col ricalcolo (`XL_CONT_MISMATCH`, `XL_CACHE_DIFF`) e la cache delle
    formule dell'export sono fatti dal frontend con `packages/engine`. Il backend
    espone solo i totali letti dal file (`cache.totali`, `cache.checkpoint`).

48. **Date seriali.** Regola della specifica (§2.4): per `serial ≥ 61` la base è
    1899-12-30; per `serial < 61` è 1899-12-31; il 60 (29/02/1900 inesistente) è
    un errore di cella. Verificato con i casi 1, 59, 60, 61 e 46023.

49. **Checkpoint.** La tabella è `project_checkpoint` (date, note, pct_planned,
    pct_actual, ac), come da specifica. Non si generano `status_snapshot` per i
    checkpoint del workbook: sono valori di progetto, non per task, e la tabella
    `status_snapshot` ha un vincolo `source` che non include `workbook`. Lo snapshot
    per task resta riservato al piano importato e all'avanzamento.

50. **Percentuali.** Il database e il motore usano frazioni 0..1. Un valore di
    parametro maggiore di 1 è letto come percento con avviso `XL_PCT_SCALE`. Chiude
    il punto 43 della fase 2 per i parametri del workbook.

51. **Base di misura EV.** Il workbook senza il parametro `Base di misura EV` usa
    `bac_con_contingency`, per riprodurre i numeri del file (avviso informativo
    `BASE_EV` nella specifica; qui è nei default di `Parametri`).

52. **Idempotenza.** `aggiorna_workbook` sostituisce le righe di input del progetto
    (attività, checkpoint, rischi, sprint) e non le duplica. Se `_meta.project_id`
    appartiene a un altro progetto l'operazione è rifiutata, come da specifica.

53. **Foglio agile.** Il costo per SP del file (`CostoTeamSprint / SPPianificati`
    della velocity reale) non si importa come valore: il motore ricalcola con il
    costo di baseline (6-bis.2). L'avviso `AGILE_COSTO_SP` lo segnala.

54. **Export: cosa manca rispetto al template.** Il foglio *Agile - Velocity* non
    esporta le colonne `BacklogResiduo`, `SprintResidui`, `EACtempoGg` e `EACcosto`
    (il backlog residuo non è nello schema di import). Il foglio *Buffer e
    Contingency* non esporta la sezione Management reserve né il buffer di tempo
    consumato. Il foglio *Agile* non esporta il Kanban. Sono i punti che la
    specifica elenca e che restano da completare.

55. **Verifica non eseguita qui.** LibreOffice non è installato nell'ambiente:
    l'apertura del file esportato in un programma reale (test §5.6) va fatta a mano
    o in CI. Il test automatico verifica la presenza di fogli, grafici nel XML e il
    foglio `_meta` nascosto.

56. **Lint e clippy.** `cargo clippy --all-targets` senza avvisi su `evm-db`. Aggiunto
    `@types/node` come dipendenza di sviluppo: i test TypeScript leggono la fixture
    con le API di Node (`node:fs`, `Buffer`).
