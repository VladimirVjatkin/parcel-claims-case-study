import * as cheerio from "cheerio";
import type { TrackingResult } from "../types.js";
import { normalizeText } from "../text.js";

const ACTIVE_COLOR = "#00a86b";
const DELIVERED_VALUE = "doručeno";
const RETURNING_VALUE = "vráceno";
const IN_TRANSIT_VALUES = ["podáno", "v přepravě", "u kurýra"];

export function parseDoructo(html: string): TrackingResult {
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
  // All labels are present in the SVG; only the active step is evidence.
  if (activeSteps !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  const text = quote.toLowerCase();
  if (text === DELIVERED_VALUE) return { state: "DELIVERED", quote, pickupPoint: null };
  if (text === RETURNING_VALUE) return { state: "RETURNING", quote, pickupPoint: null };
  for (const value of IN_TRANSIT_VALUES) {
    if (text === value) return { state: "IN_TRANSIT", quote, pickupPoint: null };
  }
  return { state: "UNKNOWN", quote, pickupPoint: null };
}
