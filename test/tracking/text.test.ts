import { describe, expect, it } from "vitest";
import { containsPhrase, normalizeText, parseCzechDate } from "../../src/tracking/text.js";

describe("tracking text", () => {
  it("normalizes spaces, line breaks and nonbreaking spaces", () => {
    expect(normalizeText("  Zásilka\n je\t na\u00a0cestě  ")).toBe("Zásilka je na cestě");
  });
  it.each([
    ["doručeno příjemci", "doručeno příjemci", true],
    ["zásilka doručeno příjemci", "doručeno příjemci", true],
    ["stav: doručeno příjemci", "doručeno příjemci", true],
    ["nedoručeno příjemci", "doručeno příjemci", false],
    ["nevyzvednuta příjemcem", "vyzvednuta příjemcem", false],
    ["ždoručeno příjemci", "doručeno příjemci", false],
    ["𐐀doručeno příjemci", "doručeno příjemci", false],
    ["nedoručeno příjemci; doručeno příjemci", "doručeno příjemci", true],
    ["nedoručena", "nedoručen", false],
    ["zpracovánař", "zpracována", false],
    ["zpracována𐐀", "zpracována", false],
    ["zpracována. dál", "zpracována", true],
    ["zpracovánax; zpracována", "zpracována", true],
    ["doručeno příjemci", "", false],
  ])("matches phrase %j / %j only between non-letter boundaries", (text, phrase, expected) => {
    expect(containsPhrase(text, phrase)).toBe(expected);
  });
  it.each([
    ["4. 11. 2026", "2026-11-04"], ["04.11.2026", "2026-11-04"],
    ["Úložní doba končí 4. 11. 2026.", "2026-11-04"], ["29. 2. 2024", "2024-02-29"],
  ])("parses Czech date %s", (value, expected) => expect(parseCzechDate(value)).toBe(expected));
  it.each(["31. 2. 2026", "29. 2. 2026", "31. 4. 2026", "0. 11. 2026", "4. 13. 2026", "abc"])("rejects impossible or unknown date %s", (value) => {
    expect(parseCzechDate(value)).toBeNull();
  });
});
