// Společné typy propojují vstupní export, pravidla A/B a výsledné rozhodnutí.
// Výsledek se odvozuje z kódů důvodů; jednotlivé vrstvy ho neurčují samostatně (README).
export type Definition = "A" | "B";
export type Outcome = "CREATE" | "DO_NOT_CREATE" | "NEEDS_REVIEW";

export type ReasonCode =
  | "NOT_CANDIDATE_STATUS" | "TOO_FEW_DAYS" | "EXCLUDED_SHIPPING_METHOD"
  | "EXISTING_COMPLAINT" | "RETURN_IN_WMS" | "DELIVERED_PER_TRACKING"
  | "NO_REPORTER" | "MISSING_ORDER_NUMBER" | "MISSING_STATUS_DATE"
  | "MISSING_SHIPPING_METHOD" | "CONFLICTING_RECORDS" | "TRACKING_UNAVAILABLE"
  | "TRACKING_UNKNOWN" | "TRACKING_RETURNING" | "AT_PICKUP_POINT_STORAGE_ACTIVE"
  | "CARRIER_PICKUP_CONFIRMED";

// Každý kód má právě jeden výsledek; jeho přiřazení se mění pouze v této tabulce.
export const REASON_OUTCOME: Record<ReasonCode, Outcome> = {
  NOT_CANDIDATE_STATUS: "DO_NOT_CREATE",
  TOO_FEW_DAYS: "DO_NOT_CREATE",
  EXCLUDED_SHIPPING_METHOD: "DO_NOT_CREATE",
  EXISTING_COMPLAINT: "DO_NOT_CREATE",
  RETURN_IN_WMS: "DO_NOT_CREATE",
  DELIVERED_PER_TRACKING: "DO_NOT_CREATE",
  NO_REPORTER: "NEEDS_REVIEW",
  MISSING_ORDER_NUMBER: "NEEDS_REVIEW",
  MISSING_STATUS_DATE: "NEEDS_REVIEW",
  MISSING_SHIPPING_METHOD: "NEEDS_REVIEW",
  CONFLICTING_RECORDS: "NEEDS_REVIEW",
  TRACKING_UNAVAILABLE: "NEEDS_REVIEW",
  TRACKING_UNKNOWN: "NEEDS_REVIEW",
  TRACKING_RETURNING: "NEEDS_REVIEW",
  AT_PICKUP_POINT_STORAGE_ACTIVE: "NEEDS_REVIEW",
  CARRIER_PICKUP_CONFIRMED: "NEEDS_REVIEW",
};

export interface Reason {
  code: ReasonCode;
  detail?: string;
}

// Platí priorita DO_NOT_CREATE > NEEDS_REVIEW > CREATE; prázdný seznam znamená CREATE.
// Pevný důvod pro nezaložení má přednost: ruční kontrola by pravidlo oddělení nezměnila.
export function outcomeFromReasons(reasons: Reason[]): Outcome {
  let outcome: Outcome = "CREATE";
  for (const reason of reasons) {
    const reasonOutcome = REASON_OUTCOME[reason.code];
    if (reasonOutcome === "DO_NOT_CREATE") {
      return "DO_NOT_CREATE";
    }
    if (reasonOutcome === "NEEDS_REVIEW") {
      outcome = "NEEDS_REVIEW";
    }
  }
  return outcome;
}

// Neúplný export dovoluje null; povinné orderId a status ověřuje načítač.
// updatedAt se uchovává, ale dny ve stavu se počítají od packedAt nebo shippedAt.
export interface Order {
  orderId: string;
  orderNumber: string | null;
  client: string | null;
  carrier: string | null;
  shippingMethod: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  createdAt: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  updatedAt: string | null;
}

export interface Complaint {
  complaintId: string;
  orderNumber: string | null;
  client: string;
  status: string;
  reason: string;
  reporter: string;
  createdAt: string;
}

export interface WmsReturn {
  returnId: string;
  orderNumber: string | null;
  status: string;
  createdAt: string;
}

export interface ReporterMatrixRow {
  client: string;
  reporterEmail: string;
}

export interface DefinitionRule {
  name: string;
  status: string;
  minDaysInStatus: number;
  complaintReason: string;
  excludedShippingMethods: string[];
}

export interface Rules {
  A: DefinitionRule;
  B: DefinitionRule;
}
