# Licenze di terze parti

Questo progetto è distribuito sotto **GPL-3.0-or-later** (vedi [LICENSE](LICENSE)).
Questo file elenca le licenze delle dipendenze dirette e, in forma
aggregata, delle dipendenze transitive, verificate come compatibili con la
GPL-3.0 secondo la [lista della Free Software Foundation](https://www.gnu.org/licenses/license-list.html).

Generato con `npx license-checker` (dipendenze npm) e `cargo license`
(dipendenze Rust). Da rigenerare quando le dipendenze cambiano in modo
significativo.

## Metodologia di verifica

- **MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Zlib, Unicode-3.0,
  BlueOak-1.0.0**: licenze permissive, compatibili con la GPL-3.0 senza
  condizioni particolari.
- **Apache-2.0**: compatibile con la GPL **versione 3** (non con la GPLv2):
  essendo questo progetto GPL-3.0-or-later, non c'è incompatibilità.
- **MPL-2.0**: copyleft debole, compatibile con la GPL-3.0 per la
  combinazione in un'opera più ampia (FSF la elenca esplicitamente come
  "GPL-compatible").
- **CC-BY-4.0**: usata solo per asset non di codice (font/icone di
  tooling), non per codice eseguibile distribuito nel binario.
- Nessuna dipendenza con licenza proprietaria, "fonte disponibile" (es.
  BUSL, SSPL) o copyleft incompatibile (es. CDDL, EPL con clausole
  problematiche) è presente nell'albero delle dipendenze alla data di
  generazione di questo file.

## Frontend (npm) — dipendenze dirette di produzione

| Pacchetto | Licenza |
|---|---|
| react, react-dom | MIT |
| zustand | MIT |
| @tanstack/react-table | MIT |
| @tanstack/react-virtual | MIT |
| @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities | MIT |
| cmdk | MIT |
| react-resizable-panels | MIT |
| @radix-ui/* (dialog, dropdown-menu, popover, tabs, tooltip, separator, …) | MIT |
| class-variance-authority | Apache-2.0 |
| clsx | MIT |
| tailwind-merge | MIT |
| tailwindcss, @tailwindcss/vite | MIT (usa internamente `lightningcss`, MPL-2.0) |
| lucide-react | ISC |
| @tauri-apps/api, @tauri-apps/plugin-opener | MIT OR Apache-2.0 (a scelta) |
| echarts (grafici Fase 5: curva S, trend CPI/SPI) | Apache-2.0 (transitive: `zrender` BSD-3-Clause, `tslib` 0BSD) |

Strumenti di sviluppo (non distribuiti nel binario finale): Vite, Storybook,
TypeScript, @vitejs/plugin-react — tutti MIT.

Riepilogo automatico (`license-checker --production --summary`): MIT (96),
MPL-2.0 (4, da `lightningcss`), ISC (3), Apache-2.0 (3, incl. `echarts`), Apache-2.0 OR MIT
(1), MIT OR Apache-2.0 (1), BSD-3-Clause (2, incl. `zrender`), 0BSD (2, incl. `tslib`).

## Backend (Rust / Cargo)

### `crates/evm-db` (motore di accesso SQLite, nessuna dipendenza da Tauri)

| Pacchetto | Licenza |
|---|---|
| rusqlite, libsqlite3-sys | MIT (il wrapper Rust; SQLite stesso, compilato da `libsqlite3-sys` con la feature `bundled`, è **di pubblico dominio**) |
| tempfile (solo test) | MIT OR Apache-2.0 |

Transitive: tutte MIT, Apache-2.0, "Apache-2.0 OR MIT", Zlib o Unicode-3.0
(bitflags, cc, cfg-if, libc, once_cell, smallvec, hashbrown, getrandom, …).

### `src-tauri` (applicazione desktop Tauri)

Dipendenze dirette: `tauri`, `tauri-plugin-opener` (MIT OR Apache-2.0),
`serde`, `serde_json` (MIT OR Apache-2.0), `evm-db` (GPL-3.0-or-later,
interno al progetto).

Riepilogo per licenza dell'intero albero delle dipendenze (`cargo license
--manifest-path src-tauri/Cargo.toml`, ~390 crate transitivi): in grande
maggioranza MIT e "Apache-2.0 OR MIT"; inoltre BSD-3-Clause, ISC, Zlib,
0BSD, ["Apache-2.0 WITH LLVM-exception"](https://spdx.org/licenses/LLVM-exception.html),
Unicode-3.0, e **MPL-2.0** per `cssparser`, `cssparser-macros`,
`dtoa-short`, `option-ext`, `selectors` (dipendenze di sistema di
`tauri`/`wry` per il rendering CSS del webview). Nessuna licenza
incompatibile con la GPL-3.0 rilevata.

## Nota sui prerequisiti di sistema (Linux)

Il webview di Tauri su Linux si appoggia a **WebKitGTK** (libreria di
sistema, non vendorizzata in questo repository): per compilare occorrono i
pacchetti di sviluppo elencati in
<https://tauri.app/start/prerequisites/#linux> (es. `libwebkit2gtk-4.1-dev`
su Debian/Ubuntu). WebKitGTK è distribuito sotto LGPL-2.1/BSD a seconda dei
moduli; non viene redistribuito con questo progetto, quindi non compare
nell'elenco sopra.
