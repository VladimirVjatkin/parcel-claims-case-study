// Vrstva 2 převádí stav dopravce na důvody rozhodnutí a řeší nedostupné ověření.
// Navazuje na pravidla A/B; rozdíl mezi A a B i platnou úložní dobu určuje výklad v README.
import type { Definition, Order, Reason } from "../domain/types.js";
import { pragueDateKey } from "../time/pragueDays.js";
import { parserForCarrier } from "../tracking/parseTrackingPage.js";
import type { TrackingSource } from "../tracking/trackingSource.js";
import type { TrackingResult } from "../tracking/types.js";

export type TrackingLookup =
  | { kind: "unavailable"; detail: string }
  | { kind: "found"; result: TrackingResult };

// TRACKING_UNAVAILABLE má pořadí: chybí dopravce → parser → číslo zásilky → stránka.
// Dopravce se nehádá podle shippingMethod; referenceMoment označuje okamžik stažení stránky.
export function lookupTracking(order: Order, source: TrackingSource, referenceMoment: Date): TrackingLookup {
  const carrier = order.carrier?.trim() ?? "";
  if (carrier === "") return { kind: "unavailable", detail: "carrier = null, parser nelze vybrat" };
  const parser = parserForCarrier(carrier);
  if (parser === null) {
    return { kind: "unavailable", detail: `pro dopravce ${carrier} nemáme čtení tracking stránky` };
  }
  const trackingNumber = order.trackingNumber?.trim() ?? "";
  if (trackingNumber === "") return { kind: "unavailable", detail: "chybí číslo zásilky" };
  const html = source.getPage(trackingNumber);
  if (html === null) return { kind: "unavailable", detail: "tracking stránka není k dispozici" };
  return { kind: "found", result: parser(html, referenceMoment) };
}

// Stav dopravce doplní důvody, samotný výsledek pak určí společná priorita důvodů.
export function checkTracking(definition: Definition, lookup: TrackingLookup, now: Date): Reason[] {
  if (lookup.kind === "unavailable") return [{ code: "TRACKING_UNAVAILABLE", detail: lookup.detail }];
  const tracking = lookup.result;
  switch (tracking.state) {
    case "DELIVERED": return [{ code: "DELIVERED_PER_TRACKING", detail: tracking.quote }];
    case "RETURNING": return [{ code: "TRACKING_RETURNING", detail: tracking.quote }];
    case "UNKNOWN": return [{ code: "TRACKING_UNKNOWN", detail: tracking.quote }];
    case "IN_TRANSIT": {
      // A: dopravce zásilku má, čímž zpochybňuje „nevyzvednuto“ → `CARRIER_PICKUP_CONFIRMED`.
      if (definition === "A") return [{ code: "CARRIER_PICKUP_CONFIRMED", detail: tracking.quote }];
      const pickupPoint = tracking.pickupPoint;
      if (pickupPoint !== null && pickupPoint.storageUntil !== null && pickupPoint.storageUntil >= pragueDateKey(now)) {
        // B: úložní doba platí včetně posledního pražského dne → `AT_PICKUP_POINT_STORAGE_ACTIVE`.
        const [year, month, day] = pickupPoint.storageUntil.split("-");
        return [{
          code: "AT_PICKUP_POINT_STORAGE_ACTIVE",
          detail: `${pickupPoint.place ?? "Výdejní místo"}, úložní doba do ${Number(day)}. ${Number(month)}. ${year}`,
        }];
      }
      // B + jiný IN_TRANSIT nepřidává důvod: po splnění pravidel první vrstvy zbývá CREATE.
      return [];
    }
  }
}
