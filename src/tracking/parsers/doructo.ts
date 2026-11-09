// Doručto: stav se čte jen z barvy aktivního kroku v svg.timeline, nikoli ze seznamu popisků.
// Z HTML vznikne stav s citací; nejednoznačná struktura vede k UNKNOWN (README).
import * as cheerio from "cheerio";
import type { TrackingResult } from "../types.js";
import { normalizeText, parseCzechDateTime } from "../text.js";
import { isAfterReference } from "../../time/pragueDays.js";

const ACTIVE_COLOR = "#00a86b";
const DELIVERED_VALUE = "doručeno";
const RETURNING_VALUE = "vráceno";
const IN_TRANSIT_VALUES = ["podáno", "v přepravě", "u kurýra"];

// Potvrzení stavu vyžaduje právě jeden aktivní krok a známou hodnotu jeho popisku.
export function parseDoructo(html: string, referenceMoment: Date): TrackingResult {
  const $ = cheerio.load(html);
  let activeSteps = 0;
  let quote = "";
  for (const step of $("svg.timeline g.step").toArray()) {
    let active = false;
    for (const circle of $(step).find("circle").toArray()) {
      if ($(circle).attr("fill")?.trim().toLowerCase() === ACTIVE_COLOR) active = true;
    }
    if (!active) continue;
    activeSteps += 1;
    const labels = $(step).find("text");
    if (labels.length !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
    quote = normalizeText(labels.text());
  }
  // V SVG jsou všechny popisky; důkazem je pouze aktivní krok.
  if (activeSteps !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  // Budoucí aktualizace činí stránku nespolehlivou; citace zachová stav i datum jako dvě doslovné části.
  // Bez jedné čitelné aktualizace s časem se kontrola data nepoužije.
  const updates = $("p.updated");
  if (updates.length === 1) {
    const updateQuote = normalizeText(updates.text());
    const match = /^Aktualizováno\s+(.*)$/iu.exec(updateQuote);
    const timestamp = match?.[1] === undefined ? null : parseCzechDateTime(match[1]);
    if (timestamp !== null && timestamp.time !== null && isAfterReference(timestamp.date, timestamp.time, referenceMoment)) {
      return { state: "UNKNOWN", quote: `${quote} | ${updateQuote}`, pickupPoint: null };
    }
  }
  // Bílý seznam přesných hodnot brání tomu, aby nová formulace automaticky potvrdila doručení.
  const text = quote.toLowerCase();
  if (text === DELIVERED_VALUE) return { state: "DELIVERED", quote, pickupPoint: null };
  if (text === RETURNING_VALUE) return { state: "RETURNING", quote, pickupPoint: null };
  for (const value of IN_TRANSIT_VALUES) {
    if (text === value) return { state: "IN_TRANSIT", quote, pickupPoint: null };
  }
  return { state: "UNKNOWN", quote, pickupPoint: null };
}
