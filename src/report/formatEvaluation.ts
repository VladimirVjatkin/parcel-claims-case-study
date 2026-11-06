import type { ErrorImpact, EvaluationResult } from "../eval/evaluatePages.js";
import type { TrackingState } from "../tracking/types.js";
import { addTable } from "./markdown.js";

const STATES: TrackingState[] = ["DELIVERED", "IN_TRANSIT", "RETURNING", "UNKNOWN"];
const IMPACTS: ErrorImpact[] = ["HIDDEN_PROBLEM", "WRONG_COMPLAINT", "EXTRA_REVIEW", "NO_DECISION_IMPACT"];
const IMPACT_MEANING: Record<ErrorImpact, string> = {
  HIDDEN_PROBLEM: "Skrytý problém: chybné potvrzení doručení zabrání reklamaci (nejdražší chyba).",
  WRONG_COMPLAINT: "Nesprávná reklamace nebo založení bez potřebné ruční kontroly.",
  EXTRA_REVIEW: "Zbytečná ruční kontrola (nejlevnější chyba).",
  NO_DECISION_IMPACT: "Záměna RETURNING a UNKNOWN: oba stavy vyžadují ruční kontrolu.",
};

function zeroCounts(): Record<TrackingState, number> {
  return { DELIVERED: 0, IN_TRANSIT: 0, RETURNING: 0, UNKNOWN: 0 };
}

export function formatEvaluation(result: EvaluationResult): string {
  const pages = [...result.pages].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  const carriers = new Map<string, { total: number; correct: number }>();
  const matrix: Record<TrackingState, Record<TrackingState, number>> = {
    DELIVERED: zeroCounts(), IN_TRANSIT: zeroCounts(), RETURNING: zeroCounts(), UNKNOWN: zeroCounts(),
  };
  const impactCounts: Record<ErrorImpact, number> = { HIDDEN_PROBLEM: 0, WRONG_COMPLAINT: 0, EXTRA_REVIEW: 0, NO_DECISION_IMPACT: 0 };
  const errorRows: string[][] = [];
  let correct = 0;
  for (const page of pages) {
    const carrier = carriers.get(page.carrier) ?? { total: 0, correct: 0 };
    carrier.total += 1;
    if (page.expected === page.predicted) { correct += 1; carrier.correct += 1; }
    carriers.set(page.carrier, carrier);
    matrix[page.expected][page.predicted] += 1;
    if (page.impact !== null) {
      impactCounts[page.impact] += 1;
      errorRows.push([page.file, page.carrier, page.expected, page.predicted, page.impact, page.quote]);
    }
  }
  const percent = pages.length === 0 ? 0 : Math.floor(correct * 100 / pages.length);
  const lines = [
    "# Měření čtení tracking stránek", "",
    `Stránek: ${pages.length} · Správně: ${correct} · Chybně: ${pages.length - correct} (${percent} %)`, "",
    "> Stránky byly prohlédnuty při psaní parserů, nejde tedy o nezávislé měření, ale o regresní kontrolu.", "",
    "## Podle dopravce", "",
  ];
  const carrierRows: string[][] = [];
  for (const name of [...carriers.keys()].sort()) {
    const counts = carriers.get(name);
    if (counts !== undefined) carrierRows.push([name, String(counts.total), String(counts.correct)]);
  }
  addTable(lines, ["Dopravce", "Stránek", "Správně"], carrierRows);
  lines.push("", "## Matice záměn (řádky = skutečnost z labels.csv, sloupce = parser)", "");
  const matrixRows: string[][] = [];
  for (const expected of STATES) {
    matrixRows.push([expected, ...STATES.map((predicted) => String(matrix[expected][predicted]))]);
  }
  addTable(lines, ["", ...STATES], matrixRows);
  lines.push("", "## Chyby podle dopadu na rozhodnutí", "",
    "Dopad se hodnotí podle definice B; u definice A vede každý stav kromě DELIVERED k ruční kontrole, nejdražší je tedy i zde falešné DELIVERED.", "");
  const impactRows: string[][] = [];
  for (const impact of IMPACTS) impactRows.push([impact, IMPACT_MEANING[impact], String(impactCounts[impact])]);
  addTable(lines, ["Dopad", "Význam", "Počet"], impactRows);
  lines.push("", "## Chybné stránky", "");
  if (errorRows.length === 0) lines.push("Žádné chyby.");
  else addTable(lines, ["Soubor", "Dopravce", "Skutečnost", "Parser", "Dopad", "Citace"], errorRows);
  return lines.join("\n") + "\n";
}
