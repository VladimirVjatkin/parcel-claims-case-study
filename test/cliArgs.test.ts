import { describe, expect, it } from "vitest";
import { parseRunArgs } from "../src/cli/args.js";
import { DEFAULT_RUN_MOMENT } from "../src/config.js";

describe("parseRunArgs", () => {
  it("uses the fixed run moment, data directory and stdout-only output by default", () => {
    let calls = 0;
    const args = parseRunArgs([], () => { calls += 1; return new Date(0); });
    expect(args).toEqual({ now: new Date(DEFAULT_RUN_MOMENT), dataDir: "data", outPath: null });
    expect(calls).toBe(0);
  });
  it("reads current time only for the explicit --now now option", () => {
    let calls = 0;
    const instant = new Date("2026-11-06T10:00:00Z");
    const args = parseRunArgs(["--now", "now"], () => { calls += 1; return instant; });
    expect(args.now).toEqual(instant);
    expect(calls).toBe(1);
  });
  it("parses an ISO instant with an explicit offset without reading the clock", () => {
    let calls = 0;
    const args = parseRunArgs(["--now", "2026-11-03T07:30:00+01:00"], () => { calls += 1; return new Date(0); });
    expect(args.now.toISOString()).toBe("2026-11-03T06:30:00.000Z");
    expect(calls).toBe(0);
  });
  it.each(["2026-11-03T07:30:00", "abc", "2026-02-30T07:30:00Z"])("rejects an invalid or offset-free --now %s", (value) => {
    expect(() => parseRunArgs(["--now", value], () => new Date(0))).toThrow("Neplatný --now");
  });
  it.each([["--unknown", "value"], ["--now"], ["--out"], ["unexpected"]])("rejects unknown or incomplete arguments: %j", (...argv) => {
    expect(() => parseRunArgs(argv, () => new Date(0))).toThrow("Neplatné argumenty");
  });
  it("accepts a custom data directory and output path", () => {
    const args = parseRunArgs(["--data", "fixtures", "--out", "reports/custom.md"], () => new Date(0));
    expect(args.dataDir).toBe("fixtures");
    expect(args.outPath).toBe("reports/custom.md");
  });
  it("allows the caller to override a script's --out option", () => {
    const args = parseRunArgs(["--out", "reports/rozhodnuti.md", "--out", "reports/custom.md"], () => new Date(0));
    expect(args.outPath).toBe("reports/custom.md");
  });
});
