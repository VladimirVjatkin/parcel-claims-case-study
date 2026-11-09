// Určuje kontakt klienta pro reklamaci: nejprve matice, jinak historie reklamací.
// Kontakt se nehádá; bez použitelného reportéra vrací null pro důvod `NO_REPORTER`.
import type { Complaint, ReporterMatrixRow } from "../domain/types.js";
import { parseIsoInstant } from "../time/pragueDays.js";

// Matice má přednost, jinak rozhoduje nejnovější reklamace bez ohledu na stav a důvod.
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
    // Porovnává se okamžik, ne text data: různé posuny +01:00 / +02:00 mění pořadí.
    // Nečitelné createdAt se do výběru nezapočítá, protože stáří nelze určit.
    const createdAt = parseIsoInstant(complaint.createdAt);
    // Při shodě okamžiku zůstává první kontakt v souboru; omezení je popsané v NOTES.
    if (createdAt !== null && createdAt.getTime() > latestTimestamp) {
      latestTimestamp = createdAt.getTime();
      reporter = complaint.reporter.trim();
    }
  }
  return reporter;
}
