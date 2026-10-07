import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  allocateImageId,
  type Component,
  getCellDimensions,
  Image,
  Text,
} from "@earendil-works/pi-tui";
import type { TypstParamsType } from "./input.js";
import { fitImageToCells } from "./layout.js";
import type { RenderedImage, TypstToolDetails } from "./types.js";

const PREVIEW_MAX_LENGTH = 50;

export class TypstResultComponent implements Component {
  private image: RenderedImage;
  private label: string;
  private theme: Theme;
  private imageId: number;
  private cachedWidth?: number | undefined;
  private cachedLines?: string[] | undefined;

  constructor(image: RenderedImage, label: string, theme: Theme) {
    this.image = image;
    this.label = label;
    this.theme = theme;
    this.imageId = allocateImageId();
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const { columns, rows } = fitImageToCells(
      this.image,
      width,
      getCellDimensions(),
    );

    const imageComponent = new Image(
      this.image.data,
      "image/png",
      { fallbackColor: (s: string) => this.theme.fg("toolOutput", s) },
      {
        maxWidthCells: columns,
        maxHeightCells: rows,
        imageId: this.imageId,
      },
      {
        widthPx: this.image.widthPx,
        heightPx: this.image.heightPx,
      },
    );

    const lines: string[] = [
      this.theme.fg("success", `✓ ${this.label}`),
      "",
      ...imageComponent.render(width),
    ];

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

/** First line of the text, truncated with an ellipsis to fit the call header. */
export function previewText(text: string): string {
  const firstLine = text.trim().split("\n")[0] ?? "";
  return firstLine.length > PREVIEW_MAX_LENGTH
    ? `${firstLine.slice(0, PREVIEW_MAX_LENGTH - 3)}...`
    : firstLine;
}

export function renderCall(args: TypstParamsType, theme: Theme): Component {
  let text = theme.fg("toolTitle", theme.bold("typst "));
  if (args.path) {
    text += theme.fg("accent", args.path);
  } else if (args.text) {
    text += theme.fg("dim", previewText(args.text));
  }
  return new Text(text, 0, 0);
}

export function renderResult(
  result: AgentToolResult<TypstToolDetails>,
  theme: Theme,
): Component {
  if (result.isError) {
    const first = result.content[0];
    const msg = first?.type === "text" ? first.text : "Compilation failed";
    return new Text(theme.fg("error", msg), 0, 0);
  }

  const image = result.details?.image;
  if (!image) {
    return new Text(theme.fg("success", "✓ Rendered"), 0, 0);
  }

  return new TypstResultComponent(image, "Rendered", theme);
}
