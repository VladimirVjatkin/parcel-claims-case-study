// Výstup parseru: UNKNOWN bez citace značí, že se ze struktury nepodařilo vybrat spolehlivý stav.
// UNKNOWN s citací zachovává nalezený text; pickupPoint se vyplňuje jen u výdejního místa.
export type TrackingState = "DELIVERED" | "IN_TRANSIT" | "RETURNING" | "UNKNOWN";

export interface PickupPoint {
  place: string | null;
  storageUntil: string | null;
}

export interface TrackingResult {
  state: TrackingState;
  quote: string;
  pickupPoint: PickupPoint | null;
}
