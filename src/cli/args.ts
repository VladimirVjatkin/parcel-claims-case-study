import { parseArgs } from "node:util";
import { DEFAULT_RUN_MOMENT } from "../config.js";
import { parseIsoInstant } from "../time/pragueDays.js";

export interface RunArgs {
  now: Date;
  dataDir: string;
  outPath: string | null;
}

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
