import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRunArgs } from "./args.js";
import { loadInput } from "../input/loadInput.js";
import { decideAll } from "../decision/decide.js";
import { createFileTrackingSource } from "../tracking/trackingSource.js";
import { formatDecisionReport } from "../report/formatDecisionReport.js";

try {
  const args = parseRunArgs(process.argv.slice(2), () => new Date());
  const input = loadInput(args.dataDir);
  const source = createFileTrackingSource(join(args.dataDir, "tracking"));
  const decisions = decideAll(input, source, args.now);
  const report = formatDecisionReport(decisions, { now: args.now, exportRowCount: input.orders.length });
  if (args.outPath !== null) {
    mkdirSync(dirname(args.outPath), { recursive: true });
    writeFileSync(args.outPath, report, "utf8");
  }
  process.stdout.write(report);
} catch (error) {
  console.error(`Chyba: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
