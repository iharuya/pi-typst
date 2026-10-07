import { type CellDimensions, getCellDimensions } from "@earendil-works/pi-tui";

export type TypstLayout = {
  pageWidthPt: number;
  ppi: number;
  textSizePt: number;
};

const TEXT_SIZE_PT = 12;
// Typical terminal line height relative to the font size. Used to infer the
// terminal font size from the cell height so typst text matches it.
const CELL_HEIGHT_PER_EM = 1.25;
const MIN_COLUMNS = 60;
const MAX_COLUMNS = 100;
// Pi's tool row pads 1 column per side and pi-tui's Image reserves 2 more.
const RESERVED_COLUMNS = 4;
const FALLBACK_TERMINAL_COLUMNS = 80;

export function cellDimensions(): CellDimensions {
  const { widthPx, heightPx } = getCellDimensions();
  return {
    widthPx: widthPx > 0 ? widthPx : 9,
    heightPx: heightPx > 0 ? heightPx : 18,
  };
}

/**
 * Sizes the typst page in terminal cells so the image is displayed 1:1:
 * text matches the terminal font, and the page spans the pane up to a
 * readable maximum. Narrower panes get the minimum width scaled down instead
 * of reflowing wide formulas off the page.
 */
export function terminalLayout(
  terminalColumns: number | undefined,
): TypstLayout {
  const cell = cellDimensions();
  const available =
    (terminalColumns || FALLBACK_TERMINAL_COLUMNS) - RESERVED_COLUMNS;
  const columns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, available));
  const pxPerPt = cell.heightPx / (CELL_HEIGHT_PER_EM * TEXT_SIZE_PT);

  return {
    pageWidthPt: (columns * cell.widthPx) / pxPerPt,
    ppi: pxPerPt * 72,
    textSizePt: TEXT_SIZE_PT,
  };
}
