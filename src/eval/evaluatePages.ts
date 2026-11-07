import { parserForCarrier } from "../tracking/parseTrackingPage.js";
import type { TrackingState } from "../tracking/types.js";
import type { LabelRow } from "./labels.js";

export type ErrorImpact = "HIDDEN_PROBLEM" | "WRONG_COMPLAINT" | "EXTRA_REVIEW" | "NO_DECISION_IMPACT";

export function errorImpact(expected: TrackingState, predicted: TrackingState): ErrorImpact | null {
  if (expected === predicted) return null;
  if (predicted === "DELIVERED") return "HIDDEN_PROBLEM";
  if (predicted === "IN_TRANSIT") return "WRONG_COMPLAINT";
  if (expected === "DELIVERED" || expected === "IN_TRANSIT") return "EXTRA_REVIEW";
  return "NO_DECISION_IMPACT";
}

export interface PageEvaluation {
  file: string;
  carrier: string;
  expected: TrackingState;
  predicted: TrackingState;
  quote: string;
  note: string;
  impact: ErrorImpact | null;
}

export interface EvaluationResult {
  pages: PageEvaluation[];
}

export function evaluatePages(labels: LabelRow[], readPage: (file: string) => string | null, referenceMoment: Date): EvaluationResult {
  const pages: PageEvaluation[] = [];
  for (const label of labels) {
    let predicted: TrackingState = "UNKNOWN";
    let quote = "";
    const parser = parserForCarrier(label.carrier);
    if (parser === null) {
      quote = `pro dopravce ${label.carrier} nemáme čtení tracking stránky`;
    } else {
      const html = readPage(label.file);
      if (html === null) quote = "tracking stránka není k dispozici";
      else {
        const result = parser(html, referenceMoment);
        predicted = result.state;
        quote = result.quote;
      }
    }
    pages.push({
      file: label.file, carrier: label.carrier, expected: label.expectedState,
      predicted, quote, note: label.note, impact: errorImpact(label.expectedState, predicted),
    });
  }
  pages.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  return { pages };
}
