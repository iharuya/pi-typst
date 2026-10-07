import { describe, expect, it } from "vitest";
import {
  estimateRows,
  fitImageToCells,
  normalizeCellDimensions,
} from "../src/layout.js";

const cell = { widthPx: 10, heightPx: 20 };

describe("normalizeCellDimensions", () => {
  it("keeps known sizes", () => {
    expect(normalizeCellDimensions(cell)).toEqual(cell);
  });

  it("falls back when the terminal reports no size", () => {
    expect(normalizeCellDimensions({ widthPx: 0, heightPx: -1 })).toEqual({
      widthPx: 9,
      heightPx: 18,
    });
  });
});

describe("fitImageToCells", () => {
  it("uses the natural size when it fits", () => {
    expect(fitImageToCells({ widthPx: 400, heightPx: 200 }, 80, cell)).toEqual({
      columns: 40,
      rows: 10,
    });
  });

  it("rounds partial cells up", () => {
    expect(fitImageToCells({ widthPx: 401, heightPx: 201 }, 80, cell)).toEqual({
      columns: 41,
      rows: 11,
    });
  });

  it("scales down proportionally when wider than available", () => {
    expect(fitImageToCells({ widthPx: 800, heightPx: 400 }, 40, cell)).toEqual({
      columns: 40,
      rows: 10,
    });
  });

  it("never returns less than one cell", () => {
    expect(fitImageToCells({ widthPx: 0, heightPx: 0 }, 0, cell)).toEqual({
      columns: 1,
      rows: 1,
    });
    expect(fitImageToCells({ widthPx: 1000, heightPx: 1 }, 1, cell)).toEqual({
      columns: 1,
      rows: 1,
    });
  });
});

describe("estimateRows", () => {
  it("rounds to the nearest row", () => {
    expect(estimateRows(29, cell)).toBe(1);
    expect(estimateRows(30, cell)).toBe(2);
  });

  it("is at least one row", () => {
    expect(estimateRows(0, cell)).toBe(1);
  });
});
