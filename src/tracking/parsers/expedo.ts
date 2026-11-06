import * as cheerio from "cheerio";
import type { TrackingResult } from "../types.js";
import { normalizeText } from "../text.js";

const DELIVERED_VALUE = "doručeno";
const RETURNING_VALUE = "vrací se odesílateli";
const IN_TRANSIT_VALUES = ["na cestě", "převzato dopravcem"];

export function parseExpedo(html: string): TrackingResult {
  const $ = cheerio.load(html);
  const values = $(".status-card .value");
  if (values.length !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  const quote = normalizeText(values.text());
  const text = quote.toLowerCase();
  if (text === DELIVERED_VALUE) return { state: "DELIVERED", quote, pickupPoint: null };
  if (text === RETURNING_VALUE) return { state: "RETURNING", quote, pickupPoint: null };
  for (const value of IN_TRANSIT_VALUES) {
    if (text === value) return { state: "IN_TRANSIT", quote, pickupPoint: null };
  }
  return { state: "UNKNOWN", quote, pickupPoint: null };
}
