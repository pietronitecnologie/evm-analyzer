# File di esempio per l'importazione del piano

Piano sintetico di esempio, uguale nei tre formati di export. È usato dai test di
importazione (`crates/evm-db/tests/import_esempi.rs`). I dati non sono reali.

## Il piano

12 righe: 3 riepiloghi (1, 2, 3), 2 milestone (1.3, 3.2), 7 attività di lavoro.
3 risorse: Ingegnere (60 €/h), Operaio (35 €/h), Elettricista (42 €/h).
7 assegnazioni, 9 collegamenti di precedenza.
Costi di baseline: 1.500 + 4.200 + 6.000 + 9.000 = 20.700 €.

## I file

| File | Formato | Cosa mostra |
|---|---|---|
| `piano-msproject-esempio.xml` | XML MSPDI | Export di MS Project: ore per la durata, date ISO, precedenze in decimi di minuto. |
| `piano-msproject-esempio.csv` | CSV | Separatore `;`, date `gg/mm/aaaa`, numeri con virgola, durata `N g`, risorse `Nome[%]`. |
| `piano-msproject-esempio.xlsx` | Excel | Mappa di esportazione: date vere di Excel, percentuali come numeri (40 = 40%). |

I tre file devono dare lo stesso piano: stesso numero di attività, precedenze,
assegnazioni e costi.

## File errati (per i test negativi)

| File | Errore atteso |
|---|---|
| `esempio-xml-senza-task.xml` | «nessun task trovato nel file XML» |
| `esempio-csv-senza-uid.csv` | «colonna UID/ID non trovata» |
| `esempio-non-supportato.mpp` | «formato non supportato»: il `.mpp` non si legge, bisogna esportare in XML o Excel |

Il file `.mpp` contiene solo l'intestazione binaria di un file Microsoft Project, non
un piano vero: serve a verificare il messaggio di formato non supportato.
