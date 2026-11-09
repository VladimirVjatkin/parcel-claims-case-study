// Offline vyhodnocení uložených odpovědí: formální kontrola, předem daný práh a podrobný report.
// Dodatečné analýzy a v2 se připojují za v1; modely se zde nevolají a odmítnutí se neslučují s UNKNOWN.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { evaluatePages, errorImpact } from "../../src/eval/evaluatePages.js";
import type { EvaluationResult } from "../../src/eval/evaluatePages.js";
import { readLabels } from "../../src/eval/labels.js";
import { addTable } from "../../src/report/markdown.js";
import { checkAnswer, isExhausted, loadModels, loadSlots, object, readSavedSlots } from "./llm.js";
import type { CheckedAnswer, Model, SavedSlot } from "./llm.js";
import { CHECK_MOMENT_LINE, EXPERIMENT_FETCH_MOMENT, PROMPT_VERSION, V2_EXPERIMENT } from "./prompt.js";

export interface Observation extends SavedSlot { answer: CheckedAnswer | null }
export interface Metrics {
  complete: boolean; valid: number; correctOriginal: number; correctMutated: number;
  falseDelivered: number; rawFalseDelivered: number; useful: number; stable: number;
}
export function observe(item: SavedSlot): Observation {
  if (item.invalid.length > 0 || item.attempts.length === 0) return { ...item, answer: null };
  const success = item.attempts.find((attempt) => attempt.status === "ok");
  if (success === undefined) {
    // Samotné omezení počtu požadavků poskytovatelem znamená chybějící data, ne odmítnutí modelu.
    const modelAttempt = item.attempts.some((attempt) => attempt.httpStatus !== 429);
    return { ...item, answer: isExhausted(item.attempts) && modelAttempt ? checkAnswer(null, null, item.slot.input) : null };
  }
  const choices = object(success.response).choices;
  const choice = object(Array.isArray(choices) ? choices[0] : null);
  return { ...item, answer: checkAnswer(object(choice.message).content, choice.finish_reason, item.slot.input) };
}

export function calculateMetrics(items: Observation[], expectedPages = 26): Metrics {
  const result: Metrics = { complete: items.length === expectedPages * 3, valid: 0, correctOriginal: 0, correctMutated: 0,
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
  if (original !== 60 || pages.size !== expectedPages) result.complete = false;
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
export const PRIMARY_THRESHOLDS = { valid: 75, correctOriginal: 54, useful: 4, stable: 24 };
// Při dodatečném vyřazení jedné stránky se zachovává počet dovolených chyb.
export const SECONDARY_THRESHOLDS = { valid: 72, correctOriginal: 54, useful: 3, stable: 23 };
export function thresholdStatus(metrics: Metrics, thresholds = PRIMARY_THRESHOLDS): string {
  if (!metrics.complete) return "nedostatek dat";
  return metrics.falseDelivered === 0 && metrics.valid >= thresholds.valid && metrics.correctOriginal >= thresholds.correctOriginal && metrics.useful >= thresholds.useful && metrics.stable >= thresholds.stable ? "splněno" : "nesplněno";
}

function cost(items: Observation[]): string {
  let known = 0; let unknown = 0;
  if (items.every((item) => item.attempts.length === 0 && item.invalid.length === 0)) return "—";
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
  lines.push("", "Pokusy s HTTP 429 se do limitu 3 nezapočítávají (upřesněno během sběru, před vyhodnocením).", "");
  const rateLimits: string[][] = [];
  for (const model of models) {
    const count = observations.filter((item) => item.slot.model.id === model.id)
      .reduce((sum, item) => sum + item.attempts.filter((attempt) => attempt.httpStatus === 429).length, 0);
    rateLimits.push([model.label, String(count)]);
  }
  addTable(lines, ["Model", "Pokusy HTTP 429"], rateLimits);
  for (const model of models) {
    const missing = observations.filter((item) => item.slot.model.id === model.id && item.invalid.length === 0 &&
      isExhausted(item.attempts) && item.attempts.every((attempt) => attempt.httpStatus === 429));
    if (missing.length > 0) {
      const noun = missing.length === 1 ? "slot" : missing.length <= 4 ? "sloty" : "slotů";
      lines.push("", `${model.label}: ${missing.length} ${noun} bez odpovědi, všech 10 pokusů skončilo omezením poskytovatele (HTTP 429); jde o chybu sběru, ne modelu, práh proto nelze vyhodnotit.`);
    }
  }
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

export function formatAdditionalAnalysis(v1: SavedSlot[], v2: SavedSlot[], models: Model[]): string {
  const first = v1.map(observe);
  const second = v2.map(observe);
  const lines = ["", "## Sekundární analýza v1 bez PN55100901 (doplněno po vyhodnocení)", "",
    "Doplněno po vyhodnocení; nenahrazuje hlavní výsledek.",
    "Vstup H; stejné počty dovolených chyb jako ve v1: falešná DELIVERED 0; validní ≥ 72/75 (nejvýše 3 chyby); přesnost ≥ 54/60; užitečná ≥ 3/5 (nejvýše 2 chyby); stabilní ≥ 23/25 (nejvýše 2 chyby). Chybějící údaje znamenají nedostatek dat.", ""];
  const secondary = models.map((model) => {
    const items = first.filter((item) => item.slot.model.id === model.id && item.slot.variant === "H" &&
      !(item.slot.set === "mutated" && item.slot.label.file === "PN55100901.html"));
    const metrics = calculateMetrics(items, 25);
    return [model.label, String(metrics.falseDelivered), `${metrics.valid}/75`, `${metrics.correctOriginal}/60`,
      `${metrics.useful}/5`, `${metrics.stable}/25`, thresholdStatus(metrics, SECONDARY_THRESHOLDS)];
  });
  const gateHeaders = ["Model", "Falešná DELIVERED", "Validní", "Přesnost", "Užitečná", "Stabilní", "Práh"];
  addTable(lines, gateHeaders, secondary);
  lines.push("", "## Prompt v2: okamžik kontroly", "",
    "Prompt v2 vznikl po prvním vyhodnocení; mění jedinou proměnnou (okamžik kontroly). Nejde o nezávislé ověření.",
    "Změněné stránky jsou datovány po okamžiku běhu (2. 11. 2026 07:30; např. „Stav k 3. 11. 2026 06:00“). Jako okamžik stažení sady experimentu se proto pro model i parser používá 3. 11. 2026 07:30; rozhodování a měření parserů zůstávají na 2. 11. 2026 07:30.",
    `Jediný přidaný řádek v user zprávě: ${CHECK_MOMENT_LINE}`,
    "System prompt, příklady, konfigurace, kontrola citace pouze proti stránce a práh jsou stejné jako ve v1. Vstup H, 26 stránek, 3 běhy, 156 slotů v2.", "");
  const pairs: { name: string; items: Observation[] }[] = [];
  for (const model of models.filter((model) => V2_EXPERIMENT.models?.includes(model.id))) {
    pairs.push({ name: `${model.label} v1`, items: first.filter((item) => item.slot.model.id === model.id && item.slot.variant === "H") });
    pairs.push({ name: `${model.label} v2`, items: second.filter((item) => item.slot.model.id === model.id && item.slot.variant === "H") });
  }
  lines.push("### Práh (vstup H)", "");
  addTable(lines, gateHeaders, pairs.map(({ name, items }) => {
    const metrics = calculateMetrics(items);
    return [name, String(metrics.falseDelivered), `${metrics.valid}/78`, `${metrics.correctOriginal}/60`,
      `${metrics.useful}/6`, `${metrics.stable}/26`, thresholdStatus(metrics)];
  }));
  lines.push("", "### Souhrn", "");
  addTable(lines, ["Model / vstup H", "Správně původní", "Správně změněné", "Falešná D (surová / po kontrole)",
    "NO_ANSWER", "INVALID_JSON", "INVALID_STATE", "QUOTE_NOT_FOUND", "Neúspěšné pokusy", "Cena USD", "Medián ms", "Skutečný poskytovatel"], pairs.map(({ name, items }) => {
    const metrics = calculateMetrics(items);
    const failures = ["NO_ANSWER", "INVALID_JSON", "INVALID_STATE", "QUOTE_NOT_FOUND"].map((outcome) => String(items.filter((item) => item.answer?.outcome === outcome).length));
    return [name, `${metrics.correctOriginal}/60`, `${metrics.correctMutated}/18`, `${metrics.rawFalseDelivered} / ${metrics.falseDelivered}`, ...failures,
      String(items.reduce((sum, item) => sum + item.attempts.filter((attempt) => attempt.status === "failed").length, 0)), cost(items), median(items), providers(items)];
  }));
  const result = (item: Observation | undefined): string => item?.answer?.state ?? item?.answer?.outcome ?? "chybí";
  const selected = models.filter((model) => V2_EXPERIMENT.models?.includes(model.id));
  lines.push("", "### PN55100901", "");
  addTable(lines, ["Model", "Běh", "v1 → v2"], selected.flatMap((model) => [1, 2, 3].map((run) => {
    const match = (item: Observation): boolean => item.slot.model.id === model.id && item.slot.variant === "H" &&
      item.slot.set === "mutated" && item.slot.label.file === "PN55100901.html" && item.slot.run === run;
    return [model.label, String(run), `${result(first.find(match))} → ${result(second.find(match))}`];
  })));
  lines.push("", "### Změny na ostatních 25 stránkách", "");
  const changes: string[][] = [];
  for (const item of second) {
    if (item.slot.label.file === "PN55100901.html" || item.answer === null) continue;
    const previous = first.find(({ slot }) => slot.model.id === item.slot.model.id && slot.variant === "H" &&
      slot.set === item.slot.set && slot.label.file === item.slot.label.file && slot.run === item.slot.run);
    if (result(previous) !== result(item)) changes.push([`${item.slot.set}/${item.slot.label.file}`, item.slot.model.label,
      String(item.slot.run), `${result(previous)} → ${result(item)}`]);
  }
  if (changes.length > 0) addTable(lines, ["Soubor", "Model", "Běh", "v1 → v2"], changes);
  else lines.push(second.every((item) => item.answer !== null) ? "Žádné změny výsledků." : "Porovnání je neúplné; u dostupných odpovědí nebyly nalezeny změny výsledků.");
  const found = second.filter((item) => item.attempts.length > 0).length;
  const evaluated = second.filter((item) => item.answer !== null).length;
  lines.push("", `Úplnost v2: ${found}/${second.length} slotů s pokusem, ${evaluated}/${second.length} vyhodnocených.`,
    `Cena v2 (všechny pokusy): ${cost(second)}.`,
    `Pokusy HTTP 429 ve v2: ${second.reduce((sum, item) => sum + item.attempts.filter((attempt) => attempt.httpStatus === 429).length, 0)}.`);
  return lines.join("\n") + "\n";
}

function main(): void {
  const { values } = parseArgs({ options: { out: { type: "string" } }, strict: true, allowPositionals: false });
  const baseline = (dir: string): EvaluationResult => evaluatePages(readLabels(join(dir, "labels.csv")), (file) => readFileSync(join(dir, file), "utf8"), new Date(EXPERIMENT_FETCH_MOMENT));
  const v1 = readSavedSlots(loadSlots());
  const v2 = readSavedSlots(loadSlots(".", V2_EXPERIMENT), ".", V2_EXPERIMENT);
  const models = loadModels();
  const report = formatLlmReport(v1, baseline("data/tracking"), baseline("experiments/llm/mutated"), models) + formatAdditionalAnalysis(v1, v2, models);
  if (values.out !== undefined) { mkdirSync(dirname(values.out), { recursive: true }); writeFileSync(values.out, report, "utf8"); }
  process.stdout.write(report);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Chyba: ${error instanceof Error ? error.message : "Vyhodnocení selhalo."}`); process.exitCode = 1; }
}
