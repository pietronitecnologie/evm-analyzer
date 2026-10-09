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

## Fase 6, incremento 1 — Registro unico delle anomalie e schermata Qualità dati (SPEC_FASE_6_QUALITA_REPORT_RILASCIO.md §1)

Ambito: solo il sottoinsieme richiesto (qualità dati, poi report, poi prestazioni — non
backup/sicurezza §4, installer §5, documentazione §6, e2e §7, criteri di accettazione
formali §8, tutti rimandati). `data_quality_issue` persiste ciò che il motore calcola già
da tempo per schermata (program.ts, buffers.ts, flow.ts, agile.ts, monitoring.ts,
quality.ts) ma che finora restava transitorio — nessuna persistenza, nessuna
accettazione, nessuno storico.

124. **Solo i codici con un input già assemblato correttamente da qualche schermata; il
     resto è deferito, non indovinato.** Wired: `WBS_NO_BUDGET`/`WBS_BUDGET_UNALLOCABLE`
     (monitoraggioEvm), `LOE_SHARE`/`GATE_NO_BUFFER` (programRollup via
     `costruisciProgramma`), `FLOW_WIP_EXCESS` (avvisoWip), `RES_CONT_NO_RISK`/
     `RES_CONT_MISMATCH`/`RES_MR_UNAPPROVED`/`BUFFER_NO_PROGRESS` (buffers.ts via
     lib/riserve.ts), `AGILE_COST_PER_SP_DERIVED`/`VEL_EMPTY`/`VEL_SHORT`/`VEL_ZERO`
     (agileMetrics), `Q007`/`Q013` (checkQ007/checkQ013, già usati da TaskRisorseScreen),
     e gli avvisi EVM di progetto (`EVM_CPI_UNDEFINED` ecc., da `testata.evm.warnings`,
     **solo a livello di progetto**, non per ogni task/nodo WBS — centinaia di "CPI non
     definito" per task con AC=0 sarebbero rumore, non anomalie). Esclusi qui:
     `Q001`-`Q006`, `Q008`-`Q011`, `Q014`-`Q016`, `Q020`-`Q021`, `Q030`-`Q031` (richiedono
     uno storico per task — metodo EV nel tempo, % soggettiva nel tempo, variazioni di
     baseline senza change request — che nessuna pipeline assembla ancora); `XL_*`/
     `PLAN_*` (import, oggi solo stringhe libere o senza un campo `code` pulito da
     estrarre); `V001`-`V016` (**non esistono**: le validazioni di invio avanzamento
     della Fase 4-bis non sono mai state scritte — `registra_avanzamento` fa solo
     controlli banali di intervallo). `FLOW_WIP_LIMIT` escluso anche lui: richiede limiti
     WIP per stato che nessuna tabella porta.

125. **Ricalcolo idempotente: confronto fatto in Rust su una mappa chiave→riga esistente,
     non con un `INSERT ... ON CONFLICT` che referenzia la stessa riga che aggiorna.**
     Un `UPSERT` con `CASE WHEN data_quality_issue.state = ...` dentro il proprio
     `ON CONFLICT DO UPDATE` avrebbe dovuto distinguere "era aperta", "era accettata" e
     "era risolta" per decidere se riaprire — fattibile in SQL con una tabella temp per
     ricordare lo stato precedente, ma più fragile da verificare che farlo in Rust:
     `ricalcola_problemi` legge prima le righe aperte/accettate di quella fonte+snapshot
     in una mappa `(code, task_id, wbs_id) → id`, poi per ogni anomalia fresca: se è nella
     mappa non tocca lo stato (solo testo/gravità, nel caso il catalogo cambi); se non
     c'è ma esiste una riga `risolta` con la stessa chiave la riapre; altrimenti inserisce.
     Quel che resta nella mappa a fine giro (prodotto prima, non più ora) diventa
     `risolta`. Le `accettata` il cui input sparisce **non** diventano mai `risolta` in
     questo giro (restano accettate "per sempre" se non riappaiono) — la specifica lo
     vorrebbe, ma farlo bene richiederebbe ricordare lo stato precedente anche per le
     accettate con la stessa complessità del punto sopra: rimandato.

126. **Il ricalcolo è manuale (pulsante «Recalculate»), non automatico dopo ogni evento.**
     La specifica lo vorrebbe agganciato a "import, approvazione, cambio status date,
     risoluzione" — collegare `ricalcola_problemi` a ogni punto di scrittura dell'app
     (import piano/workbook, approvazione avanzamento, resync, decine di comandi già
     scritti nelle fasi precedenti) è un'integrazione a sé, non contenuta in questo
     incremento. La schermata Qualità dati resta corretta finché l'utente la apre e
     preme Ricalcola; non si aggiorna da sola in sottofondo.

127. **`richiede_uno_dei_ruoli`, nuovo helper per "supervisore o coordinatore_piano".**
     `richiede_coordinatore_piano` (decisione 88) controllava un solo ruolo fisso;
     "Accetta con motivo" della specifica è per due ruoli alternativi. Nuova funzione in
     `controllo.rs` con una query `IN (?,?,...)` costruita dal numero di ruoli passati,
     non duplicando la query a ruolo singolo. "Riapri" non richiede invece alcun ruolo:
     la specifica elenca la restrizione di ruolo solo per "Accetta con motivo", non per
     "Riapri" — letta alla lettera, non un'omissione.

128. **Stato finale della data di stato: nuove colonne su `status_snapshot`, non una
     tabella a parte.** `state` (`bozza`/`provvisorio`/`finale`) più
     `final_override_by`/`final_override_reason` per quando il coordinatore forza il
     finale con anomalie critiche aperte. Il tipo `StatoStatusDate` nel frontend esisteva
     già dalla Fase 1 (`"bozza"|"provvisorio"|"finale"`) ma nessun backend lo riempiva e
     `ContextBar` non passava mai lo `stato` a `setSnapshot` — colmato qui (`s.state` ora
     passato), non introdotto da zero. `marca_snapshot_finale` blocca se ci sono critiche
     aperte per quello snapshot, a meno di un motivo non vuoto **e** del ruolo
     coordinatore_piano insieme (non basta l'uno o l'altro).

129. **Il conteggio delle anomalie nella barra di stato si aggiorna da sé (poll ogni
     15 s), non spinto dalla schermata Qualità dati.** `ctx.anomalyCount` era un campo
     segnaposto dalla Fase 1, mai scritto. `StatusBar` resta montata per tutta la sessione
     di un progetto (a differenza delle schede), quindi è lei stessa a richiamare
     `conteggio_problemi` — se l'aggiornamento fosse spinto dalla schermata Qualità dati
     (come inizialmente impostato, poi scartato), il numero resterebbe fermo a zero/
     all'ultimo valore ogni volta che quella schermata non è aperta, che è la situazione
     normale. Nessun canale di invalidazione immediato tra schede: fino a 15 s di
     scarto tra un'azione (ricalcola/accetta/riapri) e l'aggiornamento del numero in
     barra, accettato come compromesso rispetto a un bus di eventi tra componenti.

## Fase 6, incremento 2 — Report (SPEC_FASE_6_QUALITA_REPORT_RILASCIO.md §2)

130. **Un solo documento HTML per anteprima, esportazione e stampa — non tre resi da
     tenere sincronizzati.** `lib/report.ts::generaReportHtml` produce una stringa HTML
     autosufficiente (CSS inline scritto a mano, nessuna classe Tailwind né variabile
     CSS dell'app: quelle esistono solo dentro l'app, un file esportato non le avrebbe).
     `ReportScreen` la mostra in un `<iframe srcDoc={html}>` — isolato dallo stile
     dell'app per costruzione, non per attenzione a non farlo perdere — "Esporta HTML"
     scrive la stessa stringa su disco, "Stampa/Esporta PDF" chiama
     `iframeRef.current.contentWindow.print()`, che stampa solo il contenuto
     dell'iframe (comportamento standard del browser/webview), non la finestra dell'app
     attorno: nessuna CSS `print:hidden` da aggiungere ad `AppShell` per nascondere
     menu/barra laterale durante la stampa, il problema non si pone.

131. **PDF: stampa della webview, nessuna libreria Rust di riserva.** Percorso
     principale della specifica (§2.3.1) scelto senza il fallback del §2.3.2 (`typst` o
     simile) — la specifica stessa chiede di scegliere una sola strada. Non verificabile
     sulle tre piattaforme da questo ambiente di sviluppo (solo Linux): la resa
     dell'SVG inline e delle regole `@page`/`break-inside` nella finestra "Salva come
     PDF" di Windows/macOS resta da controllare quando l'app girerà lì — annotato come
     rischio noto, non silenziato.

132. **Il rendering SVG di ECharts in modalità SSR è stato eseguito davvero, non solo
     controllato a tipi.** `echarts.init(null, null, { renderer: "svg", ssr: true })` +
     `renderToSVGString()` è un uso dell'API mai comparso altrove nel codice (il resto
     dell'app disegna sempre su un `<div>` reale via `EChart.tsx`): verificato con uno
     script Node scartato subito dopo (stesso principio delle decisioni 72/99 — misurare
     prima di fidarsi della firma dei tipi) prima di scriverlo dentro `report.ts`.

133. **Scope ridotto rispetto alla specifica, dichiarato non indovinato.** Sezione Monte
     Carlo assente: lo storico delle run salvate (decisione 101) ha più fonti
     (velocity/throughput) e nessuna è "quella del report" senza un selettore dedicato —
     rimandato. Nessun caricamento di un logo (solo il nome azienda in testo). Nessun
     "Pagina x di y" interattivo nell'anteprima a schermo: i numeri di pagina via
     contatori CSS esistono solo quando il documento è davvero impaginato (stampa/PDF),
     non in uno scroll HTML continuo — l'anteprima mostra il contenuto, non una
     simulazione di impaginazione.

134. **`versione_app`, un comando Tauri proprio invece di `@tauri-apps/api/app`'s
     `getVersion()`.** Quest'ultima richiederebbe una capability Tauri in più da
     verificare (quali permessi minimi §4.5 della specifica concede davvero) solo per
     leggere una stringa; `env!("CARGO_PKG_VERSION")` è una costante di compilazione,
     stesso livello di fiducia di ogni altro comando già scritto in questo backend,
     nessun nuovo varco da apri.

135. **L'hash del report copre il contenuto delle sezioni assemblate, non il documento
     finale che lo contiene.** Includere l'hash nel testo che viene hashato è
     circolare (l'hash cambierebbe il testo che dovrebbe riassumere); si calcola su
     `corpo` (le sezioni HTML già composte) prima di inserirlo nel piè di pagina del
     documento finale — SHA-256 via Web Crypto (`crypto.subtle.digest`, disponibile nel
     contesto della webview come in ogni browser), troncato ai primi 16 caratteri
     esadecimali per restare leggibile a piè di pagina.

136. **Suite di prestazioni (specifica Fase 6 §3): un binario Rust separato
     (`bench/`, nuovo membro del workspace Cargo) invece di un test `#[bench]` o di
     criterion.** Serve generare progetti sintetici a tre scale (200/2.000/20.000 task,
     20 filoni, 50 risorse, 52 date di stato, le stesse quantità della specifica) con
     inserimenti massivi in un'unica transazione, poi cronometrare `apertura_progetto`
     e `query_gantt` su quei file veri — un `#[bench]` nightly-only o criterion
     avrebbero aggiunto una dipendenza/toolchain in più solo per il micro-benchmarking,
     quando qui serve soprattutto orchestrare SQLite su disco. Confronto con una
     baseline persistita in `bench/baseline.json` (JSON semplice, non un formato
     proprietario di una libreria di benchmark) con tolleranza 20% più una soglia di
     rumore `SOGLIA_RUMORE_MS = 20.0`: sotto i 20 ms il confronto percentuale è puro
     rumore di misura (osservato empiricamente — `query_gantt_200` è passato da 4,7 ms a
     6,5 ms fra due run consecutive a parità di codice), non una regressione.
     Cold-start-to-Home, fps di scroll e memoria a riposo restano fuori da questa
     suite: non sono misurabili senza una finestra Tauri reale, e sono rimandati
     all'incremento di test visivi/E2E (anch'esso fuori dallo scope di questo passaggio
     di Fase 6, per direttiva esplicita). Import XML ed export workbook non hanno un
     benchmark dedicato: sono già esercitati a fondo dai test di integrazione Rust
     esistenti (`tests/import_esempi.rs`, `tests/workbook_fixture.rs`) e il loro costo è
     dominato dal parsing di libreria, non da codice di questo progetto da sorvegliare
     per regressioni.

137. **Metà TypeScript della suite (`bench/engine.bench.mjs`), uno script Node a parte
     invece di un test Vitest.** `monitoraggioEvm()` e `simulateVelocity()` sono
     funzioni pure del motore (nessun I/O): non serve l'ambiente di test, basta
     `npx tsx` o `node --experimental-strip-types`. Scrive nello stesso
     `bench/baseline.json` del binario Rust, per fusione (`{...baseline, ...nuovo}`) —
     un file solo per tutta la suite di prestazioni, non due, evitando di dover
     ricordare quale metà guardare. Le date sintetiche dei 52 snapshot si generano con
     `addDays("2026-01-01", s * 7)` (la stessa funzione del motore, non aritmetica
     manuale su mese/giorno): un primo tentativo con `` `2026-${mese}-${giorno}` ``
     calcolato a mano ha prodotto `"2026-13-01"` oltre il quarantaquattresimo snapshot
     (il motore lo ha respinto correttamente con `EngineInputError`) — la lezione è che
     generare date sintetiche richiede sempre le stesse funzioni di calendario del
     motore, mai una riformulazione ad-hoc.

138. **Bug di prestazioni reale trovato dalla suite, non dal codice in produzione:
     `monitoraggioEvm` ricalcolava `perWbsMisure` e `perFiloneMisure` con un
     `righeEvm.filter(...)` per ogni nodo WBS/filone, dentro il raggruppamento già
     fatto una volta da `rollup()`.** O(task × nodi) per ogni snapshot invece di
     O(task): a 5.000 task e 500 nodi WBS (il rapporto 10:1 della specifica) e 52
     snapshot, il primo run della suite TypeScript ha misurato 2.474 ms contro
     l'obiettivo di 1.000 ms della specifica (§3) — non un'ipotesi, una misura reale
     che ha fallito il controllo automatico. Corretto raggruppando `righeEvm` una sola
     volta per chiave (nuova funzione privata `raggruppaPer` in `monitoring.ts`) e
     derivando sia la somma (`perXMisure`) sia l'indice EVM (`perX`) dallo stesso
     gruppo, senza un secondo passaggio sull'array intero; `rollup()` in `evm.ts` resta
     com'era (usata altrove con gruppi piccoli, dove il costo non si vede) — non è
     stata toccata la sua firma pubblica. Dopo la correzione: 735 ms a 5.000 task, sotto
     obiettivo; i 158 test del motore restano verdi senza modifiche.

139. **Pulizia dei menu morti: rimossi, non lasciati come placeholder con toast "non
     implementato".** Il menu Edit, il menu Feed e il menu Tools erano composti
     interamente da voci placeholder: rimossi per intero invece di lasciare un menu
     vuoto o con un solo avviso. Rimossi anche i sotto-menu di File/View/Project che
     non aprivano nulla di reale (Recent projects, Import/export pacchetto, Undo/Redo/
     Copy/Paste/Find, Columns…, Save view…, Parameters…, Create snapshot…, Submit/
     Approve/Reject avanzamento come scorciatoie dirette, Guide/Glossary/Shortcuts/
     About/License). La funzionalità reale dietro ciascuna di queste voci — dove
     esiste già (approvazioni, qualità dati) — resta raggiungibile dalla sidebar/
     schermata propria: si è tolta solo la scorciatoia morta nel menu, non la
     funzione. Stesso trattamento per la sidebar: tolti `feed-msproject`,
     `consolidamento`, `importa-esporta`, `impostazioni` (nessuno schermo reale
     dietro, solo il segnaposto generico di `ScreenPlaceholder`) e il gruppo
     "System", rimasto vuoto dopo la rimozione. Il pulsante "Import package" nella
     Home (.evmwork/.evmprog, mai implementato) è stato tolto allo stesso modo. Una
     voce con un solo comando reale (menu "Progress", gruppo sidebar "Coordination")
     non è stata accorpata o rimossa: non è morta, è solo poco popolata — "solo
     funzionalità implementate" non significa "menu esteticamente pieni".

140. **Colonne della tabella Gantt ridimensionabili, un hook locale invece di
     TanStack Table.** La tabella a sinistra del Gantt non è una `DataTable.tsx`
     (ha il proprio `useVirtualizer` condiviso con lo scorrimento della timeline a
     destra, decisione già presa per la sincronizzazione verticale): riscriverla
     sopra TanStack Table solo per il ridimensionamento avrebbe richiesto rifare
     quella sincronizzazione. Un hook minimo (`useColonneRidimensionabili` in
     `GanttScreen.tsx`, drag nativo su `mousemove`/`mouseup` dell'intera finestra,
     stesso gesto di `header.getResizeHandler()` di TanStack ma senza la libreria)
     con le larghezze persistite in `localStorage` (stesso pattern essenziale di
     `SavedViews.ts`: letture/scritture avvolte in try/catch, nessuna dipendenza da
     IndexedDB o da uno store Zustand dedicato per cinque numeri). Le colonne non
     condividono più un contenitore `flex-1`: ogni colonna (compreso "Name", prima
     `flex-1`) ha ora una larghezza esplicita in pixel, così la larghezza totale
     della tabella è sempre la somma delle colonne, mai un valore fisso indipendente.

141. **Allegati di avanzamento: blob in `progress_entry_attachment`, non percorsi su
     disco esterni al progetto.** Un `.evmproj` è un file solo (sez. 2): se gli
     allegati fossero percorsi assoluti su disco, spostare o copiare il progetto
     romperebbe i riferimenti o lascerebbe orfani. Il contenuto entra come `BLOB`
     nello stesso file SQLite — nessuna cartella parallela da sincronizzare con il
     progetto, stesso principio già seguito per tutto il resto del progetto. `note`
     su `progress_entry` restava già occupata dal motivo di rifiuto
     (`schermate.rs::respingi`, dalla Fase 4-bis): una nuova colonna `author_note`
     tiene la nota di chi registra l'avanzamento separata, così un rifiuto successivo
     non la sovrascrive. Nessun `uploaded_by`/tracciamento di chi ha allegato cosa:
     la tabella `progress_entry` stessa non traccia `entered_by` da quando esiste
     (mai scritto in `registra_avanzamento`) — aggiungerlo solo per gli allegati
     avrebbe introdotto un'incoerenza, non una funzionalità in più; resta un lavoro
     per quando il sistema di login reale (prossimo passo, vedi todo.md) sostituirà
     il selettore "Acting as".

142. **Storico avanzamento: tutte le voci di `progress_entry` per un task, non solo
     quella vigente — e un allegato si può aggiungere anche a una voce già passata,
     non solo al momento dell'invio.** `avanzamento_elenco` mostra solo l'ultima voce
     per riga (necessario per la tabella principale, altrimenti illeggibile a
     centinaia di task); il nuovo `storico_avanzamento(conn, pid, uid)` è la vista
     completa, dietro un pulsante "History" per riga invece che un'altra colonna
     nella tabella già densa. Il flusso rapido in `AvanzamentoScreen.tsx` (scegliere
     un file prima di "Submit for approval") copre il caso comune — allegare mentre
     si registra — usando l'id restituito da `registra_avanzamento` (la firma è
     cambiata da `Esito<()>` a `Esito<i64>` per questo); il dialogo storico copre il
     caso "mi sono dimenticato" o "serve aggiungere un giustificativo a una voce di
     due mesi fa", senza duplicare la logica: entrambi i percorsi chiamano lo stesso
     comando `allegato_aggiungi`.

143. **Login reale: Argon2id (crate `argon2`), non SHA-256 nonostante `sha2` fosse
     già una dipendenza del progetto.** `sha2` è usato altrove per un hash di
     contenuto (report, decisione 135), non per proteggere un segreto: un digest
     veloce senza salt è il profilo sbagliato per una password, anche in
     un'applicazione desktop locale — un domani l'hash potrebbe uscire dal progetto
     (backup, condivisione del file). Argon2 di libreria (RustCrypto, `password-hash`
     0.6) genera il salt da sé (`hash_password`, feature `getrandom` di default):
     nessuna gestione manuale di `SaltString`/`OsRng` necessaria con questa versione
     dell'API (diversa dalle 0.5.x più comuni nei tutorial in giro).

144. **L'amministratore di default si semina all'apertura se la tabella `user_profile`
     è vuota, non nei tre punti di creazione progetto (vuoto, da workbook, da
     import piano).** La richiesta era "admin/admin sui nuovi progetti", ma
     seminarlo nei tre `INSERT INTO project` avrebbe lasciato bloccati fuori tutti i
     progetti già esistenti di questo stesso repository (creati prima di questa
     funzionalità, con zero utenti configurati): una volta attivata la pagina di
     login, non c'è più alcuna via per crearne uno da uno stato non autenticato — un
     progetto senza utenti sarebbe stato permanentemente inaccessibile.
     `auth::assicura_utente_default`, chiamata a ogni `open_and_migrate` (un
     `COUNT(*)` quando la tabella ha già righe, trascurabile), è autoriparante e
     copre entrambi i casi con una sola regola: "se non c'è nessuno, admin/admin
     entra". Non si rifà se esistono già utenti (anche senza password: quel caso —
     un progetto con utenti creati dalla vecchia `crea_utente` senza hash, prima di
     questa migrazione — resta un limite noto, non silenziato: quegli utenti restano
     da sistemare a mano finché non esistono).

145. **"Acting as" (decisione 88) rimosso, non esteso.** Il selettore libero
     permetteva di diventare chiunque senza credenziali — esattamente il buco che
     la richiesta di un login reale voleva chiudere. `project-context-store`'s
     `attoreId`/`userName`/`userRole`/`userRuoli` restano gli stessi campi, cablati
     negli stessi comandi di backend che già richiedevano `coordinatore_piano` o un
     ruolo specifico (nessuna modifica lato permessi): a riempirli ora è
     `LoginScreen.tsx` dopo un `accedi()` verificato, non più una scelta libera in
     `ContextBar.tsx`. `impostaProgetto` già azzerava `attoreId` a ogni apertura di
     progetto (per "Acting as", a scopo di igiene): lo stesso azzeramento ora è
     anche il meccanismo che fa ricomparire la pagina di login a ogni apertura,
     senza bisogno di un flag "autenticato" separato nello store.

146. **Verificato un login end-to-end con un backend Tauri finto (`window.__TAURI_INTERNALS__.invoke` sostituito a mano in una pagina Playwright), non solo a tipi.**
     La webview nativa di Tauri (webkit2gtk) non è pilotabile da Playwright come un
     normale Chromium; lanciare l'app Tauri vera in questo ambiente headless non è
     stato tentato per questa verifica. Un backend finto in JS (stesso meccanismo
     `invoke(cmd, args)` → `window.__TAURI_INTERNALS__.invoke`, con un piccolo
     "database" di utenti in memoria) ha permesso di eseguire il flusso reale nel
     browser: apertura progetto → pagina di login → password sbagliata (rifiutata,
     stesso messaggio generico) → admin/admin corretto → shell visibile → creazione
     di un utente con password dalla schermata Perimetri e utenti → logout → login
     del nuovo utente con le sue credenziali. Nessun errore in console, tutti i passi
     verificati. La correttezza di Argon2/SQLite resta sul lato Rust, già coperta da
     6 test unitari in `auth.rs` — questa verifica copre invece il cablaggio React
     (store, gating in `AppShell.tsx`, componenti) che i test Rust non toccano.
     Trovato per questa via un difetto preesistente e non introdotto da questa
     funzionalità: a una larghezza di finestra ridotta, il gruppo a destra della
     barra di contesto (ricerca, campanella, ora anche "Signed in as") esce dalla
     riga fissa (`h-10` con `flex-wrap`, nessuna altezza che si adatti) e sparisce
     dalla vista — segnalato, non corretto in questo stesso passaggio (fuori
     scope: non è un difetto del login).

147. **Il progetto di esempio è generato da uno script Rust committato
     (`crates/evm-db/examples/progetto_esempio.rs`), non un file `.evmproj`
     scritto a mano o da SQL grezzo.** Lo script chiama le stesse funzioni
     pubbliche della libreria che usa l'app (`import::salva_piano`,
     `controllo::imposta_budget_wbs`/`blocca_baseline_budget`/
     `crea_change_request`/`approva_change_request`, `schermate::
     registra_avanzamento`/`approva`/`respingi`/`aggiungi_allegato`,
     `filoni::crea_filone`/`crea_gate`, `qualita::ricalcola_problemi`/
     `accetta_problema`): i dati che il manuale descrive sono garantiti
     passare per gli stessi controlli di validazione del resto dell'app, non
     un file costruito a mano che potrebbe violare un vincolo mai esercitato
     altrove. Unica eccezione deliberata: `registra_avanzamento`/
     `snapshot_manuale` timbrano sempre con la data odierna reale
     (`tempo::oggi_iso()`), non programmabile dalle funzioni pubbliche — per
     raccontare tre cicli di monitoraggio su mesi diversi, ogni ciclo si
     registra "oggi" e si retrodata con un `UPDATE` isolato subito dopo
     (funzione `backdata`, commentata come eccezione e non come tecnica
     generale). Rieseguibile in qualunque momento con `cargo run --example
     progetto_esempio -p evm-db`: se la libreria cambia firma, lo script
     smette di compilare invece di restare un fixture silenziosamente
     disallineato.

148. **Il manuale utente (`MANUALE_UTENTE.md`) è in italiano, con il testo
     esatto dell'interfaccia (in inglese) citato tra virgolette «così».**
     L'app stessa è tutta in inglese (decisione di ottobre di questa stessa
     serie di incrementi), ma l'utenza descritta nel `README.md` (project
     engineer e supervisori di un'impresa italiana) legge più comodamente
     una guida in italiano — stesso compromesso già scelto per `README.md`/
     `DECISIONS.md`, entrambi in italiano nonostante il codice e la UI siano
     in inglese. Citare la stringa esatta invece di tradurla anche quella
     evita l'ambiguità "che pulsante è, in inglese, quello che il manuale
     chiama in italiano?".

149. **Il manuale vive alla radice del repository, non in una cartella
     `docs/`.** La cartella `docs/` di questo progetto è stata cancellata
     su scelta esplicita dell'utente (vedi la cronologia di questa sessione:
     "Leave it deleted" per le vecchie specifiche di fase) — ricrearla,
     anche con contenuto nuovo, avrebbe potuto sembrare un'inversione di
     quella scelta. `MANUALE_UTENTE.md` sta accanto a `README.md`/
     `DECISIONS.md`/`todo.md`, nello stesso posto.

150. **Il manuale è leggibile anche dentro l'app stessa (Help → Guide),
     non solo da un editor di testo** — la richiesta originale lo chiedeva
     esplicitamente ("visualizzabile anche da software"). `GuideScreen.tsx`
     importa `MANUALE_UTENTE.md` come testo grezzo a tempo di build (Vite
     `?raw`: nessuna richiesta di rete, funziona offline) e lo renderizza con
     `react-markdown` + `remark-gfm` (due nuove dipendenze, nessuna libreria
     di markdown esisteva già nel progetto). Stile scritto a mano in una
     classe `.markdown-corpo` in `globals.css` invece di aggiungere
     `@tailwindcss/typography`: un solo schermo non vale una dipendenza in
     più. Questo restituisce una funzione reale al comando "Guide" nel menu
     Help, rimosso come placeholder morto nella decisione 139 — non
     reintrodotto come eccezione alla pulizia di quella decisione, ma perché
     ora esiste davvero.

151. **Trovati e corretti, mentre si scriveva il manuale, due riferimenti
     residui al selettore "Acting as"** in `BaselineCrScreen.tsx` (un
     commento e un banner mostrato all'utente) rimasti dalla decisione 145
     (che lo ha sostituito con il login reale): il banner indicava ancora
     "Pick a user with that role in «Acting as» (top bar)", un controllo che
     non esiste più nella barra di contesto. Corretto in "Sign in as a user
     with that role". Scrivere la documentazione da zero, schermata per
     schermata, ha fatto emergere un'incongruenza che l'uso quotidiano
     dell'app (sempre con lo stesso utente già autenticato) non avrebbe
     mostrato.

152. **Sprint Agile gestiti dall'app: stessa tabella `agile_sprint` già
     popolata dall'import, nuove funzioni di scrittura invece di un
     percorso parallelo.** La richiesta era "gestire completamente gli
     sprint dall'applicazione, mantenendo l'eventuale importazione": dato
     che `agile_sprint` non distingue (né ha motivo di distinguere) uno
     sprint importato da uno creato a mano — stessa riga, stesse colonne —
     bastavano `crea_sprint`/`modifica_sprint`/`elimina_sprint` in più,
     nessuna migrazione. L'unica cosa aggiunta allo schema esistente è la
     verifica applicativa di un numero di sprint duplicato nello stesso
     ambito (`workstream_id`): il vincolo `UNIQUE(workstream_id,
     sprint_number)` non basta da solo, perché SQLite tratta ogni
     `workstream_id NULL` (sprint di progetto, non di un filone) come
     distinto agli effetti di UNIQUE — due sprint "progetto, numero 1"
     passerebbero altrimenti silenziosi.

153. **Un task appartiene a UNO sprint Agile O alla lavagna Kanban, mai a
     entrambi: due colonne (`task.sprint_id`, `task.kanban`), l'esclusività
     applicata in Rust, non con un CHECK SQL.** `ALTER TABLE ADD COLUMN` di
     SQLite non può aggiungere un vincolo CHECK multi-colonna che si
     applichi anche alle righe già esistenti in modo retroattivo
     affidabile; `agile::assegna_task_a_sprint`/`assegna_task_a_kanban`
     azzerano sempre l'altro campo nella stessa UPDATE
     (`kanban = 0`/`sprint_id = CASE WHEN ... THEN NULL ELSE sprint_id
     END`), quindi i due campi non possono divergere passando sempre da lì
     — stesso principio, a livello applicativo invece che di schema, già
     usato altrove in questo progetto per vincoli che SQLite non esprime
     comodamente da solo.

154. **Lavagna Kanban: una sola board per progetto (`kanban_column` senza
     riferimento a un task), le "sotto-task-kanban" come entità a parte
     sotto un task assegnato al kanban — niente collegamento automatico
     all'avanzamento EVM del task.** La richiesta descriveva colonne e
     sotto-task-kanban con un punteggio per "tracciare l'effort speso": un
     punteggio d'effort è un segnale di tracciamento (come il flusso o la
     velocity in Agile/Flow, decisione già presa lì), non una sostituzione
     della % fisica registrata in Progress — farlo scrivere da solo in
     `progress_entry` avrebbe introdotto una seconda fonte di verità sulla
     % di un task, con le sue regole di conflitto da inventare, per una
     richiesta che chiedeva di "tracciare", non di "far calcolare l'EVM dal
     kanban". `riepilogo_effort` aggrega punti totali/completati per task
     (una colonna segnata "done" conta come completato) come dato di sola
     lettura nella scheda; collegarlo all'EVM resta un'estensione futura,
     se richiesta esplicitamente. Spostare una sotto-task tra colonne è un
     menu a tendina per riga, non trascinamento: `@dnd-kit` è già una
     dipendenza del progetto (riordino delle schede, `DocumentTabs.tsx`),
     ma cablare zone di rilascio multiple con collision detection per una
     board a più colonne è un lavoro a parte, non necessario per
     soddisfare la richiesta letterale ("creare le colonne", "aggiungere
     sotto-task") — rimandato, non dimenticato: upgrade possibile in un
     secondo momento senza cambiare lo schema.

155. **Bug (todo.md): il BAC totale di Dashboard e Buffer and reserves
     restava fermo dopo aver bloccato una nuova baseline non di tipo
     'startup', o dopo una change request approvata.** Causa: la query di
     `schermate.rs::dashboard()`/`riserve()` filtrava esplicitamente
     `kind = 'startup'`, mentre `approva_change_request` crea sempre una
     baseline di tipo `'altra'` — la query restava agganciata alla vecchia
     riga 'startup' per sempre. Corretto a "l'ultima baseline non
     archiviata, qualunque sia il tipo o lo stato di blocco" (lo stato di
     blocco non si può richiedere: la baseline generata al solo import,
     prima di qualunque blocco di governance, non è `locked` ma ha già un
     `bac_total` valido, come dimostra un test preesistente rimasto verde
     solo dopo aver tolto anche quel filtro). Nuovo test di regressione
     mirato proprio allo scenario segnalato (blocco + change request
     approvata). La UI ne approfitta due volte: `DashboardScreen.tsx` ora
     mostra anche il KPI "Budget baseline" (il campo `bacTotale` del
     comando `dashboard`, già presente nella risposta ma mai renderizzato
     prima — morto, non mancante), e il badge "Base EV" nella barra di
     contesto — `setEvBaseMode` esisteva nello store ma non aveva alcun
     controllo che lo richiamasse in nessuna schermata — è diventato un
     pulsante vero.

156. **Bug (todo.md): "un inserimento in DB chiude il progetto, serve
     ricaricare".** Un'indagine mirata ha escluso il sospetto più ovvio
     (qualcosa che richiama `impostaProgetto`/azzera `attoreId` dopo una
     scrittura: nessun punto del codice lo fa, solo i tre flussi legittimi
     di apertura progetto e il logout esplicito toccano quei campi) — ma
     ha anche confermato che **questa app non ha un error boundary da
     nessuna parte**: un'eccezione di rendering non gestita, nel punto in
     cui `ricarica()` rimonta una schermata con dati freschi dopo una
     scrittura (il momento più probabile per un bug di rendering non ancora
     visto, su una forma di dati nuova), smonta l'intera radice React
     lasciando una pagina bianca — indistinguibile, per l'utente, da "il
     progetto si è chiuso": l'unica via d'uscita è ricaricare la finestra,
     esattamente il sintomo descritto. Aggiunto `ErrorBoundary.tsx` (un
     class component React, l'unico modo per intercettare un errore di
     rendering) attorno sia alla finestra principale sia a ogni scheda
     staccata: non impedisce l'errore di partenza — quello resta da
     diagnosticare quando si ripresenta, ora con un messaggio visibile
     invece di sparire nel nulla — ma lo rende recuperabile, con la
     rassicurazione che il file del progetto su disco non è stato toccato.
     Verificato con un throw deliberato dietro un flag temporaneo
     (`?crashtest=1`, rimosso subito dopo), non solo a tipi: il pannello di
     recupero compare davvero. Aggiunto anche `PRAGMA busy_timeout = 5000`
     a ogni apertura di connessione (`open_and_migrate`): ogni comando apre
     una propria connessione sullo stesso file e più schermate ne tengono
     aperte diverse in lettura insieme — senza un timeout, una lettura che
     arriva mentre una scrittura ha il lock esclusivo fallisce subito con
     `SQLITE_BUSY` invece di aspettare. Non la causa confermata (non
     riprodotta con un progetto finto end-to-end in questa sessione), ma un
     irrigidimento reale e senza controindicazioni contro la classe di
     problema più plausibile rimasta.

157. **Bug (todo.md): tre "contingency" scollegate nell'app (percentuale di
     policy in Parameters, importo allocato per rischio, importo della
     baseline) — non un bug di codice ma una lacuna di spiegazione.**
     Nessuna delle tre si aggiorna dall'altra per scelta architetturale già
     presa altrove in questo progetto (una baseline bloccata è immutabile,
     decisione originaria; un rischio è un record a parte con la propria
     allocazione, non una formula derivata dalla percentuale di policy):
     collegarle automaticamente avrebbe richiesto decidere quale delle tre
     "vince" in caso di conflitto, una scelta di prodotto che non è la
     stessa cosa di spiegare come usarle oggi. Aggiunta una sezione
     dedicata nel manuale (capitolo 15) con l'ordine d'uso consigliato,
     più sezioni "come leggerla/leggerlo" per Baseline e change request,
     EVM Monitoring, Forecast e Cost governance (capitoli 10, 16, 17, 19) —
     la stessa richiesta del todo.md copriva anche quelle quattro
     schermate, non solo la contingency.
