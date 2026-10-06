# SPECIFICA FASE 6 — Qualità dati, report, prestazioni, installer e documentazione (rilascio)

Documento **autosufficiente**. Prerequisiti: Fasi 1–5 (guscio, DB, motore, Excel, import del piano, feeder, multi-utente, schermate di analisi). Questa fase **chiude il prodotto**: centralizza i controlli di qualità, produce i report, verifica le prestazioni, prepara installer e documentazione e applica i criteri di accettazione finali.

## 0. Ambito
**Consegna:** (1) registro unico delle anomalie e schermata *Qualità dati*; (2) schermata *Report* con anteprima A4 ed esportazione HTML/PDF; (3) prestazioni misurate e ottimizzate; (4) sicurezza e robustezza (backup, integrità, log, permessi Tauri minimi); (5) installer per Windows, macOS, Linux; (6) documentazione utente e di rilascio; (7) test end-to-end finali. **Fuori ambito:** nuove funzioni di dominio.

## 1. Registro unico delle anomalie
### 1.1 Tabella
```sql
data_quality_issue(
  id, project_id, snapshot_id, code TEXT, severity TEXT CHECK(severity IN ('info','avviso','critico')),
  category TEXT,  -- baseline|metodo_ev|costi|date|perimetro|import|avanzamento|riserve|agile|flusso
  task_id NULL, wbs_id NULL, scope_id NULL, message TEXT, suggestion TEXT,
  state TEXT CHECK(state IN ('aperta','accettata','risolta')) DEFAULT 'aperta',
  accepted_by NULL, accepted_reason NULL, accepted_at NULL, resolved_at NULL,
  source TEXT,      -- 'motore' | 'import_workbook' | 'import_piano' | 'avanzamento' | 'resync'
  created_at, UNIQUE(project_id, snapshot_id, code, task_id, wbs_id)
);
```
### 1.2 Origine delle anomalie
Unifica in un solo registro, con il **catalogo dei codici**:
- **Motore (Fase 2, Q001–Q031):** task senza baseline, metodo EV assente/incoerente, AC mancante con avanzamento, % anomale, date reali nel futuro, risorse senza tariffa, check-point incoerenti, `O>M>P`, scostamento stima/startup (> 20% avviso, > 30% critico), metodo cambiato, cadenza irregolare, **variazione di baseline senza change request**, «90% fatto», % soggettiva senza consumo di ore, LOE oltre soglia, costo per SP derivato.
- **Import workbook (Fase 3, `XL_*`):** date incoerenti tra fogli, contingency a budget ≠ somma per rischio, colonne mancanti, differenze cache vs ricalcolo.
- **Import del piano (Fase 4, `PLAN_*`):** scala dei costi, nessuna tariffa, baseline distribuita linearmente (`PLAN_LINEAR_PV`), gerarchia assente, chiavi cambiate.
- **Avanzamento (Fase 4-bis, `V001–V016`):** quelle non bloccanti rimaste come avvisi dopo l'invio.
- **Ri-sincronizzazione (Fase 4/4-bis):** task aggiunti/rimossi/rinumerati, baseline modificata fuori dall'app (**critico**).
- **Riserve e flusso (Fase 2):** `RES_*`, `GATE_NO_BUFFER`, `FLOW_*`.
Ogni codice ha in `i18n/it.json`: titolo, spiegazione, **suggerimento** e collegamento alla schermata dove si corregge. Ricalcolo: dopo ogni evento rilevante (import, approvazione, cambio status date, risoluzione) l'insieme viene rigenerato in modo **idempotente**; le anomalie `accettata` restano tali se la causa non cambia.

### 1.3 Schermata «Qualità dati» (schermata 16)
Tabella: `Gravità | Regola (codice + titolo) | Task/WBS | Descrizione | Suggerimento | Stato | Utente`. Raggruppabile per categoria; filtri per gravità/stato/perimetro; chip rapidi *Critiche*, *Aperte*, *Mie*. Azioni di riga: **Vai al task**, **Accetta con motivo** (testo obbligatorio, traccia in `audit_log`, solo ruoli `supervisore` o `coordinatore_piano`), **Riapri**. Contatori per gravità nella barra di stato (clic = apre la schermata filtrata). Esportazione CSV. Le anomalie `critico` aperte **impediscono** lo snapshot `finale` (salvo approvazione esplicita con motivo del coordinatore).

## 2. Report (schermata 17)
### 2.1 Interfaccia
Sinistra: opzioni — status date, perimetro, baseline, base EV, **sezioni** da includere (riepilogo, curva S, top scostamenti, WBS, anomalie, riserve, filoni, Agile, Monte Carlo, interpretazioni dei KPI), lingua (it), intestazione/piè di pagina personalizzabili (logo opzionale, nome azienda). Destra: **anteprima A4 in tempo reale** (HTML con CSS `@page`), zoom e scorrimento per pagina. Pulsanti: *Esporta HTML*, *Esporta PDF*, *Stampa*.

### 2.2 Contenuto e regole
- **Intestazione:** nome progetto, status date, perimetro, baseline, base EV, **stato (Provvisorio/Finale)** con copertura % BAC; autore e data di generazione; versione dell'app.
- **Riepilogo esecutivo:** KPI principali con semaforo e frase di lettura per ciascuno (testi dai tooltip KPI), variazione rispetto alla status date precedente, EAC/VAC/TCPI, data di fine prevista (Earned Schedule) vs pianificata.
- **Curva S e trend CPI/SPI** come **grafici vettoriali** (ECharts in modalità SSR SVG: `renderToSVGString`), leggibili anche in bianco e nero (stili di linea diversi).
- **Top scostamenti**, **WBS** (livello selezionato), **riserve e buffer**, **filoni e programma**, **Agile/Flow**, **Monte Carlo** (istogramma + percentili con seed e parametri), **anomalie** (critiche e avvisi aperti, accettate con motivo), **interpretazioni dei KPI** (glossario).
- Se lo stato è **Provvisorio**: filigrana/riquadro «PROVVISORIO — copertura xx% del BAC» su ogni pagina; i semafori mostrano la copertura.
- Piè di pagina: numero pagina «Pagina x di y», hash breve del report (SHA-256 del contenuto dati) e `app_version`, utile per riprodurre il documento.
- Numeri nel formato italiano; ogni valore non calcolabile come `—` con nota a piè di sezione.

### 2.3 Generazione PDF
1. **Percorso principale:** HTML autosufficiente (CSS di stampa, SVG inline, font incorporati) generato nel frontend; **PDF** tramite la stampa della webview (`print` di Tauri 2) con destinazione «Salva come PDF» del sistema. **Verifica sulle tre piattaforme** e annota limiti in `DECISIONS.md`.
2. **Fallback da valutare** se la stampa della webview non è affidabile su una piattaforma: compilazione PDF nel backend con una libreria Rust (es. crate `typst`, licenza Apache-2.0) da un template equivalente. Scegli **una** strada, documentala, non mantenerne due in parallelo.
3. Richiesto: pagine A4 verticali, margini 18 mm, nessun elemento tagliato tra pagine (`break-inside: avoid` su tabelle e grafici), PDF < 3 MB per un report tipico, testo selezionabile.

## 3. Prestazioni (misurate, con benchmark in CI)
Suite di benchmark in `bench/` con generatore di progetti sintetici (200, 2.000, 20.000 task; 20 filoni; 50 risorse; 52 status date). Obiettivi (macchina di riferimento: 4 core, 8 GB RAM, SSD):
| Operazione | Obiettivo |
|---|---|
| Avvio a freddo fino alla schermata Home | < 3 s |
| Apertura progetto da 2.000 task | < 2 s |
| Import XML/Excel da 2.000 task | < 5 s (20.000 task < 30 s) |
| Ricalcolo EVM completo (5.000 task) | < 1 s |
| Monte Carlo 5.000 iterazioni | < 2 s |
| Scorrimento tabelle/Gantt (20.000 righe) | ≥ 55 fps |
| Export workbook (5.000 righe WBS) | < 5 s |
| Generazione report PDF (30 pagine) | < 10 s |
| Memoria a riposo con progetto da 20.000 task | < 700 MB |
Strumentare con `tracing` e un pannello diagnostico (*Aiuto ▸ Diagnostica*) che mostra tempi e dimensioni; i test falliscono se un obiettivo peggiora di oltre il 20% rispetto all'ultima misura registrata (`bench/baseline.json`). Interventi consentiti: indici SQLite, transazioni batch, query preparate, `WAL`, virtualizzazione, memoization, Web Worker, streaming del parser XML.

## 4. Robustezza e sicurezza
1. **Integrità:** `PRAGMA integrity_check` e `foreign_key_check` all'apertura del progetto; errore → modalità sola lettura con messaggio e opzione di ripristino dall'ultimo backup.
2. **Backup:** copia automatica del file `.evmproj` **prima di ogni migrazione di schema** e prima di ogni importazione/consolidamento (`backups/`, ultimi 10, rotazione); *File ▸ Esporta copia di sicurezza* e *Ripristina da copia*.
3. **Migrazioni:** versionate (`PRAGMA user_version`), idempotenti, con test di aggiornamento da ogni versione precedente; un progetto di versione più recente di quella dell'app **non si apre** (messaggio chiaro).
4. **Log:** `tracing` con rotazione (max 10 file da 5 MB) in cartella dati; *Aiuto ▸ Esporta diagnostica* produce uno zip di log + versione + hash dei file di configurazione **senza dati del progetto** né nomi di persone.
5. **Tauri:** capability minime: nessun accesso rete, accesso al file system **solo** tramite finestre di scelta file dell'utente e alle cartelle dati dell'app; CSP restrittiva (nessun contenuto remoto, nessun `unsafe-eval`); nessun comando che esegua programmi esterni.
6. **Dipendenze:** `cargo audit` e `npm audit` senza vulnerabilità alte/critiche non giustificate; licenze verificate (compatibili GPL-3.0) con `cargo about`/`license-checker`; `THIRD_PARTY_LICENSES.md` rigenerato automaticamente.
7. **Dati personali:** le identità sono locali; nessuna telemetria, nessuna chiamata di rete (verificalo con un test che esegue l'app senza rete e controlla l'assenza di connessioni).

## 5. Installer e distribuzione
- **Build con Tauri bundler:** Windows **MSI** (e/o NSIS), macOS **DMG** (universal, Apple silicon + Intel), Linux **AppImage** e **.deb**. Build in CI su un runner per piattaforma.
- **Firma:** Windows (certificato di firma del codice, per evitare gli avvisi SmartScreen), macOS (Developer ID + notarizzazione). Se i certificati non sono disponibili: build non firmate con avvertenza nel README e istruzioni per l'utente (non è un errore di rilascio, ma va documentato). Checksum **SHA-256** pubblicati per ogni file.
- **Aggiornamenti:** nessun aggiornamento automatico di default (principio offline); controllo manuale opzionale con link alla pagina di rilascio.
- **GPL-3.0:** l'installer include `LICENSE` e `THIRD_PARTY_LICENSES.md`; ogni release ha un **tag** del sorgente e un archivio del sorgente allegato; *Aiuto ▸ Informazioni* mostra versione, copyright e **link al codice sorgente** del tag corrispondente; `README.md` contiene il link al repository. Ogni file sorgente ha l'intestazione di licenza.
- **Progetto di esempio:** l'installer include un progetto dimostrativo (derivato dalla fixture, dati fittizi) apribile da *File ▸ Apri progetto di esempio*, con perimetri, avanzamento e feed già predisposti, per una prova in cinque minuti.
- **Versionamento:** SemVer; `CHANGELOG.md`; versione unica in `package.json`, `Cargo.toml`, `tauri.conf.json` verificata da uno script di CI.

## 6. Documentazione
- **In app (*Aiuto ▸ Guida*)**: guida a capitoli ricercabile (Markdown nel pacchetto): primi passi, importare il piano (con la **lista dei campi minimi da esportare da MS Project** e come farlo), inserire l'avanzamento, approvare, generare il feed e applicarlo a mano in MS Project, verificare, lavorare in più utenti, leggere i KPI, report. **Glossario KPI** generato da `i18n/kpi_interpretazioni.it.json` con riferimento ai paragrafi del libro.
- **Repository:** `README.md` (cosa fa, screenshot, installazione, licenza, link al sorgente), `docs/` (`excel-formulas.md`, `profiles.md`, `multiutente.md`, `test-manuale-ms-project.md`, `architettura.md` con schema dei moduli e flusso dei dati), `DECISIONS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`.
- **Tutorial** con il progetto di esempio: scenario guidato in 10 passi (importa, assegna perimetri, inserisci avanzamento, approva, genera feed, verifica, leggi il report).

## 7. Test finali end-to-end (Playwright/WebdriverIO + test di integrazione)
1. **Scenario A — utente singolo, ciclo completo:** import XML → mappa baseline e BAC → inserisci avanzamento → approva (auto-approvazione consentita come supervisore) → genera feed (`xlsx`) → applicazione **simulata** → re-import → verifica → Dashboard e report coerenti con i numeri attesi.
2. **Scenario B — tre utenti:** coordinatore definisce tre perimetri disgiunti → esporta tre `.evmwork` → tre `.evmprog` importati (uno in conflitto, uno con firma non valida) → risoluzione conflitti → EVM provvisorio poi finale → feed consolidato.
3. **Scenario C — workbook:** import della fixture → controlli → export → re-import: input identici.
4. **Scenario D — piano grande:** 2.000 task (XML) → import, ricalcolo e Dashboard entro gli obiettivi di §3.
5. **Scenario E — degenerati:** nessuna baseline, EV = 0, nessuna status date, tutti i task senza metodo → nessun `NaN`/crash, messaggi chiari.
6. **Scenario F — offline:** esecuzione senza rete: tutto funziona, nessuna connessione in uscita.
7. **Scenario G — migrazione:** apertura di un progetto creato con la versione precedente dello schema → backup automatico + migrazione riuscita.

## 8. Criteri di accettazione finali (rilascio 1.0)
- **Fixture:** `bacTotal = 55.933,87 €`, BAC di misura senza contingency `48.638,15 €`, effort `77,17 gg-persona`, `σ = 2,06 gg`; CPI agile sprint 3 ≈ `0,92` (EV 33.200 €, AC 36.000 €, costo/SP di baseline 400 €).
- Round trip Excel senza perdita di input; grafici del Dashboard presenti e aggiornati; nessun `#VALUE!`/`NaN` in alcuna schermata.
- Round trip feeder (feed → applicazione simulata → re-import): tutti i campi coincidono; riapplicare il feed non cambia nulla; il feed non contiene date pianificate, baseline, precedenze o calendari; è bloccato se il piano è cambiato o se esistono task senza chiave corrispondente.
- Ogni modifica di avanzamento è in `audit_log`; solo i dati `approvato` finiscono nel feed.
- Multi-utente: con tre perimetri disgiunti Σ EVM di perimetro = EVM di progetto; pacchetto mancante ⇒ `provvisorio` con copertura; nessuna sovrascrittura silenziosa; ogni pacchetto importabile una sola volta; nessun utente vede/modifica task fuori perimetro (verificato sul backend).
- Identità testata: EAC lineare (BAC/CPI) = EAC base per ogni input con CPI > 0; nessuna baseline bloccata modificabile da UI o SQL senza `change_request`; variazione stima/startup > 30% ⇒ anomalia critica.
- Coverage del motore ≥ 90%, dei moduli Rust ≥ 80%; nessun warning di `eslint`/`clippy`; licenze verificate e `THIRD_PARTY_LICENSES.md` aggiornato.
- UI: tabelle virtualizzate (20.000 righe fluide), ordinamento/filtri/colonne/viste salvate, KPI con tooltip, celle fuori perimetro in grigio con lucchetto, funzioni principali da tastiera e da palette comandi, screenshot Playwright in tema chiaro e scuro, `axe` senza violazioni critiche.
- Prestazioni di §3 rispettate; sicurezza di §4 verificata; installer per le tre piattaforme generati in CI con checksum; documentazione di §6 completa.
- Ogni formula del motore commentata con il paragrafo del libro (es. `// §3.6`).

## 9. Ordine di lavoro consigliato
1. Registro unico delle anomalie e schermata Qualità dati. 2. Report: struttura HTML, grafici SVG, anteprima A4, PDF (decisione di §2.3). 3. Backup, integrità, migrazioni, log, capability Tauri. 4. Benchmark e ottimizzazioni. 5. Progetto di esempio. 6. Documentazione e guida in app. 7. Installer, firma, checksum, versioning. 8. Scenari end-to-end e verifica dei criteri finali. 9. Release candidate, checklist manuale su un computer pulito per ciascun sistema operativo.
