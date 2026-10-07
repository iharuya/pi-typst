import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  allocateImageId,
  type CellDimensions,
  type Component,
  getCellDimensions,
  Image,
  Text,
} from "@earendil-works/pi-tui";

export type RenderedImage = {
  data: string;
  widthPx: number;
  heightPx: number;
};

export type TypstToolDetails = {
  image?: RenderedImage | undefined;
};

const CALL_PREVIEW_LENGTH = 50;

export function renderTypstCall(
  args: { path?: string | undefined; text?: string | undefined },
  theme: Theme,
): Component {
  const title = theme.fg("toolTitle", theme.bold("typst "));
  if (args.path) {
    return new Text(title + theme.fg("accent", args.path), 0, 0);
  }
  const firstLine = args.text?.trim().split("\n")[0] ?? "";
  const preview =
    firstLine.length > CALL_PREVIEW_LENGTH
      ? `${firstLine.slice(0, CALL_PREVIEW_LENGTH - 3)}...`
      : firstLine;
  return new Text(title + theme.fg("dim", preview), 0, 0);
}

export function renderTypstResult(
  result: AgentToolResult<TypstToolDetails>,
  theme: Theme,
): Component {
  if (result.isError) {
    const first = result.content[0];
    const message = first?.type === "text" ? first.text : "Compilation failed";
    return new Text(theme.fg("error", message), 0, 0);
  }
  const image = result.details?.image;
  if (!image) {
    return new Text(theme.fg("success", "✓ Rendered"), 0, 0);
  }
  return new RenderedImageComponent(image, theme);
}

/** Cell size that displays the image at 1:1 pixel scale. */
export function naturalCellSize(image: RenderedImage): {
  columns: number;
  rows: number;
} {
  const cell = cellDimensions();
  return {
    columns: Math.max(1, Math.ceil(image.widthPx / cell.widthPx)),
    rows: Math.max(1, Math.ceil(image.heightPx / cell.heightPx)),
  };
}

function cellDimensions(): CellDimensions {
  const { widthPx, heightPx } = getCellDimensions();
  return {
    widthPx: widthPx > 0 ? widthPx : 9,
    heightPx: heightPx > 0 ? heightPx : 18,
  };
}

class RenderedImageComponent implements Component {
  private readonly image: RenderedImage;
  private readonly theme: Theme;
  private readonly imageId = allocateImageId();
  private cache?: { width: number; lines: string[] } | undefined;

  constructor(image: RenderedImage, theme: Theme) {
    this.image = image;
    this.theme = theme;
  }

  invalidate(): void {
    this.cache = undefined;
  }

  render(width: number): string[] {
    if (this.cache?.width === width) {
      return this.cache.lines;
    }

    // Capping at the natural size keeps text at a constant size: the image
    // never upscales, and only shrinks when the pane is narrower.
    const { columns, rows } = naturalCellSize(this.image);
    const image = new Image(
      this.image.data,
      "image/png",
      { fallbackColor: (s: string) => this.theme.fg("toolOutput", s) },
      { maxWidthCells: columns, maxHeightCells: rows, imageId: this.imageId },
      { widthPx: this.image.widthPx, heightPx: this.image.heightPx },
    );

    const lines = [
      this.theme.fg("success", "✓ Rendered"),
      "",
      ...image.render(width),
    ];
    this.cache = { width, lines };
    return lines;
  }
}
