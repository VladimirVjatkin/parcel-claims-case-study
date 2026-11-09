// Hlídá datum události vůči okamžiku stažení: budoucnost, rovnost, pražské pásmo i datum bez času.
// Ověřuje čtyři dopravce, doslovné citace a to, že lhůty ani nečitelné datum samy stav nemění.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_MOMENT } from "../../src/config.js";
import { lookupTracking } from "../../src/layer2/trackingCheck.js";
import { isAfterReference } from "../../src/time/pragueDays.js";
import type { CarrierParser } from "../../src/tracking/parseTrackingPage.js";
import { parseDoructo } from "../../src/tracking/parsers/doructo.js";
import { parseExpedo } from "../../src/tracking/parsers/expedo.js";
import { parseKuryrVltava } from "../../src/tracking/parsers/kuryrVltava.js";
import { parseParcelNord } from "../../src/tracking/parsers/parcelNord.js";
import { normalizeText, parseCzechDateTime } from "../../src/tracking/text.js";
import { EXPERIMENT_FETCH_MOMENT } from "../../experiments/llm/prompt.js";
import { makeOrder } from "../helpers/makeOrder.js";

const referenceMoment = new Date(DEFAULT_RUN_MOMENT);
const expedo = (updates: string, status = "Doručeno"): string => `<div class="status-card"><strong class="value">${status}</strong>${updates}</div>`;
const doructo = (updates: string, status = "Doručeno"): string => `<svg class="timeline"><g class="step"><circle fill="#00a86b"/><text>${status}</text></g></svg>${updates}`;
const parcelNord = (date: string, time: string, event = "Doručeno příjemci"): string => `<table class="events"><tbody><tr><td>${date}</td><td>${time}</td><td>Praha</td><td>${event}</td></tr></tbody></table>`;
const kuryr = (message: string): string => `<div class="shipment-message">${message}</div>`;
const carriers: { name: string; parser: CarrierParser; html: string }[] = [
  { name: "ParcelNord", parser: parseParcelNord, html: parcelNord("2. 11. 2026", "07:30") },
  { name: "Kurýr Vltava", parser: parseKuryrVltava, html: kuryr("Zásilka byla doručena příjemci 2. 11. 2026 v 07:30.") },
  { name: "Expedo", parser: parseExpedo, html: expedo("<small>Poslední aktualizace: 2. 11. 2026 07:30</small>") },
  { name: "Doručto", parser: parseDoructo, html: doructo('<p class="updated">Aktualizováno 2. 11. 2026 07:30</p>') },
];

describe.each(carriers)("$name event timestamps", ({ parser, html }) => {
  it("rejects a future event with only verbatim page fragments in its quote", () => {
    const result = parser(html, new Date("2026-11-02T07:29:00+01:00"));
    expect(result.state).toBe("UNKNOWN");
    const pageText = normalizeText(cheerio.load(html).root().text());
    expect(result.quote).not.toBe("");
    for (const fragment of result.quote.split(" | ")) expect(pageText).toContain(fragment);
    expect(result.quote).toContain("2. 11. 2026");
  });
  it.each(["2026-11-02T07:30:00+01:00", "2026-11-02T07:31:00+01:00"])("accepts an event at or before %s", (reference) => {
    expect(parser(html, new Date(reference)).state).toBe("DELIVERED");
  });
});

describe("Prague reference comparisons", () => {
  it("checks time on the same day and handles the Prague date across UTC midnight", () => {
    expect(isAfterReference("2026-11-02", "23:30", referenceMoment)).toBe(true);
    expect(isAfterReference("2026-11-02", "00:15", new Date("2026-11-01T23:30:00Z"))).toBe(false);
    expect(isAfterReference("2026-11-02", null, new Date("2026-11-01T23:30:00Z"))).toBe(false);
    expect(isAfterReference("2026-11-03", null, referenceMoment)).toBe(true);
  });
  it("uses the summer Prague offset and does not invent seconds for minute timestamps", () => {
    expect(isAfterReference("2026-07-02", "10:00", new Date("2026-07-02T08:00:00Z"))).toBe(false);
    expect(isAfterReference("2026-07-02", "10:01", new Date("2026-07-02T08:00:59Z"))).toBe(true);
    expect(isAfterReference("2026-07-02", "10:00", new Date("2026-07-02T08:00:59Z"))).toBe(false);
  });
  it("compares date-only delivery by Prague calendar date", () => {
    expect(parseKuryrVltava(kuryr("Zásilka byla doručena příjemci 2. 11. 2026."), referenceMoment).state).toBe("DELIVERED");
    expect(parseKuryrVltava(kuryr("Zásilka byla doručena příjemci 3. 11. 2026."), referenceMoment).state).toBe("UNKNOWN");
  });
  it.each(["31. 2. 2026 07:30", "2. 11. 2026 24:00", "2 Nov 2026 07:30", "—"])("does not parse unreadable Czech timestamps: %s", (text) => {
    expect(parseCzechDateTime(text)).toBeNull();
  });
});

describe("timestamp scope and missing dates", () => {
  it("preserves delivery without a date and ignores a pickup deadline", () => {
    expect(parseKuryrVltava(kuryr("Zásilka byla doručena příjemci."), referenceMoment).state).toBe("DELIVERED");
    expect(parseKuryrVltava(kuryr("Zásilka je na cestě k vám. Vyzvedněte do 8. 11. 2026."), referenceMoment).state).toBe("IN_TRANSIT");
    expect(parseKuryrVltava(kuryr("Zásilka byla doručena příjemci 31. 2. 2026."), referenceMoment).state).toBe("DELIVERED");
  });
  it("preserves Expedo status when its update date is missing, unreadable, duplicated or outside the card", () => {
    for (const update of ["", "<small>Poslední aktualizace: —</small>", "<small>Poslední aktualizace: 31. 2. 2026 07:30</small>",
      "<small>Poslední aktualizace: 9. 11. 2026 07:30</small><small>Poslední aktualizace: 9. 11. 2026 07:30</small>"]) {
      expect(parseExpedo(expedo(update), referenceMoment).state).toBe("DELIVERED");
    }
    expect(parseExpedo(expedo("") + "<small>Poslední aktualizace: 9. 11. 2026 07:30</small>", referenceMoment).state).toBe("DELIVERED");
  });
  it("preserves Doručto status without a unique readable update date", () => {
    for (const update of ["", '<p class="updated">Aktualizováno —</p>', '<p class="updated">Aktualizováno 31. 2. 2026 07:30</p>',
      '<p class="updated">Aktualizováno 9. 11. 2026 07:30</p><p class="updated">Aktualizováno 9. 11. 2026 07:30</p>']) {
      expect(parseDoructo(doructo(update), referenceMoment).state).toBe("DELIVERED");
    }
  });
  it("does not treat ParcelNord storage expiry as an event date", () => {
    const html = parcelNord("2. 11. 2026", "07:30", "Zásilka je připravena k vyzvednutí. Úložní doba končí 4. 11. 2026.");
    expect(parseParcelNord(html, referenceMoment)).toMatchObject({ state: "IN_TRANSIT", pickupPoint: { place: "Praha", storageUntil: "2026-11-04" } });
  });
  it("also rejects future timestamps for a status in transit", () => {
    expect(parseExpedo(expedo("<small>Poslední aktualizace: 2. 11. 2026 23:30</small>", "Na cestě"), referenceMoment).state).toBe("UNKNOWN");
    expect(parseDoructo(doructo('<p class="updated">Aktualizováno 2. 11. 2026 23:30</p>', "U kurýra"), referenceMoment).state).toBe("UNKNOWN");
    expect(parseParcelNord(parcelNord("2. 11. 2026", "23:30", "Zásilka zpracována"), referenceMoment).state).toBe("UNKNOWN");
  });
  it("passes the explicit fetch moment through lookupTracking", () => {
    const source = { getPage: () => expedo("<small>Poslední aktualizace: 2. 11. 2026 23:30</small>") };
    const order = makeOrder({ carrier: "Expedo" });
    expect(lookupTracking(order, source, referenceMoment)).toMatchObject({ kind: "found", result: { state: "UNKNOWN" } });
    expect(lookupTracking(order, source, new Date(EXPERIMENT_FETCH_MOMENT))).toMatchObject({ kind: "found", result: { state: "DELIVERED" } });
  });
  it("regresses PN55100901 against the experiment fetch moment", () => {
    const html = readFileSync(fileURLToPath(new URL("../../experiments/llm/mutated/PN55100901.html", import.meta.url)), "utf8");
    const result = parseParcelNord(html, new Date(EXPERIMENT_FETCH_MOMENT));
    expect(result.state).toBe("UNKNOWN");
    const text = normalizeText(cheerio.load(html).root().text());
    for (const fragment of result.quote.split(" | ")) expect(text).toContain(fragment);
  });
});
