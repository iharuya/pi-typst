import type { CellDimensions, ImageDimensions } from "@earendil-works/pi-tui";

const FALLBACK_CELL: CellDimensions = { widthPx: 9, heightPx: 18 };

/** Replaces unknown (non-positive) cell sizes with typical terminal defaults. */
export function normalizeCellDimensions(cell: CellDimensions): CellDimensions {
  return {
    widthPx: cell.widthPx > 0 ? cell.widthPx : FALLBACK_CELL.widthPx,
    heightPx: cell.heightPx > 0 ? cell.heightPx : FALLBACK_CELL.heightPx,
  };
}

/**
 * Size in terminal cells at which the image is shown: its natural size,
 * scaled down proportionally when wider than the available width.
 */
export function fitImageToCells(
  image: ImageDimensions,
  availableWidth: number,
  cell: CellDimensions,
): { columns: number; rows: number } {
  const { widthPx: cellW, heightPx: cellH } = normalizeCellDimensions(cell);
  const idealColumns = Math.ceil(image.widthPx / cellW);
  const idealRows = Math.ceil(image.heightPx / cellH);

  const columns = Math.min(
    Math.max(1, availableWidth),
    Math.max(1, idealColumns),
  );
  const scale = columns / Math.max(1, idealColumns);
  const rows = Math.max(1, Math.ceil(idealRows * scale));
  return { columns, rows };
}

export function estimateRows(heightPx: number, cell: CellDimensions): number {
  const { heightPx: cellH } = normalizeCellDimensions(cell);
  return Math.max(1, Math.round(heightPx / cellH));
}
