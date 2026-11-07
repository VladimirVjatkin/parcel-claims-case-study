import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RUN_MOMENT } from "../../src/config.js";
import { evaluatePages } from "../../src/eval/evaluatePages.js";
import { readLabels } from "../../src/eval/labels.js";
import { collectionPlan, collectSlots, validateSaved } from "../../experiments/llm/collect.js";
import { calculateMetrics, formatAdditionalAnalysis, formatLlmReport, observe, SECONDARY_THRESHOLDS, thresholdStatus } from "../../experiments/llm/evaluate-llm.js";
import type { Metrics } from "../../experiments/llm/evaluate-llm.js";
import { attemptPath, buildRequestBody, checkAnswer, currentConfig, loadModels, loadSlots, readSavedSlots } from "../../experiments/llm/llm.js";
import type { Attempt, SavedSlot, Slot } from "../../experiments/llm/llm.js";
import { buildMessages, buildMessagesV2, CHECK_MOMENT_LINE, EXPERIMENT_FETCH_MOMENT, PROMPT_VERSION, V1_EXPERIMENT, V2_EXPERIMENT } from "../../experiments/llm/prompt.js";
import type { Experiment } from "../../experiments/llm/prompt.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const slots = loadSlots(root, V2_EXPERIMENT);
const slot = slots[0] as Slot;
const models = loadModels(root).filter((model) => V2_EXPERIMENT.models?.includes(model.id));
const baseline = (dir: string) => evaluatePages(readLabels(join(dir, "labels.csv")), (file) => readFileSync(join(dir, file), "utf8"));
const original = baseline(join(root, "data/tracking"));
const mutated = baseline(join(root, "experiments/llm/mutated"));
const temporaryRoot = resolve(tmpdir());
let work: string;
beforeEach(() => { work = mkdtempSync(join(temporaryRoot, "mailstep-v2-test-")); });
afterEach(() => {
  const target = resolve(work);
  if (dirname(target) !== temporaryRoot || !basename(target).startsWith("mailstep-v2-test-")) throw new Error("Neplatná cesta testu.");
  rmSync(target, { recursive: true, force: true });
});
function attempt(value: Slot, version = "v2"): Attempt {
  return { status: "ok", promptVersion: version, inputSha256: value.inputSha256, config: currentConfig(value.model),
    set: value.set, file: value.label.file, variant: value.variant, run: value.run, attempt: 1,
    collectedAt: "2026-11-07T12:00:00Z", latencyMs: 100, httpStatus: 200, error: null,
    response: { provider: value.model.providerName, usage: { cost: 0.001 }, choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify({ state: value.label.expectedState, quote: value.input.slice(0, 40), reason: "test" }),
    } }] } };
}
function fixture(version: string): SavedSlot[] {
  return slots.map((slot) => ({ slot, attempts: [attempt(slot, version)], invalid: [] }));
}
function persist(value: Attempt, experiment: Experiment): void {
  const path = join(work, attemptPath(value.set, slot.model.id, value.variant, value.file, value.run, value.attempt, experiment));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

describe("fixed v2 experiment", () => {
  it("changes only the final user message by the exact frozen moment line", () => {
    expect(PROMPT_VERSION).toBe("v1");
    expect(EXPERIMENT_FETCH_MOMENT).toBe("2026-11-03T07:30:00+01:00");
    expect(DEFAULT_RUN_MOMENT).toBe("2026-11-02T07:30:00+01:00");
    expect(CHECK_MOMENT_LINE).toBe("Check moment: 3. 11. 2026 07:30 (Europe/Prague). An event or update dated after this moment does not confirm the parcel state.");
    const v1 = buildMessages("Expedo", "A1", "page");
    const v2 = buildMessagesV2("Expedo", "A1", "page");
    expect(v2.slice(0, 5)).toEqual(v1.slice(0, 5));
    expect(v2[5]).toEqual({ role: "user", content: `${CHECK_MOMENT_LINE}\n${v1[5]?.content}` });
    expect(buildMessages("Expedo", "A1", "page")).toEqual(v1);
    const body = buildRequestBody(slot.model, v1);
    expect(buildRequestBody(slot.model, v2)).toEqual({ ...body, messages: v2 });
  });
  it("plans exactly two fixed models, H only, 26 pages and three runs", () => {
    expect(slots).toHaveLength(156);
    expect(new Set(slots.map((slot) => slot.model.id))).toEqual(new Set(["openai/gpt-oss-120b", "meta-llama/llama-3.3-70b-instruct"]));
    expect(new Set(slots.map((slot) => slot.variant))).toEqual(new Set(["H"]));
    expect(new Set(slots.map((slot) => slot.run))).toEqual(new Set([1, 2, 3]));
    expect(collectionPlan(slots.map((slot) => ({ slot, attempts: [], invalid: [] })))).toEqual({ total: 156, closed: 0, open: 156, exhausted: 0, failed: 0 });
  });
  it("rejects the moment line as a quote because it is outside the page", () => {
    expect(checkAnswer(JSON.stringify({ state: "UNKNOWN", quote: CHECK_MOMENT_LINE }), "stop", slot.input).outcome).toBe("QUOTE_NOT_FOUND");
  });
  it.each([V1_EXPERIMENT, V2_EXPERIMENT])("rejects a foreign prompt version in $responseDir before collection", async (experiment) => {
    const wrong = experiment.version === "v1" ? "v2" : "v1";
    persist(attempt(slot, wrong), experiment);
    const saved = readSavedSlots([slot], work, experiment);
    expect(saved[0]?.invalid).toHaveLength(1);
    expect(() => validateSaved(saved)).toThrow("Nekompatibilní");
    let calls = 0;
    await expect(collectSlots(saved, "test-secret", async () => { calls += 1; return new Response("{}"); }, work,
      undefined, undefined, experiment)).rejects.toThrow("Nekompatibilní");
    expect(calls).toBe(0);
  });
  it.each(["input", "config"])("rejects incompatible v2 %s metadata", (field) => {
    const value = attempt(slot);
    if (field === "input") value.inputSha256 = "changed"; else value.config.temperature = 1;
    persist(value, V2_EXPERIMENT);
    expect(() => collectionPlan(readSavedSlots([slot], work, V2_EXPERIMENT))).toThrow("Nekompatibilní");
  });
  it("writes v2 only to responses-v2 with unchanged page hash and routing", async () => {
    const saved: SavedSlot[] = [{ slot, attempts: [], invalid: [] }];
    const counts = await collectSlots(saved, "test-secret", async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual(buildRequestBody(slot.model, buildMessagesV2(slot.label.carrier, slot.label.trackingNumber, slot.input)));
      return new Response(JSON.stringify(attempt(slot).response));
    }, work, undefined, undefined, V2_EXPERIMENT);
    expect(counts.ok).toBe(1);
    const loaded = readSavedSlots([slot], work, V2_EXPERIMENT);
    expect(loaded[0]?.attempts[0]).toMatchObject({ promptVersion: "v2", inputSha256: slot.inputSha256, config: currentConfig(slot.model) });
    expect(readSavedSlots([slot], work)[0]?.attempts).toEqual([]);
  });
  it("refuses a model or input variant outside the fixed v2 set", async () => {
    for (const other of [{ ...slot, variant: "T" as const }, { ...slot, model: loadModels(root)[0] as Slot["model"] }]) {
      await expect(collectSlots([{ slot: other, attempts: [], invalid: [] }], "test-secret", async () => { throw new Error("Must not fetch"); }, work,
        undefined, undefined, V2_EXPERIMENT)).rejects.toThrow("Nekompatibilní sada");
    }
  });
});

describe("secondary analysis and comparison report", () => {
  const passing: Metrics = { complete: true, valid: 72, correctOriginal: 54, correctMutated: 9, falseDelivered: 0, rawFalseDelivered: 0, useful: 3, stable: 23 };
  it.each([
    ["valid", 71], ["correctOriginal", 53], ["useful", 2], ["stable", 22], ["falseDelivered", 1],
  ] as const)("applies the secondary integer boundary for %s", (field, below) => {
    expect(thresholdStatus(passing, SECONDARY_THRESHOLDS)).toBe("splněno");
    expect(thresholdStatus({ ...passing, [field]: below }, SECONDARY_THRESHOLDS)).toBe("nesplněno");
  });
  it("computes 75-slot completeness without PN55100901, preserving missing-data handling", () => {
    const items = fixture("v1").filter((item) => item.slot.model.id === slot.model.id && item.slot.label.file !== "PN55100901.html");
    expect(calculateMetrics(items.map(observe), 25)).toMatchObject({ complete: true, valid: 75, correctOriginal: 60, useful: 5, stable: 25 });
    const first = items[0] as SavedSlot;
    first.attempts = [];
    expect(thresholdStatus(calculateMetrics(items.map(observe), 25), SECONDARY_THRESHOLDS)).toBe("nedostatek dat");
  });
  it("appends comparisons without rewriting v1, and shows absent v2 as missing", () => {
    const v1 = fixture("v1");
    const v2 = fixture("v2").map((item) => ({ ...item, attempts: [] }));
    const primary = formatLlmReport(v1, original, mutated, models);
    const extra = formatAdditionalAnalysis(v1, v2, models);
    expect((primary + extra).startsWith(primary)).toBe(true);
    expect(extra).toContain("Doplněno po vyhodnocení; nenahrazuje hlavní výsledek.");
    expect(extra).toContain("Nejde o nezávislé ověření.");
    expect(extra).toContain("gpt-oss 120B v2 | 0 | 0/78 | 0/60 | 0/6 | 0/26 | nedostatek dat");
    expect(extra).toContain("Cena v2 (všechny pokusy): —.");
    expect(extra).toBe(formatAdditionalAnalysis([...v1].reverse(), v2, models));
  });
  it("shows PN55100901 separately and lists changes on other pages with v2 cost", () => {
    const v1 = fixture("v1"); const v2 = fixture("v2");
    const future = v1.find((item) => item.slot.label.file === "PN55100901.html") as SavedSlot;
    const other = v2[0] as SavedSlot;
    future.attempts[0] = { ...attempt(future.slot, "v1"), response: { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ state: "DELIVERED", quote: future.slot.input.slice(0, 40) }) } }] } };
    other.attempts[0] = { ...attempt(other.slot), response: { usage: { cost: 0.001 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ state: "UNKNOWN", quote: other.slot.input.slice(0, 40) }) } }] } };
    const report = formatAdditionalAnalysis(v1, v2, models);
    expect(report).toContain("| gpt-oss 120B | 1 | DELIVERED → UNKNOWN |");
    expect(report).toContain(`| ${other.slot.set}/${other.slot.label.file} | gpt-oss 120B | 1 | IN_TRANSIT → UNKNOWN |`);
    expect(report).toContain("Cena v2 (všechny pokusy): 0.156000 USD.");
  });
});
