import { describe, expect, it } from "vitest";
import { parseExpedo } from "../../src/tracking/parsers/expedo.js";

function page(value: string): string {
  return `<div class="status-card"><strong class="value">${value}</strong></div>`;
}

describe("Expedo", () => {
  it("ignores delivery words in cookies, ads and FAQ", () => {
    const html = `<div id="cookie-banner">Doručeno</div><section class="hero-ad">Doručeno do 24 hodin!</section>
      <aside class="ads">Doručeno</aside><div class="faq">Doručeno</div>${page("Na cestě")}`;
    expect(parseExpedo(html)).toEqual({ state: "IN_TRANSIT", quote: "Na cestě", pickupPoint: null });
  });
  it.each([
    ["Doručeno", "DELIVERED"], ["Na cestě", "IN_TRANSIT"], ["Převzato dopravcem", "IN_TRANSIT"],
    ["Vrací se odesílateli", "RETURNING"], ["Zásilku jsme nenašli", "UNKNOWN"],
    ["Nový stav", "UNKNOWN"], ["Doručeno do 24 hodin!", "UNKNOWN"],
  ])("matches the whole value %s", (value, expected) => {
    expect(parseExpedo(page(value))).toEqual({ state: expected, quote: value, pickupPoint: null });
  });
  it("normalizes whitespace and case for matching", () => {
    expect(parseExpedo(page("  PŘEVZATO\n DOPRAVCEM ")).state).toBe("IN_TRANSIT");
  });
  it.each(["<div>Doručeno</div>", page("Doručeno") + page("Na cestě")])("rejects missing or multiple status values", (html) => {
    expect(parseExpedo(html)).toEqual({ state: "UNKNOWN", quote: "", pickupPoint: null });
  });
});
