// ParcelNord: stav určuje nejnovější událost v table.events podle data a času, ne první řádek.
// Nejednoznačná historie nebo budoucí událost nepotvrzuje stav zásilky (README).
import * as cheerio from "cheerio";
import type { TrackingResult } from "../types.js";
import { containsPhrase, normalizeText, parseCzechDate } from "../text.js";
import { isAfterReference } from "../../time/pragueDays.js";

const RETURNING_PHRASES = ["vrací odesílateli", "vrací se odesílateli", "vrácena odesílateli"];
// Falešné DELIVERED skryje ztracenou zásilku; jiná formulace jde k ruční kontrole.
const DELIVERED_PATTERN = /^(?:zásilka vyzvednuta příjemcem|doručeno příjemci(?:, podepsal: .+)?)$/u;
// Tvary doručení zahrnují i zápory, ale ne plánované „doručení“.
const DELIVERY_WORD_PATTERN = /\p{L}*(?:doručen[ao]?|vyzvednut[ao]?)(?!\p{L})/u;
const PICKUP_POINT_PHRASE = "připravena k vyzvednutí";
const STORAGE_UNTIL_PHRASE = "úložní doba končí";
const IN_TRANSIT_PHRASES = ["zpracována", "převzata od odesílatele", "předána kurýrovi", "předána k doručení"];

// Historie musí mít čitelné časy a jedinou nejnovější událost; shodné maximum znamená UNKNOWN.
export function parseParcelNord(html: string, referenceMoment: Date): TrackingResult {
  const $ = cheerio.load(html);
  const tables = $("table.events");
  if (tables.length !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  let latestKey = "";
  let quote = "";
  let place = "";
  let ambiguousLatest = false;
  let dateQuote = "";
  for (const row of tables.find("tbody tr").toArray()) {
    const cells = $(row).children("td");
    if (cells.length !== 4) return { state: "UNKNOWN", quote: "", pickupPoint: null };
    const date = parseCzechDate(normalizeText(cells.eq(0).text()));
    const time = normalizeText(cells.eq(1).text());
    // Nečitelný časový údaj může patřit právě nejnovější události.
    if (date === null || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return { state: "UNKNOWN", quote: "", pickupPoint: null };
    }
    const key = `${date}T${time}`;
    if (key > latestKey) {
      latestKey = key;
      dateQuote = normalizeText(cells.eq(0).text());
      quote = normalizeText(cells.eq(3).text());
      place = normalizeText(cells.eq(2).text());
      ambiguousLatest = false;
    } else if (key === latestKey) {
      ambiguousLatest = true;
    }
  }
  if (latestKey === "" || ambiguousLatest) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  // Budoucí datum zneplatní jakýkoli typ události; citace je doslovné datum | čas | událost.
  if (isAfterReference(latestKey.substring(0, 10), latestKey.substring(11), referenceMoment)) {
    return { state: "UNKNOWN", quote: `${dateQuote} | ${latestKey.substring(11)} | ${quote}`, pickupPoint: null };
  }
  const text = quote.toLowerCase();
  if (DELIVERED_PATTERN.test(text)) return { state: "DELIVERED", quote, pickupPoint: null };
  if (DELIVERY_WORD_PATTERN.test(text)) return { state: "UNKNOWN", quote, pickupPoint: null };
  for (const phrase of RETURNING_PHRASES) {
    if (containsPhrase(text, phrase)) return { state: "RETURNING", quote, pickupPoint: null };
  }
  // Lhůta končící v budoucnu je v pořádku: není to událost, ale údaj pro ruční kontrolu vrstvy 2.
  // pickupPoint zachová místo a datum úložní doby; bez data se jeho konec neodhaduje.
  if (containsPhrase(text, PICKUP_POINT_PHRASE)) {
    const storageIndex = text.indexOf(STORAGE_UNTIL_PHRASE);
    const storageUntil = storageIndex < 0 ? null : parseCzechDate(text.substring(storageIndex + STORAGE_UNTIL_PHRASE.length));
    return { state: "IN_TRANSIT", quote, pickupPoint: { place: place || null, storageUntil } };
  }
  for (const phrase of IN_TRANSIT_PHRASES) {
    if (containsPhrase(text, phrase)) return { state: "IN_TRANSIT", quote, pickupPoint: null };
  }
  return { state: "UNKNOWN", quote, pickupPoint: null };
}
