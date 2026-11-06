import { describe, expect, it } from "vitest";
import { parseDoructo } from "../../src/tracking/parsers/doructo.js";

function step(label: string, fill: string): string {
  return `<g class="step"><circle fill="${fill}"/><text>${label}</text></g>`;
}

function page(steps: string): string {
  return `<svg class="timeline">${steps}</svg>`;
}

describe("Doručto", () => {
  it("reads only the green step, ignoring the other labels", () => {
    const html = page(step("U kurýra", "#00a86b") + step("Doručeno", "#d0d4d9") + step("Vráceno", "#d0d4d9"));
    expect(parseDoructo(html)).toEqual({ state: "IN_TRANSIT", quote: "U kurýra", pickupPoint: null });
  });
  it.each([
    ["Podáno", "IN_TRANSIT"], ["V přepravě", "IN_TRANSIT"], ["U kurýra", "IN_TRANSIT"],
    ["Doručeno", "DELIVERED"], ["Vráceno", "RETURNING"], ["Nový stav", "UNKNOWN"],
  ])("matches active label %s with uppercase green fill", (label, expected) => {
    expect(parseDoructo(page(step(label, "#00A86B")))).toEqual({ state: expected, quote: label, pickupPoint: null });
  });
  it.each([
    "", page(step("Doručeno", "#d0d4d9")),
    page(step("Doručeno", "#00a86b") + step("U kurýra", "#00a86b")),
    page('<g class="step"><circle fill="#00a86b"/></g>'),
    page('<g class="step"><circle fill="#00a86b"/><text>Doručeno</text><text>Vráceno</text></g>'),
  ])("rejects absent or ambiguous active steps or labels", (html) => {
    expect(parseDoructo(html)).toEqual({ state: "UNKNOWN", quote: "", pickupPoint: null });
  });
});
