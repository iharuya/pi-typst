import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getCapabilities, getCellDimensions } from "@earendil-works/pi-tui";
import { formatCompileError } from "./diagnostics.js";
import {
  INVALID_INPUT_MESSAGE,
  loadSource,
  parseInput,
  TypstParams,
} from "./input.js";
import { estimateRows } from "./layout.js";
import { parsePngDimensions } from "./png.js";
import { withPreamble } from "./preamble.js";
import { renderCall, renderResult } from "./render.js";
import type { RenderedImage, TypstToolDetails } from "./types.js";
import { compileToPng, isTypstInstalled } from "./typst-cli.js";

type ToolResult = AgentToolResult<TypstToolDetails>;

const FALLBACK_IMAGE_SIZE = { widthPx: 800, heightPx: 600 };

function errorResult(
  text: string,
  details: TypstToolDetails = { error: text },
): ToolResult {
  return {
    content: [{ type: "text", text }],
    details,
    isError: true,
  };
}

function toRenderedImage(png: Buffer): RenderedImage {
  return {
    data: png.toString("base64"),
    ...(parsePngDimensions(png) ?? FALLBACK_IMAGE_SIZE),
  };
}

export const typstTool: ToolDefinition<typeof TypstParams, TypstToolDetails> = {
  name: "typst",
  label: "Typst",
  promptSnippet:
    "Render math, equations, and scientific explanations to terminal images with Typst",
  description:
    "Render math, equations, and scientific explanations as terminal images with Typst. ALWAYS use this tool instead of Markdown math to present formulas to the user (bash cannot show terminal images). Styling and layout are pre-configured: write only raw content (text, math)—never include '#set page', '#set text', or '#pagebreak()'.",
  parameters: TypstParams,

  renderCall: (args, theme) => renderCall(args, theme),
  renderResult: (result, _options, theme) => renderResult(result, theme),

  async execute(_toolCallId, params, signal, _onUpdate, ctx) {
    const input = parseInput(params);
    if (!input) {
      return errorResult(INVALID_INPUT_MESSAGE);
    }
    const path = input.kind === "path" ? input.path : undefined;

    if (!getCapabilities().images) {
      if (ctx?.hasUI) {
        ctx.ui.notify(
          "Failed to display formula: Terminal does not support image display.",
          "error",
        );
      }
      const message = "Terminal does not support image display.";
      return errorResult(message, { path, error: message });
    }

    if (!(await isTypstInstalled())) {
      if (ctx?.hasUI) {
        ctx.ui.notify(
          "Typst CLI is not installed. Please install Typst to render formulas.",
          "error",
        );
      }
      return errorResult("typst command not found.", {
        path,
        error:
          "typst command not found. Ensure Typst CLI is installed and available in PATH.",
      });
    }

    try {
      const cwd = ctx?.cwd ?? process.cwd();
      const source = await loadSource(input, cwd);
      const result = await compileToPng({
        source: withPreamble(source.content),
        cwd: source.workingDir,
        root: cwd,
        signal,
      });

      if (!result.ok) {
        const message = formatCompileError(
          result.stderr,
          result.exitCode,
          path,
        );
        return errorResult(message, { path, error: message });
      }

      const image = toRenderedImage(result.png);
      const rows = estimateRows(image.heightPx, getCellDimensions());
      return {
        content: [
          {
            type: "text",
            text: `Rendered (${image.widthPx}x${image.heightPx} px, ~${rows} rows) Displayed to user; do not repeat rendered content in text.`,
          },
        ],
        details: { path, image },
      };
    } catch (error) {
      if (signal?.aborted) {
        throw new Error("Typst compilation aborted");
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, { path, error: message });
    }
  },
};
