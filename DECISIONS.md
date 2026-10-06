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
