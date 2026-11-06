import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLabels } from "../src/eval/labels.js";

const header = "file,carrier,tracking_number,expected_state,note";
const temporaryRoot = resolve(tmpdir());
let fixtureDir: string;
let fixturePath: string;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(temporaryRoot, "mailstep-labels-"));
  fixturePath = join(fixtureDir, "labels.csv");
});
afterEach(() => {
  const target = resolve(fixtureDir);
  if (dirname(target) !== temporaryRoot || !basename(target).startsWith("mailstep-labels-")) throw new Error("Neplatná cesta testovacích dat.");
  rmSync(target, { recursive: true, force: true });
});

describe("readLabels", () => {
  it("preserves a quoted comma and doubled quotes", () => {
    writeFileSync(fixturePath, `${header}\r\nA1.html,Expedo,A1,UNKNOWN,"čeká, řekl ""soused"""\r\n`);
    expect(readLabels(fixturePath)).toEqual([{
      file: "A1.html", carrier: "Expedo", trackingNumber: "A1", expectedState: "UNKNOWN", note: 'čeká, řekl "soused"',
    }]);
  });
  it("supports quoted fields, empty notes and a final row without newline", () => {
    writeFileSync(fixturePath, `\uFEFF${header}\n"A1.html","Expedo",A1,IN_TRANSIT,`);
    expect(readLabels(fixturePath)[0]?.note).toBe("");
    expect(readLabels(fixturePath)[0]?.carrier).toBe("Expedo");
  });
  it("preserves newlines inside quoted notes", () => {
    writeFileSync(fixturePath, `${header}\nA1.html,Expedo,A1,UNKNOWN,"první\ndruhý"\n`);
    expect(readLabels(fixturePath)[0]?.note).toBe("první\ndruhý");
  });
  it("rejects a wrong header with its line number", () => {
    writeFileSync(fixturePath, "file,carrier,tracking_number,wrong,note\n");
    expect(() => readLabels(fixturePath)).toThrow("řádek 1: neplatná hlavička");
  });
  it("rejects a header quoted as one field instead of five columns", () => {
    writeFileSync(fixturePath, `"${header}"\n`);
    expect(() => readLabels(fixturePath)).toThrow("řádek 1: neplatná hlavička");
  });
  it("rejects an unknown state with its line number", () => {
    writeFileSync(fixturePath, `${header}\nA1.html,Expedo,A1,IN_TRANSIT,\nA2.html,Expedo,A2,LOST,\n`);
    expect(() => readLabels(fixturePath)).toThrow("řádek 3: neplatný expected_state");
  });
  it.each(['A1.html,Expedo,A1,UNKNOWN,"unclosed', 'A1.html,Expedo,A1,UNKNOWN,"quoted"extra', "A1.html,Expedo,A1,UNKNOWN"])("rejects malformed CSV: %s", (row) => {
    writeFileSync(fixturePath, `${header}\n${row}`);
    expect(() => readLabels(fixturePath)).toThrow("řádek 2");
  });
  it("reads all 20 supplied labels and the full quoted notes", () => {
    const labels = readLabels(fileURLToPath(new URL("../data/tracking/labels.csv", import.meta.url)));
    expect(labels).toHaveLength(20);
    expect(labels.find((row) => row.trackingNumber === "PN55100116")?.note).toBe("čeká na výdejním místě, příjemce ji nevyzvedl");
  });
});
