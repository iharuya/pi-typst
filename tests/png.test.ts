import { describe, expect, it } from "vitest";
import { parsePngDimensions } from "../src/png.js";
import { makePngHeader } from "./helpers.js";

describe("parsePngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(parsePngDimensions(makePngHeader(640, 123))).toEqual({
      widthPx: 640,
      heightPx: 123,
    });
  });

  it("returns null for buffers shorter than the header", () => {
    expect(parsePngDimensions(makePngHeader(1, 1).subarray(0, 23))).toBeNull();
    expect(parsePngDimensions(Buffer.alloc(0))).toBeNull();
  });

  it("returns null when the signature does not match", () => {
    const buffer = makePngHeader(10, 10);
    buffer[7] = 0x00;
    expect(parsePngDimensions(buffer)).toBeNull();
  });

  it("returns null for other image formats", () => {
    const jpeg = Buffer.alloc(32);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(parsePngDimensions(jpeg)).toBeNull();
  });
});
