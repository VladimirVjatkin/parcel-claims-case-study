import { describe, expect, it } from "vitest";
import type { Definition, ReasonCode } from "../src/domain/types.js";
import { outcomeFromReasons } from "../src/domain/types.js";
import { checkTracking, lookupTracking } from "../src/layer2/trackingCheck.js";
import { parseDoructo } from "../src/tracking/parsers/doructo.js";
import type { TrackingResult, TrackingState } from "../src/tracking/types.js";
import { makeOrder, NOW } from "./helpers/makeOrder.js";

const definitions: Definition[] = ["A", "B"];
const commonCases: { state: TrackingState; code: ReasonCode }[] = [
  { state: "DELIVERED", code: "DELIVERED_PER_TRACKING" },
  { state: "RETURNING", code: "TRACKING_RETURNING" },
  { state: "UNKNOWN", code: "TRACKING_UNKNOWN" },
];

describe.each(definitions)("checkTracking for definition %s", (definition) => {
  it("preserves the reason why tracking is unavailable", () => {
    expect(checkTracking(definition, { kind: "unavailable", detail: "chybí číslo zásilky" }, NOW)).toEqual([
      { code: "TRACKING_UNAVAILABLE", detail: "chybí číslo zásilky" },
    ]);
  });
  it.each(commonCases)("maps $state to $code and preserves the quote", ({ state, code }) => {
    const result: TrackingResult = { state, quote: "Citace stavu zásilky", pickupPoint: null };
    expect(checkTracking(definition, { kind: "found", result }, NOW)).toEqual([{ code, detail: result.quote }]);
  });
  it("maps IN_TRANSIT according to the definition", () => {
    const result: TrackingResult = { state: "IN_TRANSIT", quote: "Na cestě", pickupPoint: null };
    const reasons = checkTracking(definition, { kind: "found", result }, NOW);
    expect(reasons).toEqual(definition === "A" ? [{ code: "CARRIER_PICKUP_CONFIRMED", detail: result.quote }] : []);
  });
});

describe("pickup point storage for B", () => {
  it.each([
    ["2026-11-02", "NEEDS_REVIEW"],
    ["2026-11-04", "NEEDS_REVIEW"],
    ["2026-11-01", "CREATE"],
    [null, "CREATE"],
  ])("handles storageUntil=%s inclusively", (storageUntil, expectedOutcome) => {
    const result: TrackingResult = {
      state: "IN_TRANSIT", quote: "Zásilka je připravena k vyzvednutí.",
      pickupPoint: { place: "Box Praha Florenc", storageUntil },
    };
    const reasons = checkTracking("B", { kind: "found", result }, NOW);
    expect(outcomeFromReasons(reasons)).toBe(expectedOutcome);
    if (expectedOutcome === "CREATE") expect(reasons).toEqual([]);
    else expect(reasons).toEqual([{
      code: "AT_PICKUP_POINT_STORAGE_ACTIVE",
      detail: `Box Praha Florenc, úložní doba do ${storageUntil === "2026-11-02" ? "2" : "4"}. 11. 2026`,
    }]);
  });
  it("compares with the Prague date even before midnight UTC", () => {
    const result: TrackingResult = {
      state: "IN_TRANSIT", quote: "Připravena k vyzvednutí",
      pickupPoint: { place: null, storageUntil: "2026-11-01" },
    };
    expect(checkTracking("B", { kind: "found", result }, new Date("2026-11-01T23:30:00Z"))).toEqual([]);
  });
  it("does not turn an A pickup-point case into a B reason", () => {
    const result: TrackingResult = {
      state: "IN_TRANSIT", quote: "Připravena k vyzvednutí",
      pickupPoint: { place: "Box Praha", storageUntil: "2026-11-04" },
    };
    expect(checkTracking("A", { kind: "found", result }, NOW)).toEqual([{ code: "CARRIER_PICKUP_CONFIRMED", detail: result.quote }]);
  });
});

describe("revision 3: any IN_TRANSIT for A", () => {
  it("sends Doručto Podáno to manual review", () => {
    const result = parseDoructo('<svg class="timeline"><g class="step"><circle fill="#00a86b"/><text>Podáno</text></g></svg>');
    expect(result.state).toBe("IN_TRANSIT");
    const reasons = checkTracking("A", { kind: "found", result }, NOW);
    expect(reasons).toEqual([{ code: "CARRIER_PICKUP_CONFIRMED", detail: "Podáno" }]);
    expect(outcomeFromReasons(reasons)).toBe("NEEDS_REVIEW");
  });
});

describe("lookupTracking", () => {
  it.each([null, "", "  "])("does not guess a parser for carrier=%j", (carrier) => {
    let calls = 0;
    const source = { getPage: () => { calls += 1; return ""; } };
    expect(lookupTracking(makeOrder({ carrier }), source)).toEqual({ kind: "unavailable", detail: "carrier = null, parser nelze vybrat" });
    expect(calls).toBe(0);
  });
  it("includes the unsupported carrier name before considering a missing number", () => {
    let calls = 0;
    const lookup = lookupTracking(makeOrder({ carrier: " Parcelo ", trackingNumber: null }), {
      getPage: () => { calls += 1; return ""; },
    });
    expect(lookup).toEqual({ kind: "unavailable", detail: "pro dopravce Parcelo nemáme čtení tracking stránky" });
    expect(calls).toBe(0);
    expect(checkTracking("A", lookup, NOW)[0]?.code).toBe("TRACKING_UNAVAILABLE");
  });
  it.each([null, "", "  "])("does not read a page without a tracking number: %j", (trackingNumber) => {
    let calls = 0;
    expect(lookupTracking(makeOrder({ trackingNumber }), { getPage: () => { calls += 1; return ""; } })).toEqual({
      kind: "unavailable", detail: "chybí číslo zásilky",
    });
    expect(calls).toBe(0);
  });
  it("distinguishes a missing saved page from a missing number", () => {
    const seen: string[] = [];
    expect(lookupTracking(makeOrder(), { getPage: (number: string) => { seen.push(number); return null; } })).toEqual({
      kind: "unavailable", detail: "tracking stránka není k dispozici",
    });
    expect(seen).toEqual(["KV-test-1"]);
  });
  it("uses the chosen carrier parser and trims the number before lookup", () => {
    const seen: string[] = [];
    const result = lookupTracking(makeOrder({ carrier: " Expedo ", trackingNumber: " EX123 " }), {
      getPage: (number: string) => { seen.push(number); return '<div class="status-card"><strong class="value">Na cestě</strong></div>'; },
    });
    expect(seen).toEqual(["EX123"]);
    expect(result).toEqual({ kind: "found", result: { state: "IN_TRANSIT", quote: "Na cestě", pickupPoint: null } });
  });
  it("treats an existing empty page as UNKNOWN rather than unavailable", () => {
    expect(lookupTracking(makeOrder(), { getPage: () => "" })).toEqual({
      kind: "found", result: { state: "UNKNOWN", quote: "", pickupPoint: null },
    });
  });
});
