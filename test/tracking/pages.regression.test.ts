// Regression only — pages were inspected while writing the parsers, so this is not an independent measurement.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parserForCarrier } from "../../src/tracking/parseTrackingPage.js";

const trackingDir = fileURLToPath(new URL("../../data/tracking", import.meta.url));
const lines = readFileSync(join(trackingDir, "labels.csv"), "utf8").trim().split(/\r?\n/);

interface LabelRow {
  file: string;
  carrier: string;
  trackingNumber: string;
  expectedState: string;
}

function readLabels(): LabelRow[] {
  if (lines[0]?.split(",", 4).join(",") !== "file,carrier,tracking_number,expected_state") {
    throw new Error("Neplatná hlavička labels.csv.");
  }
  const labels: LabelRow[] = [];
  for (const line of lines.slice(1)) {
    // Only the fifth column contains quoted commas; notes are irrelevant here.
    const [file, carrier, trackingNumber, expectedState] = line.split(",", 4);
    if (!file || !carrier || !trackingNumber || !expectedState) throw new Error("Neplatný řádek labels.csv.");
    labels.push({ file, carrier, trackingNumber, expectedState });
  }
  return labels;
}

const labels = readLabels();

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
