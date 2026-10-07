import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CompileOptions = {
  source: string;
  cwd: string;
  root: string;
  signal?: AbortSignal | undefined;
};

export type CompileResult =
  | { ok: true; png: Buffer }
  | { ok: false; exitCode: number | null; stderr: string };

let isInstalledCache = false;

export async function isTypstInstalled(): Promise<boolean> {
  if (isInstalledCache) {
    return true;
  }

  return new Promise((resolve) => {
    const child = spawn("typst", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      isInstalledCache = code === 0;
      resolve(isInstalledCache);
    });
  });
}

/** Compiles Typst source from stdin into a single PNG. */
export async function compileToPng(
  options: CompileOptions,
): Promise<CompileResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "pi-typst-"));

  try {
    const outputPath = join(tmpDir, "output.png");
    const child = spawn(
      "typst",
      ["compile", "-", outputPath, "--format", "png", "--root", options.root],
      {
        signal: options.signal,
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    // A failed spawn or early exit surfaces through "error"/"close"; ignore EPIPE here.
    child.stdin.on("error", () => {});
    child.stdin.end(options.source);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });

    if (exitCode !== 0) {
      return { ok: false, exitCode, stderr };
    }
    return { ok: true, png: await readFile(outputPath) };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
