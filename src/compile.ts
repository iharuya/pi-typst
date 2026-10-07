import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { TypstLayout } from "./layout.js";

export type TypstSource = { text: string } | { path: string };

export type CompileResult =
  | { ok: true; png: Buffer }
  | { ok: false; error: string };

const FONT_CANDIDATES = [
  "Libertinus Serif",
  // Without an explicit CJK font, typst may fall back to one whose line
  // metrics let glyphs overflow the line box and overlap the previous line.
  "Hiragino Sans",
  "Hiragino Kaku Gothic ProN",
  "Noto Sans CJK JP",
  "Noto Sans JP",
  "Yu Gothic",
];

function preambleLines(layout: TypstLayout, fonts: string[]): string[] {
  const color = `rgb("${layout.textColor}")`;
  const font =
    fonts.length > 0 ? `font: (${fonts.map(typstString).join(", ")},), ` : "";
  return [
    `#set page(width: ${layout.pageWidthPt}pt, height: auto, margin: (x: 0pt, y: 0.5em), fill: none)`,
    `#set text(${font}fill: ${color}, size: ${layout.textSizePt}pt)`,
    "#set par(leading: 0.85em)",
    `#set line(stroke: ${color})`,
    `#set table(stroke: ${color})`,
  ];
}

const MULTI_PAGE_ERROR =
  "Output must fit on a single page. Remove '#pagebreak()' and any page size settings; the page is pre-configured to grow with the content.";

export async function compileTypst(
  source: TypstSource,
  options: {
    cwd: string;
    layout: TypstLayout;
    signal?: AbortSignal | undefined;
  },
): Promise<CompileResult> {
  const { root, body } =
    "text" in source
      ? { root: options.cwd, body: source.text }
      : await includeFile(resolve(options.cwd, source.path), options.cwd);

  const preamble = preambleLines(options.layout, await installedFonts());
  const { exitCode, stdout, stderr } = await runTypst(
    [
      "compile",
      "-",
      "-",
      "--format",
      "png",
      "--ppi",
      String(options.layout.ppi),
      "--root",
      root,
    ],
    {
      stdin: `${preamble.join("\n")}\n${body}`,
      cwd: root,
      signal: options.signal,
    },
  );

  if (exitCode === 0) {
    return { ok: true, png: stdout };
  }
  if (stderr.includes("cannot export multiple images")) {
    return { ok: false, error: MULTI_PAGE_ERROR };
  }
  const error = shiftStdinLocations(stderr.trim(), preamble.length);
  return { ok: false, error: error || `typst exited with code ${exitCode}` };
}

let typstFound = false;

export async function isTypstInstalled(): Promise<boolean> {
  if (!typstFound) {
    typstFound = await runTypst(["--version"]).then(
      ({ exitCode }) => exitCode === 0,
      () => false,
    );
  }
  return typstFound;
}

let fontsQuery: Promise<string[]> | undefined;

// Listing only installed fonts avoids "unknown font family" warnings, which
// would otherwise show up in compile errors reported to the agent.
function installedFonts(): Promise<string[]> {
  fontsQuery ??= runTypst(["fonts"]).then(
    ({ stdout }) => {
      const installed = new Set(stdout.toString().split(/\r?\n/));
      return FONT_CANDIDATES.filter((font) => installed.has(font));
    },
    () => [],
  );
  return fontsQuery;
}

// Typst resolves relative paths in stdin sources against --root, not the
// original file's directory. Including the file keeps its own relative paths
// and diagnostics intact while still applying the preamble.
async function includeFile(
  file: string,
  cwd: string,
): Promise<{ root: string; body: string }> {
  await access(file);
  const root = isWithin(cwd, file) ? cwd : dirname(file);
  const rootRelative = relative(root, file).split(sep).join("/");
  return { root, body: `#include ${typstString(`/${rootRelative}`)}\n` };
}

function isWithin(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function typstString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function shiftStdinLocations(stderr: string, offset: number): string {
  const shift = (line: string) =>
    String(Math.max(1, Number.parseInt(line, 10) - offset));
  let inStdinSnippet = false;

  return stderr
    .split("\n")
    .map((line) => {
      const snippetHeader = line.match(/┌─ (.+):\d+:\d+\s*$/);
      if (snippetHeader) {
        inStdinSnippet = snippetHeader[1] === "<stdin>";
      }
      const shifted = line.replace(
        /<stdin>:(\d+):(\d+)/g,
        (_, row: string, col: string) => `<stdin>:${shift(row)}:${col}`,
      );
      return inStdinSnippet
        ? shifted.replace(
            /^(\s*)(\d+)(\s*│)/,
            (_, pad: string, row: string, bar: string) =>
              `${pad}${shift(row)}${bar}`,
          )
        : shifted;
    })
    .join("\n");
}

function runTypst(
  args: string[],
  options: {
    stdin?: string;
    cwd?: string;
    signal?: AbortSignal | undefined;
  } = {},
): Promise<{ exitCode: number | null; stdout: Buffer; stderr: string }> {
  return new Promise((onClose, onError) => {
    const child = spawn("typst", args, {
      cwd: options.cwd,
      signal: options.signal,
    });
    const stdout: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    // typst may exit before consuming stdin (EPIPE); its exit code and stderr
    // already describe the failure.
    child.stdin.on("error", () => {});
    child.on("error", onError);
    child.on("close", (exitCode) =>
      onClose({ exitCode, stdout: Buffer.concat(stdout), stderr }),
    );
    child.stdin.end(options.stdin ?? "");
  });
}
