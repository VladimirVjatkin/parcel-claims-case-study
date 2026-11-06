import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parserForCarrier } from "../../src/tracking/parseTrackingPage.js";
import { createFileTrackingSource } from "../../src/tracking/trackingSource.js";

const trackingDir = fileURLToPath(new URL("../../data/tracking", import.meta.url));

describe("file tracking source", () => {
  const source = createFileTrackingSource(trackingDir);
  it("reads an existing page verbatim", () => {
    expect(source.getPage("KV2026100101")).toBe(readFileSync(join(trackingDir, "KV2026100101.html"), "utf8"));
  });
  it("returns null for a missing page", () => expect(source.getPage("missing0000")).toBeNull());
  it.each(["../orders", "..\\orders", "C:\\orders", "KV2026100101.html", "", " KV2026100101 "])("rejects a non-alphanumeric identifier %j", (value) => {
    expect(source.getPage(value)).toBeNull();
  });
});

describe("parserForCarrier", () => {
  it.each(["Kurýr Vltava", "ParcelNord", "Expedo", "Doručto"])("selects %s after trim", (carrier) => {
    expect(parserForCarrier(` ${carrier} `)).toBeTypeOf("function");
  });
  it.each(["Parcelo", "Interní", null, "neznámý", "expedo", " "])("does not guess a parser for %s", (carrier) => {
    expect(parserForCarrier(carrier)).toBeNull();
  });
});
