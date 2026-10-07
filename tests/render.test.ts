import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { setCapabilities, setCellDimensions } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it } from "vitest";
import {
  previewText,
  renderCall,
  renderResult,
  TypstResultComponent,
} from "../src/render.js";
import type { RenderedImage, TypstToolDetails } from "../src/types.js";
import { fakeTheme, makePngHeader } from "./helpers.js";

const image: RenderedImage = {
  data: makePngHeader(200, 100).toString("base64"),
  widthPx: 200,
  heightPx: 100,
};

const result = (
  partial: Partial<AgentToolResult<TypstToolDetails>>,
): AgentToolResult<TypstToolDetails> => ({
  content: [],
  details: {},
  ...partial,
});

beforeEach(() => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
  setCellDimensions({ widthPx: 10, heightPx: 20 });
});

describe("previewText", () => {
  it("shows only the first non-blank line", () => {
    expect(previewText("\n  $x^2$\n$y$")).toBe("$x^2$");
  });

  it("truncates long lines to 50 characters", () => {
    const preview = previewText("a".repeat(60));
    expect(preview).toHaveLength(50);
    expect(preview.endsWith("...")).toBe(true);
  });

  it("keeps a line of exactly 50 characters", () => {
    expect(previewText("b".repeat(50))).toBe("b".repeat(50));
  });
});

describe("renderCall", () => {
  it("shows the path when given", () => {
    const [line] = renderCall({ path: "notes.typ" }, fakeTheme).render(100);
    expect(line).toContain("<accent>notes.typ</accent>");
  });

  it("shows a text preview otherwise", () => {
    const [line] = renderCall({ text: "$a + b$" }, fakeTheme).render(100);
    expect(line).toContain("<dim>$a + b$</dim>");
  });

  it("shows only the title without input", () => {
    const [line] = renderCall({}, fakeTheme).render(100);
    expect(line).toContain("<toolTitle>**typst **</toolTitle>");
    expect(line).not.toContain("<dim>");
  });
});

describe("renderResult", () => {
  it("shows the error text on failure", () => {
    const component = renderResult(
      result({ isError: true, content: [{ type: "text", text: "boom" }] }),
      fakeTheme,
    );
    expect(component.render(100).join("\n")).toContain("<error>boom</error>");
  });

  it("uses a generic message when the error has no text", () => {
    const component = renderResult(result({ isError: true }), fakeTheme);
    expect(component.render(100).join("\n")).toContain("Compilation failed");
  });

  it("shows a plain success line without an image", () => {
    const component = renderResult(result({}), fakeTheme);
    expect(component).not.toBeInstanceOf(TypstResultComponent);
    expect(component.render(100).join("\n")).toContain("✓ Rendered");
  });

  it("renders the image when present", () => {
    const component = renderResult(result({ details: { image } }), fakeTheme);
    expect(component).toBeInstanceOf(TypstResultComponent);
  });
});

describe("TypstResultComponent", () => {
  it("renders a label, a blank line and the image", () => {
    const lines = new TypstResultComponent(image, "Done", fakeTheme).render(80);
    expect(lines[0]).toBe("<success>✓ Done</success>");
    expect(lines[1]).toBe("");
    expect(lines.length).toBeGreaterThan(2);
  });

  it("caches lines per width", () => {
    const component = new TypstResultComponent(image, "Done", fakeTheme);
    const first = component.render(80);
    expect(component.render(80)).toBe(first);
    expect(component.render(40)).not.toBe(first);
  });

  it("re-renders after invalidate", () => {
    const component = new TypstResultComponent(image, "Done", fakeTheme);
    const first = component.render(80);
    component.invalidate();
    const second = component.render(80);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("falls back to text when the terminal cannot show images", () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const lines = new TypstResultComponent(image, "Done", fakeTheme).render(80);
    expect(lines.slice(2).join("\n")).toContain("<toolOutput>");
  });
});
