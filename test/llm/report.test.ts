import { EXPERIMENT_FETCH_MOMENT as PARSER_REFERENCE_MOMENT } from "../../experiments/llm/prompt.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateMetrics, formatLlmReport, observe, thresholdStatus } from "../../experiments/llm/evaluate-llm.js";
import type { Metrics } from "../../experiments/llm/evaluate-llm.js";
import { currentConfig, loadModels, sha256 } from "../../experiments/llm/llm.js";
import type { Attempt, Model, SavedSlot, Slot } from "../../experiments/llm/llm.js";
import { PROMPT_VERSION } from "../../experiments/llm/prompt.js";
import { evaluatePages } from "../../src/eval/evaluatePages.js";
import { readLabels } from "../../src/eval/labels.js";
import type { TrackingState } from "../../src/tracking/types.js";

const REFERENCE_MOMENT = new Date(PARSER_REFERENCE_MOMENT);

const root = fileURLToPath(new URL("../../", import.meta.url));
const model = loadModels(root)[0] as Model;
const baseline = (dir: string) => evaluatePages(readLabels(join(dir, "labels.csv")), (file) => readFileSync(join(dir, file), "utf8"), REFERENCE_MOMENT);
const original = baseline(join(root, "data/tracking"));
const mutated = baseline(join(root, "experiments/llm/mutated"));
function response(state: TrackingState, quote = "Na cestě"): unknown {
  return { provider: model.providerName, usage: { cost: 0.001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ state, quote }) } }] };
}
function fullSet(): SavedSlot[] {
  const saved: SavedSlot[] = [];
  for (let page = 0; page < 26; page += 1) for (let run = 1; run <= 3; run += 1) {
    const changed = page >= 20 ? mutated.pages[page - 20] : undefined;
    const slot: Slot = { set: page < 20 ? "original" : "mutated", model, variant: "H", run,
      label: { file: changed?.file ?? `P${page}.html`, carrier: "Expedo", trackingNumber: `P${page}`, expectedState: changed?.expected ?? "IN_TRANSIT", note: "" },
      input: "Na cestě", inputSha256: sha256("Na cestě") };
    const attempt: Attempt = { status: "ok", promptVersion: PROMPT_VERSION, inputSha256: slot.inputSha256, config: currentConfig(model),
      set: slot.set, file: slot.label.file, variant: "H", run, attempt: 1, collectedAt: "2026-11-06T12:00:00Z",
      latencyMs: 100, httpStatus: 200, error: null, response: response(slot.label.expectedState) };
    saved.push({ slot, attempts: [attempt], invalid: [] });
  }
  return saved;
}
function first(items: SavedSlot[]): SavedSlot {
  if (!items[0]) throw new Error("Chybí testovací slot.");
  return items[0];
}
function replaceAnswer(item: SavedSlot, value: unknown): void {
  if (!item.attempts[0]) throw new Error("Chybí testovací pokus.");
  item.attempts[0].response = value;
}
const passing: Metrics = { complete: true, valid: 75, correctOriginal: 54, correctMutated: 12, falseDelivered: 0, rawFalseDelivered: 0, useful: 4, stable: 24 };

describe("predefined integer gates", () => {
  const boundaries: { field: "valid" | "correctOriginal" | "useful" | "stable"; below: number; exact: number }[] = [
    { field: "valid", below: 74, exact: 75 }, { field: "correctOriginal", below: 53, exact: 54 },
    { field: "useful", below: 3, exact: 4 }, { field: "stable", below: 23, exact: 24 },
  ];
  it.each(boundaries)("rejects $field=$below and accepts $exact without rounding", ({ field, below, exact }) => {
    expect(thresholdStatus({ ...passing, [field]: below })).toBe("nesplněno");
    expect(thresholdStatus({ ...passing, [field]: exact })).toBe("splněno");
  });
  it("rejects even one false DELIVERED and defers incomplete data", () => {
    expect(thresholdStatus({ ...passing, falseDelivered: 1 })).toBe("nesplněno");
    expect(thresholdStatus({ ...passing, complete: false })).toBe("nedostatek dat");
  });
});

describe("slot-level offline metrics", () => {
  it("counts 78 responses, 60 original decisions and 26 stable pages", () => {
    const metrics = calculateMetrics(fullSet().map(observe));
    expect(metrics).toEqual({ complete: true, valid: 78, correctOriginal: 60, correctMutated: 18, falseDelivered: 0, rawFalseDelivered: 0, useful: 6, stable: 26 });
    expect(thresholdStatus(metrics)).toBe("splněno");
  });
  it("does not count three OK responses with different states as stable", () => {
    const items = fullSet();
    replaceAnswer(first(items), response("RETURNING"));
    expect(calculateMetrics(items.map(observe)).stable).toBe(25);
  });
  it("counts matching refusals as stable without crediting them as correct UNKNOWN", () => {
    const items = fullSet();
    for (const item of items.filter((item) => item.slot.label.file === "PN55100901.html")) {
      replaceAnswer(item, { choices: [{ finish_reason: "stop", message: { content: "not json" } }] });
    }
    expect(calculateMetrics(items.map(observe))).toMatchObject({ valid: 75, correctMutated: 15, useful: 5, stable: 26 });
  });
  it("marks a missing slot and an incompatible record as insufficient", () => {
    const missing = fullSet(); first(missing).attempts = [];
    expect(thresholdStatus(calculateMetrics(missing.map(observe)))).toBe("nedostatek dat");
    const incompatible = fullSet(); first(incompatible).invalid = ["old-version.json"];
    expect(observe(first(incompatible)).answer).toBeNull();
    expect(thresholdStatus(calculateMetrics(incompatible.map(observe)))).toBe("nedostatek dat");
  });
  it("records only failed attempts as NO_ANSWER", () => {
    const item = first(fullSet());
    const initial = item.attempts[0] as Attempt;
    item.attempts = [1, 2, 3].map((number) => ({ ...initial, attempt: number, status: "failed", response: null }));
    expect(observe(item).answer?.outcome).toBe("NO_ANSWER");
  });
  it("treats rate limits alone as missing data, even after ten attempts", () => {
    const item = first(fullSet()); const initial = item.attempts[0] as Attempt;
    item.attempts = [1, 2, 3].map((number) => ({ ...initial, attempt: number, status: "failed", httpStatus: 429, response: null }));
    expect(observe(item).answer).toBeNull();
    item.attempts = Array.from({ length: 10 }, (_, index) => ({ ...initial, attempt: index + 1, status: "failed", httpStatus: 429, response: null }));
    expect(observe(item).answer).toBeNull();
    expect(thresholdStatus(calculateMetrics([item].map(observe)))).toBe("nedostatek dat");
    item.attempts[9] = { ...initial, attempt: 10, status: "failed", httpStatus: null, response: null };
    expect(observe(item).answer?.outcome).toBe("NO_ANSWER");
  });
  it("separates a raw false DELIVERED from its rejected quote", () => {
    const items = fullSet(); replaceAnswer(first(items), response("DELIVERED", "fabricated"));
    expect(calculateMetrics(items.map(observe))).toMatchObject({ rawFalseDelivered: 1, falseDelivered: 0, valid: 77 });
  });
});

describe("formatLlmReport", () => {
  it("explains exhausted provider-only slots and keeps partial metrics", () => {
    const items = fullSet();
    for (const item of items.slice(0, 4)) {
      const initial = item.attempts[0] as Attempt;
      item.attempts = Array.from({ length: 10 }, (_, index) => ({ ...initial, attempt: index + 1, status: "failed", httpStatus: 429, response: null }));
    }
    const report = formatLlmReport(items, original, mutated, [model]);
    expect(report).toContain(`${model.label}: 4 sloty bez odpovědi, všech 10 pokusů skončilo omezením poskytovatele (HTTP 429); jde o chybu sběru, ne modelu, práh proto nelze vyhodnotit.`);
    expect(report).toContain("74/78 | 56/60 | 6/6 | 24/26 | nedostatek dat");
    expect(report).toContain("| 0 | 0 | 0 | 0 | 40 |");
  });
  it("renders a deterministic pre-experiment report without claiming model results", () => {
    const report = formatLlmReport(fullSet().map((item) => ({ ...item, attempts: [] })), original, mutated, [model]);
    expect(report).toContain("Odpovědi modelů zatím nejsou uložené.");
    expect(report).toContain("| Parser | 20/20 | 1/6 | 0 / 0 |");
    expect(report).toContain("po formální kontrole");
    expect(report).not.toContain("## Práh (vstup H)");
  });
  it("includes the six report sections when responses exist", () => {
    const items = fullSet();
    const report = formatLlmReport(items, original, mutated, [model]);
    for (const title of ["Metodika", "Práh (vstup H)", "Souhrn", "Změněné stránky", "Chyby", "Úplnost"]) expect(report).toContain(`## ${title}`);
    expect(report).toBe(formatLlmReport([...items].reverse(), original, mutated, [model]));
    expect(report).toContain("78/78 | 60/60 | 6/6 | 26/26 | splněno");
    expect(report).toContain("| PN55100901.html | UNKNOWN | UNKNOWN | --- | UUU |");
  });
  it("sums costs of failed attempts too, and labels unknown costs explicitly", () => {
    const items = fullSet(); const item = first(items); const success = item.attempts[0] as Attempt;
    success.attempt = 2; success.response = { ...response("IN_TRANSIT") as object, usage: { cost: 0.3 } };
    const failure: Attempt = { ...success, attempt: 1, status: "failed", response: { usage: { cost: 0.2 } } };
    item.attempts.unshift(failure);
    expect(formatLlmReport(items, original, mutated, [model])).toContain("0.577000 USD");
    failure.response = null;
    expect(formatLlmReport(items, original, mutated, [model])).toContain("≥ 0.377000 USD, 1 pokusů s neznámou cenou");
  });
  it("shows a dash for a pair without attempts and counts HTTP 429 separately", () => {
    const items = fullSet(); const item = first(items); const success = item.attempts[0] as Attempt;
    item.attempts.unshift({ ...success, status: "failed", httpStatus: 429, response: null });
    const report = formatLlmReport(items, original, mutated, [model]);
    const emptyPair = report.split("\n").find((line) => line.startsWith(`| ${model.label} (malý, T)`));
    expect(emptyPair).toContain("| — | — | — |");
    expect(report).toContain(`| ${model.label} | 1 |`);
    expect(report).toContain("Pokusy s HTTP 429 se do limitu 3 nezapočítávají (upřesněno během sběru, před vyhodnocením).");
  });
  it("reports raw and checked false deliveries separately and escapes evidence", () => {
    const items = fullSet(); const item = first(items);
    replaceAnswer(item, response("DELIVERED", "fabricated | quote\nnext"));
    const report = formatLlmReport(items, original, mutated, [model]);
    expect(report).toContain("1 / 0");
    expect(report).toContain("QUOTE_NOT_FOUND");
    expect(report).toContain("fabricated \\| quote next");
  });
});
