// Společné argumenty obou CLI: okamžik běhu, adresář podkladů a volitelný výstupní soubor.
// Bez --now zůstává pevný okamžik z config.ts, aby se výchozí report neměnil podle dne spuštění.
import { parseArgs } from "node:util";
import { DEFAULT_RUN_MOMENT } from "../config.js";
import { parseIsoInstant } from "../time/pragueDays.js";

export interface RunArgs {
  now: Date;
  dataDir: string;
  outPath: string | null;
}

// --now now čerpá čas z předaného callbacku; ISO hodnota musí obsahovat sekundy a časový posun.
// Callback dovoluje čas řídit i v testech, místo skrytého čtení systémových hodin.
export function parseRunArgs(argv: string[], currentTime: () => Date): RunArgs {
  let values: { now?: string; data?: string; out?: string };
  try {
    const parsed = parseArgs({
      args: argv,
      options: { now: { type: "string" }, data: { type: "string" }, out: { type: "string" } },
      strict: true,
      allowPositionals: false,
    });
    values = parsed.values;
  } catch {
    throw new Error("Neplatné argumenty: povoleny jsou pouze --now, --data a --out, vždy s hodnotou.");
  }
  let now = new Date(DEFAULT_RUN_MOMENT);
  if (values.now === "now") {
    now = currentTime();
  } else if (values.now !== undefined) {
    const instant = parseIsoInstant(values.now);
    if (instant === null) throw new Error("Neplatný --now: použijte ISO datum se sekundami a časovým posunem (Z nebo ±hh:mm), nebo now.");
    now = instant;
  }
  return { now, dataDir: values.data ?? "data", outPath: values.out ?? null };
}
