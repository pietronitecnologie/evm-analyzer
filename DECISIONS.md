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
