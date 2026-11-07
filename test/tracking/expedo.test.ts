import { DEFAULT_RUN_MOMENT as PARSER_REFERENCE_MOMENT } from "../../src/config.js";
import { describe, expect, it } from "vitest";
import { parseExpedo } from "../../src/tracking/parsers/expedo.js";

const REFERENCE_MOMENT = new Date(PARSER_REFERENCE_MOMENT);

function page(value: string): string {
  return `<div class="status-card"><strong class="value">${value}</strong></div>`;
}

describe("Expedo", () => {
  it("ignores delivery words in cookies, ads and FAQ", () => {
    const html = `<div id="cookie-banner">Doručeno</div><section class="hero-ad">Doručeno do 24 hodin!</section>
      <aside class="ads">Doručeno</aside><div class="faq">Doručeno</div>${page("Na cestě")}`;
    expect(parseExpedo(html, REFERENCE_MOMENT)).toEqual({ state: "IN_TRANSIT", quote: "Na cestě", pickupPoint: null });
  });
  it.each([
    ["Doručeno", "DELIVERED"], ["Na cestě", "IN_TRANSIT"], ["Převzato dopravcem", "IN_TRANSIT"],
    ["Vrací se odesílateli", "RETURNING"], ["Zásilku jsme nenašli", "UNKNOWN"],
    ["Nový stav", "UNKNOWN"], ["Doručeno do 24 hodin!", "UNKNOWN"],
  ])("matches the whole value %s", (value, expected) => {
    expect(parseExpedo(page(value), REFERENCE_MOMENT)).toEqual({ state: expected, quote: value, pickupPoint: null });
  });
  it("normalizes whitespace and case for matching", () => {
    expect(parseExpedo(page("  PŘEVZATO\n DOPRAVCEM "), REFERENCE_MOMENT).state).toBe("IN_TRANSIT");
  });
  it.each(["<div>Doručeno</div>", page("Doručeno") + page("Na cestě")])("rejects missing or multiple status values", (html) => {
    expect(parseExpedo(html, REFERENCE_MOMENT)).toEqual({ state: "UNKNOWN", quote: "", pickupPoint: null });
  });
});
