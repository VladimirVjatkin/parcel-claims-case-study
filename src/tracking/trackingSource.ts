import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface TrackingSource {
  getPage(trackingNumber: string): string | null;
}

export function createFileTrackingSource(dir: string): TrackingSource {
  return {
    getPage(trackingNumber: string): string | null {
      // The tracking number must never become a path supplied by the export.
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
