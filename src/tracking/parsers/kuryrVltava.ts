// Kurýr Vltava: jediným zdrojem stavu je .shipment-message, nikoli plný ukazatel průběhu.
// Zpráva o doručení příjemci musí celá odpovídat bílému seznamu; pochybnost znamená UNKNOWN.
import * as cheerio from "cheerio";
import type { TrackingResult } from "../types.js";
import { containsPhrase, normalizeText, parseCzechDateTime } from "../text.js";
import { isAfterReference } from "../../time/pragueDays.js";

const RETURNING_PHRASES = ["vracíme odesílateli", "vrácena odesílateli"];
// Falešné DELIVERED skryje ztracenou zásilku; jiná formulace jde k ruční kontrole.
const DELIVERED_PATTERN = /^zásilka byla doručena příjemci(?: (?<date>\d{1,2}\.\s*\d{1,2}\.\s*\d{4}))?(?: v (?<time>(?:[01]\d|2[0-3]):[0-5]\d))?\.$/u;
// Tvary doručení zahrnují i zápory, ale ne plánované „doručení“.
const DELIVERY_WORD_PATTERN = /\p{L}*(?:doručen[ao]?|vyzvednut[ao]?)(?!\p{L})/u;
const IN_TRANSIT_PHRASES = ["na cestě k vám", "uložena na depu", "nakládáme k doručení", "nebyl zastižen"];

// Pořadí je podstatné: známé doručení → jiné doručení → návrat → přeprava.
// Zápor ani zmínka o sousedovi tak nemohou propadnout do potvrzení přepravy či návratu.
export function parseKuryrVltava(html: string, referenceMoment: Date): TrackingResult {
  const $ = cheerio.load(html);
  const messages = $(".shipment-message");
  if (messages.length !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  const quote = normalizeText(messages.text());
  const text = quote.toLowerCase();
  const delivered = DELIVERED_PATTERN.exec(text);
  if (delivered !== null) {
    // Kontroluje se jen datum ve vzoru doručení, nikoli lhůty v jiném textu zprávy.
    // Datum bez času se porovná po pražských dnech; bez čitelného data zůstává původní výklad.
    const dateText = delivered.groups?.date;
    const timeText = delivered.groups?.time;
    const timestamp = dateText === undefined ? null : parseCzechDateTime(`${dateText}${timeText === undefined ? "" : ` ${timeText}`}`);
    const future = timestamp !== null && isAfterReference(timestamp.date, timestamp.time, referenceMoment);
    return { state: future ? "UNKNOWN" : "DELIVERED", quote, pickupPoint: null };
  }
  if (DELIVERY_WORD_PATTERN.test(text)) {
    return { state: "UNKNOWN", quote, pickupPoint: null };
  }
  for (const phrase of RETURNING_PHRASES) {
    if (containsPhrase(text, phrase)) return { state: "RETURNING", quote, pickupPoint: null };
  }
  for (const phrase of IN_TRANSIT_PHRASES) {
    if (containsPhrase(text, phrase)) return { state: "IN_TRANSIT", quote, pickupPoint: null };
  }
  return { state: "UNKNOWN", quote, pickupPoint: null };
}
