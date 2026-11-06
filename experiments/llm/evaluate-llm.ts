import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { evaluatePages, errorImpact } from "../../src/eval/evaluatePages.js";
import type { EvaluationResult } from "../../src/eval/evaluatePages.js";
import { readLabels } from "../../src/eval/labels.js";
import { addTable } from "../../src/report/markdown.js";
import { checkAnswer, loadModels, loadSlots, object, readSavedSlots } from "./llm.js";
import type { CheckedAnswer, Model, SavedSlot } from "./llm.js";
import { PROMPT_VERSION } from "./prompt.js";

export interface Observation extends SavedSlot { answer: CheckedAnswer | null }
export interface Metrics {
  complete: boolean; valid: number; correctOriginal: number; correctMutated: number;
  falseDelivered: number; rawFalseDelivered: number; useful: number; stable: number;
}
export function observe(item: SavedSlot): Observation {
  if (item.invalid.length > 0 || item.attempts.length === 0) return { ...item, answer: null };
  const success = item.attempts.find((attempt) => attempt.status === "ok");
  if (success === undefined) return { ...item, answer: checkAnswer(null, null, item.slot.input) };
  const choices = object(success.response).choices;
  const choice = object(Array.isArray(choices) ? choices[0] : null);
  return { ...item, answer: checkAnswer(object(choice.message).content, choice.finish_reason, item.slot.input) };
}

export function calculateMetrics(items: Observation[]): Metrics {
  const result: Metrics = { complete: items.length === 78, valid: 0, correctOriginal: 0, correctMutated: 0,
    falseDelivered: 0, rawFalseDelivered: 0, useful: 0, stable: 0 };
  const pages = new Map<string, Observation[]>();
  let original = 0;
  for (const item of items) {
    const { slot, answer } = item;
    if (slot.set === "original") original += 1;
    if (answer === null || item.invalid.length > 0) result.complete = false;
    if (answer?.outcome === "OK") {
      result.valid += 1;
      if (answer.state === slot.label.expectedState) {
        if (slot.set === "original") result.correctOriginal += 1; else result.correctMutated += 1;
      }
      if (answer.state === "DELIVERED" && slot.label.expectedState !== "DELIVERED") result.falseDelivered += 1;
    }
    if (answer?.rawState === "DELIVERED" && slot.label.expectedState !== "DELIVERED") result.rawFalseDelivered += 1;
    const key = `${slot.set}/${slot.label.file}`;
    const group = pages.get(key) ?? [];
    group.push(item);
    pages.set(key, group);
  }
  if (original !== 60 || pages.size !== 26) result.complete = false;
  for (const group of pages.values()) {
    if (group.length !== 3 || new Set(group.map((item) => item.slot.run)).size !== 3) result.complete = false;
    const signatures = group.map((item) => item.answer === null ? "MISSING" : `${item.answer.outcome}:${item.answer.state ?? ""}`);
    if (group.length === 3 && !signatures.includes("MISSING") && new Set(signatures).size === 1) result.stable += 1;
    if (group[0]?.slot.set === "mutated" && group.filter((item) => item.answer?.outcome === "OK" && item.answer.state === item.slot.label.expectedState).length >= 2) {
      result.useful += 1;
    }
  }
  return result;
}
export function thresholdStatus(metrics: Metrics): string {
  if (!metrics.complete) return "nedostatek dat";
  return metrics.falseDelivered === 0 && metrics.valid >= 75 && metrics.correctOriginal >= 54 && metrics.useful >= 4 && metrics.stable >= 24 ? "splněno" : "nesplněno";
}

function cost(items: Observation[]): string {
  let known = 0; let unknown = 0;
  for (const item of items) unknown += item.invalid.length;
  for (const item of items) for (const attempt of item.attempts) {
    const value = object(object(attempt.response).usage).cost;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) known += value; else unknown += 1;
  }
  const amount = known.toFixed(6);
  return unknown > 0 ? `≥ ${amount} USD, ${unknown} pokusů s neznámou cenou` : `${amount} USD`;
}
function median(items: Observation[]): string {
  const values: number[] = [];
  for (const item of items) for (const attempt of item.attempts) values.push(attempt.latencyMs);
  values.sort((a, b) => a - b);
  if (values.length === 0) return "—";
  const middle = Math.floor(values.length / 2);
  return String(values.length % 2 ? values[middle] : (Number(values[middle - 1]) + Number(values[middle])) / 2);
}
function providers(items: Observation[]): string {
  const values = new Set<string>();
  for (const item of items) for (const attempt of item.attempts) {
    const provider = object(attempt.response).provider;
    if (attempt.status === "ok") values.add(typeof provider === "string" ? provider : "neuvedeno");
  }
  return [...values].sort().join(", ") || "—";
}
const SYMBOL = { DELIVERED: "D", IN_TRANSIT: "T", RETURNING: "R", UNKNOWN: "U" };

export function formatLlmReport(saved: SavedSlot[], original: EvaluationResult, mutated: EvaluationResult, models: Model[]): string {
  const observations = saved.map(observe).sort((a, b) => {
    const key = (item: Observation): string => `${item.slot.set}/${item.slot.label.file}/${item.slot.model.id}/${item.slot.variant}/${item.slot.run}`;
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
  const parserPages = [...original.pages, ...mutated.pages];
  const parserFalse = parserPages.filter((page) => page.predicted === "DELIVERED" && page.expected !== "DELIVERED").length;
  const lines = ["# Experiment s jazykovými modely", "", "## Metodika", "",
    `Verze promptu: ${PROMPT_VERSION}; 20 původních a 6 změněných stránek, vstupy T/H, 3 běhy, temperature 0.`,
    "Hostované váhy přes OpenRouter; lokální nasazení vyžaduje nové ověření.",
    "Prompt byl napsán po prohlédnutí původních stránek; nejde o nezávislé měření.",
    "Výsledky po formální kontrole: citace z jiného bloku stránky může projít, význam citace se tím nepotvrzuje.",
    "Práh pro H byl stanoven před spuštěním: 0 falešných DELIVERED, alespoň 75/78 OK, 54/60 správně, 4/6 užitečných a 24/26 stabilních stránek.",
    "Odmítnutí jsou samostatné výsledky, zůstávají ve jmenovateli a nenahrazují správné UNKNOWN."];
  const any = observations.some((item) => item.attempts.length > 0 || item.invalid.length > 0);
  if (any) {
    lines.push("", "## Práh (vstup H)", "");
    const rows: string[][] = [];
    for (const model of models) {
      const metrics = calculateMetrics(observations.filter((item) => item.slot.model.id === model.id && item.slot.variant === "H"));
      rows.push([model.label, String(metrics.falseDelivered), `${metrics.valid}/78`, `${metrics.correctOriginal}/60`, `${metrics.useful}/6`, `${metrics.stable}/26`, thresholdStatus(metrics)]);
    }
    addTable(lines, ["Model", "Falešná DELIVERED", "Validní", "Přesnost", "Užitečná", "Stabilní", "Práh"], rows);
  }
  lines.push("", "## Souhrn", "");
  const rows: string[][] = [["Parser", `${original.pages.filter((page) => page.expected === page.predicted).length}/20`,
    `${mutated.pages.filter((page) => page.expected === page.predicted).length}/6`, `${parserFalse} / ${parserFalse}`, "—", "—", "—", "—", "—", "—", "—", "—"]];
  const pairs: { model: Model; variant: "T" | "H"; items: Observation[] }[] = [];
  for (const model of models) for (const variant of ["T", "H"] as const) {
    const items = observations.filter((item) => item.slot.model.id === model.id && item.slot.variant === variant);
    pairs.push({ model, variant, items });
    if (!any) continue;
    const metrics = calculateMetrics(items);
    const failures = ["NO_ANSWER", "INVALID_JSON", "INVALID_STATE", "QUOTE_NOT_FOUND"].map((outcome) => String(items.filter((item) => item.answer?.outcome === outcome).length));
    const failedAttempts = items.reduce((sum, item) => sum + item.attempts.filter((attempt) => attempt.status === "failed").length, 0);
    rows.push([`${model.label} (${model.sizeClass}, ${variant})`, `${metrics.correctOriginal}/60`, `${metrics.correctMutated}/18`,
      `${metrics.rawFalseDelivered} / ${metrics.falseDelivered}`, ...failures, String(failedAttempts), cost(items), median(items), providers(items)]);
  }
  addTable(lines, ["Model / vstup", "Správně původní", "Správně změněné", "Falešná D (surová / po kontrole)",
    "NO_ANSWER", "INVALID_JSON", "INVALID_STATE", "QUOTE_NOT_FOUND", "Neúspěšné pokusy", "Cena USD", "Medián ms", "Skutečný poskytovatel"], rows);
  if (!any) lines.push("", "Odpovědi modelů zatím nejsou uložené.");
  else {
    lines.push("", "## Změněné stránky", "");
    const changedRows: string[][] = [];
    for (const page of mutated.pages) {
      const values = [page.file, page.expected, page.predicted];
      for (const pair of pairs) {
        let symbols = "";
        for (let run = 1; run <= 3; run += 1) {
          const answer = pair.items.find((item) => item.slot.set === "mutated" && item.slot.label.file === page.file && item.slot.run === run)?.answer;
          symbols += !answer ? "-" : answer.state === null ? "x" : SYMBOL[answer.state];
        }
        values.push(symbols);
      }
      changedRows.push(values);
    }
    addTable(lines, ["Soubor", "Štítek", "Parser", ...pairs.map((pair) => `${pair.model.label} ${pair.variant}`)], changedRows);
    lines.push("", "## Chyby", "");
    const errors: string[][] = [];
    for (const item of observations) {
      const { answer, slot } = item;
      if (answer === null) continue;
      const falseDelivered = (answer.rawState === "DELIVERED" || answer.state === "DELIVERED") && slot.label.expectedState !== "DELIVERED";
      if (!falseDelivered && !(slot.set === "mutated" && answer.state !== slot.label.expectedState)) continue;
      errors.push([`${slot.set}/${slot.label.file}`, slot.model.label, slot.variant, String(slot.run), slot.label.expectedState,
        answer.state ?? answer.outcome, answer.state === null ? "odmítnutí" : errorImpact(slot.label.expectedState, answer.state) ?? "—", Array.from(answer.quote).slice(0, 120).join("")]);
    }
    if (errors.length === 0) lines.push("Žádné uvedené chyby.");
    else addTable(lines, ["Soubor", "Model", "Vstup", "Běh", "Štítek", "Výsledek", "Dopad", "Citace"], errors);
  }
  const found = observations.filter((item) => item.attempts.length > 0 || item.invalid.length > 0).length;
  const invalid = observations.filter((item) => item.invalid.length > 0).length;
  lines.push("", "## Úplnost", "");
  addTable(lines, ["Očekáváno", "Nalezeno", "Chybí", "Neplatné sloty"], [[String(saved.length), String(found), String(saved.length - found), String(invalid)]]);
  if (invalid) lines.push("", "Nekompatibilní záznamy: práh příslušné dvojice nelze vyhodnotit.");
  return lines.join("\n") + "\n";
}

function main(): void {
  const { values } = parseArgs({ options: { out: { type: "string" } }, strict: true, allowPositionals: false });
  const baseline = (dir: string): EvaluationResult => evaluatePages(readLabels(join(dir, "labels.csv")), (file) => readFileSync(join(dir, file), "utf8"));
  const report = formatLlmReport(readSavedSlots(loadSlots()), baseline("data/tracking"), baseline("experiments/llm/mutated"), loadModels());
  if (values.out !== undefined) { mkdirSync(dirname(values.out), { recursive: true }); writeFileSync(values.out, report, "utf8"); }
  process.stdout.write(report);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Chyba: ${error instanceof Error ? error.message : "Vyhodnocení selhalo."}`); process.exitCode = 1; }
}
