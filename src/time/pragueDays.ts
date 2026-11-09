// Časová pravidla používají pražské kalendářní dny, nikoli uplynulé hodiny.
// Tím se správně posoudí změna času 25. 10. i hranice UTC / Praha u objednávky 120125.
// Stejné pásmo slouží ke kontrole budoucích událostí na stránkách dopravců (README).
const pragueDateFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const pragueTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// Seřazený tvar RRRR-MM-DDTHH:MM dovoluje porovnat pražský místní čas jako řetězec.
// Bez času se porovnají jen data; rovnost s okamžikem stažení stránky není budoucnost.
export function isAfterReference(localDate: string, localTime: string | null, referenceMoment: Date): boolean {
  const referenceDate = pragueDateKey(referenceMoment);
  // Minutová přesnost na stránce znamená nultou sekundu; rovnost nikdy není budoucnost.
  if (localTime === null) return localDate > referenceDate;
  return `${localDate}T${localTime}` > `${referenceDate}T${pragueTimeFormatter.format(referenceMoment)}`;
}

// Přísné ISO datum vrací jednoznačný okamžik; nečitelné datum vede k ruční kontrole.
export function parseIsoInstant(value: string | null): Date | null {
  // Sekundy i výslovný časový posun brání závislosti na časovém pásmu stroje.
  if (value === null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  // Date.parse může nemožné datum, například 30. 2., převést na jiné platné datum.
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

// Jednotný klíč pražského data se používá i pro úložní dobu, která platí včetně posledního dne.
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

// Rozdíl kalendářních dat zachová počet dní i při změně času; nepočítá celé úseky po 24 hodinách.
export function calendarDaysInPrague(from: Date, now: Date): number {
  // Půlnoci v UTC zde zastupují kalendářní data, nikoli uplynulé hodiny přes změnu času.
  return (calendarDateAsUtc(now) - calendarDateAsUtc(from)) / 86_400_000;
}
