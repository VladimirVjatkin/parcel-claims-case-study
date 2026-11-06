import { describe, expect, it } from "vitest";
import { decideAll, decideOrder } from "../src/decision/decide.js";
import type { Order } from "../src/domain/types.js";
import { dedupeOrders } from "../src/layer1/dedupe.js";
import { makeComplaint, makeContext, makeOrder, NOW } from "./helpers/makeOrder.js";

const deliveredPage = '<div class="shipment-message">Zásilka byla doručena příjemci.</div>';
const inTransitPage = '<div class="shipment-message">Zásilka je na cestě k vám.</div>';

function groupFor(order: Order) {
  const group = dedupeOrders([order])[0];
  if (group === undefined) throw new Error("Chybí testovací skupina.");
  return group;
}

describe("decideOrder", () => {
  it.each([
    { status: "delivered" },
    { packedAt: "2026-11-01T09:00:00+01:00" },
    { shippingMethod: "Interní přeprava" },
  ])("does not query tracking when layer 1 rejects the order: %j", (overrides) => {
    let calls = 0;
    const result = decideOrder(groupFor(makeOrder(overrides)), makeContext(), {
      getPage: () => { calls += 1; return deliveredPage; },
    }, NOW);
    expect(calls).toBe(0);
    expect(result.outcome).toBe("DO_NOT_CREATE");
    expect(result.tracking).toBeNull();
    expect(result.mailshipDiscrepancy).toBe(false);
  });
  it("does not query tracking after finding an existing complaint", () => {
    let calls = 0;
    const ctx = makeContext({ complaints: [makeComplaint({ orderNumber: "MS-test-1" })] });
    const result = decideOrder(groupFor(makeOrder()), ctx, { getPage: () => { calls += 1; return deliveredPage; } }, NOW);
    expect(calls).toBe(0);
    expect(result.reasons.map((reason) => reason.code)).toEqual(["EXISTING_COMPLAINT"]);
  });
  it("keeps NO_REPORTER plus IN_TRANSIT in manual review", () => {
    const result = decideOrder(groupFor(makeOrder({ status: "carrier_picked_up", client: null })), makeContext(), { getPage: () => inTransitPage }, NOW);
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["NO_REPORTER"]);
    expect(result.tracking?.state).toBe("IN_TRANSIT");
    expect(result.mailshipDiscrepancy).toBe(false);
  });
  it("prioritizes DELIVERED over NO_REPORTER while preserving both reasons", () => {
    const result = decideOrder(groupFor(makeOrder({ status: "carrier_picked_up", client: null })), makeContext(), { getPage: () => deliveredPage }, NOW);
    expect(result.outcome).toBe("DO_NOT_CREATE");
    expect(result.reasons).toEqual([
      { code: "NO_REPORTER" }, { code: "DELIVERED_PER_TRACKING", detail: "Zásilka byla doručena příjemci." },
    ]);
    expect(result.tracking?.state).toBe("DELIVERED");
    expect(result.mailshipDiscrepancy).toBe(true);
  });
  it("does not query tracking for conflicting records", () => {
    const first = makeOrder();
    const group = dedupeOrders([first, { ...first, trackingNumber: "another" }])[0];
    if (group === undefined) throw new Error("Chybí testovací skupina.");
    let calls = 0;
    const result = decideOrder(group, makeContext(), { getPage: () => { calls += 1; return deliveredPage; } }, NOW);
    expect(calls).toBe(0);
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["CONFLICTING_RECORDS"]);
    expect(result.tracking).toBeNull();
    expect(result.mailshipDiscrepancy).toBe(false);
  });
  it("rejects A when the carrier confirms delivery", () => {
    const result = decideOrder(groupFor(makeOrder()), makeContext(), { getPage: () => deliveredPage }, NOW);
    expect(result.outcome).toBe("DO_NOT_CREATE");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["DELIVERED_PER_TRACKING"]);
    expect(result.mailshipDiscrepancy).toBe(true);
  });
  it("sends A with IN_TRANSIT to manual review", () => {
    const result = decideOrder(groupFor(makeOrder()), makeContext(), { getPage: () => inTransitPage }, NOW);
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["CARRIER_PICKUP_CONFIRMED"]);
  });
  it("creates a B candidate in transit with its reporter and rule reason", () => {
    const result = decideOrder(groupFor(makeOrder({ status: "carrier_picked_up" })), makeContext(), { getPage: () => inTransitPage }, NOW);
    expect(result).toMatchObject({ outcome: "CREATE", reasons: [], reporter: "reporter@example.test", complaintReason: "loss", mailshipDiscrepancy: false });
  });
  it("preserves layer 1 reasons before an unavailable tracking reason", () => {
    const result = decideOrder(groupFor(makeOrder({ status: "carrier_picked_up", client: null, orderNumber: null })), makeContext(), { getPage: () => null }, NOW);
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(result.reasons.map((reason) => reason.code)).toEqual(["MISSING_ORDER_NUMBER", "NO_REPORTER", "TRACKING_UNAVAILABLE"]);
    expect(result.tracking).toBeNull();
    expect(result.mailshipDiscrepancy).toBe(false);
  });
  it("retains UNKNOWN evidence for a delivery message outside the whitelist", () => {
    const quote = "Zásilka nebyla doručena příjemci.";
    const result = decideOrder(groupFor(makeOrder({ status: "carrier_picked_up" })), makeContext(), {
      getPage: () => `<div class="shipment-message">${quote}</div>`,
    }, NOW);
    expect(result.outcome).toBe("NEEDS_REVIEW");
    expect(result.reasons).toEqual([{ code: "TRACKING_UNKNOWN", detail: quote }]);
    expect(result.mailshipDiscrepancy).toBe(false);
  });
});

describe("decideAll", () => {
  it("deduplicates orders in first-seen order without querying a duplicate twice", () => {
    const first = makeOrder({ orderId: "first", orderNumber: "first", status: "carrier_picked_up" });
    const second = makeOrder({ orderId: "second", orderNumber: "second", status: "carrier_picked_up" });
    let calls = 0;
    const input = { ...makeContext(), orders: [first, second, { ...first }] };
    const results = decideAll(input, { getPage: () => { calls += 1; return inTransitPage; } }, NOW);
    expect(results.map((result) => result.orderId)).toEqual(["first", "second"]);
    expect(calls).toBe(2);
  });
});
