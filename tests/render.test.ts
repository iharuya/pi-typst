import type { Theme } from "@earendil-works/pi-coding-agent";
import { setCapabilities, setCellDimensions } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it } from "vitest";
import { type RenderedImage, renderTypstResult } from "../src/render.js";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function renderedHeight(image: RenderedImage, width: number): number {
  const component = renderTypstResult(
    { content: [{ type: "text", text: "Rendered" }], details: { image } },
    theme,
  );
  return component.render(width).length;
}

beforeEach(() => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
  setCellDimensions({ widthPx: 10, heightPx: 20 });
});

describe("rendered image", () => {
  const image: RenderedImage = { data: "AAAA", widthPx: 400, heightPx: 400 };

  it("does not upscale beyond its natural size in wide panes", () => {
    expect(renderedHeight(image, 500)).toBe(renderedHeight(image, 100));
  });

  it("shrinks to fit narrow panes", () => {
    expect(renderedHeight(image, 20)).toBeLessThan(renderedHeight(image, 100));
  });

  it("shows the typst error message on failure", () => {
    const component = renderTypstResult(
      {
        content: [{ type: "text", text: "error: unknown variable" }],
        details: {},
        isError: true,
      },
      theme,
    );
    expect(component.render(80).join("\n")).toContain("unknown variable");
  });
});
