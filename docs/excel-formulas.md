# Formule del workbook di riferimento e corrispondenza con il motore

Fonte: `fixtures/Parte_III_Gestione_Progetti.xlsx`, leggendo le formule dallo zip XML
(fogli *Parametri*, *WBS e Stima Costi*, *Agile - Velocity*). Per ogni formula: se il
motore (`packages/engine`) la riproduce o la corregge, con il riferimento alla sezione
della specifica di Fase 2.

## Parametri

| Cella | Parametro | Valore | Uso nel motore |
|---|---|---|---|
| B6 | Overhead | 10% | `overheadPct` (§2.2) |
| B7 | Contingency | 15% | `contingencyPct` (§2.2) |
| B8 | Management reserve | 5% | `mgmtReservePct` (§2.2) |
| B20 | Durata sprint | 14 gg | `sprintDays` |
| B21 | Costo team per sprint | 12.000 € | `teamCostPerSprint` |
| B22 | Sprint per velocity media mobile | 4 | `velocityWindow` |

## Foglio *WBS e Stima Costi* (righe 4–12, nove attività)

| Colonna | Formula del workbook | Motore | Esito |
|---|---|---|---|
| I — PERT | `(F+4*G+H)/6` | `pertOf` (§3.1) | riprodotta |
| J — Sigma | `(H−F)/6` | `sigmaOf` (§3.1) | riprodotta |
| L — EffortOre | `I*K` | `pert × hoursPerDay` | riprodotta |
| M — CostoPersone | `L*E` | `pert × hoursPerDay × hourlyCost` | riprodotta |
| P — CostoDiretto | `M+N+O` | `directCost` (§2.1) | riprodotta |
| Q — CostoIndiretto | `P*Parametri!B6` | `direct × overheadPct` (§2.2) | riprodotta |
| R — CostoAttività | `P+Q` | diretto + indiretto | riprodotta |
| T — DurataGg | `TabellaWBS[PERT]` | PERT in giorni, come nel workbook | riprodotta |
| U — DataFine | `S+T` | non nel motore (date fuori dalla stima) | fuori ambito |
| V — PesoPct | `R / SUM(CostoAttività)` | non nel motore | fuori ambito |

## Foglio *WBS e Stima Costi* — sintesi

| Cella | Formula | Valore nel file | Motore | Esito |
|---|---|---|---|---|
| B24 | `SUM(PERT)` effort | 77,1667 | `effortDays` | riprodotta |
| B25 | `SQRT(SUMSQ(Sigma))` σ progetto | 2,0616 | `sigmaProject` | riprodotta |
| B27 | `SUM(CostoDiretto)` | 44.216,50 € | `direct` | riprodotta |
| B28 | `SUM(CostoIndiretto)` | 4.421,65 € | `indirect` | riprodotta |
| B29 | `B27 + B28` | 48.638,15 € | `bacMeasure` (senza contingency) | riprodotta |
| B30 | `B29 * Parametri!B7` | 7.295,72 € | `contingency` | riprodotta |
| B31 | `B29 + B30` | 55.933,87 € | `bacTotal` | riprodotta |
| B32 | `B31 * Parametri!B8` | 2.796,69 € | `mgmtReserve` | riprodotta (§2.2, risolve il punto aperto) |
| B33 | `B31 + B32` | 58.730,57 € | `budgetApproved` | riprodotta |

**Riserva di gestione.** La formula del workbook è `BAC × riserva%`, esterna al BAC: il
motore la adotta così. Il punto era aperto nella specifica («come nella fixture»).

**Costo di deviazione σ (non presente nel workbook).** La convenzione del motore,
`√Σ(σᵢ·hᵢ·cᵢ)² · (1 + overhead)`, riproduce il valore del caso A della specifica
(1.160,85 €). Il workbook non calcola questo valore: è una convenzione documentata in
`DECISIONS.md`.

## Foglio *Agile - Velocity*

| Colonna | Formula del workbook | Motore | Esito |
|---|---|---|---|
| G — VelocityMedia | `AVERAGE` delle ultime N velocity | `velocityAverage` (§7.3) | riprodotta |
| **I — CostoPerSP** | **`H / G`** (costo team ÷ velocity media reale) | **`baselineCostPerSp` = 12.000 ÷ 30 = 400 €/SP** | **corretta** (§6-bis.2) |
| K — EVAgile | `J × I` | `evAgile` = SP cumulati × costo per SP di baseline | **corretta**: usa il costo di baseline |
| M — CPIAgile | `K / L` | `cpi = ev / ac` (§3.2) | **corretta**: nel workbook vale sempre 1 (circolare) |
| O — SprintResidui | `N / G` | `sprintRemaining` (§7.3) | riprodotta |
| P — EACtempoGg | `O × sprintDays` | `eacTimeDays` (§7.3) | riprodotta |
| Q — EACcosto | `O × CostoTeam + ACCumulato` | `eacCost` (§7.3) | riprodotta |

**Effetto della correzione.** Allo sprint 3: SP cumulati 83, EV = 83 × 400 = 33.200 €,
AC = 36.000 €, CPI agile = 0,922222. Il workbook darebbe CPI = 1,000 perché il costo per
SP deriva dalla velocity reale. Il valore è verificato nei test di fixture
(`test/fixture.test.ts`).

## Foglio *Agile - Velocity* — flusso (§9)

| Cella | Formula | Motore | Esito |
|---|---|---|---|
| B25 | `B23 * B24 / 7` (WIP teorico, Legge di Little) | `littleWip` (§9) | riprodotta |
| B27 | `B26 − B25` (scostamento WIP) | differenza, fuori dal motore | fuori ambito |

## Note di coerenza (sez. 5 della specifica generale)

- La data di inizio dei parametri (B15 = 01/01/2027) non coincide con quella della WBS
  (01/01/2026): il controllo Q010 segnala l'incoerenza (`test/fixture.test.ts`).
- Il workbook non contiene la contingency stanziata per rischio nel foglio WBS: il
  confronto `RES_CONT_MISMATCH` (7.296 € contro 15.000 €) richiede il foglio *Buffer e
  Contingency* e non è ancora nei test di fixture.

## Export (fase 3)

L'export riproduce le formule della tabella sopra con i riferimenti del foglio
generato. Il file esportato usa gli stessi nomi di foglio e di intestazione del
template, così è importabile di nuovo (test di round trip in
`crates/evm-db/tests/workbook_fixture.rs`).

| Foglio | Formula esportata | Stato |
|---|---|---|
| WBS e Stima Costi | PERT, Sigma, EffortOre, CostoPersone, CostoDiretto, CostoIndiretto, CostoAttivita, DurataGg, DataFine, PesoPct | riprodotta |
| WBS e Stima Costi (sintesi) | effort, σ, costo persone, diretto, indiretto, sub-totale, contingency, BAC, misura senza contingency, management reserve, budget | riprodotta |
| Monitoraggio EVM | PV, EV, CV, SV, CPI, SPI, ETC, EAC, EAC ottimistica, EAC lineare, VAC, TCPI | riprodotta; CPI/SPI/EAC vuoti se non definiti |
| Buffer e Contingency | Residuo, Stato, totali stanziata e utilizzata, contingency a budget | riprodotta |
| Agile - Velocity | Velocity, velocity media, costo per SP (non circolare), SP cumulati, EV, AC cumulato, CPI | riprodotta; backlog e forecast esclusi (decisione 54) |

Le formule usano `IF(OR(… <= 0), "", …)` dove il motore dà `null`: un indice non
definito resta vuoto invece di mostrare 0 o un errore.
