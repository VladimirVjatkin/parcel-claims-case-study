import { describe, expect, it } from "vitest";
import { parseKuryrVltava } from "../../src/tracking/parsers/kuryrVltava.js";

function page(message: string): string {
  return `<div class="progress__fill" style="width:100%"></div><div class="shipment-message">${message}</div>`;
}

describe("Kurýr Vltava", () => {
  it("does not treat delivery to a neighbour or a full progress bar as delivery to the recipient", () => {
    const quote = "Zásilka byla doručena 28. 10. 2026. Převzal: soused (Novák).";
    expect(parseKuryrVltava(page(quote))).toEqual({ state: "UNKNOWN", quote, pickupPoint: null });
  });
  it.each([
    "Zásilka nebyla doručena příjemci.",
    "Zásilka byla doručena příjemci. Převzal: soused.",
    "Zásilka byla doručena. Převzala: sestra.",
    "Zásilka byla doručena příjemci. Předáno sousedovi.",
    "Zásilka nedoručena příjemci.",
    "Zásilka nedoručena příjemci. Zásilka byla doručena příjemci.",
    "Zásilka byla doručena příjemci. Zásilka je na cestě k vám.",
    "Zásilka nebyla doručena příjemci, vracíme odesílateli.",
  ])("rejects negated or conflicting delivery evidence: %s", (quote) => {
    expect(parseKuryrVltava(page(quote))).toEqual({ state: "UNKNOWN", quote, pickupPoint: null });
  });
  it.each([
    "Zásilka byla doručena příjemci.",
    "Zásilka byla doručena příjemci 30. 10. 2026.",
    "Zásilka byla doručena příjemci 30. 10. 2026 v 13:12.",
    "Zásilka byla doručena příjemci v 13:12.",
    "ZÁSILKA BYLA DORUČENA PŘÍJEMCI.",
  ])("accepts only a complete known delivery message: %s", (quote) => {
    expect(parseKuryrVltava(page(quote))).toEqual({ state: "DELIVERED", quote, pickupPoint: null });
  });
  it("normalizes whitespace in the quote but preserves its case", () => {
    expect(parseKuryrVltava(page(" Zásilka\n byla doručena\u00a0příjemci. "))).toEqual({
      state: "DELIVERED", quote: "Zásilka byla doručena příjemci.", pickupPoint: null,
    });
  });
  it.each([
    ["Zásilku vracíme odesílateli.", "RETURNING"],
    ["Zásilka byla vrácena odesílateli.", "RETURNING"],
    ["Zásilka je na cestě k vám.", "IN_TRANSIT"],
    ["Příjemce nebyl zastižen. Zásilka je uložena na depu.", "IN_TRANSIT"],
    ["Zásilku právě nakládáme k doručení. Předpokládaný čas doručení je 14:00–16:00.", "IN_TRANSIT"],
    ["Nový neznámý stav.", "UNKNOWN"],
  ])("classifies the status message %s", (message, expected) => {
    expect(parseKuryrVltava(page(message)).state).toBe(expected);
  });
  it("ignores delivery labels outside the status message", () => {
    expect(parseKuryrVltava(`<h1>Doručeno příjemci</h1>${page("Zásilka je na cestě k vám.")}`).state).toBe("IN_TRANSIT");
  });
  it.each(["<p>Doručena příjemci</p>", `${page("Zásilka byla doručena příjemci.")}${page("Nový stav")}`])("rejects a missing or ambiguous message", (html) => {
    expect(parseKuryrVltava(html)).toEqual({ state: "UNKNOWN", quote: "", pickupPoint: null });
  });
});
