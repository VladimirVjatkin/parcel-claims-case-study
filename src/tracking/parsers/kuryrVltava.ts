import * as cheerio from "cheerio";
import type { TrackingResult } from "../types.js";
import { containsPhrase, normalizeText, parseCzechDateTime } from "../text.js";
import { isAfterReference } from "../../time/pragueDays.js";

const RETURNING_PHRASES = ["vracíme odesílateli", "vrácena odesílateli"];
// False DELIVERED hides a lost parcel; anything else goes to manual review.
const DELIVERED_PATTERN = /^zásilka byla doručena příjemci(?: (?<date>\d{1,2}\.\s*\d{1,2}\.\s*\d{4}))?(?: v (?<time>(?:[01]\d|2[0-3]):[0-5]\d))?\.$/u;
// Delivery participles include negations, but not planned "doručení".
const DELIVERY_WORD_PATTERN = /\p{L}*(?:doručen[ao]?|vyzvednut[ao]?)(?!\p{L})/u;
const IN_TRANSIT_PHRASES = ["na cestě k vám", "uložena na depu", "nakládáme k doručení", "nebyl zastižen"];

export function parseKuryrVltava(html: string, referenceMoment: Date): TrackingResult {
  const $ = cheerio.load(html);
  const messages = $(".shipment-message");
  if (messages.length !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  const quote = normalizeText(messages.text());
  const text = quote.toLowerCase();
  const delivered = DELIVERED_PATTERN.exec(text);
  if (delivered !== null) {
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
