export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function containsPhrase(text: string, phrase: string): boolean {
  if (phrase === "") return false;
  let index = text.indexOf(phrase);
  while (index >= 0) {
    // Unicode boundaries prevent matching inside a different word.
    const letterBefore = /\p{L}$/u.test(text.substring(0, index));
    const letterAfter = /^\p{L}/u.test(text.substring(index + phrase.length));
    if (!letterBefore && !letterAfter) return true;
    index = text.indexOf(phrase, index + 1);
  }
  return false;
}

export function parseCzechDate(value: string): string | null {
  const match = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(value);
  if (match === null) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  // JavaScript normalizes impossible dates instead of rejecting them.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
