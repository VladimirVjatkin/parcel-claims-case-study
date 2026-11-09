// Vrstva 1: pravidla A/B nad objednávkou, reklamacemi a vratkami, bez ověření u dopravce.
// Ze sloučené objednávky vrací všechny zjištěné důvody, reportéra a pokyn pro tracking.
// Dny, vyloučené způsoby a blokující záznamy vycházejí z rules.yaml a výkladu v README.
import type {
  Complaint, Definition, Reason, ReporterMatrixRow, Rules, WmsReturn,
} from "../domain/types.js";
import { REASON_OUTCOME } from "../domain/types.js";
import type { OrderGroup } from "./dedupe.js";
import { findReporter } from "./reporter.js";
import { calendarDaysInPrague, parseIsoInstant } from "../time/pragueDays.js";

export interface RulesContext {
  rules: Rules;
  complaints: Complaint[];
  returns: WmsReturn[];
  reporterMatrix: ReporterMatrixRow[];
}

export interface Layer1Result {
  orderId: string;
  orderLabel: string;
  definition: Definition | null;
  daysInStatus: number | null;
  reporter: string | null;
  complaintReason: string | null;
  reasons: Reason[];
  runTracking: boolean;
}

// Kandidátem je pouze přesný stav z definice A nebo B, ostatní stavy se dále neřeší.
export function definitionForStatus(status: string, rules: Rules): Definition | null {
  if (status === rules.A.status) return "A";
  if (status === rules.B.status) return "B";
  return null;
}

// Konflikt záznamů a stav mimo A/B vyhodnocení ukončí; ostatní důvody se sbírají všechny,
// aby referent viděl úplný obraz a neztratil se ani důvod s vyšší prioritou.
export function evaluateRules(group: OrderGroup, ctx: RulesContext, now: Date): Layer1Result {
  const order = group.order;
  const orderNumber = order.orderNumber?.trim() ?? "";
  const trackingNumber = order.trackingNumber?.trim() ?? "";
  // Označení pro report: číslo objednávky, jinak zásilky (PN55100121), jinak orderId.
  const result: Layer1Result = {
    orderId: group.orderId,
    orderLabel: orderNumber || trackingNumber || order.orderId,
    definition: null, daysInStatus: null, reporter: null,
    complaintReason: null, reasons: [], runTracking: false,
  };
  if (group.conflicting) {
    result.reasons.push({
      code: "CONFLICTING_RECORDS",
      detail: `${group.rowCount} řádků se stejným orderId se liší v polích: ${group.differingFields.join(", ")}`,
    });
    return result;
  }
  const definition = definitionForStatus(order.status, ctx.rules);
  if (definition === null) {
    result.reasons.push({ code: "NOT_CANDIDATE_STATUS", detail: order.status });
    return result;
  }
  result.definition = definition;
  const rule = ctx.rules[definition];
  result.complaintReason = rule.complaintReason;
  // packedAt (A) a shippedAt (B) označují přechod do stavu; updatedAt mění i jiné úpravy.
  const start = parseIsoInstant(definition === "A" ? order.packedAt : order.shippedAt);
  if (start === null) {
    result.reasons.push({ code: "MISSING_STATUS_DATE" });
  } else {
    result.daysInStatus = calendarDaysInPrague(start, now);
    if (result.daysInStatus < rule.minDaysInStatus) {
      const days = result.daysInStatus;
      const unit = days === 1 ? "den" : days >= 2 && days <= 4 ? "dny" : "dní";
      result.reasons.push({ code: "TOO_FEW_DAYS", detail: `${days} ${unit} (minimum ${rule.minDaysInStatus})` });
    }
  }
  const shippingMethod = order.shippingMethod?.trim();
  // Bez shippingMethod nelze ověřit vyloučení, proto jde o ruční kontrolu, ne o souhlas.
  if (shippingMethod === undefined || shippingMethod === "") {
    result.reasons.push({ code: "MISSING_SHIPPING_METHOD" });
  } else if (rule.excludedShippingMethods.includes(shippingMethod)) {
    result.reasons.push({ code: "EXCLUDED_SHIPPING_METHOD", detail: shippingMethod });
  }
  if (orderNumber === "") {
    // Reklamace i vratky jsou vázané na číslo objednávky; chybějící čísla se nesmějí spojit.
    result.reasons.push({ code: "MISSING_ORDER_NUMBER" });
  } else {
    for (const complaint of ctx.complaints) {
      if (complaint.orderNumber?.trim() === orderNumber) {
        result.reasons.push({ code: "EXISTING_COMPLAINT", detail: complaint.status });
      }
    }
    for (const wmsReturn of ctx.returns) {
      if (wmsReturn.orderNumber?.trim() === orderNumber) {
        result.reasons.push({ code: "RETURN_IN_WMS", detail: wmsReturn.status });
      }
    }
  }
  result.reporter = findReporter(order.client, ctx.reporterMatrix, ctx.complaints);
  if (result.reporter === null) result.reasons.push({ code: "NO_REPORTER" });
  // DO_NOT_CREATE už nemůže tracking změnit; u NEEDS_REVIEW se ověřuje pro doplnění důkazů.
  result.runTracking = true;
  for (const reason of result.reasons) {
    if (REASON_OUTCOME[reason.code] === "DO_NOT_CREATE") result.runTracking = false;
  }
  return result;
}
