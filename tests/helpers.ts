import { spawnSync } from "node:child_process";
import type { Theme } from "@earendil-works/pi-coding-agent";

/** Theme stub that tags styled text so assertions can check which color was used. */
export const fakeTheme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `**${text}**`,
} as unknown as Theme;

/** Smallest buffer with a PNG signature and IHDR width/height. */
export function makePngHeader(widthPx: number, heightPx: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(widthPx, 16);
  buffer.writeUInt32BE(heightPx, 20);
  return buffer;
}

export const hasTypst =
  spawnSync("typst", ["--version"], { stdio: "ignore" }).status === 0;
