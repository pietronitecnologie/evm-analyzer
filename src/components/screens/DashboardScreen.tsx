// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

import { type Dashboard } from "@/lib/api";
import { Vuoto } from "./comuni";
import { EvmWorkbookSezione } from "./EvmWorkbookSezione";
import { CELLA, TESTA_TABELLA, usePercorso, useDati } from "@/lib/schermate";

function Indicatore({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="rounded-md border border-border-strong bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <p className="tabular-num mt-1 text-2xl font-semibold">{valore}</p>
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

const eur = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function DashboardScreen() {
  const percorso = usePercorso();
  const [d] = useDati<Dashboard>("dashboard", percorso);
  if (!percorso) return <Vuoto messaggio="Apri o crea un progetto per vedere la dashboard." />;
  if (!d) return <Vuoto messaggio="Caricamento…" />;

  return (
    <div className="flex flex-col gap-6 p-4">
      <EvmWorkbookSezione percorso={percorso} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicatore etichetta="Task di lavoro" valore={String(d.taskTotali)} />
        <Indicatore etichetta="Task critici" valore={String(d.taskCritici)} />
        <Indicatore etichetta="Milestone" valore={String(d.milestone)} />
        <Indicatore etichetta="BAC" valore={eur(d.bacTotale)} nota="baseline di partenza" />
        <Indicatore
          etichetta="Avanzamento medio"
          valore={d.avanzamentoMedioPct === null ? "—" : `${d.avanzamentoMedioPct.toFixed(1)} %`}
          nota="media dei task di lavoro"
        />
        <Indicatore etichetta="Data di stato" valore={d.dataDiStato ?? "—"} />
        <Indicatore etichetta="Anomalie" valore={String(d.anomalie.length)} nota="da correggere nel piano" />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Anomalie</h2>
        {d.anomalie.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna anomalia rilevata.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TESTA_TABELLA}>UID</th>
                <th className={TESTA_TABELLA}>Task</th>
                <th className={TESTA_TABELLA}>Problema</th>
              </tr>
            </thead>
            <tbody>
              {d.anomalie.map((a, i) => (
                <tr key={`${a.uid}-${i}`}>
                  <td className={`${CELLA} tabular-num`}>{a.uid}</td>
                  <td className={CELLA}>{a.nome}</td>
                  <td className={`${CELLA} text-semaforo-giallo`}>{a.messaggio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
