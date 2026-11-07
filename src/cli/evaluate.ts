import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRunArgs } from "./args.js";
import { DEFAULT_RUN_MOMENT } from "../config.js";
import { LABELS_RELATIVE_PATH, readLabels } from "../eval/labels.js";
import { evaluatePages } from "../eval/evaluatePages.js";
import { formatEvaluation } from "../report/formatEvaluation.js";

try {
  // Stored pages use the selected run moment as their reference for future events.
  const args = parseRunArgs(process.argv.slice(2), () => new Date(DEFAULT_RUN_MOMENT));
  const labels = readLabels(join(args.dataDir, LABELS_RELATIVE_PATH));
  const result = evaluatePages(labels, (file: string): string | null => {
    try {
      return readFileSync(join(args.dataDir, "tracking", file), "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }, args.now);
  const report = formatEvaluation(result);
  if (args.outPath !== null) {
    mkdirSync(dirname(args.outPath), { recursive: true });
    writeFileSync(args.outPath, report, "utf8");
  }
  process.stdout.write(report);
} catch (error) {
  console.error(`Chyba: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
