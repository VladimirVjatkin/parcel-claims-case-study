import { describe, expect, it } from "vitest";
import { errorImpact } from "../src/eval/evaluatePages.js";
import type { EvaluationResult, PageEvaluation } from "../src/eval/evaluatePages.js";
import { formatEvaluation } from "../src/report/formatEvaluation.js";
import type { TrackingState } from "../src/tracking/types.js";

function page(file: string, expected: TrackingState, predicted: TrackingState): PageEvaluation {
  return { file, carrier: "Expedo", expected, predicted, quote: "Citace", note: "", impact: errorImpact(expected, predicted) };
}

describe("formatEvaluation", () => {
  it("shows all sections, the confusion matrix and one error of each impact", () => {
    const result: EvaluationResult = { pages: [
      page("d.html", "RETURNING", "UNKNOWN"), page("c.html", "DELIVERED", "UNKNOWN"),
      page("b.html", "DELIVERED", "IN_TRANSIT"), page("a.html", "IN_TRANSIT", "DELIVERED"),
    ] };
    const report = formatEvaluation(result);
    for (const title of ["Podle dopravce", "Matice záměn", "Chyby podle dopadu na rozhodnutí", "Chybné stránky"]) {
      expect(report).toContain(`## ${title}`);
    }
    expect(report).toContain("Stránek: 4 · Správně: 0 · Chybně: 4 (0 %)");
    expect(report).toContain("| DELIVERED | 0 | 1 | 0 | 1 |");
    expect(report).toContain("| IN_TRANSIT | 1 | 0 | 0 | 0 |");
    expect(report).toContain("| RETURNING | 0 | 0 | 0 | 1 |");
    const impactSection = report.split("## Chyby podle dopadu na rozhodnutí")[1]?.split("## Chybné stránky")[0] ?? "";
    const impacts = ["HIDDEN_PROBLEM", "WRONG_COMPLAINT", "EXTRA_REVIEW", "NO_DECISION_IMPACT"];
    let previousIndex = -1;
    for (const impact of impacts) {
      const line = impactSection.split("\n").find((value) => value.startsWith(`| ${impact} |`));
      expect(line).toMatch(/\| 1 \|$/);
      expect(impactSection.indexOf(`| ${impact} |`)).toBeGreaterThan(previousIndex);
      previousIndex = impactSection.indexOf(`| ${impact} |`);
    }
    expect(report).toContain("nejde tedy o nezávislé měření");
    expect(report).toContain("u definice A");
  });
  it.each([[19, 20, 95], [1, 3, 33]])("rounds %i correct of %i pages down to %i percent", (correct, total, percent) => {
    const pages: PageEvaluation[] = [];
    for (let index = 0; index < total; index += 1) pages.push(page(`${index}.html`, "IN_TRANSIT", index < correct ? "IN_TRANSIT" : "UNKNOWN"));
    expect(formatEvaluation({ pages })).toContain(`(${percent} %)`);
  });
  it("sorts carriers and error files, and escapes table cells", () => {
    const first = { ...page("z.html", "IN_TRANSIT", "DELIVERED"), carrier: "Zeta", quote: "a|b\nc" };
    const second = { ...page("a.html", "IN_TRANSIT", "DELIVERED"), carrier: "Alfa" };
    const report = formatEvaluation({ pages: [first, second] });
    expect(report.indexOf("| Alfa |")).toBeLessThan(report.indexOf("| Zeta |"));
    expect(report.indexOf("| a.html |")).toBeLessThan(report.indexOf("| z.html |"));
    expect(report).toContain("a\\|b c");
    expect(formatEvaluation({ pages: [first, second] })).toBe(formatEvaluation({ pages: [second, first] }));
  });
  it("shows every impact even with zero errors", () => {
    const report = formatEvaluation({ pages: [page("a.html", "IN_TRANSIT", "IN_TRANSIT")] });
    expect(report).toContain("Žádné chyby.");
    expect(report).toContain("Stránek: 1 · Správně: 1 · Chybně: 0 (100 %)");
    for (const impact of ["HIDDEN_PROBLEM", "WRONG_COMPLAINT", "EXTRA_REVIEW", "NO_DECISION_IMPACT"]) {
      expect(report.split("\n").find((line) => line.startsWith(`| ${impact} |`))).toMatch(/\| 0 \|$/);
    }
  });
  it("handles an empty dataset without NaN", () => {
    expect(formatEvaluation({ pages: [] })).toContain("Stránek: 0 · Správně: 0 · Chybně: 0 (0 %)");
  });
});
