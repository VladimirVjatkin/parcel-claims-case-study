import { describe, expect, it } from "vitest";
import type { Decision } from "../src/decision/decide.js";
import type { Outcome } from "../src/domain/types.js";
import { formatDecisionReport } from "../src/report/formatDecisionReport.js";

const meta = { now: new Date("2026-11-02T06:30:00Z"), exportRowCount: 4 };

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    orderId: "id-1", orderLabel: "MS-test-1", mailshipStatus: "carrier_picked_up", definition: "B",
    outcome: "CREATE", reasons: [], reporter: "reporter@example.test", complaintReason: "loss",
    daysInStatus: 14, tracking: { state: "IN_TRANSIT", quote: "Na cestě", pickupPoint: null },
    mailshipDiscrepancy: false, ...overrides,
  };
}

describe("formatDecisionReport", () => {
  it("includes the summary, Prague date, shadow mode and all four sections", () => {
    const report = formatDecisionReport([
      makeDecision(),
      makeDecision({ orderLabel: "MS-review", outcome: "NEEDS_REVIEW", reasons: [{ code: "NO_REPORTER" }] }),
      makeDecision({ orderLabel: "MS-delivered", outcome: "DO_NOT_CREATE", reasons: [{ code: "DELIVERED_PER_TRACKING", detail: "Doručeno" }], tracking: { state: "DELIVERED", quote: "Doručeno", pickupPoint: null }, mailshipDiscrepancy: true }),
    ], meta);
    expect(report).toContain("2. 11. 2026 07:30 (Europe/Prague)");
    expect(report).toContain("Režim: stínový — nic se nezakládá");
    expect(report).toContain("Data: 4 řádků exportu → 3 objednávek.");
    expect(report).toContain("| Založit (CREATE) | 1 |");
    expect(report).toContain("| Ruční kontrola (NEEDS_REVIEW) | 1 |");
    expect(report).toContain("| Nezakládat (DO_NOT_CREATE) | 1 |");
    for (const title of ["Založit (CREATE)", "Ruční kontrola (NEEDS_REVIEW)", "Nezakládat (DO_NOT_CREATE)", "Nesoulad s Mailshipem"]) {
      expect(report).toContain(`## ${title}`);
    }
    expect(report).toContain("| MS-delivered | carrier_picked_up | Doručeno |");
  });
  it.each<Outcome>(["CREATE", "NEEDS_REVIEW", "DO_NOT_CREATE"])("sorts rows within %s", (outcome) => {
    const report = formatDecisionReport([
      makeDecision({ orderLabel: "MS-Z", outcome }), makeDecision({ orderLabel: "MS-A", outcome }),
    ], meta);
    expect(report.indexOf("| MS-A |")).toBeLessThan(report.indexOf("| MS-Z |"));
  });
  it("sorts discrepancy rows and preserves the actual Mailship status", () => {
    const report = formatDecisionReport([
      makeDecision({ orderLabel: "MS-Z", mailshipDiscrepancy: true, mailshipStatus: "waiting_for_carrier" }),
      makeDecision({ orderLabel: "MS-A", mailshipDiscrepancy: true }),
    ], meta);
    const discrepancies = report.split("## Nesoulad s Mailshipem")[1] ?? "";
    expect(discrepancies.indexOf("| MS-A |")).toBeLessThan(discrepancies.indexOf("| MS-Z |"));
    expect(discrepancies).toContain("| MS-Z | waiting_for_carrier | Na cestě |");
  });
  it("escapes pipes and replaces line breaks in every table cell", () => {
    const report = formatDecisionReport([makeDecision({
      orderLabel: "MS|x\ny", reporter: "a|b\r\nc", complaintReason: "loss|note",
      tracking: { state: "IN_TRANSIT", quote: "Na|cestě\rnová", pickupPoint: null },
    })], meta);
    expect(report).toContain("MS\\|x y");
    expect(report).toContain("a\\|b c");
    expect(report).toContain("loss\\|note");
    expect(report).toContain("IN_TRANSIT — Na\\|cestě nová");
  });
  it("preserves reason order, including a reason with no detail", () => {
    const report = formatDecisionReport([makeDecision({
      outcome: "NEEDS_REVIEW", tracking: null, reasons: [
        { code: "NO_REPORTER" }, { code: "TRACKING_UNAVAILABLE", detail: "chybí | stránka\nnová" },
      ],
    })], meta);
    expect(report).toContain("NO_REPORTER; TRACKING_UNAVAILABLE — chybí \\| stránka nová");
  });
  it("uses dashes for missing fields", () => {
    const report = formatDecisionReport([makeDecision({
      definition: null, daysInStatus: null, reporter: null, complaintReason: null, tracking: null,
    })], meta);
    expect(report).toContain("| MS-test-1 | — | — | — | — | — |");
  });
  it("marks every empty section and reports zero counts", () => {
    const report = formatDecisionReport([], { ...meta, exportRowCount: 0 });
    expect(report.match(/Žádné objednávky\./g)).toHaveLength(4);
    expect(report).toContain("| Založit (CREATE) | 0 |");
    expect(report).toContain("| Ruční kontrola (NEEDS_REVIEW) | 0 |");
    expect(report).toContain("| Nezakládat (DO_NOT_CREATE) | 0 |");
  });
  it("is deterministic and does not reorder the input", () => {
    const decisions = [makeDecision({ orderLabel: "MS-Z" }), makeDecision({ orderLabel: "MS-A" })];
    expect(formatDecisionReport(decisions, meta)).toBe(formatDecisionReport([...decisions].reverse(), meta));
    expect(decisions.map((decision) => decision.orderLabel)).toEqual(["MS-Z", "MS-A"]);
  });
});
