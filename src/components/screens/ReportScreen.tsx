// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Report (specifica Fase 6, §2): opzioni a sinistra, anteprima A4 a destra in un
// <iframe srcDoc> — isolato dallo stile dell'app (niente Tailwind, niente variabili CSS:
// lib/report.ts genera un documento autosufficiente), così l'anteprima è esattamente ciò
// che "Export HTML" scrive su disco ed esattamente ciò che la stampa del browser
// stampa/salva come PDF (percorso principale della specifica §2.3: stampa della
// webview, non una libreria PDF lato Rust — scelta singola, non mantenuta in parallelo
// con un fallback, vedi DECISIONS.md).

import * as React from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DatiAgile, DatiMonitoraggio, FiloneRiga, ProblemaRiga, Riserve, SnapshotRiga } from "@/lib/api";
import { metricheAgili } from "@/lib/agile";
import { costruisciProgramma } from "@/lib/filoni";
import { puntoTestata, vistaMonitoraggio } from "@/lib/monitoraggio";
import { generaReportHtml, SEZIONI_DEFAULT, type DatiReport, type OpzioniReport, type SezioniReport } from "@/lib/report";
import { usePercorso, useDati } from "@/lib/schermate";
import { useProjectContextStore } from "@/stores/project-context-store";
import { Campo, Sezione, Vuoto } from "./comuni";

const ETICHETTA_SEZIONE: Record<keyof SezioniReport, string> = {
  riepilogo: "Executive summary",
  curvaS: "S-curve",
  trendIndici: "CPI/SPI trend",
  topScostamenti: "Top deviations",
  wbs: "WBS",
  anomalie: "Data quality",
  riserve: "Reserves and buffers",
  filoni: "Workstreams and program",
  agile: "Agile / Flow",
  glossario: "KPI glossary",
};

export function ReportScreen() {
  const percorso = usePercorso();
  const ctx = useProjectContextStore();
  const [datiMon] = useDati<DatiMonitoraggio>("dati_monitoraggio", percorso);
  const [riserve] = useDati<Riserve>("riserve_dati", percorso);
  const [filoni] = useDati<FiloneRiga[]>("elenco_filoni", percorso);
  const [datiAgile] = useDati<DatiAgile>("agile_dati", percorso);
  const [problemi] = useDati<ProblemaRiga[]>("elenco_problemi", percorso);
  const [snapshot] = useDati<SnapshotRiga[]>("snapshot_elenco", percorso);

  const [sezioni, setSezioni] = React.useState<SezioniReport>(SEZIONI_DEFAULT);
  const [nomeAzienda, setNomeAzienda] = React.useState("");
  const [html, setHtml] = React.useState<string | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const pronto = percorso && datiMon && riserve && filoni && datiAgile && problemi && snapshot;

  React.useEffect(() => {
    if (!pronto) return;
    let annullato = false;
    async function genera() {
      const vista = vistaMonitoraggio(datiMon!);
      const testata = puntoTestata(vista, ctx);
      const snapshotCorrente = snapshot!.find((s) => s.id === (ctx.snapshotId ?? snapshot![0]?.id)) ?? null;
      const programma = testata && filoni!.length > 0 ? costruisciProgramma(filoni!, testata) : null;
      const metriche = metricheAgili(datiAgile!);
      const pctCompletatoBuffer = testata && vista.bac > 0 ? (testata.ev / vista.bac) * 100 : 0;
      const conteggioProblemi = {
        critici: problemi!.filter((p) => p.state === "aperta" && p.severity === "critico").length,
        avvisi: problemi!.filter((p) => p.state === "aperta" && p.severity === "avviso").length,
        info: problemi!.filter((p) => p.state === "aperta" && p.severity === "info").length,
      };
      let versioneApp = "—";
      try {
        versioneApp = await invoke<string>("versione_app");
      } catch {
        // la versione non è essenziale al report: resta "—" se il comando non risponde.
      }
      const dati: DatiReport = {
        nomeProgetto: ctx.projectName,
        statusDate: testata?.data ?? ctx.statusDate,
        statusDateState: snapshotCorrente?.state ?? ctx.statusDateState,
        perimetro: ctx.perimetro,
        baseline: ctx.baseline,
        evBaseMode: ctx.evBaseMode,
        copertura: pctCompletatoBuffer / 100,
        versioneApp,
        vista,
        testata,
        riserve: riserve!,
        filoni: filoni!,
        programma,
        metricheAgili: metriche,
        pctCompletatoBuffer,
        problemi: problemi!,
        conteggioProblemi,
      };
      const opz: OpzioniReport = { sezioni, nomeAzienda, autore: ctx.userName === "—" ? "—" : ctx.userName };
      const testo = await generaReportHtml(dati, opz);
      if (!annullato) setHtml(testo);
    }
    void genera();
    return () => {
      annullato = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, sezioni, nomeAzienda, ctx.snapshotId, ctx.scopeId, ctx.baselineId, ctx.statusDate]);

  if (!percorso) return <Vuoto messaggio="Open or create a project to generate a report." />;
  if (!pronto || html === null) return <Vuoto messaggio="Loading…" />;

  async function esportaHtml() {
    const destinazione = await save({ title: "Export report", defaultPath: "report.html", filters: [{ name: "HTML", extensions: ["html"] }] });
    if (!destinazione) return;
    await invoke("salva_testo", { percorso: destinazione, contenuto: html! });
  }

  function stampaOEsportaPdf() {
    iframeRef.current?.contentWindow?.print();
  }

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 overflow-y-auto border-r border-border-strong">
        <Sezione titolo="Sections">
          <div className="flex flex-col gap-1.5 text-sm">
            {Object.entries(ETICHETTA_SEZIONE).map(([chiave, etichetta]) => (
              <label key={chiave} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sezioni[chiave as keyof SezioniReport]}
                  onChange={(e) => setSezioni((s) => ({ ...s, [chiave]: e.target.checked }))}
                />
                {etichetta}
              </label>
            ))}
          </div>
        </Sezione>
        <Sezione titolo="Header / footer">
          <Campo etichetta="Company name (optional)">
            <input className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={nomeAzienda} onChange={(e) => setNomeAzienda(e.target.value)} />
          </Campo>
          <p className="mt-2 text-xs text-muted-foreground">Author: {ctx.userName === "—" ? "no active user" : ctx.userName}. Status date, scope and baseline come from the context bar above.</p>
        </Sezione>
        <Sezione titolo="Export">
          <div className="flex flex-col gap-2">
            <Button onClick={() => void esportaHtml()}>
              <Download className="size-4" />
              Export HTML
            </Button>
            <Button variant="outline" onClick={stampaOEsportaPdf}>
              <Printer className="size-4" />
              Print / Export PDF
            </Button>
            <p className="text-xs text-muted-foreground">PDF export uses the system print dialog ("Save as PDF"), not a separate converter.</p>
          </div>
        </Sezione>
      </div>
      <div className="flex-1 overflow-hidden bg-muted">
        <iframe ref={iframeRef} title="Report preview" srcDoc={html} className="h-full w-full border-0" />
      </div>
    </div>
  );
}
