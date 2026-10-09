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

50. **Percentuali (superata dalla decisione 62).** Il database e il motore usano frazioni 0..1. Un valore di
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

57. **Vista EVM del workbook nella Dashboard.** La sezione «EVM del workbook» (stima,
    checkpoint, agile, riserve) è calcolata nel frontend con `packages/engine`
    (`src/lib/evm-workbook.ts`) a partire dagli input letti con `input_workbook`. Si
    mostra solo se il progetto ha attività del workbook. Gli indici non definiti
    mostrano `—` con il motivo nel tooltip. Restano da fare il grafico della curva S
    e la schermata Forecast dedicata (fase 5).

58. **Budget per WBS (ricevuto, non stimato).** Il budget è un input assegnato al nodo
    WBS (`wbs.bac`, migrazione 0003). Il budget di un nodo con task si distribuisce sui
    suoi task in proporzione al costo di baseline (in parti uguali se il costo è zero).
    Un nodo con budget senza task produce un avviso. La stima dei costi del workbook
    resta fuori da questo flusso (decisione dell'utente).

59. **Monitoraggio EVM su task.** PV di un task = budget × frazione di durata pianificata
    trascorsa (giorni di calendario, distribuzione lineare: il libro usa la baseline
    time-phased, non disponibile dagli import). EV = budget × % fisica registrata. AC =
    AC cumulato registrato. Ogni data di stato dell'app è un punto della serie. Gli
    indici sono calcolati dal motore (`packages/engine/src/monitoring.ts`). Soglie
    semaforo fisse 0,95 / 0,85: da collegare ai parametri del progetto.

60. **Actual cost e governance.** L'AC si inserisce per task nella schermata Avanzamento
    e passa per la stessa approvazione del valore di avanzamento. Governance costi:
    contingency e riserva di gestione (stanziate e consumate), baseline di budget
    bloccata (immutabile per trigger), richieste di variazione con approvatore tracciato.
    Limite noto: i progetti da workbook non creano ancora nodi WBS nel database, quindi
    non ricevono un budget per WBS dall'interfaccia (va esteso).

61. **Pannello di destra rimosso.** Il pannello di dettaglio (ispettore) non era usato da
    nessuna funzione: componente, stato, comando, scorciatoia Ctrl+I e voce di menu
    sono stati eliminati. Il glossario EVM (`src/lib/glossario-evm.ts`) spiega le sigle
    del monitoraggio con un tooltip (`TermineEvm`): nome, significato, lettura della
    formula e riferimento al libro.

62. **Percentuali in intero positivo.** Tutte le percentuali di parametro (overhead,
    contingency, riserva di gestione, soglie verde e gialla) e le probabilità dei rischi
    sono interi 0..100, nel database, nelle API e nell'interfaccia. Il motore lavora in
    frazioni 0..1: la conversione (÷100) sta in un solo punto, `parametriDaWorkbook` nel
    frontend. Il lettore del workbook converte la frazione del file (0,15) in intero (15);
    l'export scrive l'intero come frazione nelle celle formattate in percento.
    Migrazione 0004: i valori già salvati ≤ 1 sono frazioni e si moltiplicano per 100;
    valori > 1 sono già in percento. Ambiguità nota: un 1% salvato dalla UI prima della
    migrazione come `1,0` diventa 100%. Va ricontrollato sui progetti creati prima di
    questa modifica. I valori di avanzamento (task e checkpoint) restano invariati.

63. **Baseline: archiviazione, non cancellazione.** Una baseline bloccata non si
    cancella (trigger del database e §6-bis.4). Migrazione 0005: colonna `archiviata`.
    Il trigger di aggiornamento lascia passare solo il passaggio ad archiviata, senza
    altre modifiche al contenuto. La Governance nasconde le baseline archiviate e ne
    mostra il conteggio.

64. **Costi delle risorse.** Il costo pianificato di un'assegnazione è unità × ore
    pianificate × tariffa (`packages/engine/src/resource-costs.ts`). Le ore pianificate
    sono durata del task in giorni × 8 (calendario standard): nessuna baseline time-phased
    ancora. La tariffa è il costo orario reale se verificato, altrimenti la tariffa
    importata. Nell'avanzamento si possono inserire le ore consuntive: se l'AC non è
    inserito a mano, si calcola come ore × tariffa media ponderata per le unità.

65. **Gantt di sola lettura.** Scala fissa di 18 px per giorno e righe di 28 px. Un solo
    contenitore con scorrimento orizzontale e verticale: intestazione (mesi e giorni) e
    colonna delle attività restano fisse nei rispettivi assi. Fine settimana e festivi
    vengono dal calendario predefinito del progetto (festivi espliciti e maschera dei giorni
    lavorativi), senza calendario si usa lunedì–venerdì. Le frecce di precedenza seguono il
    tipo (FS, SS, FF, SF). Il modello è in `src/lib/gantt.ts`, testato.

## Procedura guidata di importazione, riconciliazione del BAC e ri-sincronizzazione (Fase 4, incremento)

Ambito di questo incremento: colmare lo scarto più visibile tra l'import a scrittura
unica di decisione 21 e `docs/specifiche/SPEC_FASE_4_IMPORT_PIANO.md` — la procedura
guidata con anteprima prima della scrittura, la riconciliazione del BAC, la
ri-sincronizzazione e il rilevamento della scala dei costi. Restano fuori (e sono
segnalati come lavoro successivo): profili di mappatura colonne configurabili e
salvabili (resta la tabella di sinonimi fissa di decisione 23), baseline multiple da
MSPDI (`Baseline1..10`), campi personalizzati (`ExtendedAttribute`), import dei
calendari/eccezioni da XML, dati time-phased per assegnazione, e i test di prestazione
su piani da 2.000/20.000 task.

66. **Comandi separati invece di un unico `importa_piano`.** `inspect_plan_file`
    (formato/dimensione/colonne, passo 1), `preview_plan_import` (conteggi, avvisi,
    stima del BAC, passo 3 — nessuna scrittura), `commit_plan_import` (scrittura con le
    opzioni scelte) e `resync_plan`. Il parsing si fa una sola volta in `leggi_piano`,
    condiviso da anteprima e commit. Il vecchio comando Tauri `importa_piano` è stato
    rimosso: l'unico punto d'uso nel frontend ora apre la procedura guidata
    (`ImportPlanWizard`); la funzione Rust `importa_piano` resta come scorciatoia con le
    opzioni di default, usata dai test.

67. **Chiavi UID duplicate: ora un errore bloccante**, non più uno scarto silenzioso con
    avviso (si cambia il comportamento di decisione 25 per seguire la specifica §4.1).
    `verifica_chiavi_duplicate` gira prima di aprire la transazione ed elenca le chiavi
    duplicate nel messaggio d'errore.

68. **Rilevamento della scala dei costi (`PLAN_COST_SCALE`).** Si confronta `cost` con
    `work_hours × tariffa standard della risorsa assegnata` su ogni task per cui entrambi
    sono noti (serve l'assegnazione, non solo la tariffa della risorsa); con almeno due
    campioni e un rapporto medio tra 80 e 120, i costi del piano si dividono per 100 e si
    registra un avviso. Sotto i due campioni il controllo non scatta (evita falsi positivi
    sui piani piccoli o senza tariffe importate): è una semplificazione pragmatica rispetto
    al "task campione" singolo della specifica.

69. **Riconciliazione del BAC** (passo 5 della procedura guidata): `bac_indirect` e
    `bac_contingency` non sono più fissi a zero. Con gli interruttori attivi,
    `bac_indirect = bac_direct × overhead_pct/100` e
    `bac_contingency = (bac_direct + bac_indirect) × contingency_pct/100`; il tipo e il
    blocco della baseline vengono dalla procedura guidata invece di essere fissi a
    `'startup'` non bloccata.

70. **Distribuzione lineare della PV (`PLAN_LINEAR_PV`).** Senza dati time-phased nel
    file, il costo di baseline di ogni task con inizio, fine e costo si distribuisce in
    parti uguali sui giorni lavorativi lunedì–venerdì tra le due date (tabella
    `baseline_timephased`), con un unico avviso aggregato invece di uno per task. Il
    calendario di riferimento è fisso lun–ven in questo incremento: non ancora collegato
    al calendario di progetto di decisione 31.

71. **Ri-sincronizzazione (`resync_plan`).** Confronta il nuovo export con il progetto per
    `uid_source`: task aggiunti/rimossi, spostati (stesso UID, WBS diversa). Aggiorna solo
    i campi di sola lettura (`start_planned`, `finish_planned`, `float_days`,
    `is_critical`) e scrive un nuovo `status_snapshot` con `source = 'resync'` (migrazione
    0006, che ricostruisce la tabella per ampliare il vincolo `CHECK`): l'avanzamento
    inserito nell'app non viene mai toccato. Se la baseline bloccata più recente ha un
    costo diverso dal nuovo export su un task condiviso, si segnala
    `baseline_changed_locked` (corrisponde all'anomalia critica Q016 della specifica). Il
    riallineamento della gerarchia WBS ai nuovi codici non è automatico in questo
    incremento: lo spostamento è solo segnalato nel report, non applicato alla tabella `wbs`.

## Fase 5, incremento 1 — selettori di contesto reali e Dashboard (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md)

Ambito: rendere reali i tre selettori della barra di contesto (baseline, data di stato,
perimetro — prima pulsanti decorativi sopra stringhe statiche, senza id) e trasformare la
Dashboard dalla griglia piatta di 7 indicatori in quella della specifica (riga KPI, curva S,
trend CPI/SPI, top scostamenti, copertura, riserve), riusando `dati_monitoraggio` +
`vistaMonitoraggio` (già collaudati da `MonitoraggioScreen`) invece di costruire una nuova
pipeline `AnalysisDataset`/Web Worker. Grafici con **ECharts**, calcolo EVM ancora sul thread
principale: entrambe scelte esplicite dell'utente per questo incremento (vedi sotto).

72. **Nessuna pipeline `get_analysis_dataset`/Web Worker in questo incremento.** `dati_monitoraggio`
    (già esposto, già usato da `MonitoraggioScreen`) copre per intero i bisogni della Dashboard
    (PV/EV/AC/indici per data di stato, a livello di progetto e di nodo WBS); costruire un
    dataset unificato più ricco (per WBS/risorsa/filone, parametrizzato per baseline) resta
    rimandato a quando le schermate WBS/Task/Gantt lo richiederanno davvero — altrimenti sarebbe
    una pipeline parallela che duplica `dati_monitoraggio` senza bisogno. Il motore EVM gira
    ancora sul thread principale, come in tutte le altre schermate: nessun Web Worker in questo
    incremento (scelta esplicita, da rivedere quando un dataset/calcolo pesante lo richiederà,
    es. Gantt a 20.000 righe o Monte Carlo).

73. **Il selettore di baseline non incide ancora sui calcoli.** `elenco_baseline`
    (`controllo.rs`, estratta dalla query già usata da `governance()`) e `elenco_snapshot`
    (nuova, piccola) alimentano i menu della barra di contesto e scrivono `baselineId`/
    `snapshotId` nello store; la Dashboard **usa** `snapshotId` per scegliere il punto da
    evidenziare (altrimenti l'ultimo), ma `dati_monitoraggio` resta legato alla baseline
    `kind = 'startup'` più recente indipendentemente da `baselineId`. Va corretto quando
    `dati_monitoraggio` sarà parametrizzato per baseline (incremento WBS/Task).

74. **Copertura: pesata sul costo di baseline dei task, non sul conteggio.** `coperturaTaskPct`
    (`src/lib/monitoraggio.ts`) divide la somma del costo di baseline dei task non-riepilogo con
    WBS assegnata presenti nell'ultimo snapshot per la somma dello stesso costo su tutti i task
    pesabili; `0` se non c'è ancora nessuna data di stato. È un proxy (il budget del nodo WBS non
    si distribuisce sempre 1:1 per costo di baseline del task — vedi `allocaBudgetTask` nel
    motore), non il calcolo esatto del §2 della specifica, ma coerente con come il motore stesso
    alloca il budget.

75. **Il filtro per perimetro è lato frontend.** Scegliere un perimetro nella barra di contesto
    filtra `dati_monitoraggio.wbs`/`.task` al sottoalbero del codice WBS radice del perimetro
    (da `perimetri_elenco`) prima di chiamare `vistaMonitoraggio`/`coperturaTaskPct`, invece di
    aggiungere un parametro di perimetro al comando Tauri — sufficiente perché `dati_monitoraggio`
    già restituisce l'intero progetto e il filtro è puramente per codice. I perimetri non basati
    su WBS (`rule_kind` diverso da `'wbs'`) non filtrano nulla in questo incremento.

76. **Grafici ECharts senza tema ECharts separato.** `src/components/charts/EChart.tsx` legge i
    colori dai design token dell'app (`src/components/charts/tema.ts`, `getComputedStyle` sulle
    variabili CSS di `globals.css`) invece di registrare un tema ECharts a parte: i grafici
    seguono automaticamente il chiaro/scuro. Il grafico si ricrea (dispose + init) al cambio
    tema anziché fare un repaint parziale: più semplice, costo trascurabile alla scala di questi
    grafici. Colori PV/EV/AC (grigio tratteggiato/teal/arancione) fissi, come da specifica §3.1,
    non derivati da token (nessun token esistente per teal/arancione).

## Fase 5, incremento 2 — albero WBS con indici EVM (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md §3.2)

Ambito: trasformare `WbsScreen` da elenco piatto (rientro per conteggio dei punti nel codice,
nessuna gerarchia reale) nell'albero della specifica, con indici EVM a ogni livello, livello
massimo, filtro "solo fuori soglia", ordinamento per scostamento e riga dei totali. Nessuna
modifica al backend: `wbs_elenco` e `dati_monitoraggio` bastavano già.

77. **Indici EVM per nodo riepilogo: nuovo rollup lato frontend, non nel motore.**
    `monitoraggioEvm`/`perWbs` calcolano gli indici solo per i codici WBS con task assegnati
    direttamente — un nodo riepilogo senza task propri (es. `"1"` quando tutto il lavoro sta
    sotto `"1.1"`/`"1.2"`) non compare affatto. `evmPerNodoWbs` (`src/lib/monitoraggio.ts`)
    colma questo per ogni nodo: somma `perWbsMisure` dei codici uguali o discendenti, poi
    applica `evm()` una sola volta sul totale — stessa logica di `rollup()` nel motore
    (`packages/engine/src/evm.ts`), solo applicata anche ai nodi padre. Un nodo senza alcun
    task nel sottoalbero ottiene zeri e indici `null` (mai `NaN`).

78. **Ordinamento numerico dei codici WBS lato frontend, non in SQL.** La query di
    `wbs_elenco` (`schermate.rs`) ordina ancora `ORDER BY w.code`, lessicale (`"1.10"` prima
    di `"1.2"`). `costruisciAlbero` (`src/lib/wbs-albero.ts`) riordina ogni livello con un
    confronto numerico dei segmenti del codice dopo aver ricevuto i dati — non si è toccato
    il backend perché l'ordinamento per l'albero deve comunque avvenire dopo aver ricostruito
    la gerarchia (il genitore non è adiacente ai figli in un ordine lessicale piatto).

79. **"Ordina per scostamento" abbandona la gerarchia.** Quando attivo, la schermata mostra
    un elenco piatto di tutti i nodi dell'ambito corrente (foglie e riepiloghi, tutti con
    indici grazie a `evmPerNodoWbs`) ordinato per `|CV|` decrescente, con un avviso che la
    gerarchia è nascosta — non si è tentato un ibrido albero+ordinamento globale, che avrebbe
    richiesto riordinare i figli di ogni nodo in base a un criterio non locale (lo scostamento
    confrontabile solo guardando tutto l'albero, non un singolo livello).

80. **Il livello massimo non svuota lo stato di espansione.** Impostare "Max level" filtra le
    righe appiattite per profondità dopo l'espansione (`appiattisciVisibile`), senza toccare
    quali nodi sono espansi: un nodo oltre il livello resta "espanso" nello stato anche se le
    sue righe sono nascoste dal filtro. Scelta deliberata per evitare che cambiare il livello
    e poi tornare ad "All" faccia perdere le scelte di espandi/comprimi dell'utente.

## Fase 5, incremento 3 — Task/Risorse/Assegnazioni con EVM per task (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md §3.3)

Ambito: tre schede (Task, Risorse, Assegnazioni) su `DataTable` al posto delle due liste
piatte di `TaskScreen.tsx`/`RisorseSezione.tsx` (ora eliminati); indici EVM per task; nessuna
modifica di schema.

81. **EVM per task: nuova chiave nel motore, nessuna formula nuova.** `monitoraggioEvm`
    (`packages/engine/src/monitoring.ts`) costruiva già una riga `EvmInput` per task
    (`righeEvm`) prima di raggrupparla per nodo WBS in `perWbs`. Taggare ogni riga anche con
    `uid` ed esporre `perTask`/`perTaskMisure` in parallelo a `perWbs`/`perWbsMisure` (stessa
    forma, nessun raggruppamento necessario: un task è già la propria riga) rende l'EVM per
    task disponibile ovunque sia già disponibile quello per WBS, con lo stesso `evm()`.

82. **Nuova query `task::elenco_evm`, nessuna migrazione.** `ev_method`, `weight_pct`,
    `workstream_id`, `float_days`, `is_critical` erano già colonne di `task` non selezionate
    da nessuna query esistente; le date di baseline vengono da `baseline_task` (baseline
    `kind = 'startup'` più recente, stesso criterio di `dati_monitoraggio`); `pct_reale` dalla
    data di stato più recente del progetto (`status_snapshot`/`snapshot_task`), `None` se il
    task non vi compare mai (non `0`: "mai registrato" e "registrato a zero" sono stati
    diversi). Δ fine si calcola nel frontend da `inizioBaseline`/`fineBaseline` vs
    pianificate, non nella query.

83. **Totali come striscia di `Kpi` sopra la tabella, non una riga `DataTable`.** Stessa
    scelta già fatta per la Dashboard e la WBS (decisioni 73-76, 78): costruire una riga di
    piè di pagina che segua l'ordine/larghezza/visibilità dinamici delle colonne di
    `DataTable` è una funzionalità a sé; la striscia KPI dà la stessa informazione riusando
    `src/components/screens/kpi.tsx`.

84. **`DataTable`: congelamento multi-colonna corretto, resto deliberatamente non toccato.**
    Il vecchio `pinnedColumnIds` applicava `sticky left-0` a ogni colonna congelata,
    sovrapponendole con più di una colonna congelata — la scheda Task ne congela tre
    (UID/WBS/Nome). Corretto passando lo stato nativo `columnPinning` di TanStack e usando
    `column.getStart("left")` per lo scarto cumulato invece della classe fissa. Menu
    contestuale, selezione riga, esportazione CSV, raggruppamento restano assenti
    (documentato, non dimenticato): nessuna delle tre schede di questo incremento li richiede
    ancora.

85. **Ore/costo reale per risorsa e assegnazione: rimandati, bloccati su un vuoto a monte.**
    `progress_entry.actual_work_h` si cattura all'invio dell'avanzamento ma `schermate.rs`'s
    `approva()` non lo copia mai in `snapshot_task` (che non ha nemmeno una colonna per le ore
    consuntive) — quindi oggi non esiste da nessuna parte un'ora consuntiva per task
    interrogabile dopo l'approvazione, tantomeno ripartita per risorsa quando più risorse sono
    assegnate allo stesso task. Le schede Risorse/Assegnazioni mostrano quindi solo ore/costo
    *pianificati* (durata del task × 8 h/giorno, invariato dalla decisione 64) più "Fonte
    tariffa"/"Costo orario reale" (già esistenti). Sbloccare le colonne Ore reali/AC/
    Utilizzo % richiede: una colonna ore-consuntive su `snapshot_task` + migrazione,
    `approva()` aggiornata per scriverla, e una nuova funzione di ripartizione per risorsa
    (pesata sulle unità, analoga a `costoPianificatoAssegnazione`) — non ancora scritta.

86. **`imposta_unita_assegnazione`, nuovo comando.** Mancava un modo per cambiare le unità di
    un'assegnazione esistente (solo creazione/eliminazione esistevano); necessario per rendere
    la colonna "Units %" modificabile in linea nella scheda Assegnazioni. Stessa validazione
    di `crea_assegnazione` (unità > 0) e stesso vincolo di perimetro per progetto di
    `elimina_assegnazione`.

87. **Scoperto, non introdotto qui: i messaggi delle regole di qualità (`Q001`-`Q031` in
    `packages/engine/src/quality.ts`, più `checkMethodChange`/`checkLoeShare`/`checkCadence`
    in `ev-methods.ts`) sono ancora in italiano.** Sono stringhe generate a runtime (template
    letterali), non testo JSX statico: la traduzione dell'interfaccia di ottobre 2026 non
    poteva trovarle con una ricerca testuale. Tradotti qui solo i due che la scheda Risorse
    mostra davvero (`checkQ007`, `checkQ013`, già verificato che nessun test asserisce sul
    testo del messaggio) — gli altri ~20 restano in italiano e vanno tradotti in un passaggio
    dedicato quando una schermata li renderà (Qualità dati, Fase 6, è la prima candidata).

## Fase 5, incremento 4 — Baseline e change request (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md §3.5)

Ambito: nuova schermata `BaselineCrScreen` (nav id `baseline-cr`, già previsto ma non
cablato — decisioni 88-93) con le quattro schede della specifica — Baseline, Confronto,
Change request, Scope — al posto delle tabelle Baseline/Change request finora dentro
`GovernanceScreen` (che resta solo per budget/riserve/consumi, decisione 92).

88. **"Agire come" invece di un vero login.** La specifica richiede che le azioni di
    gestione su queste schede siano riservate a chi ha il ruolo `coordinatore_piano`,
    ma l'app non aveva alcun concetto di utente corrente: `userName`/`userRole` nello
    store di contesto erano segnaposto statici mai scritti. Si introduce un selettore
    "Acting as" nella barra di contesto (`ContextBar.tsx`, accanto a stato/perimetro/
    baseline), che sceglie un `user_profile` esistente (da `utenti_elenco`, già
    presente dalla Fase 4-quater) e scrive il suo id in `attoreId` nello store
    (`project-context-store.ts`). Nessuna password: è lo stesso livello di fiducia
    già implicito in tutta l'app (desktop locale, un progetto alla volta). Le funzioni
    di backend che richiedono il ruolo (`blocca_baseline_budget`, `archivia_baseline`,
    `approva_change_request`, `rifiuta_change_request`, `imposta_baseline_scope` in
    `controllo.rs`) ricevono `attore_id: Option<i64>` e lo verificano lato server con
    `richiede_coordinatore_piano` (controlla `user_role`, restituisce il nome per
    "creata da"/"approvata da": niente più campo di testo libero per quello,
    l'autore tracciato è sempre l'utente verificato) — non solo un pulsante
    disabilitato in UI, come richiesto esplicitamente dal test di specifica §5.7
    ("verifica anche backend").

89. **Creare una change request resta aperto a chiunque; solo decidere/bloccare è
    riservato.** La frase sui permessi nella specifica è scritta sotto la sola scheda
    Scope ("gestione solo coordinatore_piano"), ma il test §5.7 generalizza a
    "azioni di gestione" sulle schermate Baseline/Change request. Si è interpretato
    "gestione" come: bloccare/archiviare una baseline, approvare/respingere una CR,
    modificare lo scope — tutte azioni che cambiano cosa è bloccato o chi è
    approvato. *Proporre* una variazione (`crea_change_request`, richiede solo
    richiedente+motivo, nessun `attore_id`) resta invece aperto a chiunque, speculare
    al rapporto invia/approva già esistente tra Avanzamento e Approvazioni — un
    project engineer può chiedere una variazione, solo il coordinatore del piano la
    decide.

90. **Una change request parte sempre dalla baseline corrente.** `baseline_from_id`
    esisteva nello schema ma non veniva mai scritto. `crea_change_request` lo imposta
    ora automaticamente all'ultima baseline bloccata e non archiviata del progetto
    (`baseline_corrente`, ordine per id decrescente) e rifiuta la richiesta se non ce
    n'è una ("blocca prima una baseline di budget") — coerente con "nessuna nuova
    baseline senza change request" (non si propone una variazione nel vuoto).

91. **L'approvazione crea una baseline di soli importi, non riclona i task.**
    "Approvata ⇒ crea la nuova baseline collegata" (specifica) è implementato in
    `approva_change_request` clonando `bac_direct`/`bac_indirect`/`bac_contingency`
    della baseline di partenza con il Δ costo della CR applicato al diretto, con
    `kind = 'altra'` — stessa natura di `blocca_baseline_budget`, nessuna riga
    `baseline_task`/`baseline_timephased`. Riclonare anche i dati a livello di task
    richiederebbe una logica di "nuovo import di piano" che nessuna change request
    oggi fornisce (il piano si aggiorna solo da un nuovo export, Fase 4 §6); è una
    baseline di budget come le altre, confrontabile ma senza dettaglio di task (vedi
    93 sul Confronto). `baseline_to_id` e lo stato della CR si aggiornano nella stessa
    transazione del nuovo insert.

92. **`approved_at`/`approved_by` significano ora "decisa il/da", per entrambi gli
    esiti.** Aggiungere uno `status` esplicito (`pending`/`approved`/`rejected`,
    migrazione `0007_baseline_change_request.sql`) invece di dedurlo da
    `approved_at IS NULL` com'era prima permette lo stato "respinta" richiesto dalla
    colonna "Stato" della specifica. Non si sono rinominate le colonne (SQLite
    richiederebbe ricreare la tabella, come già fatto una volta per `status_snapshot`
    in 0006): si riusano per il rigetto, con lo stesso significato "chi/quando ha
    deciso" — lo `status` disambigua quale decisione sia stata presa. Le righe
    esistenti con `approved_at` non nullo sono state retro-popolate a `status =
    'approved'` nella migrazione.

93. **Il Confronto ha senso solo tra baseline con dati di task.** `confronta_baseline`
    (nuova funzione in `controllo.rs`) aggrega `baseline_task.cost`/`start`/`finish`
    per nodo WBS tra due baseline a scelta — ma quella tabella si popola solo
    all'importazione di un piano (`import/mod.rs`), non da `blocca_baseline_budget`
    né dall'approvazione di una CR (decisione 91). Confrontare due baseline "di soli
    importi" produce quindi zero/— su ogni riga: comportamento accettato (nessun
    errore, nessun valore fittizio), perché l'uso previsto dalla specifica stessa
    ("es. stima vs startup") confronta due baseline nate da un import, che hanno
    sempre `baseline_task`.

94. **Lo scope di baseline resta modificabile anche a baseline bloccata.**
    `baseline_scope` non ha (e non riceve qui) un trigger di immutabilità come
    `baseline`/`baseline_task`: l'inclusione/esclusione di un nodo WBS e la sua nota
    sono per natura una revisione successiva al blocco (altrimenti la scheda Scope
    non avrebbe senso su una baseline già bloccata, che è il caso normale). La sola
    protezione è il permesso `coordinatore_piano` (decisione 88); "incluso" di
    default quando non c'è ancora una riga in `baseline_scope` per quel nodo
    (`COALESCE(bs.included, 1)`), così la tabella parte già coerente senza dover
    inizializzare una riga per ogni WBS alla creazione della baseline.

95. **Tabelle Baseline/Confronto/Change request/Scope su `DataTable`, non `<table>`
    semplice come la vecchia `GovernanceScreen`.** Coerente con il resto della Fase 5
    (decisione 84 e seguenti): questa è una schermata della specifica UI_ANALISI, non
    la `GovernanceScreen` pre-Fase-5 (che resta con le sole sezioni budget/riserve/
    consumi, fuori ambito di questa specifica). Confronto e Scope leggono con
    `useDatiCon` (nuovo hook in `lib/schermate.ts`, parallelo a `useDati` ma per
    comandi con argomenti che cambiano, es. le due baseline scelte) invece del
    pattern a zero argomenti usato finora: primo caso in app di un comando Tauri
    richiamato con parametri scelti dall'utente dopo il montaggio della schermata.

## Fase 5, incremento 5 — Forecast: EAC ed Earned Schedule (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md §3.6)

Ambito: nuova schermata `ForecastScreen` (nav id `forecast`, già previsto in
`navigation.ts` ma non cablato) con le schede EAC ed Earned Schedule. Monte Carlo,
terza scheda della specifica, resta un segnaposto: l'ordine di lavoro consigliato
(§7) la rimanda all'incremento con Agile/Flow, che condivide la stessa
infrastruttura di simulazione.

96. **Nessun calcolo nuovo per la scheda EAC: solo lettura di `EvmOutput`.**
    `vistaMonitoraggio` (già usata da Dashboard/WBS/Task, decisione 71) porta già
    `etc`/`eac`/`eacOptimistic`/`vac`/`tcpi` per ogni data di stato dentro
    `PuntoVista.evm` — la scheda EAC riusa `puntoTestata` per i KPI del punto
    corrente e `vista.punti` per il grafico a barre EAC-vs-BAC, senza toccare
    `packages/engine` né il backend. Il messaggio guida "TCPI > 1,1" della
    specifica è puramente di presentazione (stringa in `ForecastScreen.tsx`,
    condizione `tcpi !== null && tcpi > 1.1`): non esiste nel motore un codice di
    avviso per questa soglia, diversamente da CPI/SPI che hanno `cpiLight`/
    `spiLight`. Niente scenario "lineare" separato nel grafico (coerente con la
    decisione 34: EAC lineare resta solo un controllo nei test del motore).

97. **Le date di inizio/fine prevista del progetto arrivano ora nello store di
    contesto.** `ProgettoAperto`/`EsitoImportWorkbook` portavano già
    `dataInizio`/`dataFinePrevista` (da `project_params`, viste da `progetto.rs`)
    ma `applicaAlContesto` (`lib/progetto.ts`) e l'equivalente in `lib/workbook.ts`
    le scartavano, copiando solo la data di stato. Servono a `earnedSchedule()`
    (date di calendario per ES/AT/PD): si sono aggiunte `dataInizio`/
    `dataFinePrevista` a `project-context-store` e ai due punti che aprono un
    progetto, invece di un nuovo comando Tauri o di derivarle da
    min/max delle date pianificate dei task (`DatiMonitoraggio.task`) — i valori
    del progetto sono quelli espliciti dell'import, più corretti di
    un'approssimazione dalle date dei singoli task. Se un progetto non le ha
    (ancora possibile: sono `Option<String>` anche nello schema), la scheda Earned
    Schedule mostra uno stato vuoto invece di calcolare su date assenti.

98. **La linea "ES" nel grafico si ancora alla data di stato più vicina, non al
    giorno esatto.** `earnedSchedule()` restituisce `es` in giorni dall'inizio
    progetto, un numero continuo; l'asse x del grafico PV/EV è a categorie (le
    date di stato disponibili, stesso schema di `curvaS` in Dashboard) e
    `markLine.xAxis` su un asse a categorie richiede un valore identico a uno dei
    tick, non una data arbitraria. `dataPiuVicina` (`ForecastScreen.tsx`) sceglie
    il punto della vista con `diffDays(dataInizio, p.data)` più vicino a `es` e
    usa la sua stringa data come ancora: approssimazione onesta (la linea cade sul
    punto osservato più vicino al vero ES), preferita a un asse a tempo continuo
    che avrebbe richiesto riscrivere anche `curvaS`/`trendIndici` per coerenza.

## Fase 5, incremento 6 — Monte Carlo e Agile/Flow (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md §3.6/§3.9)

Ambito: la scheda Monte Carlo (prevista sia in Forecast sia in Agile/Flow, "stessi
controlli e salvataggio") e la nuova schermata `AgileFlowScreen` (nav id `agile-flow`,
già previsto ma non cablato) con le schede Sprint, Velocity, Flow, Monte Carlo.

99. **Nessun Web Worker né chunking per Monte Carlo: misurato, non solo deciso.**
    La decisione 72 aveva esplicitamente rimandato questa scelta a quando "Gantt a
    20.000 righe o Monte Carlo" l'avessero richiesta. Misurato con
    `simulateVelocity` (nessuna modifica al motore): 5.000 iterazioni (il default
    di specifica) girano in ~13ms, 200.000 in ~250ms — sempre sul thread
    principale, senza un progresso reale da mostrare in più di uno o due frame.
    `MonteCarloPanel` (`src/components/screens/MonteCarloPanel.tsx`) non ha quindi
    barra di avanzamento né Annulla (la specifica li richiede assumendo un calcolo
    più pesante di quanto sia in pratica): il pulsante Esegui si disabilita solo
    per la breve durata della chiamata sincrona. `MAX_ITERAZIONI = 200_000`
    (`lib/montecarlo.ts`) tiene il caso peggiore nello stesso ordine di grandezza
    misurato, così l'assunzione resta valida anche se l'utente alza le iterazioni
    oltre il default.

100. **Monte Carlo è un'unica infrastruttura condivisa, non tre algoritmi.** Lo
     schema di `monte_carlo_run` prevede un `kind` con tre valori possibili
     (`velocity`, `throughput`, `durata_costo`), ma la specifica del tab Monte
     Carlo di Forecast parla delle stesse "finestra velocity/throughput" del tab
     di Agile/Flow — non di un terzo algoritmo basato su un burn rate EVM
     classico (che richiederebbe una formula non specificata: quale storico di
     "progresso per periodo" usare, come tradurre un backlog in € in periodi).
     Si è scelto di non costruirlo: `MonteCarloPanel` (`src/components/screens/
     MonteCarloPanel.tsx`) usa solo `simulateVelocity`, alimentato da due fonti —
     velocity degli sprint o throughput dei periodi di flusso — scelte
     dall'utente con un selettore, mostrato identico sia nella scheda Monte Carlo
     di Forecast sia in quella di Agile/Flow (`lib/montecarlo.ts::costruisciFonti`,
     usato da entrambe le schermate). Il tipo `durata_costo` resta nel CHECK dello
     schema (per non restringerlo) ma nessun codice lo scrive: se in futuro servirà
     un vero Monte Carlo sui costi EVM, è una formula da definire, non un'estensione
     di questo codice.

101. **`monte_carlo_run.result_json` porta solo il riassunto (percentili e
     istogramma), non le `periods`/`costs` grezze di ogni iterazione.** Bastano a
     ri-mostrare una run passata (tabella, istogramma, frase guida) senza
     ricalcolo, e restano piccoli anche a 200.000 iterazioni — le migliaia di
     numeri grezzi per iterazione non servono a nessuna vista già costruita.
     Riprodurre esattamente una run (stessi numeri iterazione per iterazione) resta
     possibile lanciandola di nuovo con lo stesso seed, parametri e storico
     (mulberry32 è deterministico, decisione 40): non serve conservare l'output
     completo per questo. Nessun permesso richiesto per salvare una run: a
     differenza di Baseline/Change request (decisione 88-89), la specifica non
     riserva Monte Carlo al coordinatore del piano.

102. **`project_params.backlog_sp`, nuova colonna, inserimento a mano.**
     `agileMetrics` del motore richiede un totale di SP residui per calcolare
     sprint residui/EAC tempo/EAC costo, ma nessuna tabella lo portava: gli sprint
     hanno SP pianificati/completati per sprint già fatto, non un backlog totale
     ancora da fare, e nessuna fonte di import lo fornisce. Si imposta nella
     scheda Sprint di Agile/Flow (`imposta_backlog_sp`); se assente (`null`, non
     `0`: "non impostato" è diverso da "backlog esaurito"), la UI mostra `—` su
     sprint residui/EAC invece di un forecast fuorviante "già finito" — l'adattatore
     (`lib/agile.ts::metricheAgili`) calcola comunque con 0 così velocity/costo
     per SP/CPI agile restano disponibili senza quel dato.

103. **`kanban_flow`: inserimento manuale, Cumulative Flow Diagram deferito.**
     La tabella esisteva dalla Fase 1 ma nessun foglio del workbook la esporta
     (il foglio "Agile" non ha un Kanban, decisione già presa in Fase 3) e nessun
     codice la leggeva/scriveva: qui si aggiungono `flusso_elenco`/
     `crea_periodo_flusso`/`elimina_periodo_flusso` (`crates/evm-db/src/agile.rs`)
     con un modulo di inserimento a mano nella scheda Flow — unica via possibile
     senza un'integrazione con una board Kanban reale, fuori ambito. Throughput/
     cycle time/WIP osservato-vs-teorico (Legge di Little) e l'avviso
     FLOW_WIP_EXCESS usano direttamente queste righe (`kanban_flow` porta già gli
     aggregati che `littleWip`/`diagnoseWip` del motore si aspettano). Il
     **Cumulative Flow Diagram resta fuori**: `cumulativeFlow()` del motore
     richiede conteggi grezzi per stato (`backlog`/`inProgress`/`done`), che
     questa tabella non ha (solo gli aggregati `throughput`/`cycle_time_days`/
     `wip_observed`) e che nessuna fonte di dati fornisce oggi — aggiungerli
     richiederebbe un'altra migrazione e un'altra UI di inserimento a mano senza
     che nulla li alimenti automaticamente; rimandato a quando un dato reale
     (import o integrazione) li renderà significativi.

104. **`FLOW_WIP_LIMIT`/`checkWipLimits` non costruito: non richiesto da questo
     paragrafo della specifica.** Il bullet "Flusso" di §3.9 cita solo
     FLOW_WIP_EXCESS; i limiti WIP per stato (e la loro tabella di
     configurazione) sono una funzionalità del motore distinta, non menzionata
     qui — non è un deferimento, è semplicemente fuori ambito di questo
     incremento.

105. **Tabella Sprint fedele alle colonne della specifica, anche quando ripetono
     un valore costante.** "Velocity" (= SP completati dello stesso sprint),
     "Velocity media" e "Costo/SP di baseline" sono gli stessi valori su ogni riga
     (la media e il costo/SP sono per progetto, non per sprint) — si mostrano
     comunque come colonne proprie invece di deduplicarle, perché la specifica le
     elenca esplicitamente nella tabella. Backlog residuo/Sprint residui/EAC
     tempo/EAC costo sono invece valori di progetto non per-sprint: striscia di
     `Kpi` sopra la tabella, stessa scelta della decisione 83.

## Fase 5, incremento 8 — Filoni e programma, Buffer e riserve (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md §3.7/§3.8)

Ambito: nuova schermata `FiloniScreen` (nav id `filoni`, già previsto ma non
cablato) con la tabella dei filoni/riga Programma/elenco gate, e `RiserveScreen`
riscritta in tre sezioni — Contingency, Management reserve, Buffer di tempo —
ognuna con lo stato del motore (`buffers.ts`, scritto e testato dalla Fase 2 ma
non ancora richiamato da nessuna schermata).

106. **Workstream e gate: CRUD manuale, come `agile_sprint`/`kanban_flow` prima di
     loro.** `workstream`/`workstream_gate` esistevano dalla Fase 1 ma nessun
     import li popola (il foglio "Agile" del workbook esporta solo gli sprint,
     non i filoni) e nessun comando li leggeva o scriveva. Nuovo modulo
     `crates/evm-db/src/filoni.rs`: `crea_filone`/`elenco_filoni`/
     `assegna_task_a_filone`/`crea_gate`/`elenco_gate`. Due colonne mancavano per
     corrispondere al motore: `workstream.variable_scope` (il campo
     `Workstream.variableScope` del motore non aveva nulla da leggere) e
     `workstream_gate.due_date` (un gate aveva buffer e descrizione ma non la
     propria data) — migrazione `0009_filoni_riserve.sql`.

107. **Il nome del filone è la chiave del rollup EVM: unicità imposta alla
     creazione.** Il motore raggruppa gli indici per filone sul nome
     (`MonTask.filone`/`perFilone`, stessa convenzione del codice WBS, non
     sull'id — coerente con come `perWbs` già funziona), quindi due filoni
     omonimi farebbero confluire silenziosamente i loro dati nello stesso
     gruppo. `crea_filone` rifiuta un nome già usato nel progetto — unico
     controllo di unicità lato backend su un "nome" dell'app (i codici WBS non
     lo hanno, ma lì il codice è strutturato e la Fase 3 già lo tratta come
     chiave); qui, senza, il bug sarebbe silenzioso (somme sbagliate, non un
     errore).

108. **`dati_monitoraggio`/`monitoraggioEvm` portano ora anche il filone di ogni
     task, con lo stesso trattamento del WBS.** `TaskMon.filone` (nuovo campo,
     `LEFT JOIN workstream` in `dati_monitoraggio` — stesso join già usato da
     `task.rs::elenco_evm`) alimenta `perFilone`/`perFiloneMisure` in
     `PuntoMonitoraggio` (`packages/engine/src/monitoring.ts`), costruiti con lo
     stesso `rollup()`/`sumEvm()` di `perWbs`, filtrando i task senza filone
     invece di un bucket "non assegnato" (anche questo, come `perWbs`). Un task
     senza WBS non entra comunque in `righeEvm` (limite preesistente
     dell'allocazione del budget, non introdotto qui): un filone con solo task
     privi di WBS non riceve ancora indici EVM.

109. **Nessuna rilevazione LOE per filone: ogni riga passata a `programRollup`
     ha `loe: false`.** `WorkstreamRow.loe` richiederebbe di portare il metodo
     EV di ogni task dentro il rollup di monitoraggio solo per alimentare
     `loeShare`/`spiExLoe`/l'avviso `LOE_SHARE` — nessuna delle colonne della
     tabella Filoni della specifica (`Filone | Tipo | Metodo di misura | BAC |
     PV | EV | AC | CPI | SPI | Peso sul programma | Semaforo`) le richiede.
     Con `loe: false` ovunque, `loeShare` resta 0 (sotto qualunque soglia
     positiva) e lo SPI mostrato è sempre quello semplice — nessuna sovrastima
     nascosta, solo una correzione che questo incremento non calcola. Rimandato
     a quando una schermata mostrerà davvero LOE share/SPI-ex-LOE.

110. **GATE_NO_BUFFER non si calcola: nessuna data di consegna prevista per
     filone esiste.** `checkGate` confronta la data del gate con una previsione
     di consegna (P80 Monte Carlo o EAC tempo) **per filone**, ma né il Monte
     Carlo (decisione 100, per fonte di velocity/throughput di progetto, non
     per filone) né `programRollup` calcolano una data di fine per singolo
     filone — costruirla richiederebbe una macchina di Earned-Schedule-per-
     filone a sé. `FiloniScreen` chiama `programRollup` con `gates: []`
     (nessun avviso) e mostra l'elenco dei gate letto da `elenco_gate` solo per
     tracciamento, con una nota esplicita in UI che l'avviso automatico non
     c'è ancora — non un errore nascosto.

111. **Buffer e riserve: `risk.usage_amount`/`usage_date` letti per la prima
     volta.** Le colonne esistevano dalla Fase 1 ma `schermate.rs::riserve()`
     non le selezionava: `Rischio` porta ora `utilizzato`/`dataUtilizzo`,
     usati sia per le colonne Utilizzata/Residuo della tabella rischi
     (specifica §3.8) sia come `RiskRow` per `contingencyStatus` (motore,
     `lib/riserve.ts::statoContingency`) — RES_CONT_NO_RISK/RES_CONT_MISMATCH
     ora hanno dati reali da cui scattare, non solo i test unitari del motore
     (decisione 42).

112. **`reserve_usage.approved`, nuova colonna, con un'approvazione riservata al
     coordinatore del piano.** Nessuna colonna segnava se un consumo di
     riserva fosse approvato: RES_MR_UNAPPROVED non aveva dati da leggere.
     `approva_consumo_riserva` (nuovo comando, stesso schema di permesso delle
     decisioni 88-89: `richiede_coordinatore_piano`, resa `pub(crate)` in
     `controllo.rs` e riusata da `schermate.rs` invece di duplicarla) marca un
     consumo come approvato; `lib/riserve.ts::statoRiservaGestione` considera
     la management reserve "approvata" solo se **tutti** i consumi di quel
     tipo lo sono — un solo consumo non approvato tiene l'avviso attivo, non
     lo nasconde la media. Contingency e buffer di tempo non hanno questo
     concetto (la specifica lo richiede solo per la management reserve).

113. **L'indice di salute del buffer si applica solo al Buffer di tempo.**
     `bufferHealth(consumedPct, completedPct)` è il "fever chart" classico —
     consumo del buffer di programma contro percentuale di progetto
     completata (EV/BAC, da `dati_monitoraggio`, già disponibile nella
     schermata) — concetto estraneo a contingency/management reserve, che
     hanno invece un residuo diretto (stanziata/usata) e il loro avviso
     dedicato. Si mostra quindi come unica card nella scheda Buffer di tempo,
     non replicato nelle altre due.

114. **Tabella Filoni: "Peso sul programma" è `evShare`, "Semaforo" è il
     peggiore tra CPI e SPI.** Il motore espone sia `evShare` sia `acShare`
     come contributo di un filone alle variazioni di programma, ma la
     specifica elenca una sola colonna "Peso sul programma": si mostra
     `evShare` (il peso sul valore guadagnato, la metrica EVM primaria),
     `acShare` resta calcolato nel motore ma non ha una colonna propria. La
     colonna "Semaforo" non esiste come campo singolo in `WorkstreamResult`
     (che porta `cpiLight`/`spiLight` separati, come ogni altra schermata):
     si combina con il peggiore dei due (rosso > giallo > verde > nd), così un
     filone in ritardo ma a costo non segnala "a posto" solo perché il CPI è
     verde.

## Fase 5, incremento 9 — Gantt di sola lettura (docs/specifiche/SPEC_FASE_5_UI_ANALISI.md §3.4)

Ambito: il Gantt esisteva già (decisione 65, Fase 4) ma a una specifica più semplice —
un solo contenitore di scorrimento, nessuna virtualizzazione, zoom o baseline. Qui si
riscrive `GanttScreen.tsx` per il §3.4 completo: due pannelli ridimensionabili,
virtualizzazione, zoom, baseline, linea della data di stato, frecce disattivabili,
evidenza del perimetro, tooltip con SPI. La matematica di scala/frecce di
`src/lib/gantt.ts` (già testata) resta, solo parametrizzata invece che a costanti fisse.

115. **SVG virtualizzato, non Canvas 2D.** Nessun `<canvas>` esiste nel codice: la
     specifica permette entrambi ("Canvas 2D o SVG virtualizzato"). Si riusa invece
     il pattern già in produzione in `DataTable.tsx` (`@tanstack/react-virtual`,
     `useVirtualizer`): con la virtualizzazione il numero di nodi DOM a schermo è
     limitato alla finestra visibile (~40-60 righe con l'overscan) indipendentemente
     dal totale — lo stesso principio che già regge le tabelle con migliaia di righe
     altrove nell'app — senza introdurre una tecnica di rendering (disegno manuale a
     pixel, hit-testing per i tooltip) mai usata prima in questo codice.

116. **Nessuna misura di frame time qui: è il test §5.4, non questo incremento.**
     La specifica elenca "20.000 righe scorrevoli (misurare frame time)" tra i test
     obbligatori del §5, non tra i requisiti della schermata — e quel punto è
     esplicitamente nell'incremento 11 ("test visivi, accessibilità e
     prestazioni"), non ancora raggiunto. Misurarlo onestamente richiede un
     browser/harness visivo che questo progetto non ha ancora (decisione da
     prendere nell'incremento 11, non qui): diversamente dalle decisioni 72/99
     (Monte Carlo), dove un calcolo puro si poteva cronometrare con `tsx` in pochi
     secondi, il costo di un rendering virtualizzato è una proprietà del DOM/
     browser, non del codice TypeScript puro — non misurabile qui senza fabbricare
     un numero.

117. **`gantt()` ora parametrizzato per baseline, stessa convenzione delle altre
     query baseline-aware.** `inizio_baseline`/`fine_baseline` (nuovi campi di
     `RigaGantt`) vengono da `baseline_task` filtrato su
     `COALESCE(?baseline_id, (SELECT id FROM baseline WHERE kind='startup' ORDER
     BY id DESC LIMIT 1))` — stesso fallback già usato da `task.rs::elenco_evm`/
     `controllo.rs::dati_monitoraggio`, ora reso esplicito invece che fisso.
     Nessun nuovo selettore nella schermata: `GanttScreen` legge `ctx.baselineId`
     dallo store di contesto e lo passa a `gantt_elenco` (via `useDatiCon`, non
     `useDati`, perché ora il comando ha un parametro) — il selettore di baseline
     della barra di contesto (decisione 73) è l'unico punto da cui si scelgono
     "Startup/Stima/altra", non duplicato dentro il Gantt.

118. **Scorrimento verticale sincronizzato a una sola direzione, non due listener
     che si rimandano l'un l'altro.** Il pannello sinistro (tabella) è l'elemento
     a cui è agganciato `useVirtualizer`: il suo `onScroll` copia `scrollTop` nel
     pannello destro (timeline). Scorrere sopra il destro (rotella senza Ctrl)
     muove invece `leftRef.current.scrollTop`, che a cascata richiama lo stesso
     `onScroll` del sinistro — nessun ping-pong possibile perché il destro non ha
     un proprio listener che retroagisca sul sinistro. Pannelli ridimensionabili
     con `react-resizable-panels` (`Group`/`Panel`/`Separator`, l'API v4 già usata
     da `AppShell.tsx`, qui con un vero `Separator` draggabile — finora solo un
     singolo `Panel` al 100% era in uso, senza divisore).

119. **Zoom a 4 livelli discreti (giorno/settimana/mese/trimestre), non continuo.**
     Selezionabili da pulsanti (sempre raggiungibili da tastiera) o Ctrl+rotella
     sul pannello timeline (che scorre la rotella senza Ctrl per lo scorrimento
     verticale, decisione 118). Sotto una densità di 8px/giorno si nascondono i
     numeri dei singoli giorni nell'intestazione (illeggibili a quella scala),
     sotto 4px/giorno anche la griglia verticale — altrimenti migliaia di linee
     /etichette a trimestre su un progetto pluriennale.

120. **Corretta la resa visiva rispetto all'implementazione precedente (decisione
     65), ora che ci sono le date di baseline per farlo.** Barra attuale sempre
     blu (`bg-zona-accento`) con riempimento *scuro* (opacità piena) che cresce
     con `% reale` sopra una base più chiara (`/35`) — l'inverso della vecchia
     resa (sovrapposizione chiara su barra piena); i task critici aggiungono un
     **contorno** rosso (`border-2 border-semaforo-rosso`) alla barra blu, non la
     sostituiscono con una barra piena rossa; i riepiloghi sono ora una parentesi
     (due tacche verticali unite da una linea sottile), non una barra attenuata;
     sotto la barra attuale compare la barra sottile grigia della baseline quando
     il task ne ha una (prima impossibile: `RigaGantt` non portava quelle date).

121. **Le frecce di precedenza si filtrano sulla stessa finestra virtualizzata
     delle righe (±1 di overscan), non su tutto il progetto.** Stesso principio
     della decisione 115: con 20.000 righe anche il numero di dipendenze
     potenziali è grande; disegnare solo gli archi i cui due estremi sono (quasi)
     visibili limita i nodi SVG allo stesso modo in cui la virtualizzazione limita
     i nodi DOM delle barre.

122. **Tooltip ricco riusando il componente Radix già nell'app (nessun provider
     nuovo: `TooltipProvider` avvolge già tutta l'app in `App.tsx`).** Data
     pianificata/baseline, durata, % pianificata vs reale, SPI di task — senza
     calcoli nuovi: "% pianificata" è `pvLineareTask(1, inizio, fine, statusDate)`
     del motore (già usato per il PV dei task nel motore di monitoraggio, qui
     con budget `1` per ottenere direttamente una frazione), e lo SPI viene dalla
     stessa pipeline `dati_monitoraggio` → `vistaMonitoraggio` → `puntoTestata`
     già usata da Task e risorse (decisione 81-82) — letta qui per il tooltip,
     non duplicata.

123. **L'evidenza del perimetro riusa `sottoalbero` di `lib/monitoraggio.ts`
     (ora esportata), non una propria copia del controllo sul prefisso WBS.**
     I task fuori dal perimetro scelto nella barra di contesto si attenuano
     (`opacity-40`) invece di essere rimossi dalla vista — "gli altri attenuati",
     non filtrati, come nella specifica — sia nella tabella che sulla timeline.
