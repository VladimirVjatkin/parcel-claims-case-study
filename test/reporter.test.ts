import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadInput } from "../src/input/loadInput.js";
import { findReporter } from "../src/layer1/reporter.js";
import { makeComplaint } from "./helpers/makeOrder.js";

const input = loadInput(fileURLToPath(new URL("../data", import.meta.url)));

describe("findReporter", () => {
  it("prefers the matrix to history", () => {
    expect(findReporter(" Velkoobchod Gama ", input.reporterMatrix, input.complaints)).toBe("reklamace@velkoobchod-gama.example");
  });
  it("chooses the latest complaint regardless of status and reason", () => {
    expect(findReporter("Hračky Epsilon", input.reporterMatrix, input.complaints)).toBe("tomas.velky@hracky-epsilon.example");
  });
  it("compares instants, not strings with different offsets", () => {
    const history = [
      makeComplaint({ reporter: "earlier@example.test", createdAt: "2026-10-25T01:30:00+02:00" }),
      makeComplaint({ reporter: "later@example.test", createdAt: "2026-10-25T00:45:00+01:00" }),
    ];
    expect(findReporter("Testovací klient", [], history)).toBe("later@example.test");
  });
  it("returns null without a client or contact", () => {
    expect(findReporter(null, input.reporterMatrix, input.complaints)).toBeNull();
    expect(findReporter("Nový klient Zeta", input.reporterMatrix, input.complaints)).toBeNull();
  });
  it("skips empty contacts and invalid history dates", () => {
    const history = [
      makeComplaint(),
      makeComplaint({ reporter: "  ", createdAt: "2026-11-01T10:00:00Z" }),
      makeComplaint({ reporter: "invalid@example.test", createdAt: "abc" }),
    ];
    expect(findReporter("Testovací klient", [{ client: "Testovací klient", reporterEmail: " " }], history)).toBe("history@example.test");
  });
});
