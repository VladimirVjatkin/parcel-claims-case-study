import { describe, expect, it } from "vitest";
import { dedupeOrders } from "../src/layer1/dedupe.js";
import { makeOrder } from "./helpers/makeOrder.js";

describe("dedupeOrders", () => {
  it("merges exact duplicates", () => {
    const order = makeOrder();
    expect(dedupeOrders([order, { ...order }])).toEqual([
      { orderId: order.orderId, order, rowCount: 2, conflicting: false, differingFields: [] },
    ]);
  });
  it("lists all differing fields in declaration order across all rows", () => {
    const order = makeOrder();
    const groups = dedupeOrders([
      order, { ...order, status: "delivered" }, { ...order, trackingNumber: "different" }, order,
    ]);
    expect(groups[0]).toMatchObject({ rowCount: 4, conflicting: true, differingFields: ["trackingNumber", "status"] });
  });
  it("ignores property insertion order", () => {
    const order = makeOrder();
    const reordered = Object.fromEntries(Object.entries(order).reverse()) as typeof order;
    expect(dedupeOrders([order, reordered])[0]?.conflicting).toBe(false);
  });
  it("preserves first-seen group order", () => {
    const first = makeOrder({ orderId: "b" });
    const second = makeOrder({ orderId: "a" });
    expect(dedupeOrders([first, second, first]).map((group) => group.orderId)).toEqual(["b", "a"]);
  });
  it("also treats a changed updatedAt as a data conflict", () => {
    expect(dedupeOrders([makeOrder(), makeOrder({ updatedAt: null })])[0]?.differingFields).toEqual(["updatedAt"]);
  });
});
