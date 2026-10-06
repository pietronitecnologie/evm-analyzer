# SPECIFICA FASE 5 — Interfaccia di analisi (Dashboard, WBS, Task e risorse, Gantt, Baseline, Forecast, Filoni, Buffer, Agile/Flow)

Documento **autosufficiente**. Prerequisiti: Fasi 1–4-ter (guscio UI con design token, tabella comune virtualizzata, DB, motore EVM, import, avanzamento, feed, multi-utente). Qui si costruiscono le **schermate di sola analisi** che leggono dati già presenti e li presentano. Non si modifica il motore (Fase 2); si consumano le sue funzioni.

## 0. Ambito
**Consegna:** le schermate 2 (Dashboard), 6 (WBS e control account), 7 (Task e risorse), 8 (Gantt sola lettura), 9 (Baseline e change request), 10 (Forecast), 11 (Filoni e programma), 12 (Buffer e riserve), 13 (Agile/Flow); il sistema dei **tooltip di interpretazione dei KPI**; l'integrazione con i selettori di contesto (status date, perimetro, baseline, base EV); test visivi. **Fuori ambito (Fase 6):** Qualità dati (schermata), Report/PDF, installer, prestazioni finali.

Principi di design e componenti sono quelli del guscio (Fase 1): **React + Tailwind + shadcn/ui**, **TanStack Table + Virtual**, **Apache ECharts**, **react-resizable-panels**, **cmdk**, **dnd-kit**. Strumento professionale denso di dati; numeri a destra, cifre tabulari, formato italiano (`1.234,56 €`, `12,5%`, `gg/mm/aaaa`); indici (CPI, SPI) a 2 decimali; non calcolabile = `—` con tooltip del motivo (mai `NaN`/`#VALUE!`); **mai solo colore** (icona + testo); tema chiaro/scuro; tutto da tastiera. Semantica colore: verde/giallo/rosso = semaforo da soglie; blu chiaro = input; grigio = calcolato; arancione = provvisorio/non approvato; viola = in conflitto.

## 1. Architettura dati
1. **Contesto globale** (store Zustand, persistito per utente): `projectId`, `snapshotId` (status date), `scopeId | 'progetto'`, `baselineId`, `evBaseMode`. Cambiare un selettore aggiorna **tutte** le schede aperte.
2. **Caricamento:** comandi Tauri che restituiscono **dati grezzi** per il contesto (task con baseline, time-phased, avanzamento approvato, risorse, assegnazioni, rischi, sprint, parametri): `get_analysis_dataset(ctx) -> AnalysisDataset`. Il calcolo avviene con il motore TypeScript in un **Web Worker** (`engine.worker.ts`): input `AnalysisDataset`, output `AnalysisResult` (EVM di progetto/perimetro/WBS/filone/risorsa, curve, Earned Schedule, buffer, agile, qualità). Nessun calcolo EVM in componenti React.
3. **Cache:** risultato memorizzato per chiave `(projectId, snapshotId, scopeId, baselineId, evBaseMode, datasetVersion)`; invalidazione quando cambiano avanzamento approvato, parametri o baseline. Operazioni lunghe (Monte Carlo) con barra di avanzamento e annulla.
4. **Copertura:** ogni schermata che mostra indici di perimetro/progetto mostra il badge **Copertura % BAC** e **Provvisorio/Finale**; con copertura sotto soglia i semafori sono accompagnati dall'avviso («indici calcolati sul 63% del BAC»).
5. Selezione di una riga/barra/punto apre il **pannello dettaglio destro** (Dettaglio, Storico, Audit, Anomalie) già presente nel guscio.

## 2. Sistema dei tooltip di interpretazione (trasversale)
Ogni KPI e colonna di indice ha un'icona `?` e un tooltip alla pressione/hover. Testi in `i18n/kpi_interpretazioni.it.json`, chiave per KPI:
```json
{ "cpi": { "titolo":"CPI — Cost Performance Index", "formula":"EV / AC", "lettura":"…", "soglie":"…", "attenzione":"…", "ref":"Cap. 3 §3.8" } }
```
La UI mostra: titolo, formula, **valore corrente con semaforo**, lettura, soglie in uso, avvertenza, riferimento al paragrafo del libro. Contenuti minimi da inserire (testi sintetici, da rifinire):
| Chiave | Lettura (sintesi) |
|---|---|
| `bac` | Budget totale approvato a baseline. Mostrare sempre «BAC totale» e «BAC di misura» (senza contingency se così configurato). |
| `pv` | Valore del lavoro che la baseline prevedeva completato alla status date. Deriva dal piano, non dalla realtà. |
| `ev` | Valore, a budget, del lavoro realmente completato: % reale × BAC (per task, con il metodo di misura scelto). |
| `ac` | Costo realmente sostenuto fino alla status date, indipendentemente dal lavoro fatto. |
| `cv` | EV − AC. Negativo: si spende più di quanto vale il lavoro fatto. |
| `sv` | EV − PV. Negativo: ritardo rispetto al piano (in euro). |
| `cpi` | EV/AC. =1 in linea; <1 si spende più del previsto per il lavoro svolto; >1 esecuzione più efficiente. |
| `spi` | EV/PV. =1 in linea; <1 ritardo; >1 anticipo. Con LOE rilevante può sottostimare il ritardo (vedi `spi_ex_loe`). |
| `etc` | Costo stimato per completare il lavoro residuo alla performance osservata: (BAC−EV)/CPI. |
| `eac` | Costo finale proiettato: AC + ETC. |
| `eac_ottimistica` | AC + (BAC−EV): il residuo torna al ritmo di piano. |
| `vac` | BAC − EAC. Negativo = sforamento atteso. |
| `tcpi` | (BAC−EV)/(BAC−AC): efficienza richiesta da qui alla fine per rispettare il budget. Oltre 1,1 è un obiettivo difficile. |
| `spi_t` | ES/AT: ritmo in termini di **tempo** (Earned Schedule). Più affidabile dello SPI a fine progetto. |
| `es`, `sv_t` | Tempo pianificato al quale sarebbe stato raggiunto l'EV attuale; differenza in giorni rispetto al tempo effettivo. |
| `burn_rate` | AC/PV del periodo: velocità di consumo rispetto al ritmo pianificato. |
| `buffer_salute` | % buffer consumato / % lavoro completato. ≤1 sano; >1 il buffer si consuma più in fretta del lavoro. |
| `contingency` | Riserva per rischi noti: va consumata rischio per rischio. Consumo senza rischio materializzato = problema di stima. |
| `velocity` | Story point completati per sprint; la media mobile serve al forecast, non a valorizzare l'EV. |
| `cpi_agile` | EV agile / AC con costo per SP di baseline: non circolare. |
| `wip`, `cycle_time`, `throughput` | Legge di Little: WIP = throughput × cycle time. Cycle time in crescita con throughput stabile ⇒ WIP eccessivo. |
| `p50`, `p80`, `p90` | Probabilità di finire entro la data/il costo indicati secondo la simulazione sulle velocity storiche. |
| `copertura` | % del BAC con avanzamento approvato per la status date. Sotto soglia: indici provvisori. |

## 3. Schermate
### 3.1 Dashboard
- **Barra filtri** (status date, perimetro, baseline) già nel guscio; qui solo titolo e badge *Provvisorio/Finale* + copertura.
- **Riga KPI** (10 card, 5×2 su 1440 px, griglia reattiva): BAC di misura, PV, EV, AC, CPI, SPI, EAC, VAC, TCPI, SPI(t). Ogni card: valore, semaforo (icona + colore), variazione rispetto alla status date precedente (▲/▼ e valore), **sparkline** a 8 punti, icona `?`. Clic = apre il dettaglio (selezione della metrica nella scheda Forecast/WBS).
- **Curva S** (ECharts, linee): PV (grigio tratteggiato), EV (teal), AC (arancione), **proiezione EAC** (arancione punteggiato dalla status date), **linea verticale della status date**, **linea del BAC**, **banda ±σ** attorno al BAC (area semitrasparente, da `sigmaCost`), selettore baseline; asse X in date, tooltip con valori e CPI/SPI del punto.
- **Trend CPI/SPI**: due linee per status date con **fasce verde/giallo/rosso** dalle soglie in uso; punti con tooltip.
- **Top 10 scostamenti**: tabella `WBS/Task | CV | SV | CPI | SPI | Impatto sull'EAC` (ordinata per |CV|), clic = apre il task.
- **Copertura per perimetro/utente**: barre orizzontali % BAC aggiornato, con etichetta *Provvisorio/Finale* e «pacchetto atteso non ricevuto».
- **Riserve**: barre per contingency (usata/stanziata), management reserve, buffer di tempo (con indice di salute).
- **Filoni**: mini-tabella `Filone | EV | AC | PV | CPI | SPI`, riga Programma in grassetto.
- **Anomalie critiche**: elenco (max 8) con gravità, regola, task; clic = apre Qualità dati filtrata.
- Stati vuoti illustrati («Nessuna status date: importa un piano o un workbook»).

### 3.2 WBS e control account (tabella ad albero)
Colonne: `WBS | Nome | BAC | PV | EV | AC | CV | SV | CPI | SPI | EAC | VAC | % pian. | % reale | Copertura | Semaforo`. Selettore livello (1–5), filtro «solo fuori soglia», ordinamento per scostamento, riga totale con **indici ricalcolati dai totali** (non medie). Barra sottile in riga: % pianificata vs % reale. Clic su riga = apre *Task e risorse* filtrato su quel nodo. Espandi/comprimi con tastiera (→/←).

### 3.3 Task e risorse (tab: Task · Risorse · Assegnazioni)
- **Task**: `UID | WBS | Nome | Filone | Metodo EV | Inizio pian. | Fine pian. | Inizio base. | Fine base. | Δ fine (gg) | % reale | BAC | PV | EV | AC | CV | SV | CPI | SPI | Float | Critico | Anomalie`. `Critico` e `Float` in sola lettura (da export del piano).
- **Risorse**: `Nome | Tipo | Tariffa importata | Costo orario reale | Fonte tariffa | Ore pian. | Ore reali | Costo pian. | AC | CV | Utilizzo %`, con avviso se manca il costo reale.
- **Assegnazioni**: `Task | Risorsa | Unità % | Ore pian. | Ore reali | Ore residue | Costo pian. | AC`.
- Comportamento tabella comune (ordinamento multiplo, filtri a chip, viste salvate, colonne riordinabili con dnd-kit, menu contestuale, esportazione CSV della selezione).

### 3.4 Gantt (sola lettura)
- Layout a due pannelli ridimensionabili: tabella a sinistra (`WBS | Nome | Inizio | Fine | % reale`, con le regole delle tabelle) e **timeline** a destra, con **scorrimento verticale sincronizzato** e virtualizzazione (20.000 righe).
- Rendering **Canvas 2D o SVG virtualizzato** (non DOM per barra). Elementi: barra **baseline** sottile grigia sotto la barra attuale; barra **attuale** blu con **riempimento scuro = % reale**; task **critici** con contorno rosso (dato dal piano importato); **milestone** a rombo; task summary a parentesi; **linea verticale della status date**; frecce di dipendenza (FS/SS/FF/SF) attivabili da interruttore; evidenza dei task del proprio perimetro (gli altri attenuati).
- Zoom giorno/settimana/mese/trimestre (Ctrl+rotella), selettore baseline (Startup/Stima/altre), tooltip su barra: date pianificate/baseline/reali, durata, % pianificata vs reale, SPI di task.
- **Non modificabile**: nessun trascinamento; messaggio di aiuto «Il piano si modifica solo nel software di pianificazione».
- Vista senza dati di date (import Excel senza date) → stato vuoto con spiegazione.

### 3.5 Baseline e change request (tab: Baseline · Confronto · Change request · Scope)
- **Baseline**: `Nome | Tipo (stima/startup/altra) | Creata il | Bloccata 🔒 | BAC diretto | BAC indiretto | Contingency | BAC totale | Creata da`; azione *Blocca baseline* (conferma con modale); le bloccate sono immutabili.
- **Confronto**: due selettori (es. stima vs startup), tabella per WBS `Δ costo | Δ % | Δ durata | Δ date`, scostamento > 20% **giallo** (avviso), > 30% **rosso** (critico), come da libro.
- **Change request**: `# | Data | Richiedente | Motivo | Δ costo | Δ durata | Δ scope | Approvata da | Stato` + modulo di creazione (motivo, approvatore, delta); **nessuna nuova baseline senza change request**; approvata ⇒ crea la nuova baseline collegata.
- **Scope**: elenco dei WBS inclusi/esclusi nella baseline di scope (`baseline_scope`), con nota. Permessi: gestione solo `coordinatore_piano`; gli altri in sola lettura.

### 3.6 Forecast (tab: EAC · Earned Schedule · Monte Carlo)
- **EAC**: affiancamento di **base** (AC + ETC) e **ottimistica** (AC + BAC − EV); tabella `ETC | EAC | VAC | TCPI` e grafico a barre con confronto con il BAC; messaggio guida condizionale: «TCPI > 1,1: il budget residuo richiede un'efficienza superiore al 110% — considera di riprogrammare, rinegoziare o correggere (§3.6)». **Non** mostrare la variante lineare come scenario distinto (è identica alla base; resta solo come controllo nei test).
- **Earned Schedule**: ES, SPI(t), SV(t) in giorni, data di fine **prevista** vs pianificata, grafico PV/EV con ES evidenziato.
- **Monte Carlo**: parametri (iterazioni default 5.000, **seed** salvato e mostrato, finestra velocity/throughput), pulsante *Esegui* con barra di avanzamento e *Annulla*, **istogramma** delle date finali (o costi) con marcatori **P50/P80/P90**, tabella dei percentili, frase guida («80% di probabilità di finire entro il …»); esecuzioni salvate in `monte_carlo_run` (seed e parametri) e riproducibili.

### 3.7 Filoni e programma
Tabella `Filone | Tipo | Metodo di misura | BAC | PV | EV | AC | CPI | SPI | Peso sul programma | Semaforo` con riga **Programma** (somma) e indici ricalcolati dai totali; contributo di ciascun filone alla variazione di CPI/SPI. Sotto: elenco dei **gate** (`Da filone → A filone | Data gate | Buffer (gg) | Stato`) con avviso `GATE_NO_BUFFER` se il filone a scope variabile consegna dopo il gate senza buffer sufficiente. Confronto per tipo di filone: costruzione = unità fisiche; automazione = milestone pesate + test; software = story point/flusso.

### 3.8 Buffer e riserve (tab: Contingency · Management reserve · Buffer di tempo)
Tabelle come il foglio del libro: `Rischio | Probabilità | Impatto | Stanziata | Utilizzata | Residuo | Stato`; indicatori a barra di consumo; **indice di salute del buffer** con soglie colorate (≤1 verde, ≤1,5 giallo, >1,5 rosso, configurabili); avvisi `RES_CONT_MISMATCH` (contingency a budget ≠ somma per rischio), `RES_CONT_NO_RISK`, `RES_MR_UNAPPROVED`.

### 3.9 Agile/Flow (tab: Sprint · Velocity · Flusso · Monte Carlo)
- **Sprint**: `Sprint | SP pianificati | SP completati | Velocity | Velocity media | Costo/SP di baseline | EV agile | AC | CPI agile | Backlog residuo | Sprint residui | EAC tempo | EAC costo` (costo/SP **non circolare**, specifica Fase 2 §7).
- **Velocity**: barre per sprint + linea della media mobile (finestra configurabile).
- **Flusso**: throughput, cycle time, WIP osservato vs teorico (Legge di Little), **Cumulative Flow Diagram** (aree cumulate: backlog/in corso/fatto); avviso `FLOW_WIP_EXCESS` quando il cycle time cresce con throughput stabile.
- **Monte Carlo**: come in Forecast, sulla velocity; stessi controlli e salvataggio.

## 4. Requisiti trasversali
- **Interazioni comuni a tutte le tabelle:** intestazione fissa, colonne congelabili, ridimensionamento/riordino, selettore colonne, ordinamento multiplo (Maiusc+clic), filtri per colonna e chip rapidi, raggruppamento, riga di totali (indici dai totali), viste salvate **per utente**, menu contestuale (Apri dettaglio, Copia valore/riga, Vai nel Gantt, Mostra storico, Segnala anomalia, Esporta selezione CSV), virtualizzazione obbligatoria.
- **Grafici:** ECharts con tema chiaro/scuro, tooltip, legenda cliccabile, esportazione PNG; descrizione testuale per screen reader (`aria-label` con i valori chiave); palette con contrasto AA; mai solo colore (stili di linea diversi + etichette).
- **Prestazioni:** apertura di una scheda < 500 ms con cache calda; ricalcolo del contesto < 1 s per 5.000 task; scorrimento fluido a 60 fps con 20.000 righe; Monte Carlo 5.000 iterazioni < 2 s.
- **Accessibilità:** navigazione completa da tastiera, focus visibile, contrasto AA, ruoli ARIA per tabelle e alberi.
- **Internazionalizzazione:** tutti i testi in `i18n/it.json`; formati con `Intl` (it-IT).
- **Palette comandi (Ctrl+K):** ogni scheda raggiungibile da comando.

## 5. Test obbligatori
1. **Test visivi Playwright** (screenshot di riferimento, tema chiaro e scuro, 1440×900 e 1920×1080) per ciascuna schermata, con la fixture; soglia di differenza 0,1%.
2. **Dati:** per la fixture i valori mostrati nelle card Dashboard coincidono con quelli del motore (test che confronta DOM e `AnalysisResult`); nessuna schermata mostra `NaN`, `undefined` o `#VALUE!` (test su DOM per tutte le schede con dataset normale e con dataset degenere: EV = 0, AC = 0, nessuna baseline, nessuna status date).
3. **Contesto:** cambiare status date/perimetro/baseline aggiorna tutte le schede aperte; il perimetro limita righe e totali; con copertura < soglia compaiono *Provvisorio* e la copertura accanto agli indici.
4. **Gantt:** 20.000 task scorrevoli (misurare frame time), status date visibile, barre baseline/attuale/% corrette su un caso noto, nessun trascinamento possibile.
5. **Monte Carlo:** stesso seed → stessa distribuzione; annullamento a metà funziona; esecuzione salvata e ricaricabile.
6. **Tooltip KPI:** presente per ogni KPI della tabella §2 (test che verifica l'esistenza della chiave i18n per ogni icona `?`).
7. **Permessi:** schermate Baseline/Change request: azioni di gestione disabilitate per chi non ha `coordinatore_piano` (verifica anche backend).
8. **Accessibilità:** controllo automatico `axe` senza violazioni critiche su ciascuna schermata.

## 6. Criteri di completamento
- Tutte le schermate del §3 raggiungibili da sidebar, menu e palette comandi; contesto condiviso funzionante; tooltip KPI completi.
- Test del §5 verdi in CI; `tsc --noEmit` e `eslint` senza errori; nessuna dipendenza nuova senza voce in `THIRD_PARTY_LICENSES.md`.
- Screenshot di riferimento archiviati in `e2e/__screenshots__/`.
- `DECISIONS.md` aggiornato (libreria di rendering del Gantt, strategia di cache, soglie dei grafici).

## 7. Ordine di lavoro consigliato
1. Contesto globale, Web Worker del motore, cache e badge copertura. 2. Sistema dei tooltip KPI. 3. Dashboard. 4. WBS. 5. Task/Risorse/Assegnazioni. 6. Baseline e change request. 7. Forecast (EAC, Earned Schedule). 8. Monte Carlo e Agile/Flow. 9. Filoni e Buffer. 10. Gantt. 11. Test visivi, accessibilità e prestazioni.
