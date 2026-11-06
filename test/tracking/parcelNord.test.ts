import { describe, expect, it } from "vitest";
import { parseParcelNord } from "../../src/tracking/parsers/parcelNord.js";

function row(date: string, time: string, event: string, place = "Praha"): string {
  return `<tr><td>${date}</td><td>${time}</td><td>${place}</td><td>${event}</td></tr>`;
}

function page(rows: string): string {
  return `<table class="events"><tbody>${rows}</tbody></table>`;
}

describe("ParcelNord", () => {
  it.each([
    "Nedoručeno příjemci",
    "Zásilka nevyzvednuta příjemcem",
    "Zásilka nebyla doručena příjemci",
    "Doručeno sousedovi",
    "Doručeno příjemci. Předáno sousedovi.",
    "Nedoručeno příjemci. Doručeno příjemci",
    "Zásilka zpracována. Nedoručeno příjemci",
    "Nedoručeno příjemci, zásilka se vrací odesílateli",
  ])("rejects negated delivery evidence: %s", (quote) => {
    expect(parseParcelNord(page(row("1. 11. 2026", "10:00", quote)))).toEqual({
      state: "UNKNOWN", quote, pickupPoint: null,
    });
  });
  it.each([
    "Zásilka vyzvednuta příjemcem",
    "Doručeno příjemci",
    "Doručeno příjemci, podepsal: J. Dvořák",
    "DORUČENO PŘÍJEMCI",
  ])("accepts only a complete known delivery event: %s", (quote) => {
    expect(parseParcelNord(page(row("1. 11. 2026", "10:00", quote)))).toEqual({
      state: "DELIVERED", quote, pickupPoint: null,
    });
  });
  it("selects the latest date and time regardless of row order", () => {
    const oldest = row("31. 10. 2026", "23:59", "Zásilka vyzvednuta příjemcem");
    const earlierToday = row("1. 11. 2026", "09:00", "Zásilka předána kurýrovi");
    const newest = row("1. 11. 2026", "10:00", "Zásilka vrácena odesílateli");
    expect(parseParcelNord(page(oldest + earlierToday + newest)).state).toBe("RETURNING");
    expect(parseParcelNord(page(newest + earlierToday + oldest)).state).toBe("RETURNING");
  });
  it("extracts the pickup point and storage date from the latest event only", () => {
    const quote = "Zásilka je připravena k vyzvednutí. Úložní doba končí 4. 11. 2026.";
    expect(parseParcelNord(page(row("19. 10. 2026", "15:02", quote, "Box Praha Florenc")))).toEqual({
      state: "IN_TRANSIT", quote, pickupPoint: { place: "Box Praha Florenc", storageUntil: "2026-11-04" },
    });
  });
  it("keeps a pickup point without a storage date", () => {
    const result = parseParcelNord(page(row("19. 10. 2026", "15:02", "Zásilka je připravena k vyzvednutí.", "Box Praha Florenc")));
    expect(result.pickupPoint).toEqual({ place: "Box Praha Florenc", storageUntil: null });
  });
  it("does not invent a place or use a date before the storage phrase", () => {
    const result = parseParcelNord(page(row("19. 10. 2026", "15:02", "19. 10. 2026: Zásilka je připravena k vyzvednutí.", " ")));
    expect(result.pickupPoint).toEqual({ place: null, storageUntil: null });
  });
  it.each([
    ["Úložní doba uplynula, zásilka se vrací odesílateli", "RETURNING"],
    ["Zásilka vrací se odesílateli", "RETURNING"],
    ["Zásilka vrácena odesílateli", "RETURNING"],
    ["Zásilka vyzvednuta příjemcem", "DELIVERED"],
    ["Doručeno příjemci, podepsal: J. Dvořák", "DELIVERED"],
    ["Zásilka zpracována", "IN_TRANSIT"],
    ["Zásilka převzata od odesílatele", "IN_TRANSIT"],
    ["Zásilka předána kurýrovi", "IN_TRANSIT"],
    ["Zásilka předána k doručení do boxu", "IN_TRANSIT"],
    ["Neznámý stav", "UNKNOWN"],
  ])("classifies the latest event %s", (event, expected) => {
    const result = parseParcelNord(page(row("12. 10. 2026", "04:37", event)));
    expect(result.state).toBe(expected);
    expect(result.quote).toBe(event);
    expect(result.pickupPoint).toBeNull();
  });
  it.each([
    "", page(""), page("<tr><td>Neúplný řádek</td></tr>"),
    page(row("abc", "10:00", "Doručeno příjemci")),
    page(row("31. 2. 2026", "10:00", "Doručeno příjemci")),
    page(row("1. 11. 2026", "25:00", "Doručeno příjemci")),
    page(row("1. 11. 2026", "10:00", "Doručeno příjemci") + row("abc", "09:00", "Zásilka zpracována")),
  ])("rejects empty or unreadable event history", (html) => {
    expect(parseParcelNord(html)).toEqual({ state: "UNKNOWN", quote: "", pickupPoint: null });
  });
  it("rejects two latest events with the same timestamp", () => {
    const html = page(row("1. 11. 2026", "10:00", "Doručeno příjemci") + row("1. 11. 2026", "10:00", "Zásilka zpracována"));
    expect(parseParcelNord(html).state).toBe("UNKNOWN");
  });
  it("rejects multiple tracking tables", () => {
    expect(parseParcelNord(page(row("1. 11. 2026", "10:00", "Doručeno příjemci")) + page("")).state).toBe("UNKNOWN");
  });
});
