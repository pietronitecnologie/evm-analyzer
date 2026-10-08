// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Involucro generico per un grafico ECharts: inizializza sul montaggio,
// aggiorna le opzioni quando cambiano, si ridimensiona con la finestra.
// Nessun tema ECharts separato: i colori arrivano dall'opzione stessa
// (vedi src/components/charts/tema.ts), già coerente col tema chiaro/scuro.

import * as React from "react";
import * as echarts from "echarts";

import { useThemeStore } from "@/stores/theme-store";

export function EChart({
  option,
  className,
}: {
  option: echarts.EChartsOption;
  className?: string;
}) {
  const contenitoreRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const theme = useThemeStore((s) => s.theme);
  // Letta dall'effetto di inizializzazione: l'opzione più recente, anche se
  // il genitore non si è ri-renderizzato nello stesso istante del tema.
  const optionRef = React.useRef(option);
  React.useEffect(() => {
    optionRef.current = option;
  }, [option]);

  React.useEffect(() => {
    if (!contenitoreRef.current) return;
    const chart = echarts.init(contenitoreRef.current);
    chartRef.current = chart;
    chart.setOption(optionRef.current, true);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
    // Si ricrea il grafico al cambio tema: più semplice e robusto di un
    // repaint parziale, e il costo è trascurabile per grafici di questa scala.
  }, [theme]);

  React.useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={contenitoreRef} className={className} />;
}
