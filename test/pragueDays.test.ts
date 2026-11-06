import { afterEach, describe, expect, it } from "vitest";
import { calendarDaysInPrague, parseIsoInstant, pragueDateKey } from "../src/time/pragueDays.js";
import { NOW } from "./helpers/makeOrder.js";

const originalTimeZone = process.env.TZ;
afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe("calendarDaysInPrague", () => {
  it.each([
    ["2026-10-31T14:10:00+01:00", 2],
    ["2026-11-01T09:00:00+01:00", 1],
    ["2026-10-31T23:40:00+01:00", 2],
    // UTC would start on October 19 and incorrectly count 14 days.
    ["2026-10-20T00:30:00+02:00", 13],
    ["2026-10-19T22:30:00Z", 13],
    ["2026-10-25T01:30:00+02:00", 8],
    ["2026-10-25T02:30:00+01:00", 8],
    ["2026-10-24T23:30:00+02:00", 9],
  ])("counts Prague dates from %s as %i days", (value, expected) => {
    expect(calendarDaysInPrague(new Date(value), NOW)).toBe(expected);
  });

  it("uses Prague even when the machine time zone changes", () => {
    process.env.TZ = "UTC";
    const before = new Date(0).getTimezoneOffset();
    for (const zone of ["Pacific/Kiritimati", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      const after = new Date(0).getTimezoneOffset();
      expect(after, `TZ=${zone}: offset ${before} -> ${after}`).not.toBe(before);
      expect(pragueDateKey(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-20");
      expect(calendarDaysInPrague(new Date("2026-10-19T22:30:00Z"), NOW)).toBe(13);
    }
  });
});

describe("parseIsoInstant", () => {
  it.each([null, "abc", "2026-10-20T10:00:00", "2026-02-30T10:00:00Z", "2026-13-01T10:00:00Z"])("rejects %s", (value) => {
    expect(parseIsoInstant(value)).toBeNull();
  });
  it.each(["2026-10-19T22:30:00Z", "2026-10-20T00:30:00+02:00", "2026-10-19T21:30:00-01:00"])("accepts explicit offsets: %s", (value) => {
    expect(parseIsoInstant(value)?.toISOString()).toBe("2026-10-19T22:30:00.000Z");
  });
});
