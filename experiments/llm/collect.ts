// CLI sběru odpovědí experimentu: plán a kontrola poskytovatele bez klíče, placený sběr jen na pokyn vlastníka.
// Pokusy se nepřepisují; společné limity, pauzy HTTP 429 a oddělení v1/v2 chrání úplnost a srovnatelnost.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { attemptPath, buildRequestBody, currentConfig, isExhausted, loadModels, loadSlots, object, readSavedSlots } from "./llm.js";
import type { Attempt, Model, SavedSlot } from "./llm.js";
import { V1_EXPERIMENT, V2_EXPERIMENT } from "./prompt.js";
import type { Experiment } from "./prompt.js";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export interface CollectionCounts { ok: number; failed: number; skipped: number; exhausted: number }

export function endpointDescription(model: Model, payload: unknown): string {
  const values = object(object(payload).data).endpoints;
  const matches = Array.isArray(values) ? values.map(object).filter((row) => row.tag === model.provider && row.quantization === model.quantization) : [];
  if (matches.length !== 1) throw new Error(`${model.id}: počet odpovídajících endpointů = ${matches.length}; volbu musí potvrdit vlastník.`);
  const endpoint = matches[0];
  if (endpoint === undefined) throw new Error("Chybí endpoint.");
  const required = ["temperature", "max_tokens", "response_format", "structured_outputs"];
  if (model.reasoning !== null) required.push("reasoning");
  const supported = endpoint.supported_parameters;
  const missing = required.filter((parameter) => !Array.isArray(supported) || !supported.includes(parameter));
  if (missing.length > 0) throw new Error(`${model.id}: chybí podpora parametrů ${missing.join(", ")}.`);
  const pricing = object(endpoint.pricing);
  const inputPrice = Number((Number(pricing.prompt) * 1_000_000).toFixed(6));
  const outputPrice = Number((Number(pricing.completion) * 1_000_000).toFixed(6));
  return `${model.id}: ${model.provider}, ${model.quantization}; USD/1M vstup ${inputPrice}, výstup ${outputPrice}; status ${endpoint.status}`;
}

export function validateSaved(saved: SavedSlot[]): void {
  const invalid: string[] = [];
  for (const item of saved) invalid.push(...item.invalid);
  if (invalid.length > 0) throw new Error(`Nekompatibilní záznamy; sběr zastaven:\n${invalid.sort().join("\n")}`);
}

function redact(value: unknown, key: string): unknown {
  if (typeof value === "string") return value.replaceAll(key, "[REDACTED]").replace(/Authorization/gi, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [name, item] of Object.entries(object(value))) {
      if (name.toLowerCase() !== "authorization") result[name] = redact(item, key);
    }
    return result;
  }
  return value;
}

export function retryDelayMs(reply: Response, body: unknown, nowMs = Date.now()): number {
  const header = reply.headers.get("Retry-After");
  let seconds = header === null || header.trim() === "" ? NaN : Number(header);
  if (!Number.isFinite(seconds) && header !== null) seconds = (Date.parse(header) - nowMs) / 1000;
  if (!Number.isFinite(seconds) || seconds < 0) {
    const value = object(object(object(body).error).metadata).retry_after_seconds;
    seconds = typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
  }
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 10;
  return Math.min(seconds, 60) * 1000;
}

export async function collectSlots(saved: SavedSlot[], key: string, fetcher: Fetcher, root = ".",
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
  notify: (message: string) => void = console.warn, experiment: Experiment = V1_EXPERIMENT): Promise<CollectionCounts> {
  validateSaved(saved);
  if (saved.some(({ slot, attempts }) => !experiment.variants.includes(slot.variant) ||
    (experiment.models !== null && !experiment.models.includes(slot.model.id)) ||
    attempts.some((attempt) => attempt.promptVersion !== experiment.version))) throw new Error("Nekompatibilní sada experimentu.");
  if (key === "") throw new Error("Chybí OPENROUTER_API_KEY.");
  const counts: CollectionCounts = { ok: 0, failed: 0, skipped: 0, exhausted: 0 };
  const blockedModels = new Set<string>();
  const consecutive429 = new Map<string, number>();
  let pendingDelay = 0;
  for (const item of saved) {
    if (item.attempts.some((attempt) => attempt.status === "ok")) { counts.skipped += 1; continue; }
    if (isExhausted(item.attempts)) { counts.exhausted += 1; continue; }
    const slot = item.slot;
    if (blockedModels.has(slot.model.id)) continue;
    // Pozdrží další skutečné volání, aniž by se tento slot automaticky opakoval.
    if (pendingDelay > 0) { await wait(pendingDelay); pendingDelay = 0; }
    const number = item.attempts.length + 1;
    const started = performance.now();
    let httpStatus: number | null = null;
    let response: unknown = null;
    let status: Attempt["status"] = "failed";
    let error: string | null = null;
    try {
      const reply = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(slot.model, experiment.buildMessages(slot.label.carrier, slot.label.trackingNumber, slot.input))),
        signal: AbortSignal.timeout(120_000),
      });
      httpStatus = reply.status;
      if (httpStatus === 429) pendingDelay = retryDelayMs(reply, null);
      response = await reply.json();
      if (httpStatus === 429) pendingDelay = retryDelayMs(reply, response);
      if (reply.ok && object(response).error === undefined) status = "ok";
      else error = `Chyba API (HTTP ${httpStatus}).`;
    } catch {
      // Libovolné síťové chyby se nelogují: mohou obsahovat podrobnosti požadavku.
      error = "Chyba sítě, časový limit nebo nečitelná odpověď API.";
    }
    const attempt: Attempt = {
      status, promptVersion: experiment.version, inputSha256: slot.inputSha256, config: currentConfig(slot.model),
      set: slot.set, file: slot.label.file, variant: slot.variant, run: slot.run, attempt: number,
      collectedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - started), httpStatus, error, response,
    };
    const path = join(root, attemptPath(slot.set, slot.model.id, slot.variant, slot.label.file, slot.run, number, experiment));
    mkdirSync(dirname(path), { recursive: true });
    // Výhradní vytvoření souboru chrání i před druhým souběžným sběrem.
    writeFileSync(path, JSON.stringify(redact(attempt, key), null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    if (status === "ok") counts.ok += 1; else counts.failed += 1;
    if (httpStatus === 401 || httpStatus === 402 || httpStatus === 403) {
      throw new Error(`Sběr zastaven po HTTP ${httpStatus}: ověřte klíč, kredit nebo přístup. Pokus byl uložen; ok ${counts.ok}, failed ${counts.failed}.`);
    }
    const streak = httpStatus === 429 ? (consecutive429.get(slot.model.id) ?? 0) + 1 : 0;
    consecutive429.set(slot.model.id, streak);
    if (streak >= 5) {
      blockedModels.add(slot.model.id);
      notify(`${slot.model.id}: Poskytovatel omezuje počet požadavků, zkuste později`);
    }
  }
  return counts;
}

export function collectionPlan(saved: SavedSlot[]): { total: number; closed: number; open: number; exhausted: number; failed: number } {
  validateSaved(saved);
  let closed = 0; let exhausted = 0; let failed = 0;
  for (const item of saved) {
    failed += item.attempts.filter((attempt) => attempt.status === "failed").length;
    if (item.attempts.some((attempt) => attempt.status === "ok")) closed += 1;
    else if (isExhausted(item.attempts)) exhausted += 1;
  }
  return { total: saved.length, closed, open: saved.length - closed - exhausted, exhausted, failed };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    prompt: { type: "string", default: "v1" },
    check: { type: "boolean" }, "dry-run": { type: "boolean" }, model: { type: "string" },
    set: { type: "string", default: "all" }, variant: { type: "string", default: "all" }, runs: { type: "string", default: "3" },
  }, strict: true, allowPositionals: false });
  if (values.prompt !== "v1" && values.prompt !== "v2") throw new Error("Neplatný --prompt: v1|v2.");
  const experiment = values.prompt === "v2" ? V2_EXPERIMENT : V1_EXPERIMENT;
  if (experiment.version === "v2" && (values.set !== "all" || values.variant !== "all" || values.runs !== "3")) {
    throw new Error("Sada v2 je pevná: všechny stránky, vstup H, 3 běhy; použijte pouze --model, --check nebo --dry-run.");
  }
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1 || runs > 3 || !["all", "original", "mutated"].includes(values.set ?? "") ||
      !["all", "T", "H"].includes(values.variant ?? "") || (values.check && values["dry-run"])) {
    throw new Error("Neplatné volby: --runs 1 až 3, --set original|mutated|all, --variant T|H|all; --check a --dry-run nelze kombinovat.");
  }
  const models = loadModels().filter((model) => experiment.models === null || experiment.models.includes(model.id));
  if (values.model !== undefined && !models.some((model) => model.id === values.model)) throw new Error("Neznámý --model.");
  const all = readSavedSlots(loadSlots(".", experiment), ".", experiment);
  validateSaved(all);
  const selected = all.filter(({ slot }) => (values.model === undefined || slot.model.id === values.model) &&
    (values.set === "all" || slot.set === values.set) && (values.variant === "all" || slot.variant === values.variant) && slot.run <= runs);
  if (values.check) {
    let failed = false;
    for (const model of models) {
      if (values.model !== undefined && values.model !== model.id) continue;
      try {
        const reply = await fetch(`https://openrouter.ai/api/v1/models/${model.id}/endpoints`, { signal: AbortSignal.timeout(15_000) });
        if (!reply.ok) throw new Error(`HTTP ${reply.status}`);
        console.log(endpointDescription(model, await reply.json()));
      } catch (error) { console.error(`Kontrola selhala: ${error instanceof Error ? error.message : "síť"}`); failed = true; }
    }
    if (failed) process.exitCode = 1;
    return;
  }
  if (values["dry-run"]) {
    const plan = collectionPlan(selected);
    console.log(`Slotů / uzavřeno / otevřeno / vyčerpáno / failed: ${plan.total} / ${plan.closed} / ${plan.open} / ${plan.exhausted} / ${plan.failed}`);
    return;
  }
  if (existsSync(".env")) process.loadEnvFile(".env");
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Chybí OPENROUTER_API_KEY v .env nebo prostředí.");
  const counts = await collectSlots(selected, key, fetch, ".", undefined, undefined, experiment);
  console.log(`Sběr: ok ${counts.ok} / failed ${counts.failed} / přeskočeno ${counts.skipped} / vyčerpáno ${counts.exhausted}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(`Chyba: ${error instanceof Error ? error.message : "Sběr selhal."}`); process.exitCode = 1; });
}
