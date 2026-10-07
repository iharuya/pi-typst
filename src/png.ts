import type { ImageDimensions } from "@earendil-works/pi-tui";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads width/height from the IHDR chunk, or null if the buffer is not a PNG. */
export function parsePngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) {
    return null;
  }
  if (!PNG_SIGNATURE.every((byte, i) => buffer[i] === byte)) {
    return null;
  }
  return {
    widthPx: buffer.readUInt32BE(16),
    heightPx: buffer.readUInt32BE(20),
  };
}
