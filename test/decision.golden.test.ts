// Regression against decisions in the design, not a proof of correctness.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decideAll } from "../src/decision/decide.js";
import type { Outcome, ReasonCode } from "../src/domain/types.js";
import { loadInput } from "../src/input/loadInput.js";
import { createFileTrackingSource } from "../src/tracking/trackingSource.js";
import { NOW } from "./helpers/makeOrder.js";
import { formatDecisionReport } from "../src/report/formatDecisionReport.js";

const input = loadInput(fileURLToPath(new URL("../data", import.meta.url)));
const source = createFileTrackingSource(fileURLToPath(new URL("../data/tracking", import.meta.url)));
const decisions = decideAll(input, source, NOW);

interface ExpectedDecision {
  number: string;
  outcome: Outcome;
  codes: ReasonCode[];
}

const expected: ExpectedDecision[] = [];
for (const number of ["120101", "120112", "120114", "120118", "120123"]) {
  expected.push({ number, outcome: "CREATE", codes: [] });
}
const reviewCodes: Record<string, ReasonCode[]> = {
  "120001": ["TRACKING_UNAVAILABLE"], "120006": ["TRACKING_UNAVAILABLE"],
  "120007": ["TRACKING_UNAVAILABLE"], "120008": ["TRACKING_UNAVAILABLE"],
  "120110": ["TRACKING_UNAVAILABLE"], "120111": ["TRACKING_UNAVAILABLE"],
  "120005": ["NO_REPORTER", "TRACKING_UNAVAILABLE"],
  "120122": ["NO_REPORTER", "TRACKING_UNAVAILABLE"],
  PN55100121: ["MISSING_ORDER_NUMBER", "TRACKING_UNAVAILABLE"],
  "120113": ["TRACKING_UNKNOWN"], "120115": ["TRACKING_UNKNOWN"],
  "120116": ["AT_PICKUP_POINT_STORAGE_ACTIVE"],
};
for (const [number, codes] of Object.entries(reviewCodes)) {
  expected.push({ number, outcome: "NEEDS_REVIEW", codes });
}
const rejectionCodes: Record<string, ReasonCode[]> = {
  "120002": ["TOO_FEW_DAYS"], "120003": ["EXCLUDED_SHIPPING_METHOD"],
  "120004": ["EXISTING_COMPLAINT"], "120102": ["TOO_FEW_DAYS"],
  "120103": ["EXCLUDED_SHIPPING_METHOD"], "120104": ["EXCLUDED_SHIPPING_METHOD"],
  "120106": ["NOT_CANDIDATE_STATUS"], "120107": ["NOT_CANDIDATE_STATUS"],
  "120108": ["RETURN_IN_WMS"], "120109": ["EXISTING_COMPLAINT"],
  "120120": ["EXCLUDED_SHIPPING_METHOD"], "120125": ["TOO_FEW_DAYS"],
  "120105": ["DELIVERED_PER_TRACKING"], "120117": ["DELIVERED_PER_TRACKING"],
  "120124": ["DELIVERED_PER_TRACKING"],
};
for (const [number, codes] of Object.entries(rejectionCodes)) {
  expected.push({ number, outcome: "DO_NOT_CREATE", codes });
}

function label(number: string): string {
  return number === "PN55100121" ? number : `MS-2026-${number}`;
}

describe("final decision regression on supplied data", () => {
  it("reports the 5 / 12 / 15 counts and exactly the three Mailship discrepancies", () => {
    const report = formatDecisionReport(decisions, { now: NOW, exportRowCount: input.orders.length });
    expect(report).toContain("| Založit (CREATE) | 5 |");
    expect(report).toContain("| Ruční kontrola (NEEDS_REVIEW) | 12 |");
    expect(report).toContain("| Nezakládat (DO_NOT_CREATE) | 15 |");
    expect(report).toContain("TOO_FEW_DAYS — 1 den (minimum 2)");
    expect(report).toContain("TOO_FEW_DAYS — 13 dní (minimum 14)");
    expect(report).toContain("| TRACKING_UNKNOWN | UNKNOWN — Zásilku jsme nenašli |");
    const section = report.split("## Nesoulad s Mailshipem")[1] ?? "";
    const labels: string[] = [];
    for (const line of section.split("\n")) {
      if (line.startsWith("| MS-2026-")) labels.push(line.split("|")[1]?.trim() ?? "");
    }
    expect(labels).toEqual([label("120105"), label("120117"), label("120124")]);
    expect(section).toContain("carrier_picked_up");
  });
  it.each(expected)("$number → $outcome", ({ number, outcome, codes }) => {
    const decision = decisions.find((item) => item.orderLabel === label(number));
    expect(decision, label(number)).toBeDefined();
    expect(decision?.outcome, label(number)).toBe(outcome);
    expect(decision?.reasons.map((reason) => reason.code).sort(), label(number)).toEqual([...codes].sort());
  });
  it("matches all 32 unique orders and the 5 / 12 / 15 totals", () => {
    expect(decisions).toHaveLength(32);
    expect(decisions.map((item) => item.orderLabel).sort()).toEqual(expected.map((item) => label(item.number)).sort());
    expect(decisions.filter((item) => item.outcome === "CREATE")).toHaveLength(5);
    expect(decisions.filter((item) => item.outcome === "NEEDS_REVIEW")).toHaveLength(12);
    expect(decisions.filter((item) => item.outcome === "DO_NOT_CREATE")).toHaveLength(15);
  });
  it("flags exactly the three delivered parcels as Mailship discrepancies", () => {
    expect(decisions.filter((item) => item.mailshipDiscrepancy).map((item) => item.orderLabel).sort()).toEqual([
      label("120105"), label("120117"), label("120124"),
    ]);
  });
  it("explains why the carrier cannot be checked for 120110 and 120008", () => {
    const missingCarrier = decisions.find((item) => item.orderLabel === label("120110"));
    const unsupportedCarrier = decisions.find((item) => item.orderLabel === label("120008"));
    expect(missingCarrier?.reasons.find((reason) => reason.code === "TRACKING_UNAVAILABLE")?.detail).toContain("carrier = null");
    expect(unsupportedCarrier?.reasons.find((reason) => reason.code === "TRACKING_UNAVAILABLE")?.detail).toContain("Parcelo");
  });
  it("preserves reporters and complaint reasons on CREATE", () => {
    const reporters: Record<string, string> = {
      "120101": "jana.svobodova@sportovna-alfa.example",
      "120114": "jana.svobodova@sportovna-alfa.example",
      "120118": "jana.svobodova@sportovna-alfa.example",
      "120112": "tomas.velky@hracky-epsilon.example",
      "120123": "reklamace@velkoobchod-gama.example",
    };
    for (const [number, reporter] of Object.entries(reporters)) {
      const decision = decisions.find((item) => item.orderLabel === label(number));
      expect(decision?.reporter, label(number)).toBe(reporter);
      expect(decision?.complaintReason, label(number)).toBe("loss");
    }
  });
});
