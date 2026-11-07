import type { TrackingResult } from "./types.js";
import { parseKuryrVltava } from "./parsers/kuryrVltava.js";
import { parseParcelNord } from "./parsers/parcelNord.js";
import { parseExpedo } from "./parsers/expedo.js";
import { parseDoructo } from "./parsers/doructo.js";

// In production the moment the page was fetched; in this slice pages are stored, so the run moment is passed.
export type CarrierParser = (html: string, referenceMoment: Date) => TrackingResult;

export function parserForCarrier(carrier: string | null): CarrierParser | null {
  if (carrier === null) return null;
  switch (carrier.trim()) {
    case "Kurýr Vltava": return parseKuryrVltava;
    case "ParcelNord": return parseParcelNord;
    case "Expedo": return parseExpedo;
    case "Doručto": return parseDoructo;
    default: return null;
  }
}
