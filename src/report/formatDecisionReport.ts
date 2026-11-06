import type { Decision } from "../decision/decide.js";
import type { Reason } from "../domain/types.js";
import { addTable } from "./markdown.js";

export interface DecisionReportMeta {
  now: Date;
  exportRowCount: number;
}

function formatRunMoment(now: Date): string {
  const formatter = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(now)) parts[part.type] = part.value;
  return `${parts.day}. ${parts.month}. ${parts.year} ${parts.hour}:${parts.minute}`;
}

function addSection(lines: string[], title: string, headers: string[], rows: string[][]): void {
  lines.push("", `## ${title}`, "");
  if (rows.length === 0) lines.push("Žádné objednávky.");
  else addTable(lines, headers, rows);
}

function formatReasons(reasons: Reason[], trackingQuote: string | null): string {
  const values: string[] = [];
  for (const reason of reasons) {
    const quoteReason = reason.code === "TRACKING_UNKNOWN" || reason.code === "TRACKING_RETURNING" ||
      reason.code === "DELIVERED_PER_TRACKING" || reason.code === "CARRIER_PICKUP_CONFIRMED";
    const repeatedQuote = quoteReason && trackingQuote !== null && reason.detail === trackingQuote;
    values.push(reason.detail && !repeatedQuote ? `${reason.code} — ${reason.detail}` : reason.code);
  }
  return values.join("; ");
}

function formatTracking(decision: Decision): string {
  if (decision.tracking === null) return "—";
  const { state, quote } = decision.tracking;
  return quote === "" ? state : `${state} — ${quote}`;
}

export function formatDecisionReport(decisions: Decision[], meta: DecisionReportMeta): string {
  // Avoid locale-dependent collation and leave the caller's array untouched.
  const sorted = [...decisions].sort((a, b) => a.orderLabel < b.orderLabel ? -1 : a.orderLabel > b.orderLabel ? 1 : 0);
  const createRows: string[][] = [];
  const reviewRows: string[][] = [];
  const rejectRows: string[][] = [];
  const discrepancyRows: string[][] = [];
  for (const decision of sorted) {
    const common = [decision.orderLabel, decision.definition ?? "—", decision.daysInStatus?.toString() ?? "—"];
    switch (decision.outcome) {
      case "CREATE":
        createRows.push([...common, decision.complaintReason ?? "—", decision.reporter ?? "—", formatTracking(decision)]);
        break;
      case "NEEDS_REVIEW":
        reviewRows.push([...common, formatReasons(decision.reasons, decision.tracking?.quote ?? null), formatTracking(decision)]);
        break;
      case "DO_NOT_CREATE":
        rejectRows.push([...common, formatReasons(decision.reasons, null)]);
        break;
    }
    if (decision.mailshipDiscrepancy) {
      discrepancyRows.push([decision.orderLabel, decision.mailshipStatus, decision.tracking?.quote ?? "—"]);
    }
  }
  const lines = [
    "# Rozhodnutí o reklamacích", "",
    `Okamžik běhu: ${formatRunMoment(meta.now)} (Europe/Prague) · Režim: stínový — nic se nezakládá, jde o návrh.`,
    `Data: ${meta.exportRowCount} řádků exportu → ${decisions.length} objednávek.`, "",
  ];
  addTable(lines, ["Výsledek", "Počet"], [
    ["Založit (CREATE)", String(createRows.length)],
    ["Ruční kontrola (NEEDS_REVIEW)", String(reviewRows.length)],
    ["Nezakládat (DO_NOT_CREATE)", String(rejectRows.length)],
  ]);
  addSection(lines, "Založit (CREATE)", ["Objednávka", "Definice", "Dní ve stavu", "Důvod reklamace", "Reportér", "Tracking"], createRows);
  addSection(lines, "Ruční kontrola (NEEDS_REVIEW)", ["Objednávka", "Definice", "Dní ve stavu", "Důvody", "Tracking"], reviewRows);
  addSection(lines, "Nezakládat (DO_NOT_CREATE)", ["Objednávka", "Definice", "Dní ve stavu", "Důvody"], rejectRows);
  lines.push("", "## Nesoulad s Mailshipem", "",
    "Dopravce potvrdil doručení, Mailship má jiný stav. Reklamace se nezakládá; k prověření ve vývoji (QUESTIONS.md).", "");
  if (discrepancyRows.length === 0) lines.push("Žádné objednávky.");
  else addTable(lines, ["Objednávka", "Stav v Mailshipu", "Citace ze stránky dopravce"], discrepancyRows);
  return lines.join("\n") + "\n";
}
