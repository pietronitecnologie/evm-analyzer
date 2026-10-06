# SPECIFICA FASE 2 — Motore EVM (`packages/engine`)

Documento **autosufficiente**: contiene tutto ciò che serve per implementare la Fase 2. Sostituisce i rimandi a «sez. 6», «6-bis», «Cap. 3» del prompt generale. Dove una regola qui sotto contraddice il template Excel, **vince questo documento**; dove questo documento tace su una formula del template, **vince la formula della fixture** (leggila dallo zip XML e documentala in `docs/excel-formulas.md`).

## 0. Ambito e regole di lavoro

**Consegna della Fase 2:** il pacchetto `packages/engine` (TypeScript puro) con test. **Fuori ambito:** UI, database, Excel, import del piano, feed, pacchetti, report (fasi successive).

Regole vincolanti:
1. **Funzioni pure**: input → output, nessun I/O, nessun accesso a `Date.now()`, `Math.random()`, rete o file. La data corrente e il seme casuale sono sempre parametri.
2. **Nessuna dipendenza** da React, Tauri, Node API. Solo TypeScript e, per i test, Vitest e `fast-check`.
3. **Mai `NaN`, `Infinity`, `undefined` o eccezioni per input matematicamente degeneri**: indici indefiniti → `null`, con eventuale avviso nel campo `warnings`. Le eccezioni sono ammesse solo per input strutturalmente invalidi (es. array vuoti dove è obbligatorio un elemento, parametri negativi) e devono essere tipizzate (`EngineInputError`).
4. **Numeri**: `number` (double). Importi in euro, arrotondamento **solo in presentazione**; i test usano tolleranza `0,005 €` sugli importi e `1e-6` sugli indici (salvo dove indicato).
5. **Date**: tipo `ISODate = string` («YYYY-MM-DD»). Il motore lavora con **giorni di calendario** interi calcolati su UTC; conversione in/da serial Excel fuori dal motore.
6. Ogni formula ha un commento con il riferimento al paragrafo del libro (es. `// §3.6`).
7. Ogni funzione pubblica ha: tipo di input, tipo di output, JSDoc, e almeno un test di esempio e un test di casi limite.
8. Scrivi in `DECISIONS.md` ogni scelta non determinata da questo documento (soglie di default, arrotondamenti, convenzioni di data).

Struttura dei file:
```
packages/engine/src/
  types.ts            // tipi comuni (sez. 1)
  estimate.ts         // PERT, costi, BAC, range (sez. 2)
  evm.ts              // PV/EV/AC, indici, forecast (sez. 3)
  ev-methods.ts       // metodi di misura dell'avanzamento (sez. 4)
  earned-schedule.ts  // (sez. 5)
  buffers.ts          // buffer e riserve (sez. 6)
  agile.ts            // velocity, EV agile, forecast (sez. 7)
  montecarlo.ts       // PRNG + simulazioni (sez. 8)
  flow.ts             // CFD, Little (sez. 9)
  program.ts          // filoni, aggregazione, gate (sez. 10)
  quality.ts          // controlli qualità dati (sez. 11)
  index.ts            // API pubblica (sez. 12)
packages/engine/test/ // un file di test per modulo + fixtures/
```

---

## 1. Tipi comuni (`types.ts`)

```ts
export type ISODate = string;                  // 'YYYY-MM-DD'
export type Money = number;                    // euro
export type Warning = { code: string; message: string; ref?: string };

export type TrafficLight = 'verde' | 'giallo' | 'rosso' | 'nd';

export interface ProjectParams {
  overheadPct: number;            // 0..1  es. 0.20
  contingencyPct: number;         // 0..1
  mgmtReservePct: number;         // 0..1
  greenThreshold: number;         // default 0.95
  yellowThreshold: number;        // default 0.85
  startDate: ISODate;
  plannedEndDate: ISODate;
  timeBufferDays: number;
  sprintDays: number;
  teamCostPerSprint: Money;
  velocityWindow: number;         // N sprint per la media mobile, default 3
  evBaseMode: 'bac_con_contingency' | 'bac_senza_contingency';
  plannedSpPerSprint: number;
  baselineCostPerSp?: Money;      // se assente: teamCostPerSprint / plannedSpPerSprint
  loeShareThreshold: number;      // default 0.15
}
```
Valori di default per i soglie: verde ≥ 0,95; giallo ≥ 0,85; altrimenti rosso.

---

## 2. Stima (`estimate.ts`) — §3.1–§3.4

### 2.1 Stima a tre punti per attività
Input per attività: `O, M, P` in **giorni-persona**, `hoursPerDay`, `hourlyCost` (€/h), `materials` (€), `externalServices` (€).

- `pert = (O + 4M + P) / 6`
- `sigma = (P − O) / 6`
- `directCost = pert × hoursPerDay × hourlyCost + materials + externalServices`

Validazione: `O ≤ M ≤ P` (altrimenti avviso `EST_ORDER`, non errore); valori negativi → `EngineInputError`.

### 2.2 Aggregazione di progetto
- `effortDays = Σ pert`
- `sigmaProject = √(Σ sigma²)` (attività indipendenti, §3.3)
- `direct = Σ directCost`
- `indirect = direct × overheadPct`
- `contingency = (direct + indirect) × contingencyPct`
- `bacTotal = direct + indirect + contingency` (**BAC del libro**, §3.2)
- `bacMeasure` (BAC di misura per EV/PV) secondo `evBaseMode`:
  - `bac_senza_contingency`: `direct + indirect`
  - `bac_con_contingency`: `bacTotal`
- `mgmtReserve`: come nella fixture (leggi la formula; è esterna al BAC). `budgetApproved = bacTotal + mgmtReserve`.
- Restituisci **sempre entrambi** i BAC (`bacTotal`, `bacMeasure`) e la base in uso.

### 2.3 Range di stima (§3.3)
`effortRange = { low1: effort − σ, high1: effort + σ, low2: effort − 2σ, high2: effort + 2σ }` (68% / 95%).

Range di costo: `sigmaCost = √Σ (sigma_i × hoursPerDay_i × hourlyCost_i)² × (1 + overheadPct)` (contingency e materiali esclusi, a σ nulla). `bacRange = bacTotal ± k·sigmaCost` con k = 1, 2. Documenta in `DECISIONS.md` questa convenzione.

### 2.4 Casi di test (§12 contiene l'elenco completo)
Caso A (a mano): overhead 20%, contingency 10%, 8 h/giorno.

| Attività | O | M | P | €/h | Materiali | Servizi | PERT | σ | Costo diretto |
|---|---|---|---|---|---|---|---|---|---|
| T1 | 4 | 5 | 12 | 50 | 1.000 | 0 | 6,0 | 1,3333 | 3.400,00 |
| T2 | 8 | 10 | 18 | 60 | 0 | 2.000 | 11,0 | 1,6667 | 7.280,00 |
| T3 | 2 | 3 | 4 | 40 | 500 | 0 | 3,0 | 0,3333 | 1.460,00 |

Attesi: `effortDays = 20,0`; `sigmaProject = 2,160247`; `direct = 12.140,00`; `indirect = 2.428,00`; `contingency = 1.456,80`; `bacTotal = 16.024,80`; `bacMeasure (senza contingency) = 14.568,00`; `sigmaCost ≈ 1.160,85` (tolleranza 0,01 €).

Fixture Excel: `bacTotal = 55.933,87 €` (importata con `bac_con_contingency`), `bacMeasure (senza contingency) = 48.638,15 €`, contingency = 7.295,72 € = 15% × 48.638,15, `effortDays = 77,17`, `sigmaProject = 2,06`.

---

## 3. EVM (`evm.ts`) — §3.5, §3.6, §3.8

### 3.1 Input e output
```ts
interface EvmInput { bac: Money; pv: Money; ev: Money; ac: Money }
interface EvmOutput {
  cv: Money; sv: Money;
  cpi: number | null; spi: number | null;
  etc: Money; eac: Money; eacOptimistic: Money; eacLinear: Money | null;
  vac: Money; tcpi: number | null;
  etcFallback: boolean;            // true se ETC calcolato senza CPI
  cpiLight: TrafficLight; spiLight: TrafficLight;
  warnings: Warning[];
}
```

### 3.2 Formule
- `cv = ev − ac` ; `sv = ev − pv`
- `cpi = ev / ac` se `ac > 0` **e** `ev > 0`, altrimenti `null`
- `spi = ev / pv` se `pv > 0`, altrimenti `null` (se `pv = 0` e `ev > 0` → `null` con avviso)
- `etc = (bac − ev) / cpi` se `cpi` non nullo; altrimenti `etc = bac − ev` con `etcFallback = true` e avviso `EVM_NO_CPI` (ipotesi: il residuo procede al ritmo di piano)
- `eac = ac + etc`
- `eacOptimistic = ac + (bac − ev)` (il residuo torna al ritmo di piano)
- `eacLinear = bac / cpi` se `cpi` non nullo, altrimenti `null`
- `vac = bac − eac`
- `tcpi = (bac − ev) / (bac − ac)` se `bac − ac > 0`, altrimenti `null`
- **Non** implementare varianti non presenti nel libro (es. CPI×SPI).
- **Identità da testare** (non uno scenario separato nell'UI): per `cpi` non nullo, `eacLinear == eac` entro `1e-9` relativo. Dimostrazione: `eac = ac + (bac−ev)·ac/ev = bac·ac/ev = bac/cpi`.

### 3.3 Semaforo
`light(index)`: `null` → `nd`; `index ≥ greenThreshold` → `verde`; `index ≥ yellowThreshold` → `giallo`; altrimenti `rosso`. Soglie da parametri.

### 3.4 Altri indicatori
- **Burn Rate** = `acPeriodo / pvPeriodo`; `null` se `pvPeriodo = 0`.
- **Forecast Accuracy** (solo a consuntivo) = `1 − |eac − costoFinale| / costoFinale`; `null` se `costoFinale ≤ 0`.
- **Varianza per aggregazione**: funzione `rollup(items, keyFn)` che somma `pv/ev/ac/bac` per WBS, control account, risorsa, filone, periodo e applica `evm()` a ogni gruppo. I totali dei gruppi devono coincidere con il totale (test).

### 3.5 Curva PV time-phased
`PvCurve = { date: ISODate; cumulative: Money }[]`, ordinata, monotona non decrescente (se non lo è → avviso `PV_NOT_MONOTONIC`, la curva viene comunque usata dopo aver forzato il massimo cumulato).
`pvAt(curve, date)`: interpolazione lineare tra due punti; prima del primo punto = 0 (o primo valore se il primo punto è alla data di inizio); dopo l'ultimo = ultimo valore.

### 3.6 Test numerico di riferimento
`bac = 100.000; pv = 40.000; ev = 35.000; ac = 42.000` →
`cv = −7.000; sv = −5.000; cpi = 0,833333; spi = 0,875; etc = 78.000; eac = 120.000; eacOptimistic = 107.000; eacLinear = 120.000; vac = −20.000; tcpi = 1,120690`. Semafori con soglie default: CPI `rosso` (0,833 < 0,85); SPI `giallo` (0,875 ≥ 0,85 e < 0,95).

Casi limite: `ev = 0` → `cpi = null`, `etc = bac`, `etcFallback = true`; `ac = 0` → `cpi = null`; `bac = ac` → `tcpi = null`; `pv = 0` → `spi = null`; tutti i valori nulli → nessuna eccezione e nessun `NaN`.

---

## 4. Metodi di misura dell'avanzamento (`ev-methods.ts`) — §3.5

Ogni task ha **un solo metodo**, che **non può cambiare a metà progetto**: se tra due status date consecutive cambia → avviso `METHOD_CHANGED` (grave).

```ts
type EvMethod = 'zero_cento' | 'cinquanta_cinquanta' | 'venti_ottanta' | 'unita_fisiche'
              | 'milestone_pesate' | 'loe' | 'soggettiva';
```

Funzione `measureProgress(task, status)` → `{ pct: number /*0..1*/; ev: Money; warnings }` con `ev = pct × taskBac`.

| Metodo | Regola |
|---|---|
| `zero_cento` | `pct = 1` se finito, altrimenti `0` |
| `cinquanta_cinquanta` | `0` non iniziato; `0,5` iniziato non finito; `1` finito |
| `venti_ottanta` | `0`; `0,2` iniziato; `1` finito |
| `unita_fisiche` | `pct = clamp(unitaCompletate / unitaTotali, 0, 1)`; `unitaTotali = 0` → `null` + avviso |
| `milestone_pesate` | `pct = Σ pesi delle milestone chiuse`; la somma dei pesi deve essere 100% (±0,001), altrimenti si **normalizza** con avviso `MILESTONE_WEIGHTS` |
| `loe` | `ev = pvTask` (per costruzione); badge «non può rilevare ritardi» |
| `soggettiva` | `pct` dichiarata; richiede un segnale indipendente (sez. 11, controllo Q020/Q021) |

**LOE**: `loeShare = Σ bac task LOE / bac totale`. Se `loeShare > loeShareThreshold` (default 0,15), lo SPI di filone **esclude** i task LOE (`spiExLoe`) e produce avviso `LOE_SHARE`. Calcola sempre sia `spi` che `spiExLoe`.

**Cadenza e fonte unica**: `checkCadence(statusDates[])` → avviso `CADENCE_IRREGULAR` se l'intervallo tra due status date differisce dalla mediana di più del 50%.

---

## 5. Earned Schedule (`earned-schedule.ts`)

Lavora su **giorni di calendario** a partire dalla curva PV cumulata `[(d0,PV0=0), (d1,PV1), … (dn,PVn=BAC)]`.

Input: `pvCurve`, `ev`, `bac`, `statusDate`, `startDate`, `plannedEndDate`.

Algoritmo:
1. `AT = giorni(statusDate − startDate)`; `PD = giorni(plannedEndDate − startDate)`.
2. Se `ev ≤ 0` → `ES = 0`. Se `ev ≥ bac` → `ES = PD`.
3. Altrimenti trova il **più piccolo** `k` tale che `PV_{k+1} > ev` e `PV_k ≤ ev` (nei tratti piatti prendi il primo `k` utile, evitando divisioni per zero: se `PV_{k+1} = PV_k` salta al punto successivo).
4. `ES = t_k + (ev − PV_k) / (PV_{k+1} − PV_k) × (t_{k+1} − t_k)` (interpolazione lineare, in giorni).
5. `SPI(t) = ES / AT` se `AT > 0`, altrimenti `null`; `SV(t) = ES − AT` (giorni).
6. Durata stimata a finire: `IEAC(t) = PD / SPI(t)` se `SPI(t) > 0`, altrimenti `null`; data di fine stimata = `startDate + IEAC(t)` giorni, arrotondata per eccesso al giorno.
7. `ES` non decresce al crescere di `ev` (proprietà da testare).

Test di riferimento (unità = periodi uguali di 1; `AT = 5`; `PD = 10`; `bac = 100`): curva cumulata `[0, 5, 12, 22, 35, 50, 65, 78, 88, 95, 100]`:
- `ev = 35` → `ES = 4,000`; `SPI(t) = 0,8`; `SV(t) = −1`.
- `ev = 40` → `ES = 4,333333`; `SPI(t) = 0,866667`; `SV(t) = −0,666667`; `IEAC(t) = 11,538462`.
- `ev = 0` → `ES = 0`; `ev = 100` → `ES = 10`.

---

## 6. Buffer e riserve (`buffers.ts`) — §3.7

- **Indice di salute del buffer** = `%bufferConsumato / %lavoroCompletato`; `null` se `%completato = 0` (con avviso). Interpretazione: ≤ 1 verde, tra 1 e 1,5 giallo, > 1,5 rosso (soglie `bufferYellow = 1`, `bufferRed = 1,5` configurabili; documenta in `DECISIONS.md`).
- **Contingency**: `contingencyUsed = Σ importoUtilizzato` per rischio; `contingencyResidual = stanziata − usata`; anomalia `RES_CONT_NO_RISK` se `usata > 0` ma nessun rischio risulta materializzato (data di utilizzo assente).
- **Management reserve**: consumo e residuo; uso senza approvazione registrata → `RES_MR_UNAPPROVED`.
- **Coerenza contingency**: confronta la contingency a budget (da stima) con la somma delle contingenze stanziate per rischio; scostamento > 1 € → avviso `RES_CONT_MISMATCH` (nella fixture: 7.296 € vs 15.000 €).
- **Tempo**: buffer temporale residuo in giorni = `timeBufferDays − consumo`.

---

## 7. Agile (`agile.ts`) — §3.9.3–§3.9.6, con la correzione di §6-bis.2

### 7.1 Costo per story point **non circolare**
- `baselineCostPerSp = teamCostPerSprint / plannedSpPerSprint` (fissato in baseline; non cambia se non con change request).
- Esempio fixture: `12.000 / 30 = 400 €/SP`.
- **Non** usare `costo team / velocity reale` per valorizzare l'EV (renderebbe il CPI sempre = 1).

### 7.2 Per ogni sprint `i`
- `spCompleted_i`, `spPlanned_i`, `cost_i` (costo team sostenuto).
- Cumulati: `spCum_i`, `spPlannedCum_i`, `acCum_i`.
- `ev_i = spCum_i × baselineCostPerSp`; `pv_i = spPlannedCum_i × baselineCostPerSp`; `ac_i = acCum_i`.
- `cpi = ev/ac`, `spi = ev/pv` (stesse regole di nullità della sez. 3).
- `spiVelocity = velocityReale / velocityPianificata` (indicatore equivalente §3.9.8).

### 7.3 Velocity e forecast
- `velocity_i = spCompleted_i`.
- `velocityAvg = media delle ultime N velocity` (`N = velocityWindow`, default 3; con meno di N sprint usa quelli disponibili e avvisa `VEL_SHORT`).
- `sprintRemaining = backlogResiduoSp / velocityAvg` (reale; mostra anche `ceil`). `velocityAvg = 0` → `null` + avviso.
- `eacTimeDays = sprintRemaining × sprintDays` (dal presente).
- `eacCost = sprintRemaining × teamCostPerSprint + acCum` (§3.9.6).
- Se `baselineCostPerSp` è assente (import del vecchio template): `= teamCostPerSprint / plannedSpPerSprint` del primo sprint e avviso `AGILE_COST_PER_SP_DERIVED`.

### 7.4 Test di riferimento (fixture)
Allo sprint 3: `spCum = 83`, `ev = 33.200`, `ac = 36.000`, `pv = 90 × 400 = 36.000`, `cpi = 0,922222`, `spi = 0,922222`. Il template circolare darebbe `cpi = 1` (da NON riprodurre).
Esempio velocity: storico `[28, 26, 31]` → `velocityAvg = 28,3333`; backlog residuo 210 → `sprintRemaining = 7,411765`.

---

## 8. Monte Carlo (`montecarlo.ts`) — §3.9.6

### 8.1 Generatore pseudo-casuale (obbligatorio, per riproducibilità tra piattaforme)
Implementa **esattamente** mulberry32:
```ts
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
Test: `mulberry32(42)` produce `0,601104`, `0,448291`, `0,852466` (6 decimali).

### 8.2 Simulazione sulla velocity
Input: `history: number[]` (velocity storiche, ≥ 1 elemento, tutte ≥ 0, non tutte zero), `backlogSp`, `nIter` (default 5.000), `seed`, `sprintDays`, `teamCostPerSprint`, `acSoFar`, `startFrom: ISODate`.
Per ciascuna iterazione: `done = 0; n = 0; mentre done < backlogSp: done += history[floor(rng() × history.length)]; n += 1`. Salvaguardia: massimo 10.000 sprint per iterazione (oltre → `EngineInputError`).
Output per iterazione: `sprints = n`; `finishDate = startFrom + n × sprintDays`; `cost = acSoFar + n × teamCostPerSprint`.
**Percentili con metodo nearest-rank**: ordinato crescente, `P_q = valori[ceil(q × N) − 1]`. Restituisci P50, P80, P90, minimo, massimo, media, istogramma (bin interi di sprint) e la **probabilità di finire entro una data** `P(sprints ≤ k)`.
Ordine di campionamento = ordine di iterazione = ordine del generatore: non cambiarlo, i test dipendono da esso.

### 8.3 Variante throughput (Kanban)
Stessa procedura con `history` = item/settimana, `backlogItems`, unità = settimane. Funzione `simulateThroughput(...)`.

### 8.4 Test di riferimento
`history = [20, 35, 18, 40, 25]`, `backlogSp = 300`, `nIter = 5.000`, `seed = 42`: **P50 = 11, P80 = 12, P90 = 13 sprint; minimo 8; massimo 16; media 11,4112** (tolleranza media 1e-4). Stesso seed → output identico; seed diverso → output diverso. Storico tutto uguale `[30,30,30]`, backlog 300 → P50 = P80 = P90 = 10.

---

## 9. Flusso (`flow.ts`) — §3.9.5

- **Cumulative Flow Diagram**: input serie di istantanee `{ date, backlog, inProgress, done }` (conteggi di item per stato); output: serie cumulate per stato (`todoCum = backlog + inProgress + done`, `startedCum = inProgress + done`, `doneCum = done`).
- **Legge di Little**: `WIP = throughput × cycleTime` (in item, item/giorno, giorni). Funzioni inverse: `cycleTime = WIP / throughput` (`null` se `throughput = 0`).
- **Throughput** per periodo = `Δ done`.
- **Diagnosi**: con le ultime `k` finestre (default 4), se `cycleTime` cresce di oltre il 20% e `throughput` varia meno del 10% (in valore assoluto), emetti `FLOW_WIP_EXCESS` («Cycle Time in crescita con throughput stabile ⇒ WIP eccessivo»).
- **WIP limit**: parametro opzionale per stato; superamento → avviso `FLOW_WIP_LIMIT`.
- Test: WIP = 12, throughput = 3 item/settimana → cycle time = 4 settimane; throughput = 0 → `null`.

---

## 10. Filoni e programma (`program.ts`) — §3.9.2, §3.9.4, §3.9.7

- Ogni task appartiene a un **filone** (`workstream`) con metodo nativo: `costruzione` = unità fisiche; `automazione` = milestone pesate + test superati/previsti; `software` = story point/flusso.
- **Livello di programma**: da ogni filone, per periodo, **tre numeri in euro**: `pv`, `ev`, `ac`.
  - `evProgramma = Σ ev filone`; idem `pvProgramma`, `acProgramma`, `bacProgramma`.
  - `cpiProgramma = evProgramma / acProgramma`, `spiProgramma = evProgramma / pvProgramma` (stesse regole di nullità).
  - Contributo per filone alla variazione (quanto pesa ciascuno su CPI/SPI di programma).
- **Gate** tra filoni: `{ fromWorkstream, toWorkstream, dueDate, bufferDays }`. Avviso `GATE_NO_BUFFER` se il filone a scope variabile (software) ha previsione di consegna successiva alla data del gate e `bufferDays` non copre il ritardo previsto (la data prevista viene dal P80 del Monte Carlo o da `eacTimeDays`).
- Test: due filoni (costruzione EV 50.000 AC 55.000 PV 52.000; software EV 33.200 AC 36.000 PV 36.000) → `evProgramma = 83.200`, `acProgramma = 91.000`, `pvProgramma = 88.000`, `cpiProgramma = 0,914286`, `spiProgramma = 0,945455`.

---

## 11. Controlli qualità dati (`quality.ts`)

Funzione `runQualityChecks(input) → Anomaly[]` con `Anomaly = { code, severity: 'info'|'avviso'|'critico', taskId?, message, ref? }`. Elenco minimo:

| Codice | Regola | Gravità |
|---|---|---|
| Q001 | Task attivo senza baseline | critico |
| Q002 | Metodo EV assente o incoerente con il tipo di task | avviso |
| Q003 | AC mancante con avanzamento > 0 | avviso |
| Q004 | `% complete` > 100% o decrescente tra status date | critico |
| Q005 | Avanzamento > 0 senza `actual start` | avviso |
| Q006 | Data reale nel futuro rispetto alla status date | critico |
| Q007 | Risorsa senza tariffa | avviso |
| Q008 | `PctPianificato` decrescente o `AC` decrescente tra check-point | critico |
| Q009 | Check-point con data fuori dall'intervallo di progetto | avviso |
| Q010 | Date incoerenti tra sezioni (es. inizio parametri ≠ inizio WBS) | avviso |
| Q011 | Righe di stima con `O > M` o `M > P` | avviso |
| Q012 | Scostamento stima (top-down) vs startup (bottom-up): `> 20%` avviso, `> 30%` critico | avviso / critico |
| Q013 | Costo orario non verificato (tariffa importata senza costo reale) | info |
| Q014 | Metodo di misura cambiato tra status date | critico |
| Q015 | Intervalli irregolari tra status date | info |
| Q016 | Variazione di baseline senza change request | critico |
| Q020 | **«90% fatto»**: `pct ≥ 90%` per più di 3 status date consecutive (task a metodo soggettivo) | avviso |
| Q021 | `% soggettiva` cresce senza consumo di ore (segnale indipendente assente o piatto) | avviso |
| Q030 | Agile: costo per SP derivato dal consuntivo (CPI circolare) | avviso |
| Q031 | LOE oltre la soglia di quota di BAC | avviso |

Ogni controllo è una funzione separata, con test positivo e negativo. Gli avvisi di coerenza dell'import (sez. 5 del prompt generale) rientrano qui.

---

## 12. API pubblica (`index.ts`) e piano dei test

### 12.1 API
```ts
estimateProject(activities, params): EstimateResult
evm(input: EvmInput, params): EvmOutput
rollup(items, keyFn, params): Map<string, EvmOutput>
measureProgress(task, status): ProgressResult
pvAt(curve, date): Money
earnedSchedule(input): EarnedScheduleResult
bufferHealth(...): BufferResult
agileMetrics(sprints, params): AgileResult
simulateVelocity(opts): MonteCarloResult
simulateThroughput(opts): MonteCarloResult
cumulativeFlow(snapshots): CfdResult
littleLaw(...): number | null
programRollup(workstreams, gates, params): ProgramResult
runQualityChecks(input): Anomaly[]
```
Tutti i tipi sono esportati. Nessun effetto collaterale all'import.

### 12.2 Test obbligatori
1. **Casi con numeri verificati a mano** nelle sezioni 2.4, 3.6, 5, 7.4, 8.4, 9, 10 (usare i valori scritti sopra come attesi).
2. **Fixture Excel**: `bacTotal = 55.933,87`, `bacMeasure (senza contingency) = 48.638,15`, `effortDays = 77,17`, `sigmaProject = 2,06`; agile sprint 3 come in 7.4. Il test legge i dati d'ingresso dal file della fixture, non da costanti copiate.
3. **Proprietà** (`fast-check`, almeno 1.000 casi ciascuna):
   - nessun output è `NaN`/`Infinity`, per qualunque combinazione di input finiti non negativi;
   - per `cpi` non nullo: `eacLinear = eac` (identità);
   - `cpi × ac = ev` quando `cpi` non è nullo;
   - `rollup`: la somma dei gruppi uguaglia il totale;
   - `earnedSchedule`: `ES` non decresce al crescere di `ev`, e `0 ≤ ES ≤ PD`;
   - `simulateVelocity`: stesso seed → stesso risultato; `P50 ≤ P80 ≤ P90`;
   - `pvAt` è monotona non decrescente nella data.
4. **Casi limite** (sez. 3.6): `ev = 0`, `ac = 0`, `pv = 0`, `bac = ac`, tutti zero.
5. **Copertura**: ≥ 90% di righe e rami sul pacchetto `engine`; nessun warning del linter (`eslint` con regola `no-restricted-globals` su `Date`, `Math.random`).
6. **Snapshot di regressione** della tabella dei risultati di riferimento (`test/fixtures/golden.json`), generata una volta e poi immutabile salvo decisione esplicita.

### 12.3 Criteri di completamento della Fase 2
- Tutti i test sopra passano in CI; `pnpm -w test` verde; `tsc --noEmit` senza errori.
- `docs/excel-formulas.md` elenca le formule della fixture e, per ciascuna, se il motore la riproduce o la corregge (con riferimento alla sezione di questo documento).
- `DECISIONS.md` contiene le scelte della sez. 0 (punto 8), 2.3, 6.
- Esiste un esempio di uso (`packages/engine/examples/demo.ts`) che stampa il riepilogo EVM del caso 3.6 e il Monte Carlo del caso 8.4.
- Nessuna dipendenza di runtime nel `package.json` del motore (solo `devDependencies`).

### 12.4 Ordine di lavoro consigliato (un commit per passo)
1. `types.ts`, `estimate.ts` + test 2.4. 2. `evm.ts` + test 3.6 + proprietà. 3. `ev-methods.ts`. 4. `earned-schedule.ts`. 5. `agile.ts`. 6. `montecarlo.ts` (PRNG per primo). 7. `flow.ts`. 8. `buffers.ts`. 9. `program.ts`. 10. `quality.ts`. 11. Fixture, golden file, documentazione, copertura.

Se qualcosa in questo documento è ambiguo o in contrasto con la fixture, **non indovinare**: scrivi la questione in `DECISIONS.md` con le due alternative e usa quella indicata come «default» qui sopra, poi segnalala nel messaggio finale.
