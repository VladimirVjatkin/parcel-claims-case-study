// Načítá referenční štítky pro měření a regresní testy; rozhodovací vrstvy je nečtou.
// Krátký vlastní CSV parser stačí na tento soubor bez další knihovny (NOTES).
// Podporuje uvozovky, zdvojené uvozovky, čárky i konce řádků v poli, CRLF a vstupní BOM.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TrackingState } from "../tracking/types.js";

export const LABELS_RELATIVE_PATH = join("tracking", "labels.csv");

export interface LabelRow {
  file: string;
  carrier: string;
  trackingNumber: string;
  expectedState: TrackingState;
  note: string;
}

interface CsvRow {
  cells: string[];
  line: number;
}

function csvError(line: number): Error {
  return new Error(`labels.csv, řádek ${line}: neplatný formát CSV.`);
}

// Stav uvozovek odděluje skutečný konec řádku od zalomení uvnitř citovaného pole.
// U každého záznamu se uchová číslo počátečního řádku pro srozumitelnou chybu vstupu.
function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let startLine = 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else {
        cell += char;
        if (char === "\n" || (char === "\r" && text[index + 1] !== "\n")) line += 1;
      }
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
      closedQuote = false;
    } else if (char === "\r" || char === "\n") {
      cells.push(cell);
      if (cells.length > 1 || cells[0] !== "") rows.push({ cells, line: startLine });
      cells = [];
      cell = "";
      closedQuote = false;
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
      startLine = line;
    } else if (char === '"') {
      if (cell !== "" || closedQuote) throw csvError(line);
      quoted = true;
    } else {
      // Po uzavřené uvozovce smí následovat jen oddělovač nebo konec řádku, jinak je CSV neplatné.
      if (closedQuote) throw csvError(line);
      cell += char;
    }
  }
  if (quoted) throw csvError(startLine);
  if (cells.length > 0 || cell !== "" || closedQuote) {
    cells.push(cell);
    rows.push({ cells, line: startLine });
  }
  return rows;
}

function readState(value: string, line: number): TrackingState {
  switch (value) {
    case "DELIVERED": case "IN_TRANSIT": case "RETURNING": case "UNKNOWN": return value;
    default: throw new Error(`labels.csv, řádek ${line}: neplatný expected_state „${value}“.`);
  }
}

// Hlavička i všech pět sloupců jsou povinné; neznámý stav se nesmí vydávat za UNKNOWN.
export function readLabels(path: string): LabelRow[] {
  const rows = parseCsv(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  const header = rows.shift();
  if (header?.cells.length !== 5 || header.cells.join(",") !== "file,carrier,tracking_number,expected_state,note") {
    throw new Error(`labels.csv, řádek ${header?.line ?? 1}: neplatná hlavička.`);
  }
  const labels: LabelRow[] = [];
  for (const row of rows) {
    const [file, carrier, trackingNumber, expectedState, note] = row.cells;
    if (row.cells.length !== 5 || !file || !carrier || !trackingNumber || expectedState === undefined || note === undefined) {
      throw csvError(row.line);
    }
    labels.push({ file, carrier, trackingNumber, expectedState: readState(expectedState, row.line), note });
  }
  return labels;
}
