// Expedo: stav pochází pouze z .status-card .value; „Doručeno“ je i v reklamě, cookies a FAQ.
// Parser vrací stav a doslovnou citaci; neznámá hodnota či struktura znamená UNKNOWN (README).
import * as cheerio from "cheerio";
import type { TrackingResult } from "../types.js";
import { normalizeText, parseCzechDateTime } from "../text.js";
import { isAfterReference } from "../../time/pragueDays.js";

const DELIVERED_VALUE = "doručeno";
const RETURNING_VALUE = "vrací se odesílateli";
const IN_TRANSIT_VALUES = ["na cestě", "převzato dopravcem"];

// Jedna hodnota stavu se ověří proti datu aktualizace a teprve pak proti bílému seznamu.
export function parseExpedo(html: string, referenceMoment: Date): TrackingResult {
  const $ = cheerio.load(html);
  const values = $(".status-card .value");
  if (values.length !== 1) return { state: "UNKNOWN", quote: "", pickupPoint: null };
  const quote = normalizeText(values.text());
  // Aktualizace po okamžiku stažení stránky zneplatní důkaz; do citace patří stav i aktualizace.
  // „—“, datum bez času nebo více prvků small se nekontrolují, datum se nedoplňuje odhadem.
  const updates = $(".status-card small");
  if (updates.length === 1) {
    const updateQuote = normalizeText(updates.text());
    const match = /^Poslední aktualizace:\s*(.*)$/iu.exec(updateQuote);
    const timestamp = match?.[1] === undefined ? null : parseCzechDateTime(match[1]);
    if (timestamp !== null && timestamp.time !== null && isAfterReference(timestamp.date, timestamp.time, referenceMoment)) {
      return { state: "UNKNOWN", quote: `${quote} | ${updateQuote}`, pickupPoint: null };
    }
  }
  // Celá hodnota musí být známá; samotný výskyt slova doručení by nebyl důkazem.
  const text = quote.toLowerCase();
  if (text === DELIVERED_VALUE) return { state: "DELIVERED", quote, pickupPoint: null };
  if (text === RETURNING_VALUE) return { state: "RETURNING", quote, pickupPoint: null };
  for (const value of IN_TRANSIT_VALUES) {
    if (text === value) return { state: "IN_TRANSIT", quote, pickupPoint: null };
  }
  return { state: "UNKNOWN", quote, pickupPoint: null };
}
