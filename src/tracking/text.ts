// Společná práce s textem stavů a českými daty pro čtyři parsery.
// Sjednocuje mezery, nikoli význam zprávy; bezpečné rozpoznání doručení zůstává na parseru.
// Nečitelná data vrací null a sama o sobě nespouštějí kontrolu budoucí události (README).
// Mezery a zalomení z HTML se sjednotí pro porovnání i čitelné doslovné citace.
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Fráze musí stát mezi hranicemi slov, aby „doručeno“ nesedělo uvnitř „nedoručeno“.
export function containsPhrase(text: string, phrase: string): boolean {
  if (phrase === "") return false;
  let index = text.indexOf(phrase);
  while (index >= 0) {
    // Hranice podle Unicode písmen brání shodě uvnitř jiného slova i s českou diakritikou.
    const letterBefore = /\p{L}$/u.test(text.substring(0, index));
    const letterAfter = /^\p{L}/u.test(text.substring(index + phrase.length));
    if (!letterBefore && !letterAfter) return true;
    index = text.indexOf(phrase, index + 1);
  }
  return false;
}

// Česká data se převádějí na seřaditelný klíč; částečný text dovoluje vyčíst i úložní dobu.
export function parseCzechDate(value: string): string | null {
  const match = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(value);
  if (match === null) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  // JavaScript nemožná data převádí na jiná, místo aby je odmítl.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// U události se očekává celé datum s volitelným časem; neúplný či nečitelný údaj se nehádá.
export function parseCzechDateTime(value: string): { date: string; time: string | null } | null {
  const match = /^(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})(?: ((?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(normalizeText(value));
  if (match?.[1] === undefined) return null;
  const date = parseCzechDate(match[1]);
  return date === null ? null : { date, time: match[2] ?? null };
}
