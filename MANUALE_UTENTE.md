# Manuale utente — Analizzatore EVM

Guida completa all'app desktop per la gestione dell'Earned Value Management
(EVM). Questo manuale descrive ogni schermata così com'è nell'applicazione,
con il testo esatto che si vede a schermo tra virgolette («come questo»).
L'interfaccia è in inglese; questo manuale è in italiano e traduce/spiega
ogni voce.

Puoi leggere questo manuale anche **dentro l'applicazione**: menu **Help →
Guide**.

Un progetto di esempio completo (`fixtures/progetto-esempio.evmproj`) accompagna
questo manuale: molti capitoli lo richiamano con numeri concreti. Vedi il
capitolo [21. Il progetto di esempio passo per passo](#21-il-progetto-di-esempio-passo-per-passo).

## Indice

1. [Di cosa si occupa l'app](#1-di-cosa-si-occupa-lapp)
2. [Avvio: aprire o creare un progetto](#2-avvio-aprire-o-creare-un-progetto)
3. [Accesso e utenti](#3-accesso-e-utenti)
4. [L'interfaccia: menu, barra di contesto, barra laterale](#4-linterfaccia-menu-barra-di-contesto-barra-laterale)
5. [Importare un piano da MS Project](#5-importare-un-piano-da-ms-project)
6. [Importare/esportare il workbook Excel](#6-importareesportare-il-workbook-excel)
7. [Dashboard](#7-dashboard)
8. [WBS](#8-wbs)
9. [Task e risorse](#9-task-e-risorse)
10. [Baseline e change request](#10-baseline-e-change-request)
11. [Registrare l'avanzamento](#11-registrare-lavanzamento)
12. [Approvazioni](#12-approvazioni)
13. [Gantt](#13-gantt)
14. [Filoni e programma (workstream)](#14-filoni-e-programma-workstream)
15. [Buffer e riserve](#15-buffer-e-riserve)
16. [EVM Monitoring](#16-evm-monitoring)
17. [Forecast: EAC, Earned Schedule, Monte Carlo](#17-forecast-eac-earned-schedule-monte-carlo)
18. [Agile/Flow](#18-agileflow)
19. [Cost governance](#19-cost-governance)
20. [Qualità dati](#20-qualità-dati)
21. [Il progetto di esempio passo per passo](#21-il-progetto-di-esempio-passo-per-passo)
22. [Report](#22-report)
23. [Perimetri e utenti](#23-perimetri-e-utenti)
24. [Calendari di lavoro](#24-calendari-di-lavoro)
25. [Diagnostica](#25-diagnostica)
26. [Scorciatoie da tastiera](#26-scorciatoie-da-tastiera)
27. [Ruoli e permessi](#27-ruoli-e-permessi)
28. [Glossario EVM](#28-glossario-evm)
29. [Limiti noti](#29-limiti-noti)

---

## 1. Di cosa si occupa l'app

Il software é inteso per essere usato da Project Engineer, Supevisori e PM,
va a coadiuvare o sostituire software come MS Project. Questa applicazione è dove
si registra l'avanzamento lavori, si fa l'analisi Earned Value (EVM) secondo
il metodo del Capitolo 3 del libro "Impresa Numerica", e si genera il
file/report con cui aggiornare MS Project.

Il software si concentra nel registrare gli avanzamenti/consuntivi  di una pianificazione
importata da Excel o MS Project e calcola gli indicatori EVM. 
Ha la possiblita di creare nuove task e gestire le date, ma manca degli automatismi di software di pianificazione.

## 2. Avvio: aprire o creare un progetto

Un progetto è un singolo file `.evmproj` (un database SQLite autosufficiente:
copiarlo o spostarlo non lascia nulla indietro — allegati agli avanzamenti
inclusi, vedi [11. Registrare l'avanzamento](#11-registrare-lavanzamento)).

Alla prima apertura dell'app, se non c'è un progetto recente, si vede la
schermata **Home** con tre scelte:

- **«New from MS Project export»** — crea un nuovo progetto importando un
  export XML MSPDI, Excel o CSV da MS Project (vedi
  [5. Importare un piano da MS Project](#5-importare-un-piano-da-ms-project)).
- **«Open»** — apre un file `.evmproj` esistente.
- **«Import Excel workbook»** — crea un nuovo progetto dal workbook Excel in
  formato "Impresa Numerica" (vedi
  [6. Importare/esportare il workbook Excel](#6-importareesportare-il-workbook-excel)).

Un progetto completamente vuoto si crea con **File → New project…**.

## 3. Accesso e utenti

Appena un progetto è aperto, prima di vedere qualunque schermata, compare una
**pagina di login** con due campi: «Identifier» e «Password».

Ogni progetto nuovo riceve automaticamente un utente amministratore di
default:

- Identificativo: `admin`
- Password: `admin`

**Cambia questa password al primo accesso** (menu utente in alto a destra →
«Change password…», vedi sotto): è una password nota e documentata, non un
segreto.

Questo vale anche per un progetto creato prima che questa funzionalità
esistesse: se un progetto non ha ancora nessun utente configurato, riceve
anch'esso `admin`/`admin` alla prima apertura successiva — nessun progetto
resta bloccato fuori senza nessuna credenziale valida.

Dopo l'accesso, in alto a destra nella barra di contesto compare **«Signed in
as {nome}»**: un menu con il/i ruolo/i dell'utente, e due azioni:

- **«Change password…»** — richiede sempre la password attuale, anche per
  l'amministratore.
- **«Log out»** — torna alla pagina di login. Si torna alla pagina di login
  anche automaticamente ogni volta che si apre o si crea un progetto (anche
  lo stesso già aperto in precedenza): l'accesso vale per una sessione di
  apertura, non è ricordato tra un'apertura e l'altra.

Se non si ha ancora un account valido per il progetto che si è aperto, il
link **«Open a different project…»** nella pagina di login permette di
tornare indietro senza dover chiudere l'applicazione.

Per creare altri utenti o reimpostare una password dimenticata, vedi
[23. Perimetri e utenti](#23-perimetri-e-utenti).

## 4. L'interfaccia: menu, barra di contesto, barra laterale

**Barra dei menu** (in alto): **File**, **View**, **Project**, **Progress**,
**Analysis**, **Help**. Solo funzionalità reali: non ci sono voci che
"arriveranno in futuro".

**Barra di contesto** (sotto i menu), da sinistra a destra:

- **Project** — nome del progetto aperto.
- **Status date** — «Latest» o una data di stato specifica tra quelle
  registrate; a fianco un'etichetta **Draft** / **Provisional** / **Final**
  (vedi [20. Qualità dati](#20-qualità-dati) per cosa serve "Final").
- **Scope** — «Whole project» o un perimetro (sottoalbero WBS) tra quelli
  definiti in [23. Perimetri e utenti](#23-perimetri-e-utenti).
- **Baseline** — quale baseline di budget usare come riferimento nelle
  schermate di analisi (🔒 = bloccata).
- Un'etichetta **«Base EV: without contingency»** / **«with contingency»**:
  indica se il BAC usato come riferimento include la riserva di contingency.
- **«Search tasks…»** (scorciatoia **Ctrl+K**) — palette comandi: cerca
  qualunque comando o schermata per nome.
- Icona campanella — contatore notifiche.
- **«Signed in as {nome}»** — vedi [3. Accesso e utenti](#3-accesso-e-utenti).

**Barra laterale** (sinistra), ridimensionabile trascinando il bordo destro o
collassabile a sola icona con **Ctrl+B**, raggruppa le schermate:

- **Work** — Progress, Approvals.
- **Analysis** — Dashboard, WBS, Tasks and resources, Gantt, Forecast,
  Workstreams and schedule, Agile/Flow, Buffer and reserves, EVM Monitoring.
- **Governance** — Baseline and change requests, Cost governance, Data
  quality, Report.
- **Coordination** — User scopes.

Ogni voce apre una **scheda** (tab) nell'area principale, come un browser:
più schede restano aperte insieme, si riordinano trascinandole, **«Close
all»** le chiude tutte. Lo stesso contenuto si stacca in una finestra
separata dal menu contestuale di una scheda.

**Barra di stato** (in basso): **Coverage … BAC** (quanta parte del budget è
coperta dai dati correnti), **Plan: synced** / **needs re-sync** (se il piano
importato combacia ancora con l'ultimo export caricato), un contatore
**anomalie** cliccabile che apre **Data quality**, e **Saved** / **Saving…**.

## 5. Importare un piano da MS Project

**File → Import plan from MS Project export…** apre una procedura guidata in
due passi:

1. Si sceglie il file (XML MSPDI, Excel o CSV esportato da MS Project): l'app
   ne fa un'anteprima — quante attività, quali avvisi non bloccanti — senza
   scrivere nulla.
2. Si conferma: si sceglie dove salvare il nuovo file `.evmproj` e si
   completa l'importazione. Il piano importato (date, WBS, costi, eventuali
   percentuali già presenti nell'export) diventa la prima baseline del
   progetto.

**Project → Re-sync plan** confronta il progetto aperto con un nuovo export
dello stesso piano: aggiorna solo i campi di sola lettura (date, calendario,
cammino critico) letti dal file, senza mai toccare l'avanzamento già
registrato in questa app. Se la baseline bloccata risultasse diversa nel
nuovo export, l'app lo segnala invece di correggerla in silenzio.

## 6. Importare/esportare il workbook Excel

**File → Import Excel workbook…** crea un nuovo progetto dal workbook in
formato "Impresa Numerica" (lo stesso formato del Capitolo 3 del libro):
WBS e stima costi, avanzamenti, rischi/contingency, checkpoint, sprint
agili — tutto in un unico file Excel.

**File → Export Excel workbook…** scrive un nuovo workbook con lo stato
corrente del progetto: formule Excel vive più una cache dei valori calcolati
dal motore, per confrontare facilmente i due.

## 7. Dashboard

La schermata **Dashboard** è il punto di partenza consigliato: una sintesi
di tutto il progetto, filtrata dal perimetro scelto in Scope (non dalla
Baseline: quell'interazione non è ancora collegata qui).

In testa: **«EVM as of {data}»**; se la copertura del BAC è sotto il 100%,
un'etichetta **«Provisional — {pct}% of BAC covered»**.

Riga di indicatori (ogni card ha una nota sotto il valore): **BAC** (nota
"WBS budget"), **PV**, **EV**, **AC**, **CV / SV** (insieme), **CPI** (nota
"EV ÷ AC"), **SPI** (nota "EV ÷ PV"), **EAC** (nota con il valore
ottimistico), **VAC**, **TCPI**.

Due grafici: **"S-curve"** (PV tratteggiata, EV, AC, con il BAC come
riferimento orizzontale) e **"CPI / SPI trend"** (con bande colorate per le
soglie verde/giallo/rosso).

Tabella **"Top deviations by WBS"**: i 10 nodi WBS con lo scostamento di
costo (CV) più marcato — cliccare una riga apre la schermata WBS su quel
nodo.

Se i parametri di riserva sono impostati, una sezione **"Reserves"** mostra
Contingency, Management reserve e Time buffer (vedi
[15. Buffer e riserve](#15-buffer-e-riserve)).

In fondo, una tabella **"Anomalies"** (UID, Task, Issue): un controllo
rapido e leggero, distinto dal registro completo di
[20. Qualità dati](#20-qualità-dati) — qui sono solo le incongruenze più
immediate (es. un task avanzato senza data di inizio effettiva), non le
regole più elaborate del motore.

## 8. WBS

La schermata **WBS** mostra la struttura ad albero (Work Breakdown
Structure) del progetto, filtrata al perimetro scelto in Scope.

Controlli in alto: **«Max level»** (profondità massima da mostrare: All, o
da 1 a 5), casella **«Off-threshold only»** (solo i nodi fuori soglia
CPI/SPI), casella **«Sort by deviation»** (ordina per scostamento invece che
per gerarchia — nasconde l'albero).

Colonne della tabella: **Code, Name, BAC, PV, EV, AC, CV, SV, CPI, SPI, EAC,
VAC, % plan, % actual, Coverage, Task**, più un semaforo di stato (on
track / warning / critical / n/a). Una riga in fondo mostra i **Total**.

La cella **BAC** di ogni nodo è modificabile direttamente: un campo numero e
un pulsante **«Save»** — è qui che si assegna il budget a un nodo WBS (il
primo passo prima di poter bloccare una baseline di budget, vedi
[10. Baseline e change request](#10-baseline-e-change-request)). **Un nodo
senza budget non partecipa al calcolo EVM**: i suoi task restano "scoperti"
finché non gli si assegna un budget (lo vedremo nel progetto di esempio).

Il modulo **«New node»** (campi **Code** es. `1.2` sotto `1`, e **Name**)
crea un nuovo nodo — il nodo padre deve già esistere.

## 9. Task e risorse

La schermata **Tasks and resources** ha tre schede.

**Task**: card con **BAC, PV, EV, AC, CPI, SPI, Tasks**; tabella con UID,
WBS, Name, Workstream, EV method, date pianificate/di baseline, scostamento
di fine, % reale, e gli indicatori EVM per task. Filtri rapidi:
**Off-threshold**, **Critical**, **Milestones**. Il modulo **«New task»**
(Name, WBS, Start, Finish, Duration, casella Milestone) crea un task
direttamente nell'app, senza dover ripassare da MS Project.

**Resources**: tabella risorse (Name, Type, Imported rate, Real hourly cost,
Rate source, Tasks, Units, Planned cost) — tariffa importata e costo orario
reale sono celle modificabili inline. Il modulo **«New resource»** ne crea
una nuova.

**Assignments**: tabella delle assegnazioni risorsa↔task (UID, Task,
Resource, Units %, Planned hours, Planned cost) con percentuale di impiego
modificabile e un'icona cestino per rimuovere l'assegnazione. Il modulo
**«New assignment»** ne crea una nuova.

Il costo/le ore **effettive** di un task non si inseriscono qui: si
registrano nella schermata **Progress** (vedi il capitolo successivo).

## 10. Baseline e change request

La schermata **Baseline and change requests** ha quattro schede. Le azioni
di gestione (bloccare/archiviare una baseline, decidere una change request,
modificare lo scope) **richiedono il ruolo Plan coordinator**: senza quel
ruolo la schermata è di sola lettura e lo segnala con un banner in alto.

**Baseline**: elenco delle baseline (Name, Type, Created on/by, Locked,
Direct/Indirect/Contingency/Total BAC) con un pulsante **«Archive»** per
ritirarne una (resta nel database, solo non più "corrente"). Il modulo
**«Lock a new budget baseline»** (Baseline name, Type — **Startup** /
**Estimate** / **Other** —, Indirect BAC, Contingency) blocca il budget
corrente: una finestra di conferma riepiloga il BAC totale prima di
procedere con **«Confirm lock»**. **Una baseline bloccata è immutabile**:
cambiarla richiede una change request approvata.

**Comparison**: si scelgono due baseline (**Baseline A**/**Baseline B**) e si
vede, per nodo WBS, il delta di costo (assoluto e %, colorato se oltre il
20%/30%), di durata e di date.

**Change request**: tabella delle richieste (numero, data, richiedente,
motivo, Δ costo, Δ durata, Δ scope, stato Pending/Approved/Rejected) con
**«Approve»**/**«Reject»** per quelle in sospeso. Il modulo **«Request a
change»** ne crea una nuova. **Approvarla crea automaticamente una nuova
baseline** (tipo "Other") con il BAC aggiornato del delta di costo —
diventa la nuova baseline corrente.

**Scope**: per la baseline scelta, quali nodi WBS sono inclusi o esclusi dal
suo perimetro di budget (pulsante **Included**/**Excluded** per riga, più
una nota se si ha il ruolo necessario).

### Come usarle: il flusso corretto

1. Importa il piano o crealo a mano (capitoli 5-6, 9), poi assegna un budget
   a ogni nodo WBS che ha task di lavoro (schermata **WBS**, capitolo 8) —
   bloccare una baseline di budget richiede che questa somma sia già
   positiva.
2. Blocca la **prima baseline di budget** (tipo **Startup**): qui si
   dichiarano anche il **BAC indiretto** (costi non attribuiti a un nodo WBS
   specifico: direzione lavori, strutture di cantiere condivise…) e la
   **contingency** in euro — diventano `Direct BAC + Indirect BAC +
   Contingency = Total BAC` di quella baseline. Da questo momento la
   baseline è immutabile: ogni cambiamento di scope/costo passa da una
   **change request**, mai da una modifica diretta.
3. Quando emerge un imprevisto che cambia il budget o la durata (un
   ritrovamento in cantiere, una variante richiesta dal committente…),
   registralo come **change request** invece di toccare budget o date a
   mano: la richiesta porta un motivo esplicito, e solo chi ha il ruolo
   Plan coordinator decide se approvarla. **Approvarla crea una nuova
   baseline** (tipo "Other") con lo stesso indiretto/contingency della
   baseline di partenza più il delta di costo della richiesta — diventa
   lei la "baseline corrente" da quel momento.

**Qual è "la baseline corrente"?** È **l'ultima non archiviata**, di
qualunque tipo: la schermata Dashboard (KPI "Budget baseline") e la
schermata Buffer and reserves (KPI "BAC") la seguono automaticamente —
bloccare una nuova baseline o approvare una change request aggiorna subito
quei due numeri, non serve altro. Il selettore **Baseline** nella barra di
contesto è invece solo un filtro di visualizzazione per il confronto nel
Gantt e per i metadati del Report: **non** influenza il calcolo degli
indicatori EVM (CPI/SPI/EAC…), che si basano sempre sul budget WBS corrente
("BAC" nelle schermate EVM, etichettato "WBS budget" — vedi anche
[15. Buffer e riserve](#15-buffer-e-riserve) per la differenza tra questo
BAC "di lavoro" e il "Budget baseline" di governance).

## 11. Registrare l'avanzamento

La schermata **Progress** è una tabella con una riga per task di lavoro
(non i riepiloghi). Per ogni riga si può modificare: **New %**, **Actual
start**, **Actual finish**, **Actual hours**, **Cumulative AC (€)** — se non
si inserisce l'AC a mano, l'app lo calcola dalle ore consuntive moltiplicate
per la tariffa media delle risorse assegnate (l'icona ⓘ accanto ad "Actual
hours" spiega la formula per esteso).

C'è anche un campo **Note** (facoltativo: un commento libero su questo
avanzamento) e un controllo **«Attach file…»**: permette di allegare un
file (un verbale di sopralluogo, una foto, un certificato…) insieme alla
proposta. Il file entra nel progetto stesso (nel file `.evmproj`), non resta
un percorso esterno: copiare o spostare il progetto porta con sé anche gli
allegati.

Il pulsante **«Submit for approval»** (attivo solo se la riga è stata
modificata) invia la proposta: non diventa subito il valore vigente, resta
in sospeso finché qualcuno non la approva o respinge dalla schermata
**Approvals** (capitolo successivo). La colonna **«Latest proposal
status»** mostra lo stato dell'ultima proposta per quel task; se è stata
respinta, il motivo del rifiuto compare sotto, in rosso.

Il pulsante **«History»** per riga apre lo **storico completo** del task:
non solo l'ultima voce, ma ogni proposta mai registrata — con la sua nota,
il motivo di un eventuale rifiuto, e i suoi allegati (scaricabili con
**«Download»** o rimovibili con **«Remove»**). Da qui si può anche allegare
un file a una voce già passata con **«Attach file…»**, non solo al momento
dell'invio.

## 12. Approvazioni

La schermata **Approvals** è la coda delle proposte in attesa: UID, Task,
% proposta, date effettive, AC, data di invio. **«Approve»** rende la
proposta il valore vigente del task. Per respingerla si scrive il motivo nel
campo **«Reason for rejection»** e si preme **«Reject»** — il motivo è
obbligatorio e torna visibile a chi ha inviato la proposta, nella schermata
Progress.

## 13. Gantt

Il Gantt è **di sola lettura**: il piano si modifica in MS Project, non
qui. Due pannelli ridimensionabili: a sinistra la tabella dei task (WBS,
Name, Start, Finish, %), a destra la linea del tempo.

**Le colonne della tabella a sinistra si ridimensionano** trascinando il
bordo destro di ciascuna intestazione — le larghezze scelte si ricordano tra
una sessione e l'altra.

Controlli in alto: livello di zoom (**Day/Week/Month/Quarter** — o
**Ctrl+rotellina del mouse** sopra la linea del tempo), casella
**Dependencies** per mostrare/nascondere le frecce di precedenza. Legenda:
quadrato pieno = task, bordo rosso = critico, trattino orizzontale =
riepilogo, rombo = milestone, barra grigia sottile = baseline. Una linea
rossa verticale segna la **status date** corrente. Passando il mouse su una
barra compare un riquadro con date pianificate/di baseline, durata, %
pianificata vs reale, SPI.

## 14. Filoni e programma (workstream)

La schermata **Workstreams and schedule** gestisce i **filoni** (workstream):
raggruppamenti di task per cui si vuole un proprio avanzamento EVM, utile
quando lavorano squadre diverse in parallelo (es. "Civile" e "Impianti" nel
progetto di esempio).

Tabella: Workstream, Type, BAC, PV, EV, AC, CPI, SPI, **Weight (EV)** (quota
% sull'EV di programma), Status. Tipi disponibili: **Construction**,
**Automation**, **Software**, **Other**. Metodi di misura: **Physical
units**, **Weighted milestones**, **Story points**, **Flow**.

Il modulo **«New workstream»** ne crea uno; **«Assign a task to a
workstream»** assegna (o rimuove, scegliendo «— none —») il filone di un
task.

Sezione **Gates**: un gate è un punto di passaggio tra due filoni (es. "i
cavidotti devono essere pronti prima di posare i cavi"), con una data
prevista e un buffer in giorni. Il modulo **«New gate»** ne crea uno
(From/To workstream, Gate date, Buffer days, Description).

## 15. Buffer e riserve

La schermata **Buffer and reserves** segue tre riserve distinte, ciascuna
con la propria sezione:

- **Contingency** — copre i rischi identificati del progetto. Si registra un
  rischio con **«Record a risk»** (Description, Probability %, Impact €,
  Allocated contingency €); la tabella mostra Allocated/Used/Residual per
  rischio.
- **Management reserve** — copre l'imprevisto non identificabile in
  anticipo. **«Record consumption»** registra un consumo (Amount, Date,
  Note); ogni consumo richiede un'**approvazione** di chi ha il ruolo Plan
  coordinator prima di essere definitivo.
- **Time buffer** — margine temporale di programma, in giorni. Stesso
  principio della management reserve ma senza approvazione.

In alto, il pannello **Parameters** mostra le percentuali correnti
(Contingency %, Management reserve %, Time buffer giorni) ed è modificabile
da chi ha i permessi.

### Le tre "contingency" dell'app, e come si usano insieme

Il termine "contingency" compare in tre punti diversi dell'app, con tre
significati distinti che **non si aggiornano a vicenda in automatico** —
vanno tenuti allineati a mano, in quest'ordine:

1. **«Contingency %»** (pannello Parameters qui sopra, lo stesso numero
   compare in **Cost governance**): è la **politica** del progetto — "di
   norma accantoniamo il 10% del budget diretto come contingency". Un
   parametro di riferimento, non un importo: serve da guida per il passo 2.
2. **Rischi registrati** (sezione Contingency qui sopra): l'importo
   **realmente stanziato**, rischio per rischio, con **«Record a risk»**
   (campo **Allocated contingency €**). La somma di questi importi è
   l'«Allocated» mostrato sia qui sia in Cost governance — idealmente
   vicina al budget diretto × la percentuale del punto 1, ma è l'utente a
   doverlo verificare: l'app non ricalcola né avvisa se i due si
   scostano.
3. **«Contingency» della baseline** (campo del modulo "Lock a new budget
   baseline", capitolo 10): un **importo in euro inserito a mano** al
   momento di bloccare la baseline, che entra nel suo "Total BAC". **Non
   si riempie da solo con la somma dei rischi del punto 2** — se il
   registro rischi cambia dopo che la baseline è bloccata, il numero
   bloccato nella baseline resta quello di allora (correttamente: una
   baseline bloccata è immutabile, capitolo 10) finché una change request
   non la aggiorna.

**Come usarle senza perdersi**: decidi prima la percentuale di politica
(1), censisci i rischi con i loro importi (2) finché la somma non converge
verso quella percentuale, e solo allora blocca la baseline riportando a
mano quella stessa somma come contingency (3). Se in seguito il registro
rischi cambia in modo sostanziale, valuta una change request che aggiorni
anche la contingency della nuova baseline di conseguenza — l'app non lo fa
da sola.

## 16. EVM Monitoring

La schermata **EVM Monitoring** mostra gli indicatori EVM dell'intero
progetto (non filtrati da Scope/Baseline della barra di contesto):

- Alla **status date** corrente: BAC, PV, EV, AC, CV/SV, CPI, SPI, EAC, VAC,
  TCPI.
- **Serie per data di stato**: una riga per ogni status date registrata, con
  gli stessi indicatori — per vedere l'andamento nel tempo.
- **Per nodo WBS** alla data corrente.
- **Checkpoint da workbook**: se il progetto è stato importato/esportato
  anche in Excel, i checkpoint registrati lì (distinti dalle status date
  registrate nell'app).
- Eventuali **avvisi** del motore di calcolo.

Ogni sigla (BAC, CPI, SPI…) in questa e in altre schermate è sottolineata: ci
si passa sopra il mouse (o ci si mette il focus da tastiera) per vedere nome
per esteso, cosa misura, come si legge, la formula e il riferimento al
libro — vedi anche [28. Glossario EVM](#28-glossario-evm).

### Come leggerla

Questa è la schermata per vedere l'andamento **nel tempo**, non solo lo
stato di oggi: la tabella "Serie per data di stato" è la stessa storia che
il Dashboard mostra per l'ultima data soltanto, status date dopo status
date. Un progetto in salute ha CPI e SPI che oscillano intorno a 1 (o sopra)
senza un trend in discesa marcato; un CPI che scende status date dopo
status date, anche se ancora "verde" oggi, è un segnale da seguire prima
che diventi un problema conclamato — è il punto di questa vista rispetto
al singolo numero del Dashboard. La sezione "Per nodo WBS" aiuta a
localizzare DOVE nasce uno scostamento visto a livello di progetto nel
Dashboard: se il CPI di progetto è sceso, qui si vede quale nodo lo sta
trascinando giù.

## 17. Forecast: EAC, Earned Schedule, Monte Carlo

La schermata **Forecast** ha tre schede.

**EAC**: BAC, ETC, EAC (base), EAC (optimistic), VAC, TCPI — con un avviso
se il TCPI supera 1,1 (serve un'efficienza superiore al 110% sul budget
residuo: valutare una revisione del piano o della stima). Grafico a barre
EAC (base/optimistic) con il BAC come riferimento.

**Earned Schedule**: richiede che il progetto abbia una data di inizio e una
data di fine prevista. Mostra ES (Earned Schedule, in giorni), AT (Actual
Time), SPI(t) = ES ÷ AT, SV(t) = ES − AT, e la data di fine stimata.

**Monte Carlo**: simulazione per stimare quando si esaurirà il backlog
residuo, a partire dallo storico di velocity (sprint) o di throughput
(flusso). Campi: **Iterations**, **Seed** (con pulsante «New» per
rigenerarlo), **Period (days)**, **Backlog**, **Team cost/period**
(facoltativo), **Start from**. Il pulsante **«Run»** calcola **P50, P80,
P90, Min/max, Mean** (e il costo a P80 se è stato inserito un costo per
periodo), più un istogramma delle iterazioni. Ogni run si salva e resta
richiamabile da **«Saved runs»**.

### Come leggerlo

**EAC (base) vs EAC (optimistic)**: l'EAC base assume che il ritmo di spesa
osservato finora (il CPI attuale) continui fino alla fine — è la stima
prudente da comunicare quando il progetto sta sforando. L'EAC optimistic
assume che il resto del lavoro torni a costare esattamente quanto
pianificato (ritmo CPI = 1 da qui alla fine) — è il "se da domani
recuperiamo", non una previsione realistica se il CPI è basso da tempo. Usa
l'optimistic come limite inferiore, non come stima da comunicare al
committente. Il **TCPI**: se supera 1,1 significa che il budget residuo
richiederebbe un'efficienza mai vista finora nel progetto per restare nel
BAC — a quel punto il problema non si risolve "lavorando meglio", serve una
revisione del budget (una change request) o della stima.

**Earned Schedule** risponde a una domanda diversa dal CPI/SPI classico:
SPI (Dashboard/EVM Monitoring) può restare vicino a 1 anche a progetto quasi
concluso per costruzione matematica (tende a 1 quando il PV smette di
crescere), mentre **SPI(t)** (qui) resta un'efficienza di programma
leggibile fino alla fine. Se le due misure divergono molto verso la fine
del progetto, fidati di SPI(t)/SV(t) per capire quanto si è davvero in
anticipo o ritardo in giorni.

**Monte Carlo**: **P50** è "metà delle simulazioni finisce entro questo
numero di periodi" — troppo ottimista da solo per un impegno esterno. **P80**
è il valore comunemente usato per una stima da comunicare con un margine di
sicurezza ragionevole (80% delle simulazioni ci rientra). **P90** è per
impegni dove il rischio di sforare è particolarmente costoso. Non prendere
mai il Min come stima.

## 18. Agile/Flow

La schermata **Agile/Flow** ha quattro schede (la quarta, Monte Carlo, è la
stessa della schermata Forecast).

**Sprint**: dati storici importati dal workbook (foglio "Agile - Velocity").
Mostra velocity media, costo/SP, backlog residuo, sprint residui, EAC (tempo
e costo). Il campo **«Remaining backlog (SP)»** è l'unico dato inserito a
mano qui: nessun import fornisce questa cifra.

**Velocity**: grafico a barre della velocity per sprint con media mobile
(finestra configurabile).

**Flow**: a differenza dello sprint, **qui tutto è manuale** — nessun import
fornisce dati di flusso Kanban. **«Record a flow period»** (Period
start/end, Throughput, Cycle time, WIP observed) registra un periodo
osservato; la tabella li elenca con un'icona cestino per rimuoverli.

## 19. Cost governance

La schermata **Cost governance** mostra una sintesi di budget e riserve
(quanti nodi WBS hanno un budget, contingency allocata/usata, management
reserve allocata/usata) e un registro generale dei consumi di riserva
(**Date, Reserve, Amount, Note** — qui si può registrare un consumo su
**qualunque** delle tre riserve, scegliendola da un menu: **Contingency**,
**Management reserve**, **Time buffer**).

L'assegnazione del budget ai singoli nodi WBS si fa invece nella schermata
**WBS** (vedi [8. WBS](#8-wbs)): qui si vede il totale, non si modifica nodo
per nodo.

### Come leggerla

Questa schermata risponde a "quanta riserva abbiamo ancora, in totale,
indipendentemente da come è distribuita per rischio?" — è il quadro
riassuntivo delle tre riserve (vedi
[15. Buffer e riserve](#15-buffer-e-riserve) per il dettaglio di ciascuna e
per come le tre "contingency" dell'app si tengono allineate). Il registro
consumi qui sotto è lo stesso dato della schermata Buffer and reserves,
solo in un'unica tabella invece che divisa per tipo di riserva — utile per
un riepilogo in un colpo d'occhio prima di un report, non per registrare un
nuovo consumo (per quello, la schermata Buffer and reserves ha il contesto
— righi/periodi — per scegliere l'importo giusto).

## 20. Qualità dati

La schermata **Data quality** è il registro delle anomalie: problemi che il
motore di calcolo rileva (budget mancante, date incoerenti, scostamenti
sospetti…) restano qui, non solo come avviso temporaneo su uno schermo.

Filtri: **Critical**, **Open**, **Mine**, categoria. Per ogni anomalia:
gravità, regola, task/WBS coinvolti, descrizione, suggerimento, stato,
utente. Azioni: **«Go to task»**, **«Accept with reason»** (richiede un
ruolo Supervisor o Plan coordinator, e un motivo obbligatorio — l'anomalia
resta visibile ma segnata come accettata), **«Reopen»**. Il contatore nella
barra di stato (capitolo 4) si aggiorna ogni 15 secondi.

Una **status date** non si può segnare come **«Final»** se restano anomalie
critiche aperte, a meno che chi ha il ruolo Plan coordinator non lo
autorizzi esplicitamente con un motivo.

Il pulsante **«Recalculate»** aggiorna il registro: un'anomalia già
accettata non torna "aperta" solo perché viene ricalcolata (resta accettata
finché qualcuno non la riapre), e una risolta da sola (la causa non c'è
più) si marca automaticamente come tale.

## 21. Il progetto di esempio passo per passo

`fixtures/progetto-esempio.evmproj` è un piccolo progetto realistico:
**"Rifacimento impianto elettrico — Edificio A"**, generato dallo script
`crates/evm-db/examples/progetto_esempio.rs` (rieseguibile con `cargo run
--example progetto_esempio -p evm-db` dalla cartella `crates/evm-db`, se si
vuole rigenerarlo da zero).

**WBS**: 4 fasi — 1 Progettazione, 2 Lavori civili, 3 Impianti elettrici, 4
Collaudi — ciascuna con due o tre nodi di lavoro, più una milestone finale
"Consegna impianto". Il nodo **4.2 Certificazioni** è lasciato
*deliberatamente* senza budget: è l'anomalia che si vede aperta in **Data
quality** (`WBS_NO_BUDGET`), accettata da Luca Verdi con il motivo "Le
certificazioni sono ancora in corso: il budget si assegna al collaudo
finale."

**Utenti**: oltre ad `admin`/`admin`, due utenti pensati per questo
progetto:

| Identificativo | Nome | Ruoli | Password |
|---|---|---|---|
| `mrossi` | Mario Rossi | Project engineer, Plan coordinator | `cantiere1` |
| `lverdi` | Luca Verdi | Supervisor | `cantiere2` |

**Baseline**: un primo import come baseline **Estimate** (non bloccata); poi
i budget WBS assegnati nodo per nodo; poi una baseline **Startup** bloccata
da Mario Rossi (Direct BAC 31.500 €, Indirect 1.500 €, Contingency 3.000 €
→ Total BAC 36.000 €).

**Change request**: durante le demolizioni (task "Demolizioni") sono state
rinvenute canalizzazioni interrate non censite — una change request di
+2.500 € e +3 giorni, approvata da Mario Rossi. L'approvazione ha creato una
nuova baseline ("Startup — CR #1"), quella corrente da lì in avanti.

**Avanzamento**: tre cicli di monitoraggio (metà agosto, metà settembre, e
oggi), con una storia di rifiuto/correzione sul task "Corpi illuminanti"
(prima proposta respinta per una data incoerente, poi corretta e approvata —
guarda il suo **«History»** in Progress per vedere entrambe le voci) e un
allegato (un verbale di sopralluogo) sulla voce di "Demolizioni".

Apri questo file (**File → Open**) e segui i capitoli di questo manuale
schermata per schermata: ogni numero citato sopra si ritrova esattamente
in Dashboard, WBS, Baseline and change requests, Progress e Data quality.

## 22. Report

La schermata **Report** genera un documento HTML autosufficiente, pensato
per la stampa in A4: a sinistra le sezioni attivabili (una casella per
sezione) e il nome dell'azienda, a destra l'anteprima esatta di quello che
si esporta o si stampa — sono letteralmente lo stesso documento.

**«Export HTML»** salva il file su disco. **«Print / Export PDF»** apre la
finestra di stampa del sistema operativo (da lì si sceglie "Salva come
PDF"). Il report porta una filigrana **"Provisional"** se la status date non
è "Final", e in piè di pagina un hash del contenuto più la versione
dell'app, per poterlo verificare più avanti.

La sezione Monte Carlo non è ancora disponibile nel report (nessuna run "del
report" senza prima scegliere quale run riportare — vedi
[29. Limiti noti](#29-limiti-noti)).

## 23. Perimetri e utenti

La schermata **User scopes** (gruppo Coordination nella barra laterale) ha
due sezioni.

**Scopes**: un perimetro è un sottoalbero WBS con i suoi task — usato dal
selettore **Scope** nella barra di contesto per filtrare le analisi. Il
modulo **«Create scope»** (Name, WBS code, Owner) ne crea uno nuovo;
**l'elenco dei task di un perimetro si fissa alla sua creazione**.

**Users**: tabella degli utenti del progetto (Identifier, Name, Roles) con
un pulsante **«Reset password…»** per riga (richiede il ruolo
Administrator — non serve conoscere la password attuale dell'utente: è il
percorso per sbloccare chi l'ha persa). Il modulo in basso crea un nuovo
utente: **Identifier**, **Name**, **Password** (minimo 4 caratteri) e le
caselle dei **Roles**:

- **Project engineer**
- **Supervisor**
- **Plan coordinator**
- **Administrator**

Un utente può avere più ruoli insieme (cumulabili). Vedi
[27. Ruoli e permessi](#27-ruoli-e-permessi) per cosa sblocca ciascuno.

## 24. Calendari di lavoro

La schermata **Working calendars** (**Project → Working calendars…**) elenca
gli schemi di calendario del progetto: nome, giorni lavorativi, festivi, e
quale sia quello in uso (**«Use for this project»** per cambiarlo). Il
modulo **«Create schema»** ne crea uno nuovo: nome, una casella per ciascun
giorno della settimana (Mon…Sun), ed eventuali festivi aggiunti uno per uno
con un selettore di data. Se nessuno schema è mai stato creato, il progetto
usa lunedì-venerdì senza festivi.

Il pulsante **«Recalculate task durations»** in alto ricalcola la durata dei
task secondo il calendario in uso.

## 25. Diagnostica

**Help → Diagnostics…** apre una finestra con la versione dell'app e, se un
progetto è aperto, la sua dimensione (numero di task, nodi WBS, status
date registrate) — utile per capire se un rallentamento segnalato dipende
dalla scala del progetto.

## 26. Scorciatoie da tastiera

| Scorciatoia | Azione |
|---|---|
| **Ctrl+K** | Apre la ricerca/palette comandi |
| **Ctrl+B** | Mostra/nasconde la barra laterale |
| **F11** | Schermo intero |
| **Ctrl+rotellina** (sul Gantt) | Cambia il livello di zoom della linea del tempo |

Ogni comando della barra dei menu è raggiungibile anche dalla palette
(**Ctrl+K**): basta digitarne il nome.

## 27. Ruoli e permessi

Un utente può avere uno o più di questi ruoli insieme:

- **Project engineer** — uso operativo quotidiano: registrare avanzamento,
  consultare le analisi.
- **Supervisor** — in più, accetta le anomalie di qualità dati con un
  motivo.
- **Plan coordinator** — in più, gestisce baseline e change request
  (bloccare/archiviare una baseline, approvare/respingere una change
  request, modificare lo scope di una baseline), approva i consumi di
  management reserve, può forzare una status date a "Final" con anomalie
  critiche aperte.
- **Administrator** — in più, crea altri utenti e reimposta le loro
  password.

Senza il ruolo richiesto, l'azione resta visibile ma disattivata (o la
schermata passa in sola lettura con un banner che lo spiega) — non
scompare, per capire comunque cosa esiste e a chi chiedere.

## 28. Glossario EVM

Lo stesso testo che compare passando il mouse su ogni sigla nell'app
(§ = paragrafo del Capitolo 3 del libro "Impresa Numerica").

| Sigla | Nome | Cosa misura | Formula | § |
|---|---|---|---|---|
| **BAC** | Budget At Completion | Il budget totale approvato del progetto. | somma dei budget dei nodi WBS | §3.2 |
| **PV** | Planned Value | Il valore del lavoro che si sarebbe dovuto completare, secondo il piano. | budget del task × frazione di durata pianificata trascorsa | §3.5 |
| **EV** | Earned Value | Il valore del lavoro realmente completato, valutato al budget pianificato. | budget del task × % fisica completata | §3.5 |
| **AC** | Actual Cost | Il costo realmente sostenuto alla data di stato. | somma dei costi effettivi registrati per task | §3.5 |
| **CV** | Cost Variance | Scostamento di costo: quanto il lavoro fatto vale in più/meno di quanto speso. | EV − AC | §3.6 |
| **SV** | Schedule Variance | Scostamento di programma: quanto il lavoro fatto è avanti/indietro rispetto al piano. | EV − PV | §3.6 |
| **CPI** | Cost Performance Index | Efficienza di costo: quanto valore si ottiene per ogni euro speso. | EV ÷ AC | §3.6 |
| **SPI** | Schedule Performance Index | Efficienza di programma: quanto lavoro è completato rispetto al pianificato. | EV ÷ PV | §3.6 |
| **ETC** | Estimate To Complete | Il costo ancora da sostenere per finire il lavoro. | (BAC − EV) ÷ CPI | §3.7 |
| **EAC** | Estimate At Completion | Il costo finale previsto, al ritmo di spesa attuale. | AC + ETC | §3.7 |
| **EAC ottimistica** | Optimistic EAC | Il costo finale se il lavoro residuo procede al ritmo pianificato. | AC + (BAC − EV) | §3.7 |
| **VAC** | Variance At Completion | Lo scostamento previsto a fine progetto rispetto al budget. | BAC − EAC | §3.8 |
| **TCPI** | To-Complete Performance Index | L'efficienza necessaria sul lavoro residuo per restare nel budget. | (BAC − EV) ÷ (BAC − AC) | §3.8 |
| **ES** | Earned Schedule | Il tempo "guadagnato": a quale istante del piano corrisponde il valore (EV) prodotto finora. | — | Forecast |
| **AT** | Actual Time | Il tempo realmente trascorso dall'inizio del progetto. | — | Forecast |
| **SPI(t)** | Schedule Performance Index (tempo) | Come SPI ma su base temporale, non di valore. | ES ÷ AT | Forecast |
| **SV(t)** | Schedule Variance (tempo) | Come SV ma su base temporale: giorni di anticipo/ritardo. | ES − AT | Forecast |

Un indice **undefined** (mostrato come «—») non è un errore: significa che
il denominatore è zero (es. CPI senza ancora nessun costo registrato) — non
un valore calcolabile, non un valore nascosto.

## 29. Limiti noti

Questi limiti sono intenzionali, non dimenticanze — annotati qui perché
l'utente non li scambi per un difetto:

- **Il report non include ancora una sezione Monte Carlo**: lo storico delle
  simulazioni ha più fonti (sprint o flusso) e nessuna è "quella del
  report" senza un selettore dedicato, non ancora costruito.
- **L'esportazione PDF non è stata verificata su Windows/macOS** da questo
  ambiente di sviluppo (solo Linux): la resa dell'SVG inline nella finestra
  di stampa di sistema resta da controllare su quelle piattaforme.
- **L'avanzamento non registra chi l'ha inserito o approvato/respinto** (solo
  la nota e l'eventuale motivo di rifiuto): un collegamento esplicito
  all'utente autenticato è un lavoro futuro, insieme all'estensione del
  login reale introdotto in questa versione.
- **Un utente creato con una versione dell'app precedente al login reale**,
  se il progetto aveva già almeno un utente configurato, non riceve una
  password automaticamente: va reimpostata da un amministratore (vedi
  [23. Perimetri e utenti](#23-perimetri-e-utenti)).
- **La barra di contesto, a finestra molto stretta**, può nascondere il
  gruppo di destra (ricerca, notifiche, utente autenticato): un difetto di
  layout noto, non legato al login in sé — allargare la finestra lo
  risolve.
