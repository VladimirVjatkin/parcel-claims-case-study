import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { errorImpact, evaluatePages } from "../src/eval/evaluatePages.js";
import type { ErrorImpact } from "../src/eval/evaluatePages.js";
import { readLabels } from "../src/eval/labels.js";
import type { LabelRow } from "../src/eval/labels.js";
import type { TrackingState } from "../src/tracking/types.js";

const pairs: { expected: TrackingState; predicted: TrackingState; impact: ErrorImpact | null }[] = [
  { expected: "DELIVERED", predicted: "DELIVERED", impact: null },
  { expected: "DELIVERED", predicted: "IN_TRANSIT", impact: "WRONG_COMPLAINT" },
  { expected: "DELIVERED", predicted: "RETURNING", impact: "EXTRA_REVIEW" },
  { expected: "DELIVERED", predicted: "UNKNOWN", impact: "EXTRA_REVIEW" },
  { expected: "IN_TRANSIT", predicted: "DELIVERED", impact: "HIDDEN_PROBLEM" },
  { expected: "IN_TRANSIT", predicted: "IN_TRANSIT", impact: null },
  { expected: "IN_TRANSIT", predicted: "RETURNING", impact: "EXTRA_REVIEW" },
  { expected: "IN_TRANSIT", predicted: "UNKNOWN", impact: "EXTRA_REVIEW" },
  { expected: "RETURNING", predicted: "DELIVERED", impact: "HIDDEN_PROBLEM" },
  { expected: "RETURNING", predicted: "IN_TRANSIT", impact: "WRONG_COMPLAINT" },
  { expected: "RETURNING", predicted: "RETURNING", impact: null },
  { expected: "RETURNING", predicted: "UNKNOWN", impact: "NO_DECISION_IMPACT" },
  { expected: "UNKNOWN", predicted: "DELIVERED", impact: "HIDDEN_PROBLEM" },
  { expected: "UNKNOWN", predicted: "IN_TRANSIT", impact: "WRONG_COMPLAINT" },
  { expected: "UNKNOWN", predicted: "RETURNING", impact: "NO_DECISION_IMPACT" },
  { expected: "UNKNOWN", predicted: "UNKNOWN", impact: null },
];

function label(overrides: Partial<LabelRow> = {}): LabelRow {
  return { file: "A1.html", carrier: "Expedo", trackingNumber: "A1", expectedState: "IN_TRANSIT", note: "poznámka", ...overrides };
}

describe("errorImpact", () => {
  it.each(pairs)("$expected → $predicted = $impact", ({ expected, predicted, impact }) => {
    expect(errorImpact(expected, predicted)).toBe(impact);
  });
});

describe("evaluatePages", () => {
  it("evaluates a correct page and preserves its evidence and note", () => {
    const result = evaluatePages([label()], () => '<div class="status-card"><strong class="value">Na cestě</strong></div>');
    expect(result.pages).toEqual([{
      file: "A1.html", carrier: "Expedo", expected: "IN_TRANSIT", predicted: "IN_TRANSIT", quote: "Na cestě", note: "poznámka", impact: null,
    }]);
  });
  it("flags a false DELIVERED as a hidden problem", () => {
    const result = evaluatePages([label()], () => '<div class="status-card"><strong class="value">Doručeno</strong></div>');
    expect(result.pages[0]?.impact).toBe("HIDDEN_PROBLEM");
  });
  it("records a missing page as UNKNOWN with a Czech explanation", () => {
    const result = evaluatePages([label()], () => null);
    expect(result.pages[0]).toMatchObject({ predicted: "UNKNOWN", quote: "tracking stránka není k dispozici", impact: "EXTRA_REVIEW" });
  });
  it("records an unsupported carrier without trying to read a page", () => {
    let calls = 0;
    const result = evaluatePages([label({ carrier: "Parcelo" })], () => { calls += 1; return ""; });
    expect(result.pages[0]).toMatchObject({ predicted: "UNKNOWN", quote: "pro dopravce Parcelo nemáme čtení tracking stránky" });
    expect(calls).toBe(0);
  });
  it("sorts the result by file without changing the label order", () => {
    const labels = [label({ file: "Z.html" }), label({ file: "A.html" })];
    expect(evaluatePages(labels, () => null).pages.map((page) => page.file)).toEqual(["A.html", "Z.html"]);
    expect(labels.map((row) => row.file)).toEqual(["Z.html", "A.html"]);
  });
  it("matches all 20 supplied pages", () => {
    const dir = fileURLToPath(new URL("../data/tracking", import.meta.url));
    const result = evaluatePages(readLabels(join(dir, "labels.csv")), (file) => readFileSync(join(dir, file), "utf8"));
    expect(result.pages).toHaveLength(20);
    expect(result.pages.filter((page) => page.expected === page.predicted)).toHaveLength(20);
    expect(result.pages.filter((page) => page.impact !== null)).toEqual([]);
  });
});
