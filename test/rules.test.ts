import { describe, expect, it } from "vitest";
import type { Order, ReasonCode } from "../src/domain/types.js";
import { outcomeFromReasons } from "../src/domain/types.js";
import { dedupeOrders } from "../src/layer1/dedupe.js";
import { definitionForStatus, evaluateRules } from "../src/layer1/rules.js";
import type { Layer1Result, RulesContext } from "../src/layer1/rules.js";
import { makeComplaint, makeContext, makeOrder, NOW } from "./helpers/makeOrder.js";

function evaluate(overrides: Partial<Order> = {}, context: RulesContext = makeContext()): Layer1Result {
  const group = dedupeOrders([makeOrder(overrides)])[0];
  if (group === undefined) throw new Error("Chybí testovací skupina.");
  return evaluateRules(group, context, NOW);
}

function codes(result: Layer1Result): ReasonCode[] {
  return result.reasons.map((reason) => reason.code);
}

describe("evaluateRules", () => {
  it.each([
    ["waiting_for_carrier", "2026-10-31T23:40:00+01:00", 2, []],
    ["waiting_for_carrier", "2026-11-01T09:00:00+01:00", 1, ["TOO_FEW_DAYS"]],
    ["carrier_picked_up", "2026-10-19T10:00:00+02:00", 14, []],
    ["carrier_picked_up", "2026-10-20T00:30:00+02:00", 13, ["TOO_FEW_DAYS"]],
  ])("checks the threshold for %s at %s", (status, date, days, expected) => {
    const result = evaluate({ status, packedAt: date, shippedAt: date });
    expect(result.daysInStatus).toBe(days);
    expect(codes(result)).toEqual(expected);
    expect(result.runTracking).toBe(expected.length === 0);
    expect(result.complaintReason).toBe(status === "waiting_for_carrier" ? "not_collected_by_carrier" : "loss");
  });

  it.each([
    { packedAt: null }, { status: "carrier_picked_up", shippedAt: null },
    { packedAt: "abc" }, { packedAt: "2026-10-20T10:00:00" },
  ])("requires a valid status date: %j", (overrides) => {
    const result = evaluate(overrides);
    expect(codes(result)).toEqual(["MISSING_STATUS_DATE"]);
    expect(result.daysInStatus).toBeNull();
    expect(result.runTracking).toBe(true);
  });

  it.each([null, "   "])("requires a shipping method: %s", (shippingMethod) => {
    expect(codes(evaluate({ shippingMethod }))).toEqual(["MISSING_SHIPPING_METHOD"]);
  });

  it("uses packedAt rather than updatedAt", () => {
    expect(evaluate({ packedAt: "2026-10-30T10:00:00+01:00", updatedAt: "2026-11-01T10:00:00+01:00" }).daysInStatus).toBe(3);
    expect(codes(evaluate())).toEqual([]);
  });

  it("uses different exclusions for A and B and trims the shipping method", () => {
    expect(codes(evaluate({ shippingMethod: "Parcelo DE" }))).toEqual([]);
    expect(codes(evaluate({ status: "carrier_picked_up", shippingMethod: " Parcelo DE " }))).toEqual(["EXCLUDED_SHIPPING_METHOD"]);
    for (const status of ["waiting_for_carrier", "carrier_picked_up"]) {
      expect(codes(evaluate({ status, shippingMethod: "Interní přeprava" }))).toEqual(["EXCLUDED_SHIPPING_METHOD"]);
    }
  });

  it("reads both status and day threshold from rules", () => {
    const ctx = makeContext();
    ctx.rules.A.minDaysInStatus = 5;
    ctx.rules.A.status = "custom_status";
    expect(definitionForStatus("custom_status", ctx.rules)).toBe("A");
    expect(codes(evaluate({ status: "custom_status" }, ctx))).toEqual(["TOO_FEW_DAYS"]);
  });

  it("stops on a non-candidate status even with a return and missing reporter", () => {
    const result = evaluate({ status: "delivered" }, makeContext({
      reporterMatrix: [], returns: [{ returnId: "r", orderNumber: "MS-test-1", status: "Přijato", createdAt: "2026-11-01T10:00:00Z" }],
    }));
    expect(codes(result)).toEqual(["NOT_CANDIDATE_STATUS"]);
    expect(result).toMatchObject({ definition: null, daysInStatus: null, reporter: null, complaintReason: null, runTracking: false });
  });

  it("stops on conflicting rows and reports all differing fields", () => {
    const first = makeOrder({ packedAt: "2026-11-01T09:00:00Z", client: null });
    const group = dedupeOrders([first, { ...first, trackingNumber: "other", status: "delivered" }])[0];
    if (group === undefined) throw new Error("Chybí testovací skupina.");
    const result = evaluateRules(group, makeContext(), NOW);
    expect(codes(result)).toEqual(["CONFLICTING_RECORDS"]);
    expect(result.reasons[0]?.detail).toContain("trackingNumber, status");
    expect(result).toMatchObject({ definition: null, daysInStatus: null, reporter: null, complaintReason: null, runTracking: false });
  });

  it("collects blocking and review reasons without stopping", () => {
    const result = evaluate({ packedAt: "2026-11-01T09:00:00Z", client: null }, makeContext({
      complaints: [makeComplaint({ orderNumber: "MS-test-1" })],
    }));
    expect(codes(result)).toEqual(["TOO_FEW_DAYS", "EXISTING_COMPLAINT", "NO_REPORTER"]);
    expect(outcomeFromReasons(result.reasons)).toBe("DO_NOT_CREATE");
    expect(result.runTracking).toBe(false);
  });

  it("does not join null order numbers and still allows tracking", () => {
    const ctx = makeContext({
      complaints: [makeComplaint({ orderNumber: null })],
      returns: [{ returnId: "r", orderNumber: null, status: "Připraveno", createdAt: "2026-11-01T10:00:00Z" }],
    });
    const result = evaluate({ orderNumber: null }, ctx);
    expect(codes(result)).toEqual(["MISSING_ORDER_NUMBER"]);
    expect(result.runTracking).toBe(true);
    expect(result.orderLabel).toBe("KV-test-1");
    const tooYoung = evaluate({ orderNumber: null, packedAt: "2026-11-01T09:00:00Z" }, ctx);
    expect(codes(tooYoung)).toEqual(["TOO_FEW_DAYS", "MISSING_ORDER_NUMBER"]);
    expect(outcomeFromReasons(tooYoung.reasons)).toBe("DO_NOT_CREATE");
  });

  it("blocks a closed complaint even with a different reason", () => {
    const result = evaluate({}, makeContext({ complaints: [makeComplaint({ orderNumber: "MS-test-1", status: "closed", reason: "damaged" })] }));
    expect(result.reasons).toEqual([{ code: "EXISTING_COMPLAINT", detail: "closed" }]);
  });

  it("blocks a processed WMS return", () => {
    const result = evaluate({}, makeContext({ returns: [{ returnId: "r", orderNumber: "MS-test-1", status: "Zpracováno", createdAt: "2026-11-01T10:00:00Z" }] }));
    expect(result.reasons).toEqual([{ code: "RETURN_IN_WMS", detail: "Zpracováno" }]);
  });

  it("keeps a candidate without a reporter eligible for tracking", () => {
    const result = evaluate({ client: null });
    expect(codes(result)).toEqual(["NO_REPORTER"]);
    expect(result.runTracking).toBe(true);
  });

  it("does not reject a null carrier in layer 1", () => {
    expect(codes(evaluate({ carrier: null }))).toEqual([]);
  });

  it("falls back to orderId when there is no order or tracking number", () => {
    expect(evaluate({ orderNumber: null, trackingNumber: null }).orderLabel).toBe("order-1");
  });

  it.each([
    [" MS-test-1 ", "MS-test-1"],
    ["MS-test-1", " MS-test-1 "],
    [" MS-test-1 ", " MS-test-1 "],
  ])("matches trimmed order number %j with complaint %j", (orderNumber, complaintNumber) => {
    const result = evaluate({ orderNumber }, makeContext({
      complaints: [makeComplaint({ orderNumber: complaintNumber })],
    }));
    expect(result.reasons).toEqual([{ code: "EXISTING_COMPLAINT", detail: "closed" }]);
    expect(result.runTracking).toBe(false);
  });

  it.each([
    [" MS-test-1 ", "MS-test-1"],
    ["MS-test-1", " MS-test-1 "],
    [" MS-test-1 ", " MS-test-1 "],
  ])("matches trimmed order number %j with return %j", (orderNumber, returnNumber) => {
    const result = evaluate({ orderNumber }, makeContext({
      returns: [{ returnId: "r", orderNumber: returnNumber, status: "Připraveno", createdAt: "2026-11-01T10:00:00Z" }],
    }));
    expect(result.reasons).toEqual([{ code: "RETURN_IN_WMS", detail: "Připraveno" }]);
    expect(result.runTracking).toBe(false);
  });

  it.each([null, "", "  "])("does not match a complaint or return with missing number %j", (orderNumber) => {
    const result = evaluate({}, makeContext({
      complaints: [makeComplaint({ orderNumber })],
      returns: [{ returnId: "r", orderNumber, status: "Připraveno", createdAt: "2026-11-01T10:00:00Z" }],
    }));
    expect(result.reasons).toEqual([]);
  });

  it.each([
    [" MS-test-1 ", " KV-test-1 ", "MS-test-1"],
    ["", "KV-test-1", "KV-test-1"],
    ["  ", " KV-test-1 ", "KV-test-1"],
    ["", "  ", "order-1"],
  ])("uses a nonempty trimmed orderLabel for %j and %j", (orderNumber, trackingNumber, expected) => {
    expect(evaluate({ orderNumber, trackingNumber }).orderLabel).toBe(expected);
  });
});

describe("outcomeFromReasons", () => {
  it("uses CREATE when there are no reasons", () => expect(outcomeFromReasons([])).toBe("CREATE"));
  it("uses NEEDS_REVIEW without a blocking reason", () => expect(outcomeFromReasons([{ code: "NO_REPORTER" }])).toBe("NEEDS_REVIEW"));
  it("prioritizes DO_NOT_CREATE in either order", () => {
    expect(outcomeFromReasons([{ code: "NO_REPORTER" }, { code: "EXISTING_COMPLAINT" }])).toBe("DO_NOT_CREATE");
    expect(outcomeFromReasons([{ code: "EXISTING_COMPLAINT" }, { code: "NO_REPORTER" }])).toBe("DO_NOT_CREATE");
  });
});
