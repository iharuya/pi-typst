import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import {
  allocateImageId,
  type Component,
  getCapabilities,
  getCellDimensions,
  Image,
  Text,
} from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

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

type RenderedImage = {
  data: string;
  widthPx: number;
  heightPx: number;
};

type TypstToolDetails = {
  path?: string | undefined;
  image?: RenderedImage | undefined;
  error?: string | undefined;
};

class TypstResultComponent implements Component {
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

    const { widthPx: cellW, heightPx: cellH } = getCellDimensions();
    const safeCellW = cellW > 0 ? cellW : 9;
    const safeCellH = cellH > 0 ? cellH : 18;
    const availableWidth = Math.max(1, width);

    const idealColumns = Math.ceil(this.image.widthPx / safeCellW);
    const idealRows = Math.ceil(this.image.heightPx / safeCellH);

    const columns = Math.min(availableWidth, Math.max(1, idealColumns));
    const scale = columns / Math.max(1, idealColumns);
    const rows = Math.max(1, Math.ceil(idealRows * scale));

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

const DEFAULT_PREAMBLE_LINES = [
  "#set page(width: 170mm, height: auto, margin: (x: 0pt, y: 0.5em), fill: none)",
  '#set text(fill: rgb("#d4d4d4"), size: 12pt)',
  "#set par(leading: 0.85em)",
];

const DEFAULT_PREAMBLE = `${DEFAULT_PREAMBLE_LINES.join("\n")}\n`;
const PREAMBLE_LINE_COUNT = DEFAULT_PREAMBLE_LINES.length;

function parsePngDimensions(
  buffer: Buffer,
): { widthPx: number; heightPx: number } | null {
  if (buffer.length < 24) {
    return null;
  }
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  if (!isPng) {
    return null;
  }
  return {
    widthPx: buffer.readUInt32BE(16),
    heightPx: buffer.readUInt32BE(20),
  };
}

function adjustStderr(
  stderr: string,
  prefixLineCount: number,
  filename?: string,
): string {
  const targetName = filename ?? "<stdin>";
  return stderr
    .replace(/<stdin>:(\d+):(\d+)/g, (_, line, col) => {
      const newLine = Math.max(1, Number.parseInt(line, 10) - prefixLineCount);
      return `${targetName}:${newLine}:${col}`;
    })
    .replace(/(^\s*)(\d+)(\s*│)/gm, (_, pad, line, bar) => {
      const newLine = Math.max(1, Number.parseInt(line, 10) - prefixLineCount);
      return `${pad}${newLine}${bar}`;
    });
}

let isTypstInstalledCache: boolean | null = null;

async function checkTypstInstalled(): Promise<boolean> {
  if (isTypstInstalledCache) {
    return true;
  }

  return new Promise((resolve) => {
    const child = spawn("typst", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      const installed = code === 0;
      if (installed) {
        isTypstInstalledCache = true;
      }
      resolve(installed);
    });
  });
}

export default function typstExtension(pi: ExtensionAPI): void {
  pi.registerTool<typeof TypstParams, TypstToolDetails>({
    name: "typst",
    label: "Typst",
    promptSnippet:
      "Render math, equations, and scientific explanations to terminal images with Typst",
    description:
      "Render math, equations, and scientific explanations as terminal images with Typst. ALWAYS use this tool instead of Markdown math to present formulas to the user (bash cannot show terminal images). Styling and layout are pre-configured: write only raw content (text, math)—never include '#set page', '#set text', or '#pagebreak()'.",
    parameters: TypstParams,

    renderCall(args: TypstParamsType, theme) {
      let text = theme.fg("toolTitle", theme.bold("typst "));
      if (args.path) {
        text += theme.fg("accent", args.path);
      } else if (args.text) {
        const firstLine = args.text.trim().split("\n")[0] ?? "";
        const preview =
          firstLine.length > 50 ? `${firstLine.slice(0, 47)}...` : firstLine;
        text += theme.fg("dim", preview);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      if (result.isError) {
        const msg =
          result.content[0]?.type === "text"
            ? result.content[0].text
            : "Compilation failed";
        return new Text(theme.fg("error", msg), 0, 0);
      }

      const image = result.details?.image;
      if (!image) {
        return new Text(theme.fg("success", "✓ Rendered"), 0, 0);
      }

      return new TypstResultComponent(image, "Rendered", theme);
    },

    async execute(
      _toolCallId,
      params: TypstParamsType,
      signal,
      _onUpdate,
      ctx,
    ): Promise<AgentToolResult<TypstToolDetails>> {
      const { path: inputPath, text: inputText } = params;

      if (!getCapabilities().images) {
        if (ctx?.hasUI) {
          ctx.ui.notify(
            "Failed to display formula: Terminal does not support image display.",
            "error",
          );
        }
        return {
          content: [
            {
              type: "text",
              text: "Terminal does not support image display.",
            },
          ],
          details: {
            path: inputPath,
            error:
              "Terminal does not support image display.",
          },
          isError: true,
        };
      }

      if (!(await checkTypstInstalled())) {
        if (ctx?.hasUI) {
          ctx.ui.notify(
            "Typst CLI is not installed. Please install Typst to render formulas.",
            "error",
          );
        }
        return {
          content: [
            {
              type: "text",
              text: "typst command not found.",
            },
          ],
          details: {
            path: inputPath,
            error:
              "typst command not found. Ensure Typst CLI is installed and available in PATH.",
          },
          isError: true,
        };
      }

      if ((!inputPath && !inputText) || (inputPath && inputText)) {
        return {
          content: [
            {
              type: "text",
              text: "Exactly one of 'path' or 'text' must be provided.",
            },
          ],
          details: {
            error: "Exactly one of 'path' or 'text' must be provided.",
          },
          isError: true,
        };
      }

      const tmpDir = await mkdtemp(join(tmpdir(), "pi-typst-"));

      try {
        const outputPath = join(tmpDir, "output.png");
        const resolvedPath = inputPath
          ? isAbsolute(inputPath)
            ? inputPath
            : resolve(ctx?.cwd ?? process.cwd(), inputPath)
          : undefined;

        const rawContent = resolvedPath
          ? await readFile(resolvedPath, "utf-8")
          : (inputText ?? "");

        const workingDir = resolvedPath
          ? dirname(resolvedPath)
          : (ctx?.cwd ?? process.cwd());
        const rootDir = ctx?.cwd ?? process.cwd();

        const child = spawn(
          "typst",
          ["compile", "-", outputPath, "--format", "png", "--root", rootDir],
          {
            signal,
            cwd: workingDir,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        let stderr = "";
        child.stderr?.on("data", (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });

        if (child.stdin) {
          child.stdin.write(`${DEFAULT_PREAMBLE}${rawContent}`);
          child.stdin.end();
        }

        const exitCode = await new Promise<number | null>((res, rej) => {
          child.on("close", res);
          child.on("error", rej);
        });

        if (exitCode !== 0) {
          let errorText = stderr.trim();
          if (
            errorText.includes(
              "cannot export multiple images without a page number template",
            )
          ) {
            errorText =
              "Multi-page documents are not supported. Please use '#set page(height: auto)' and avoid '#pagebreak()' to render as a single continuous scrollable canvas.";
          } else {
            errorText = adjustStderr(
              errorText,
              PREAMBLE_LINE_COUNT,
              inputPath ?? undefined,
            );
          }
          return {
            content: [
              {
                type: "text",
                text: errorText || `typst exited with code ${exitCode}`,
              },
            ],
            details: {
              path: inputPath,
              error: errorText,
            },
            isError: true,
          };
        }

        const buffer = await readFile(outputPath);
        const dimensions = parsePngDimensions(buffer);
        const image: RenderedImage = {
          data: buffer.toString("base64"),
          widthPx: dimensions?.widthPx ?? 800,
          heightPx: dimensions?.heightPx ?? 600,
        };

        const { heightPx: cellH } = getCellDimensions();
        const safeCellH = cellH > 0 ? cellH : 18;
        const approxRows = Math.max(1, Math.round(image.heightPx / safeCellH));

        return {
          content: [
            {
              type: "text",
              text: `Rendered (${image.widthPx}x${image.heightPx} px, ~${approxRows} rows) Displayed to user; do not repeat rendered content in text.`,
            },
          ],
          details: {
            path: inputPath,
            image,
          },
        };
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("Typst compilation aborted");
        }

        const message = error instanceof Error ? error.message : String(error);

        return {
          content: [{ type: "text", text: message }],
          details: {
            path: inputPath,
            error: message,
          },
          isError: true,
        };
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    },
  });
}
