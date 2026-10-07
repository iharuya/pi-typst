const PREAMBLE_LINES = [
  "#set page(width: 170mm, height: auto, margin: (x: 0pt, y: 0.5em), fill: none)",
  '#set text(fill: rgb("#d4d4d4"), size: 12pt)',
  "#set par(leading: 0.85em)",
];

/** Number of lines prepended to user content; diagnostics are shifted back by this. */
export const PREAMBLE_LINE_COUNT = PREAMBLE_LINES.length;

export function withPreamble(content: string): string {
  return `${PREAMBLE_LINES.join("\n")}\n${content}`;
}
