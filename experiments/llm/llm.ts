import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import * as cheerio from "cheerio";
import { readLabels } from "../../src/eval/labels.js";
import type { LabelRow } from "../../src/eval/labels.js";
import { normalizeText } from "../../src/tracking/text.js";
import type { TrackingState } from "../../src/tracking/types.js";
import { V1_EXPERIMENT } from "./prompt.js";
import type { Experiment, Message } from "./prompt.js";

export type Variant = "T" | "H";
export type PageSet = "original" | "mutated";
export type AnswerOutcome = "NO_ANSWER" | "INVALID_JSON" | "INVALID_STATE" | "QUOTE_NOT_FOUND" | "OK";
export interface Model {
  id: string; label: string; sizeClass: "malý" | "střední" | "velký"; architecture: string;
  provider: string; providerName: string; quantization: string; reasoning: { effort: "low" } | null; maxTokens: number;
}
export interface CheckedAnswer { outcome: AnswerOutcome; rawState: TrackingState | null; state: TrackingState | null; quote: string }
export interface Config {
  model: string; provider: string; quantization: string; temperature: number; max_tokens: number;
  reasoning: { effort: "low" } | null; responseSchemaSha256: string;
}
export interface Slot { set: PageSet; model: Model; variant: Variant; label: LabelRow; input: string; inputSha256: string; run: number }
export interface Attempt {
  status: "ok" | "failed"; promptVersion: string; inputSha256: string; config: Config;
  set: PageSet; file: string; variant: Variant; run: number; attempt: number;
  collectedAt: string; latencyMs: number; httpStatus: number | null; error: string | null; response: unknown;
}
export interface SavedSlot { slot: Slot; attempts: Attempt[]; invalid: string[] }
export function isExhausted(attempts: Attempt[]): boolean {
  if (attempts.some((attempt) => attempt.status === "ok")) return false;
  return attempts.length >= 10 || attempts.filter((attempt) => attempt.httpStatus !== 429).length >= 3;
}
export const RESPONSE_SCHEMA = {
  type: "object", properties: {
    state: { type: "string", enum: ["DELIVERED", "IN_TRANSIT", "RETURNING", "UNKNOWN"] },
    quote: { type: "string" }, reason: { type: "string" },
  }, required: ["state", "quote", "reason"], additionalProperties: false,
};
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = object(value);
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export function currentConfig(model: Model): Config {
  return { model: model.id, provider: model.provider, quantization: model.quantization, temperature: 0,
    max_tokens: model.maxTokens, reasoning: model.reasoning, responseSchemaSha256: sha256(canonical(RESPONSE_SCHEMA)) };
}
export function loadModels(root = "."): Model[] {
  const values: unknown = JSON.parse(readFileSync(join(root, "experiments/llm/models.json"), "utf8"));
  if (!Array.isArray(values)) throw new Error("models.json musí obsahovat pole.");
  const models: Model[] = [];
  for (const value of values) {
    const row = object(value);
    for (const key of ["id", "label", "architecture", "provider", "providerName", "quantization"]) {
      if (typeof row[key] !== "string" || row[key] === "") throw new Error(`models.json: neplatné ${key}.`);
    }
    if (!/^[\w-]+\/[\w][\w.-]*$/.test(String(row.id)) ||
        !["malý", "střední", "velký"].includes(String(row.sizeClass)) ||
        !Number.isInteger(row.maxTokens) || Number(row.maxTokens) <= 0 ||
        (row.reasoning !== null && object(row.reasoning).effort !== "low")) throw new Error("Neplatná konfigurace modelu.");
    if (models.some((model) => model.id === row.id)) throw new Error("Duplicitní ID modelu.");
    models.push({ id: String(row.id), label: String(row.label), architecture: String(row.architecture),
      sizeClass: row.sizeClass as Model["sizeClass"], provider: String(row.provider), providerName: String(row.providerName),
      quantization: String(row.quantization), reasoning: row.reasoning === null ? null : { effort: "low" }, maxTokens: Number(row.maxTokens) });
  }
  return models;
}
export function buildInput(html: string, variant: Variant): string {
  return variant === "H" ? html : normalizeText(cheerio.load(html)("body").text());
}
export function checkAnswer(content: unknown, finishReason: unknown, input: string): CheckedAnswer {
  const result: CheckedAnswer = { outcome: "NO_ANSWER", rawState: null, state: null, quote: "" };
  if (finishReason === "length" || typeof content !== "string" || content.trim() === "") return result;
  let parsed: unknown;
  try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1")); }
  catch { return { ...result, outcome: "INVALID_JSON" }; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ...result, outcome: "INVALID_JSON" };
  const row = object(parsed);
  if (row.state !== "DELIVERED" && row.state !== "IN_TRANSIT" && row.state !== "RETURNING" && row.state !== "UNKNOWN") {
    return { ...result, outcome: "INVALID_STATE" };
  }
  result.rawState = row.state;
  result.quote = typeof row.quote === "string" ? row.quote : "";
  if (normalizeText(result.quote) === "" || !normalizeText(input).includes(normalizeText(result.quote))) {
    return { ...result, outcome: "QUOTE_NOT_FOUND" };
  }
  return { ...result, outcome: "OK", state: row.state };
}
export function buildRequestBody(model: Model, messages: Message[]): Record<string, unknown> {
  return { model: model.id, messages, temperature: 0, max_tokens: model.maxTokens,
    response_format: { type: "json_schema", json_schema: { name: "parcel_state", strict: true, schema: RESPONSE_SCHEMA } },
    provider: { order: [model.provider], quantizations: [model.quantization], allow_fallbacks: false, require_parameters: true },
    ...(model.reasoning === null ? {} : { reasoning: model.reasoning }), usage: { include: true } };
}
export function attemptPath(set: PageSet, modelId: string, variant: Variant, file: string, run: number, attempt: number, experiment: Experiment = V1_EXPERIMENT): string {
  if (!/^[A-Za-z0-9]+\.html$/.test(file) || !/^[\w-]+\/[\w][\w.-]*$/.test(modelId)) throw new Error("Neplatná cesta odpovědi.");
  return join(experiment.responseDir, set, modelId.replaceAll("/", "__"), variant, `${file.replace(/\.html$/, "")}.${run}.a${attempt}.json`);
}
export function loadSlots(root = ".", experiment: Experiment = V1_EXPERIMENT): Slot[] {
  const slots: Slot[] = [];
  const models = loadModels(root).filter((model) => experiment.models === null || experiment.models.includes(model.id));
  if (experiment.models !== null && models.length !== experiment.models.length) throw new Error("Chybí model experimentu.");
  for (const model of models) for (const set of ["original", "mutated"] as PageSet[]) {
    const dir = set === "original" ? join(root, "data/tracking") : join(root, "experiments/llm/mutated");
    const labels = readLabels(join(dir, "labels.csv"));
    if (labels.length !== (set === "original" ? 20 : 6) || new Set(labels.map((label) => label.file)).size !== labels.length) {
      throw new Error(`Neplatná sada ${set}: počet nebo duplicita stránek.`);
    }
    for (const label of labels) {
      if (!/^[A-Za-z0-9]+\.html$/.test(label.file)) throw new Error("Neplatný název stránky.");
      const html = readFileSync(join(dir, label.file), "utf8");
      for (const variant of experiment.variants) for (let run = 1; run <= 3; run += 1) {
        const input = buildInput(html, variant);
        slots.push({ set, model, variant, label, input, inputSha256: sha256(input), run });
      }
    }
  }
  return slots;
}
export function readSavedSlots(slots: Slot[], root = ".", experiment: Experiment = V1_EXPERIMENT): SavedSlot[] {
  const saved = slots.map((slot): SavedSlot => ({ slot, attempts: [], invalid: [] }));
  const expected = new Map<string, { saved: SavedSlot; number: number }>();
  for (const item of saved) for (let number = 1; number <= 10; number += 1) {
    expected.set(attemptPath(item.slot.set, item.slot.model.id, item.slot.variant, item.slot.label.file, item.slot.run, number, experiment), { saved: item, number });
  }
  const dir = join(root, experiment.responseDir);
  if (!existsSync(dir)) return saved;
  for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" }).sort()) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    const key = relative(root, path);
    const entry = expected.get(key);
    if (entry === undefined) throw new Error(`Neočekávaný soubor odpovědi: ${key}`);
    const slot = entry.saved.slot;
    let row: Record<string, unknown>;
    try { row = object(JSON.parse(readFileSync(path, "utf8"))); } catch { row = {}; }
    if (row.promptVersion !== experiment.version || row.inputSha256 !== slot.inputSha256 ||
        canonical(row.config) !== canonical(currentConfig(slot.model)) || row.set !== slot.set || row.file !== slot.label.file ||
        row.variant !== slot.variant || row.run !== slot.run || row.attempt !== entry.number ||
        (row.status !== "ok" && row.status !== "failed") || typeof row.collectedAt !== "string" ||
        typeof row.latencyMs !== "number" || !Number.isFinite(row.latencyMs) || row.latencyMs < 0 ||
        !(row.httpStatus === null || typeof row.httpStatus === "number") || !(row.error === null || typeof row.error === "string") || !("response" in row)) {
      entry.saved.invalid.push(key);
    } else entry.saved.attempts.push(row as unknown as Attempt);
  }
  for (const item of saved) {
    item.attempts.sort((a, b) => a.attempt - b.attempt);
    for (let index = 0; index < item.attempts.length; index += 1) {
      const attempt = item.attempts[index];
      if (attempt?.attempt !== index + 1 || (attempt.status === "ok" && index !== item.attempts.length - 1)) {
        item.invalid.push(attemptPath(item.slot.set, item.slot.model.id, item.slot.variant, item.slot.label.file, item.slot.run, attempt?.attempt ?? 0, experiment));
      }
    }
  }
  return saved;
}
