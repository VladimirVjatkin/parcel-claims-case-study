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
