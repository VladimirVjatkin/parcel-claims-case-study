import type { Definition, Outcome, Reason } from "../domain/types.js";
import { outcomeFromReasons } from "../domain/types.js";
import type { InputData } from "../input/loadInput.js";
import type { OrderGroup } from "../layer1/dedupe.js";
import { dedupeOrders } from "../layer1/dedupe.js";
import type { RulesContext } from "../layer1/rules.js";
import { evaluateRules } from "../layer1/rules.js";
import { checkTracking, lookupTracking } from "../layer2/trackingCheck.js";
import type { TrackingSource } from "../tracking/trackingSource.js";
import type { TrackingResult } from "../tracking/types.js";

export interface Decision {
  orderId: string;
  orderLabel: string;
  mailshipStatus: string;
  definition: Definition | null;
  outcome: Outcome;
  reasons: Reason[];
  reporter: string | null;
  complaintReason: string | null;
  daysInStatus: number | null;
  tracking: TrackingResult | null;
  mailshipDiscrepancy: boolean;
}

export function decideOrder(group: OrderGroup, ctx: RulesContext, source: TrackingSource, now: Date): Decision {
  const layer1 = evaluateRules(group, ctx, now);
  const reasons: Reason[] = [...layer1.reasons];
  let tracking: TrackingResult | null = null;
  if (layer1.runTracking) {
    if (layer1.definition === null) throw new Error("Ověření trackingu vyžaduje definici A nebo B.");
    const lookup = lookupTracking(group.order, source);
    reasons.push(...checkTracking(layer1.definition, lookup, now));
    if (lookup.kind === "found") tracking = lookup.result;
  }
  return {
    orderId: layer1.orderId,
    orderLabel: layer1.orderLabel,
    mailshipStatus: group.order.status,
    definition: layer1.definition,
    outcome: outcomeFromReasons(reasons),
    reasons,
    reporter: layer1.reporter,
    complaintReason: layer1.complaintReason,
    daysInStatus: layer1.daysInStatus,
    tracking,
    mailshipDiscrepancy: tracking?.state === "DELIVERED",
  };
}

export function decideAll(input: InputData, source: TrackingSource, now: Date): Decision[] {
  const decisions: Decision[] = [];
  for (const group of dedupeOrders(input.orders)) {
    decisions.push(decideOrder(group, input, source, now));
  }
  return decisions;
}
