import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  colorToHex,
  getCapabilities,
  getPngDimensions,
} from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { compileTypst, isTypstInstalled, type TypstSource } from "./compile.js";
import { terminalLayout } from "./layout.js";
import {
  naturalCellSize,
  renderTypstCall,
  renderTypstResult,
  type TypstToolDetails,
} from "./render.js";

const TypstParams = Type.Object({
  path: Type.Optional(
    Type.String({
      description: "Path to a .typ file to render",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description: "Typst markup text to render directly",
    }),
  ),
});

type TypstParamsType = Static<typeof TypstParams>;

export default function typstExtension(pi: ExtensionAPI): void {
  pi.registerTool<typeof TypstParams, TypstToolDetails>({
    name: "typst",
    label: "Typst",
    promptSnippet:
      "Render math, equations, and scientific explanations to terminal images with Typst",
    description:
      "Render math, equations, and scientific explanations as terminal images with Typst. ALWAYS use this tool instead of Markdown math to present formulas to the user (bash cannot show terminal images). Styling and layout are pre-configured: write only raw content (text, math)—never include '#set page', '#set text', or '#pagebreak()'.",
    parameters: TypstParams,

    renderCall: (args, theme) => renderTypstCall(args, theme),
    renderResult: (result, _options, theme) => renderTypstResult(result, theme),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const source = toSource(params);
      if (!source) {
        return errorResult("Exactly one of 'path' or 'text' must be provided.");
      }

      if (!getCapabilities().images) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "Failed to display formula: Terminal does not support image display.",
            "error",
          );
        }
        return errorResult("Terminal does not support image display.");
      }

      if (!(await isTypstInstalled())) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            "Typst CLI is not installed. Please install Typst to render formulas.",
            "error",
          );
        }
        return errorResult(
          "typst command not found. Ensure Typst CLI is installed and available in PATH.",
        );
      }

      try {
        const layout = terminalLayout({
          terminalColumns: process.stdout.columns,
          textColor: ctx.hasUI
            ? colorToHex(ctx.ui.theme.colors.toolOutput)
            : undefined,
        });
        const compiled = await compileTypst(source, {
          cwd: ctx.cwd,
          layout,
          signal,
        });
        if (!compiled.ok) {
          return errorResult(compiled.error);
        }

        const data = compiled.png.toString("base64");
        const size = getPngDimensions(data);
        if (!size) {
          return errorResult("typst produced an unreadable PNG.");
        }

        const image = { data, ...size };
        const { rows } = naturalCellSize(image);
        return {
          content: [
            {
              type: "text",
              text: `Rendered (${image.widthPx}x${image.heightPx} px, ~${rows} rows) Displayed to user; do not repeat rendered content in text.`,
            },
          ],
          details: { image },
        };
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("Typst compilation aborted");
        }
        return errorResult(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}

function toSource({ path, text }: TypstParamsType): TypstSource | undefined {
  if (path && !text) {
    return { path };
  }
  if (text && !path) {
    return { text };
  }
  return undefined;
}

function errorResult(message: string): AgentToolResult<TypstToolDetails> {
  return {
    content: [{ type: "text", text: message }],
    details: {},
    isError: true,
  };
}
