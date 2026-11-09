// Regrese proti rozhodnutím v návrhu (004), nikoli důkaz správnosti pravidel.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReasonCode } from "../src/domain/types.js";
import { outcomeFromReasons } from "../src/domain/types.js";
import { loadInput } from "../src/input/loadInput.js";
import { dedupeOrders } from "../src/layer1/dedupe.js";
import { evaluateRules } from "../src/layer1/rules.js";
import { NOW } from "./helpers/makeOrder.js";

const input = loadInput(fileURLToPath(new URL("../data", import.meta.url)));
const groups = dedupeOrders(input.orders);
const results = groups.map((group) => evaluateRules(group, input, NOW));
const expectedReasons: Record<string, ReasonCode[]> = {
  "120002": ["TOO_FEW_DAYS"], "120003": ["EXCLUDED_SHIPPING_METHOD"],
  "120004": ["EXISTING_COMPLAINT"], "120102": ["TOO_FEW_DAYS"],
  "120103": ["EXCLUDED_SHIPPING_METHOD"], "120104": ["EXCLUDED_SHIPPING_METHOD"],
  "120106": ["NOT_CANDIDATE_STATUS"], "120107": ["NOT_CANDIDATE_STATUS"],
  "120108": ["RETURN_IN_WMS"], "120109": ["EXISTING_COMPLAINT"],
  "120120": ["EXCLUDED_SHIPPING_METHOD"], "120125": ["TOO_FEW_DAYS"],
  "120005": ["NO_REPORTER"], "120122": ["NO_REPORTER"],
  PN55100121: ["MISSING_ORDER_NUMBER"],
};
const withoutReasons = [
  "120001", "120006", "120007", "120008", "120101", "120105", "120110", "120111",
  "120112", "120113", "120114", "120115", "120116", "120117", "120118", "120123", "120124",
];

function label(number: string): string {
  return number === "PN55100121" ? number : `MS-2026-${number}`;
}

describe("layer 1 regression on supplied data", () => {
  it("deduplicates 33 rows into 32 non-conflicting groups", () => {
    expect(input.orders).toHaveLength(33);
    expect(groups).toHaveLength(32);
    expect(groups.every((group) => !group.conflicting)).toBe(true);
    expect(groups.find((group) => group.order.orderNumber === label("120101"))?.rowCount).toBe(2);
  });

  it("matches every expected reason and all 17 candidates without reasons", () => {
    const expectedLabels: string[] = [];
    for (const [number, codes] of Object.entries(expectedReasons)) {
      expectedLabels.push(label(number));
      const actual = results.find((result) => result.orderLabel === label(number));
      expect(actual, label(number)).toBeDefined();
      expect(actual?.reasons.map((reason) => reason.code).sort(), label(number)).toEqual([...codes].sort());
    }
    for (const number of withoutReasons) {
      expectedLabels.push(label(number));
      expect(results.find((result) => result.orderLabel === label(number))?.reasons, label(number)).toEqual([]);
    }
    expect(results.map((result) => result.orderLabel).sort()).toEqual(expectedLabels.sort());
  });

  it("matches the 12 / 3 / 17 layer 1 totals and 20 tracking candidates", () => {
    expect(results.filter((result) => outcomeFromReasons(result.reasons) === "DO_NOT_CREATE")).toHaveLength(12);
    expect(results.filter((result) => outcomeFromReasons(result.reasons) === "NEEDS_REVIEW")).toHaveLength(3);
    expect(results.filter((result) => result.reasons.length === 0)).toHaveLength(17);
    expect(results.filter((result) => result.runTracking)).toHaveLength(20);
  });

  it("matches the boundary dates and updatedAt traps", () => {
    const days: Record<string, number> = {
      "120002": 1, "120102": 13, "120125": 13, "120001": 2,
      "120007": 2, "120006": 3, "120101": 14, "120105": 14,
    };
    for (const [number, expected] of Object.entries(days)) {
      expect(results.find((result) => result.orderLabel === label(number))?.daysInStatus, label(number)).toBe(expected);
    }
  });

  it("matches all reporters selected for tracking candidates", () => {
    const reporterOrders: Record<string, string[]> = {
      "jana.svobodova@sportovna-alfa.example": ["120001", "120007", "120101", "120110", "120114", "120118"],
      "tomas.velky@hracky-epsilon.example": ["120006", "120105", "120112", "PN55100121"],
      "claims@kosmetika-delta.example": ["120008", "120115"],
      "reklamace@velkoobchod-gama.example": ["120113", "120117", "120123"],
      "petr.kral@bylinkarna-beta.example": ["120111", "120116", "120124"],
    };
    for (const [reporter, numbers] of Object.entries(reporterOrders)) {
      for (const number of numbers) {
        expect(results.find((result) => result.orderLabel === label(number))?.reporter, label(number)).toBe(reporter);
      }
    }
    for (const number of ["120005", "120122"]) {
      expect(results.find((result) => result.orderLabel === label(number))?.reporter).toBeNull();
    }
  });
});
