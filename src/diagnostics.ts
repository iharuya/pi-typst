import { PREAMBLE_LINE_COUNT } from "./preamble.js";

const MULTI_PAGE_ERROR =
  "cannot export multiple images without a page number template";

export const MULTI_PAGE_MESSAGE =
  "Multi-page documents are not supported. Please use '#set page(height: auto)' and avoid '#pagebreak()' to render as a single continuous scrollable canvas.";

function shiftLine(line: string, offset: number): number {
  return Math.max(1, Number.parseInt(line, 10) - offset);
}

/**
 * Rewrites `<stdin>:L:C` locations and source gutter line numbers so they
 * point at the user's content instead of the preamble-prefixed input.
 */
export function remapDiagnostics(
  stderr: string,
  lineOffset: number,
  filename = "<stdin>",
): string {
  return stderr
    .replace(
      /<stdin>:(\d+):(\d+)/g,
      (_, line: string, col: string) =>
        `${filename}:${shiftLine(line, lineOffset)}:${col}`,
    )
    .replace(
      /^([ \t]*)(\d+)([ \t]*│)/gm,
      (_, pad: string, line: string, bar: string) =>
        `${pad}${String(shiftLine(line, lineOffset)).padStart(line.length)}${bar}`,
    );
}

export function formatCompileError(
  stderr: string,
  exitCode: number | null,
  filename?: string,
): string {
  const trimmed = stderr.trim();
  if (trimmed.includes(MULTI_PAGE_ERROR)) {
    return MULTI_PAGE_MESSAGE;
  }
  const remapped = remapDiagnostics(trimmed, PREAMBLE_LINE_COUNT, filename);
  return remapped || `typst exited with code ${exitCode}`;
}
