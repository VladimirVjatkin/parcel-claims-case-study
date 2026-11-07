const pragueDateFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const pragueTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function isAfterReference(localDate: string, localTime: string | null, referenceMoment: Date): boolean {
  const referenceDate = pragueDateKey(referenceMoment);
  // Minute precision on the page means second zero; equality is never future.
  if (localTime === null) return localDate > referenceDate;
  return `${localDate}T${localTime}` > `${referenceDate}T${pragueTimeFormatter.format(referenceMoment)}`;
}

export function parseIsoInstant(value: string | null): Date | null {
  // An explicit offset prevents dependence on the machine's time zone.
  if (value === null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  // Date.parse can normalize an impossible date such as February 30.
  const [datePart] = value.split("T");
  if (datePart === undefined) {
    return null;
  }
  const [year, month, day] = datePart.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
    return null;
  }
  return new Date(timestamp);
}

export function pragueDateKey(instant: Date): string {
  let year = "";
  let month = "";
  let day = "";
  for (const part of pragueDateFormatter.formatToParts(instant)) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

function calendarDateAsUtc(instant: Date): number {
  const [year, month, day] = pragueDateKey(instant).split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("Nelze určit kalendářní datum v Praze.");
  }
  return Date.UTC(year, month - 1, day);
}

export function calendarDaysInPrague(from: Date, now: Date): number {
  // UTC midnights represent calendar dates, not elapsed hours across DST.
  return (calendarDateAsUtc(now) - calendarDateAsUtc(from)) / 86_400_000;
}
