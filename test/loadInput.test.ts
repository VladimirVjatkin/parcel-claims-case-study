import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outcomeFromReasons } from "../src/domain/types.js";
import { loadInput } from "../src/input/loadInput.js";
import { dedupeOrders } from "../src/layer1/dedupe.js";
import { evaluateRules } from "../src/layer1/rules.js";
import { findReporter } from "../src/layer1/reporter.js";
import { makeComplaint, makeOrder, NOW } from "./helpers/makeOrder.js";

const dataDir = fileURLToPath(new URL("../data", import.meta.url));
const temporaryRoot = resolve(tmpdir());
let fixtureDir: string;

function writeJson(name: string, value: unknown): void {
  writeFileSync(join(fixtureDir, name), JSON.stringify(value), "utf8");
}

function evaluateLoadedOrder() {
  const input = loadInput(fixtureDir);
  const group = dedupeOrders(input.orders)[0];
  if (group === undefined) throw new Error("Chybí testovací objednávka.");
  return evaluateRules(group, input, NOW);
}

beforeEach(() => {
  fixtureDir = mkdtempSync(join(temporaryRoot, "mailstep-input-"));
  copyFileSync(join(dataDir, "rules.yaml"), join(fixtureDir, "rules.yaml"));
  writeFileSync(join(fixtureDir, "reporters.csv"), "client,reporter_email\nTestovací klient,reporter@example.test\n", "utf8");
  writeJson("orders.json", [makeOrder()]);
  writeJson("complaints.json", []);
  writeJson("returns.json", []);
});

afterEach(() => {
  const target = resolve(fixtureDir);
  if (dirname(target) !== temporaryRoot || !basename(target).startsWith("mailstep-input-")) {
    throw new Error("Neplatná cesta dočasných testovacích dat.");
  }
  rmSync(target, { recursive: true, force: true });
});

describe("loadInput normalizes export records before evaluating rules", () => {
  it("treats an absent orderNumber as missing, never CREATE", () => {
    const row: Record<string, unknown> = { ...makeOrder() };
    delete row.orderNumber;
    writeJson("orders.json", [row]);
    expect(loadInput(fixtureDir).orders[0]?.orderNumber).toBeNull();
    const result = evaluateLoadedOrder();
    expect(result.reasons).toEqual([{ code: "MISSING_ORDER_NUMBER" }]);
    expect(outcomeFromReasons(result.reasons)).toBe("NEEDS_REVIEW");
  });

  it("treats an absent client as NO_REPORTER without throwing", () => {
    const row: Record<string, unknown> = { ...makeOrder() };
    delete row.client;
    writeJson("orders.json", [row]);
    expect(loadInput(fixtureDir).orders[0]?.client).toBeNull();
    const result = evaluateLoadedOrder();
    expect(result.reasons).toEqual([{ code: "NO_REPORTER" }]);
    expect(outcomeFromReasons(result.reasons)).toBe("NEEDS_REVIEW");
  });

  it.each(["", " "])("treats blank orderNumber %j as missing and skips joins", (orderNumber) => {
    writeJson("orders.json", [makeOrder({ orderNumber })]);
    writeJson("complaints.json", [makeComplaint({ orderNumber })]);
    writeJson("returns.json", [{ returnId: "r", orderNumber, status: "Připraveno", createdAt: "2026-11-01T10:00:00Z" }]);
    const result = evaluateLoadedOrder();
    expect(result.reasons).toEqual([{ code: "MISSING_ORDER_NUMBER" }]);
    expect(result.runTracking).toBe(true);
  });

  it.each(["orderId", "status"])("rejects an absent %s with the record number", (field) => {
    const row: Record<string, unknown> = { ...makeOrder() };
    delete row[field];
    writeJson("orders.json", [makeOrder(), row]);
    expect(() => loadInput(fixtureDir)).toThrow(`orders.json, řádek 2, ${field}`);
  });

  it.each([
    ["orderId", ""], ["orderId", "  "], ["status", ""], ["status", "  "],
    ["orderId", 123], ["status", null], ["client", 123],
  ])("rejects an invalid %s=%j instead of asserting its type", (field, value) => {
    writeJson("orders.json", [{ ...makeOrder(), [field]: value }]);
    expect(() => loadInput(fixtureDir)).toThrow(`orders.json, řádek 1, ${field}`);
  });

  it("normalizes every absent nullable order field to null", () => {
    writeJson("orders.json", [{ orderId: "order-1", status: "waiting_for_carrier" }]);
    expect(loadInput(fixtureDir).orders[0]).toEqual({
      orderId: "order-1", status: "waiting_for_carrier", orderNumber: null, client: null,
      carrier: null, shippingMethod: null, trackingNumber: null, trackingUrl: null,
      createdAt: null, packedAt: null, shippedAt: null, updatedAt: null,
    });
  });

  it("normalizes absent complaint and return fields and skips unusable reporters", () => {
    const complaint: Record<string, unknown> = { ...makeComplaint() };
    delete complaint.orderNumber;
    delete complaint.client;
    delete complaint.reporter;
    writeJson("complaints.json", [complaint]);
    writeJson("returns.json", [{ returnId: "r", status: "Připraveno", createdAt: "2026-11-01T10:00:00Z" }]);
    writeJson("orders.json", [makeOrder({ orderNumber: null })]);
    const input = loadInput(fixtureDir);
    expect(input.complaints[0]).toMatchObject({ orderNumber: null, client: "", reporter: "" });
    expect(input.returns[0]?.orderNumber).toBeNull();
    expect(findReporter("Testovací klient", [], input.complaints)).toBeNull();
    expect(evaluateLoadedOrder().reasons).toEqual([{ code: "MISSING_ORDER_NUMBER" }]);
  });
});
