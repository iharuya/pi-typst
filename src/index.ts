import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

const TypstParams = Type.Object({
  path: Type.Optional(
    Type.String({
      description: "Path to a .typ file to compile and render",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description: "Typst markup text to compile and render directly",
    }),
  ),
});

type TypstParamsType = Static<typeof TypstParams>;

type TypstToolDetails = {
  path?: string | undefined;
  pageCount?: number | undefined;
  error?: string | undefined;
};

const TEXT_DEFAULT_PREAMBLE = [
  "#set page(width: auto, height: auto, margin: 0.5em, fill: none)",
  '#set text(fill: rgb("#d4d4d4"))',
  "",
].join("\n");

const PREAMBLE_LINE_COUNT = 2;

function adjustStderr(stderr: string, prefixLineCount: number): string {
  return stderr
    .replace(/<stdin>:(\d+):(\d+)/g, (_, line, col) => {
      const newLine = Math.max(1, Number.parseInt(line, 10) - prefixLineCount);
      return `<stdin>:${newLine}:${col}`;
    })
    .replace(/(^\s*)(\d+)(\s*│)/gm, (_, pad, line, bar) => {
      const newLine = Math.max(1, Number.parseInt(line, 10) - prefixLineCount);
      return `${pad}${newLine}${bar}`;
    });
}

export default function typstExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "typst",
    label: "Typst",
    description:
      "Render Typst markup or a .typ file to images in the terminal. Provide either 'path' (for complex documents or diagrams) or 'text' (for inline math or quick snippets).",
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
      const imageCount = result.content.filter(
        (c) => c.type === "image",
      ).length;
      const label =
        imageCount === 1 ? "1 page rendered" : `${imageCount} pages rendered`;
      return new Text(theme.fg("success", `✓ ${label}`), 0, 0);
    },

    async execute(
      _toolCallId,
      params: TypstParamsType,
      signal,
      _onUpdate,
      ctx,
    ): Promise<AgentToolResult<TypstToolDetails>> {
      const { path: inputPath, text: inputText } = params;

      if ((!inputPath && !inputText) || (inputPath && inputText)) {
        return {
          content: [
            {
              type: "text",
              text: "Error: exactly one of 'path' or 'text' must be provided.",
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
        const outputPattern = join(tmpDir, "page-{p}.png");
        const inputTarget = inputPath
          ? isAbsolute(inputPath)
            ? inputPath
            : resolve(ctx?.cwd ?? process.cwd(), inputPath)
          : "-";

        const child = spawn(
          "typst",
          ["compile", inputTarget, outputPattern, "--format", "png"],
          {
            signal,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        let stderr = "";
        child.stderr?.on("data", (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });

        if (inputText && child.stdin) {
          child.stdin.write(`${TEXT_DEFAULT_PREAMBLE}${inputText}`);
          child.stdin.end();
        }

        const exitCode = await new Promise<number | null>((res, rej) => {
          child.on("close", res);
          child.on("error", rej);
        });

        if (exitCode !== 0) {
          const formattedError = inputText
            ? adjustStderr(stderr, PREAMBLE_LINE_COUNT)
            : stderr;
          return {
            content: [
              {
                type: "text",
                text:
                  formattedError.trim() || `typst exited with code ${exitCode}`,
              },
            ],
            details: {
              path: inputPath,
              error: formattedError.trim(),
            },
            isError: true,
          };
        }

        const entries = await readdir(tmpDir);
        const pngFiles = entries
          .filter((name) => name.endsWith(".png"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const content: (TextContent | ImageContent)[] = [];

        for (const file of pngFiles) {
          const buffer = await readFile(join(tmpDir, file));
          content.push({
            type: "image",
            data: buffer.toString("base64"),
            mimeType: "image/png",
          });
        }

        if (content.length === 0) {
          content.push({
            type: "text",
            text: "Document rendered without visual pages.",
          });
        }

        return {
          content,
          details: {
            path: inputPath,
            pageCount: pngFiles.length,
          },
        };
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("Typst compilation aborted");
        }

        const message =
          error instanceof Error && "code" in error && error.code === "ENOENT"
            ? "typst command not found. Ensure Typst CLI is installed and available in PATH."
            : error instanceof Error
              ? error.message
              : String(error);

        return {
          content: [{ type: "text", text: `Error: ${message}` }],
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
