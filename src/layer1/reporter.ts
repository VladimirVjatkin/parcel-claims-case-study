import type { Complaint, ReporterMatrixRow } from "../domain/types.js";
import { parseIsoInstant } from "../time/pragueDays.js";

export function findReporter(
  client: string | null,
  matrix: ReporterMatrixRow[],
  complaints: Complaint[],
): string | null {
  if (client === null || client.trim() === "") return null;
  const clientName = client.trim();
  for (const row of matrix) {
    if (row.client.trim() === clientName && row.reporterEmail.trim() !== "") {
      return row.reporterEmail.trim();
    }
  }
  let reporter: string | null = null;
  let latestTimestamp = -Infinity;
  for (const complaint of complaints) {
    if (complaint.client.trim() !== clientName || complaint.reporter.trim() === "") continue;
    const createdAt = parseIsoInstant(complaint.createdAt);
    if (createdAt !== null && createdAt.getTime() > latestTimestamp) {
      latestTimestamp = createdAt.getTime();
      reporter = complaint.reporter.trim();
    }
  }
  return reporter;
}
