import { describe, expect, it } from "vitest";
import { PREAMBLE_LINE_COUNT, withPreamble } from "../src/preamble.js";

describe("withPreamble", () => {
  it("places user content right after the preamble lines", () => {
    const lines = withPreamble("first\nsecond").split("\n");
    expect(lines.slice(PREAMBLE_LINE_COUNT)).toEqual(["first", "second"]);
  });

  it("keeps the preamble itself to set rules only", () => {
    const lines = withPreamble("").split("\n").slice(0, PREAMBLE_LINE_COUNT);
    expect(lines).toHaveLength(PREAMBLE_LINE_COUNT);
    for (const line of lines) {
      expect(line).toMatch(/^#set /);
    }
  });

  it("does not paint a page background, to suit dark terminals", () => {
    expect(withPreamble("")).toContain("fill: none");
  });
});
