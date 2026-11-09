// Vybírá pravidlový parser podle výslovně uvedeného dopravce, nikoli podle URL či způsobu dopravy.
// Neznámý dopravce vrátí null; vrstva 2 ho převede na `TRACKING_UNAVAILABLE` (README).
import type { TrackingResult } from "./types.js";
import { parseKuryrVltava } from "./parsers/kuryrVltava.js";
import { parseParcelNord } from "./parsers/parcelNord.js";
import { parseExpedo } from "./parsers/expedo.js";
import { parseDoructo } from "./parsers/doructo.js";

// V provozu jde o okamžik stažení stránky; v řezu jsou stránky uložené, proto se předává okamžik běhu.
export type CarrierParser = (html: string, referenceMoment: Date) => TrackingResult;

// Pouze čtyři známí dopravci mají parser; bez něj nelze stav potvrdit odhadem.
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
