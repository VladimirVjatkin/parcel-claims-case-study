// CLI pro regresní měření parserů: labels.csv a HTML → počty, matice záměn a dopady chyb.
// --now určuje okamžik kontroly událostí; výchozí měření používá stejný okamžik jako decide.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRunArgs } from "./args.js";
import { DEFAULT_RUN_MOMENT } from "../config.js";
import { LABELS_RELATIVE_PATH, readLabels } from "../eval/labels.js";
import { evaluatePages } from "../eval/evaluatePages.js";
import { formatEvaluation } from "../report/formatEvaluation.js";

try {
  // Uložené stránky používají zvolený okamžik běhu jako referenci pro budoucí události.
  // Větev --now now zde dostává callback s pevným okamžikem, nikoli se systémovým časem.
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
