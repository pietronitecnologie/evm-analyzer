# Analizzatore EVM (Impresa Numerica)

App desktop GPL-3.0 per project engineer e supervisori (direttore
tecnico/site supervisor) che funziona da **feeder per MS Project**: il
piano (schedule, precedenze, calendari, baseline, cammino critico) resta
in MS Project; questa app è il luogo dove si registra l'avanzamento
lavori, si fa l'analisi Earned Value e si produce il file Excel/CSV con
cui il PM aggiorna MS Project a mano.

Il Capitolo 3 del libro "Impresa Numerica" è la fonte autorevole delle
formule e del metodo EVM implementate dal motore (`packages/engine`).

## Codice sorgente e licenza

Codice sorgente:
<https://github.com/pietronitecnologie/PietroniTecnologie-ImpresaNumerica/tree/main/evm-analyzer>.

Distribuito sotto **GPL-3.0-or-later** (vedi [LICENSE](LICENSE) e
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)). Ogni binario
distribuito corrisponde a un tag Git del sorgente (`evm-analyzer-vX.Y.Z`);
il tag è riportato nella schermata Aiuto → Informazioni dell'app.

## Stato del progetto

Sviluppo a fasi (vedi `DECISIONS.md` per il piano completo e le scelte
fatte finora). **Fase 1 — Fondamenta** in corso: scaffold Tauri +
React/TypeScript, workspace `packages/engine`, DB SQLite con migrazioni
versionate, guscio UI completo (menu, barra di contesto, sidebar, schede
staccabili, pannello di dettaglio, barra di stato, palette comandi,
tabella comune virtualizzata) con Storybook.

## Struttura del repository

```
packages/engine   motore EVM TypeScript puro (nessuna dipendenza da UI/Tauri), testato con Vitest
src/              frontend React + TypeScript (Vite)
src-tauri/        applicazione desktop Tauri (Rust): comandi, finestra, build
crates/evm-db/    accesso SQLite e migrazioni versionate (crate Rust indipendente da Tauri)
fixtures/         file di esempio (xlsx del libro, export sintetici di MS Project)
docs/             documentazione tecnica (formule Excel, checklist di test manuale, ...)
```

## Prerequisiti

- **Node.js 22+** e npm.
- **Rust** (toolchain stabile) via [rustup](https://rustup.rs/).
- Per compilare ed eseguire l'app desktop su Linux occorrono le librerie
  di sistema di WebKitGTK richieste da Tauri — vedi
  <https://tauri.app/start/prerequisites/#linux> (su Debian/Ubuntu:
  `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`,
  `libayatana-appindicator3-dev`, `librsvg2-dev`). Senza questi pacchetti
  il motore EVM (`packages/engine`) e l'accesso SQLite (`crates/evm-db`)
  si sviluppano e testano comunque normalmente: solo la compilazione del
  pacchetto `src-tauri` (l'app con interfaccia) li richiede.

## Sviluppo

```bash
npm install                 # installa le dipendenze del workspace npm
npm run test:engine         # test del motore EVM (Vitest)
npm run storybook           # componenti UI di base, isolati
npm run dev                 # frontend in sola modalità browser (senza Tauri)
npm run tauri dev           # app desktop completa (richiede i prerequisiti Linux sopra)

cargo test -p evm-db        # test del livello di accesso SQLite/migrazioni (nessun prerequisito grafico)
cargo test --workspace      # tutti i test Rust (richiede i prerequisiti Linux per compilare src-tauri)
```

## Build

```bash
npm run build               # build di produzione del frontend
npm run tauri build         # installer desktop (MSI/DMG/AppImage secondo la piattaforma)
```
