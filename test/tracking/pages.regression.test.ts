// Regression only — pages were inspected while writing the parsers, so this is not an independent measurement.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parserForCarrier } from "../../src/tracking/parseTrackingPage.js";
import { readLabels } from "../../src/eval/labels.js";

const trackingDir = fileURLToPath(new URL("../../data/tracking", import.meta.url));
const labels = readLabels(join(trackingDir, "labels.csv"));

describe("saved tracking pages regression", () => {
  it("covers all 20 labelled pages", () => expect(labels).toHaveLength(20));
  it.each(labels)("$file → $expectedState", ({ file, carrier, expectedState }) => {
    const parser = parserForCarrier(carrier);
    if (parser === null) throw new Error(`Chybí parser pro ${carrier}.`);
    const result = parser(readFileSync(join(trackingDir, file), "utf8"));
    expect(result.state, `${file}: ${result.quote}`).toBe(expectedState);
  });
  it("extracts storage details for PN55100116", () => {
    const parser = parserForCarrier("ParcelNord");
    expect(parser?.(readFileSync(join(trackingDir, "PN55100116.html"), "utf8")).pickupPoint).toEqual({
      place: "Box Praha Florenc", storageUntil: "2026-11-04",
    });
  });
  it("preserves the neighbour evidence for KV2026100115", () => {
    const parser = parserForCarrier("Kurýr Vltava");
    expect(parser?.(readFileSync(join(trackingDir, "KV2026100115.html"), "utf8")).quote).toContain("soused");
  });
});
