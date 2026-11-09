// Odděluje získání stránky od rozhodování: číslo zásilky → HTML nebo nedostupný zdroj.
// Souborový zdroj lze později nahradit API / retrackem přes stejné rozhraní (NOTES).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface TrackingSource {
  getPage(trackingNumber: string): string | null;
}

// Uložené stránky zastupují dopravce; chybějící soubor je nedostupnost, jiná chyba se nezatají.
export function createFileTrackingSource(dir: string): TrackingSource {
  return {
    getPage(trackingNumber: string): string | null {
      // Číslo zásilky z exportu se nikdy nesmí stát libovolnou cestou k souboru.
      if (!/^[A-Za-z0-9]+$/.test(trackingNumber)) return null;
      try {
        return readFileSync(join(dir, `${trackingNumber}.html`), "utf8");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },
  };
}
