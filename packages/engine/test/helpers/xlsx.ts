// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

// Lettore minimale di workbook .xlsx per i test di fixture (solo test, non parte
// del motore): legge lo zip con zlib e restituisce i valori delle celle per foglio.
// La specifica chiede che i test leggano i dati dal file della fixture.

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export type CellValue = number | string;

function leggiEntrate(buffer: Buffer): Map<string, Buffer> {
  // Fine del central directory (firma 0x06054b50) cercata dal fondo.
  let fine = buffer.length - 22;
  while (fine >= 0 && buffer.readUInt32LE(fine) !== 0x06054b50) fine--;
  if (fine < 0) throw new Error("zip non valido");
  const numero = buffer.readUInt16LE(fine + 10);
  let offset = buffer.readUInt32LE(fine + 16);
  const entrate = new Map<string, Buffer>();
  for (let i = 0; i < numero; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("central directory non valido");
    const metodo = buffer.readUInt16LE(offset + 10);
    const compressa = buffer.readUInt32LE(offset + 20);
    const nomeLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentoLen = buffer.readUInt16LE(offset + 32);
    const localeOffset = buffer.readUInt32LE(offset + 42);
    const nome = buffer.toString("utf8", offset + 46, offset + 46 + nomeLen);
    const localeNome = buffer.readUInt16LE(localeOffset + 26);
    const localeExtra = buffer.readUInt16LE(localeOffset + 28);
    const inizio = localeOffset + 30 + localeNome + localeExtra;
    const dati = buffer.subarray(inizio, inizio + compressa);
    entrate.set(nome, metodo === 8 ? inflateRawSync(dati) : Buffer.from(dati));
    offset += 46 + nomeLen + extraLen + commentoLen;
  }
  return entrate;
}

function decodifica(testo: string): string {
  return testo
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Carica un workbook e restituisce, per nome di foglio, la mappa cella → valore (valori in cache). */
export function leggiWorkbook(percorso: string): Record<string, Record<string, CellValue>> {
  const entrate = leggiEntrate(readFileSync(percorso));
  const xml = (nome: string) => entrate.get(nome)?.toString("utf8") ?? "";
  const stringhe = [...xml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodifica([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const fogli = [...xml("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
  const relazioni = new Map([...xml("xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const risultato: Record<string, Record<string, CellValue>> = {};
  for (const [, nomeFoglio, rid] of fogli) {
    const percorsoXml = `xl/${relazioni.get(rid)}`;
    const celle: Record<string, CellValue> = {};
    for (const c of xml(percorsoXml).matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attributi, interno = ""] = c;
      const v = /<v>([\s\S]*?)<\/v>/.exec(interno)?.[1];
      if (v === undefined) continue;
      if (/t="s"/.test(attributi)) celle[ref] = stringhe[Number(v)];
      else if (/t="str"|t="inlineStr"|t="e"/.test(attributi)) celle[ref] = decodifica(v);
      else celle[ref] = Number(v);
    }
    risultato[decodifica(nomeFoglio)] = celle;
  }
  return risultato;
}
