import { EXPERIMENT_FETCH_MOMENT as PARSER_REFERENCE_MOMENT } from "../../experiments/llm/prompt.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attemptPath, buildInput, buildRequestBody, canonical, checkAnswer, currentConfig, isExhausted, loadModels, loadSlots, readSavedSlots, sha256 } from "../../experiments/llm/llm.js";
import type { Attempt, Model, SavedSlot, Slot } from "../../experiments/llm/llm.js";
import { collectionPlan, collectSlots, endpointDescription, retryDelayMs, validateSaved } from "../../experiments/llm/collect.js";
import { buildMessages, PROMPT_VERSION, SYNTHETIC_EXAMPLES, SYSTEM_PROMPT } from "../../experiments/llm/prompt.js";
import { evaluatePages } from "../../src/eval/evaluatePages.js";
import { readLabels } from "../../src/eval/labels.js";

const REFERENCE_MOMENT = new Date(PARSER_REFERENCE_MOMENT);

const root = fileURLToPath(new URL("../../", import.meta.url));
const models = loadModels(root);
const model = models[0] as Model;
const slot: Slot = { set: "original", model, variant: "H", label: { file: "TEST1.html", carrier: "Expedo", trackingNumber: "TEST1", expectedState: "IN_TRANSIT", note: "" }, input: "Na cestě", inputSha256: sha256("Na cestě"), run: 1 };
const temporaryRoot = resolve(tmpdir());
let work: string;
beforeEach(() => { work = mkdtempSync(join(temporaryRoot, "mailstep-llm-test-")); });
afterEach(() => {
  const target = resolve(work);
  if (dirname(target) !== temporaryRoot || !basename(target).startsWith("mailstep-llm-test-")) throw new Error("Neplatná cesta testu.");
  rmSync(target, { recursive: true, force: true });
});
function saved(): SavedSlot { return { slot, attempts: [], invalid: [] }; }
function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return { status: "ok", promptVersion: PROMPT_VERSION, inputSha256: slot.inputSha256, config: currentConfig(model),
    set: "original", file: slot.label.file, variant: "H", run: 1, attempt: 1, collectedAt: "2026-11-06T12:00:00Z", latencyMs: 10,
    httpStatus: 200, error: null, response: {}, ...overrides };
}
function persist(value: Attempt): string {
  const path = join(work, attemptPath(value.set, model.id, value.variant, value.file, value.run, value.attempt));
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value)); return path;
}

describe("LLM input and protocol", () => {
  it("preserves H verbatim and loses the active SVG marker in T", () => {
    const html = readFileSync(join(root, "data/tracking/DT9100112.html"), "utf8");
    expect(buildInput(html, "H")).toBe(html);
    const text = buildInput(html, "T");
    for (const value of ["Podáno", "V přepravě", "U kurýra", "Doručeno", "Vráceno"]) expect(text).toContain(value);
    expect(text).not.toContain("#00a86b");
  });
  it("sends exactly six messages and valid JSON examples, without mutated-page hints", () => {
    const messages = buildMessages("Expedo", "A1", "Na cestě");
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    expect(messages[0]?.content).toBe(SYSTEM_PROMPT);
    expect(messages[5]?.content).toBe("Tracking page (carrier: Expedo, number: A1):\nNa cestě");
    for (const message of SYNTHETIC_EXAMPLES) if (message.role === "assistant") expect(() => JSON.parse(message.content)).not.toThrow();
    expect(SYSTEM_PROMPT).not.toContain("Z-BOX");
  });
  it("pins routing, quantization, schema and reasoning without an API key", () => {
    const body = buildRequestBody(model, buildMessages("Expedo", "A1", "Na cestě"));
    expect(body).toMatchObject({ temperature: 0, max_tokens: 4000, reasoning: { effort: "low" },
      provider: { order: [model.provider], quantizations: ["bf16"], allow_fallbacks: false, require_parameters: true },
      response_format: { type: "json_schema", json_schema: { strict: true, schema: { additionalProperties: false, required: ["state", "quote", "reason"] } } } });
    expect(buildRequestBody({ ...model, reasoning: null }, [])).not.toHaveProperty("reasoning");
    expect(JSON.stringify(body)).not.toContain("Authorization");
    expect(canonical({ b: { z: 1, a: 2 }, a: 3 })).toBe(canonical({ a: 3, b: { a: 2, z: 1 } }));
  });
  it("plans exactly 936 slots and validates immutable cached metadata", () => {
    expect(loadSlots(root)).toHaveLength(936);
    expect(collectionPlan([saved()])).toEqual({ total: 1, closed: 0, open: 1, exhausted: 0, failed: 0 });
    persist(attempt({ config: { ...currentConfig(model), max_tokens: 99 } }));
    const cache = readSavedSlots([slot], work);
    expect(cache[0]?.invalid).toHaveLength(1);
    expect(() => collectionPlan(cache)).toThrow("Nekompatibilní");
  });
  it("rejects the future event found by the experiment and preserves other changed-page outcomes", () => {
    const dir = join(root, "experiments/llm/mutated");
    const result = evaluatePages(readLabels(join(dir, "labels.csv")), (file) => readFileSync(join(dir, file), "utf8"), REFERENCE_MOMENT);
    expect(result.pages).toHaveLength(6);
    for (const page of result.pages) expect(page.predicted).toBe("UNKNOWN");
  });
});

describe("checkAnswer", () => {
  it("accepts a JSON fence and normalized whitespace", () => {
    expect(checkAnswer('```json\n{"state":"IN_TRANSIT","quote":"Na   cestě"}\n```', "stop", "Na\ncestě")).toMatchObject({ outcome: "OK", state: "IN_TRANSIT" });
  });
  it.each([null, "", "   "])("records no answer for %j", (value) => expect(checkAnswer(value, "stop", "text").outcome).toBe("NO_ANSWER"));
  it("rejects a token-limit completion even when its content is valid JSON", () => expect(checkAnswer('{"state":"UNKNOWN","quote":"text"}', "length", "text").outcome).toBe("NO_ANSWER"));
  it.each(["broken", "null", "[]", "123", '"text"'])("rejects non-object JSON %s without throwing", (value) => expect(checkAnswer(value, "stop", "text").outcome).toBe("INVALID_JSON"));
  it.each([{}, { state: "LOST" }])("rejects an invalid enum %j", (value) => expect(checkAnswer(JSON.stringify(value), "stop", "text").outcome).toBe("INVALID_STATE"));
  it.each([undefined, null, 7, "", "  ", "elsewhere", "TEXT"])("rejects missing, invalid or unmatched quotes: %j", (quote) => {
    expect(checkAnswer(JSON.stringify({ state: "DELIVERED", quote }), "stop", "text")).toMatchObject({ outcome: "QUOTE_NOT_FOUND", rawState: "DELIVERED", state: null });
  });
  it("accepts a quote from an ad: a known limitation of formal validation", () => {
    expect(checkAnswer('{"state":"DELIVERED","quote":"Doručeno do 24 hodin!"}', "stop", '<aside class="ad">Doručeno do 24 hodin!</aside>').outcome).toBe("OK");
  });
});

describe("endpoint preflight", () => {
  const endpoint = { tag: model.provider, quantization: model.quantization, status: 0, pricing: { prompt: "0.0000001", completion: "0.00000015" },
    supported_parameters: ["temperature", "max_tokens", "response_format", "structured_outputs", "reasoning"] };
  it.each([0, 2])("rejects %i matching endpoints", (count) => expect(() => endpointDescription(model, { data: { endpoints: Array(count).fill(endpoint) } })).toThrow("počet"));
  it("accepts one endpoint and displays its price", () => expect(endpointDescription(model, { data: { endpoints: [endpoint] } })).toContain(model.provider));
  it("rejects missing reasoning support", () => expect(() => endpointDescription(model, { data: { endpoints: [{ ...endpoint, supported_parameters: endpoint.supported_parameters.slice(0, -1) }] } })).toThrow("reasoning"));
});

describe("collector with fake fetch only", () => {
  it.each([
    [[429, 429, 429], false],
    [[429, 429, null, null, null], true],
    [Array(10).fill(429), true],
  ])("applies the separate rate-limit and total caps for %j", (statuses, expected) => {
    const attempts = statuses.map((httpStatus, index) => attempt({ status: "failed", httpStatus, attempt: index + 1 }));
    expect(isExhausted(attempts)).toBe(expected);
    expect(collectionPlan([{ ...saved(), attempts }])).toMatchObject({ exhausted: expected ? 1 : 0, open: expected ? 0 : 1 });
  });
  it("reads a4 without altering earlier attempts and rejects a11", () => {
    for (let number = 1; number <= 4; number += 1) persist(attempt({ status: "failed", httpStatus: 429, attempt: number }));
    expect(readSavedSlots([slot], work)[0]).toMatchObject({ invalid: [] });
    expect(readSavedSlots([slot], work)[0]?.attempts).toHaveLength(4);
    persist(attempt({ status: "failed", httpStatus: 429, attempt: 11 }));
    expect(() => readSavedSlots([slot], work)).toThrow("Neočekávaný soubor");
  });
  it.each([
    ["5", null, 5000],
    [null, { error: { metadata: { retry_after_seconds: 7 } } }, 7000],
    [null, null, 10000],
    ["120", null, 60000],
    ["Sat, 07 Nov 2026 12:00:05 GMT", null, 5000],
  ])("uses the bounded Retry-After delay from %s", (header, body, expected) => {
    const reply = new Response("{}", { status: 429, headers: header === null ? {} : { "Retry-After": header } });
    expect(retryDelayMs(reply, body, Date.parse("2026-11-07T12:00:00Z"))).toBe(expected);
  });
  it("pauses before the next call and stops a model after five consecutive 429s", async () => {
    const cache = Array.from({ length: 7 }, (_, index): SavedSlot => ({ ...saved(), slot: { ...slot, label: { ...slot.label, file: `TEST${index}.html` } } }));
    const waits: number[] = []; const messages: string[] = []; let calls = 0;
    const counts = await collectSlots(cache, "test-secret", async () => {
      expect(waits.length).toBe(calls);
      calls += 1;
      return new Response("{}", { status: 429, headers: { "Retry-After": "5" } });
    }, work, async (ms) => { waits.push(ms); }, (message) => { messages.push(message); });
    expect(calls).toBe(5);
    expect(counts.failed).toBe(5);
    expect(waits).toEqual([5000, 5000, 5000, 5000]);
    expect(messages).toEqual([`${model.id}: Poskytovatel omezuje počet požadavků, zkuste později`]);
  });
  it("skips a closed slot without calling fetch", async () => {
    const cache = [{ ...saved(), attempts: [attempt()] }]; let calls = 0;
    expect(await collectSlots(cache, "test-secret", async () => { calls += 1; return new Response("{}"); }, work)).toMatchObject({ skipped: 1 });
    expect(calls).toBe(0);
  });
  it("saves a failure and makes only one new attempt on the next invocation", async () => {
    let calls = 0;
    const fail = async (): Promise<Response> => { calls += 1; throw new Error("timeout with test-secret"); };
    await collectSlots([saved()], "test-secret", fail, work);
    const firstPath = join(work, attemptPath(slot.set, model.id, "H", slot.label.file, 1, 1));
    const first = readFileSync(firstPath, "utf8");
    expect(first).not.toContain("test-secret");
    expect(JSON.parse(first).status).toBe("failed");
    await collectSlots(readSavedSlots([slot], work), "test-secret", async () => { calls += 1; return new Response('{"choices":[]}'); }, work);
    expect(calls).toBe(2);
    expect(readFileSync(firstPath, "utf8")).toBe(first);
    expect(existsSync(join(work, attemptPath(slot.set, model.id, "H", slot.label.file, 1, 2)))).toBe(true);
  });
  it("never retries automatically and stops after three failed attempts", async () => {
    let calls = 0;
    const fail = async (): Promise<Response> => { calls += 1; throw new Error("network"); };
    for (let run = 0; run < 3; run += 1) await collectSlots(readSavedSlots([slot], work), "test-secret", fail, work);
    expect(calls).toBe(3);
    expect((await collectSlots(readSavedSlots([slot], work), "test-secret", fail, work)).exhausted).toBe(1);
    expect(calls).toBe(3);
  });
  it("persists HTTP 402 before stopping the run", async () => {
    await expect(collectSlots([saved()], "test-secret", async () => new Response('{"error":{"message":"credit"}}', { status: 402 }), work)).rejects.toThrow("HTTP 402");
    expect(readSavedSlots([slot], work)[0]?.attempts[0]).toMatchObject({ status: "failed", httpStatus: 402 });
  });
  it("refuses incompatible data before the first request", async () => {
    persist(attempt({ promptVersion: "old" })); let calls = 0;
    const cache = readSavedSlots([slot], work);
    expect(() => validateSaved(cache)).toThrow("Nekompatibilní");
    await expect(collectSlots(cache, "test-secret", async () => { calls += 1; return new Response("{}"); }, work)).rejects.toThrow("Nekompatibilní");
    expect(calls).toBe(0);
  });
  it("sends auth only as a header and never stores it, even if echoed by the server", async () => {
    await collectSlots([saved()], "test-secret", async (_url, init) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-secret" });
      expect(String(init?.body)).not.toContain("test-secret");
      return new Response('{"Authorization":"Bearer test-secret","echo":"Authorization test-secret","choices":[]}');
    }, work);
    const text = readFileSync(join(work, attemptPath(slot.set, model.id, "H", slot.label.file, 1, 1)), "utf8");
    expect(text).not.toContain("test-secret"); expect(text).not.toContain("Authorization");
  });
});
