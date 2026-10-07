import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { setCapabilities } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MULTI_PAGE_MESSAGE } from "../src/diagnostics.js";
import type { TypstParamsType } from "../src/input.js";
import { parsePngDimensions } from "../src/png.js";
import { typstTool } from "../src/tool.js";
import { compileToPng, isTypstInstalled } from "../src/typst-cli.js";
import { hasTypst } from "./helpers.js";

describe.skipIf(!hasTypst)("with the typst CLI", () => {
  let dir: string;
  const run = (params: TypstParamsType, signal?: AbortSignal) =>
    typstTool.execute("call-1", params, signal, undefined, {
      cwd: dir,
      hasUI: false,
    } as ExtensionToolContext);
  const textOf = (r: Awaited<ReturnType<typeof run>>) =>
    r.content[0]?.type === "text" ? r.content[0].text : "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "pi-typst-it-"));
    setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("detects the installation", async () => {
    expect(await isTypstInstalled()).toBe(true);
  });

  it("compiles source to a PNG", async () => {
    const result = await compileToPng({
      source: "$x^2$",
      cwd: dir,
      root: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(parsePngDimensions(result.png)).not.toBeNull();
    }
  });

  it("returns stderr and the exit code on failure", async () => {
    const result = await compileToPng({ source: "#foo", cwd: dir, root: dir });
    expect(result).toMatchObject({ ok: false, exitCode: 1 });
    if (!result.ok) {
      expect(result.stderr).toContain("unknown variable: foo");
    }
  });

  it("renders inline math at the preamble's page width", async () => {
    const result = await run({ text: "$ integral_0^1 x dif x = 1/2 $" });
    expect(result.isError).toBeFalsy();
    // 170mm at typst's default 144 ppi.
    expect(result.details?.image?.widthPx).toBe(964);
    expect(result.details?.image?.heightPx).toBeGreaterThan(0);
  });

  it("renders a file given by relative path", async () => {
    await writeFile(join(dir, "doc.typ"), "= Title\nBody");
    const result = await run({ path: "doc.typ" });
    expect(result.isError).toBeFalsy();
    expect(result.details?.path).toBe("doc.typ");
  });

  it("reports errors at the user's line in inline text", async () => {
    const result = await run({ text: "fine\n#foo" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("<stdin>:2:1");
    expect(textOf(result)).toMatch(/^2 │ #foo$/m);
  });

  it("reports errors with the file name for path input", async () => {
    await writeFile(join(dir, "bad.typ"), "#foo");
    const result = await run({ path: "bad.typ" });
    expect(textOf(result)).toContain("bad.typ:1:1");
  });

  it("resolves a file's relative imports and images from its directory", async () => {
    const sub = join(dir, "nested");
    await mkdir(sub, { recursive: true });
    const pic = await compileToPng({ source: "x", cwd: dir, root: dir });
    if (!pic.ok) throw new Error(pic.stderr);
    await writeFile(join(sub, "pic.png"), pic.png);
    await writeFile(join(sub, "part.typ"), "Included part");
    await writeFile(
      join(sub, "main.typ"),
      '#include "part.typ"\n#image("pic.png", width: 1cm)',
    );
    const result = await run({ path: "nested/main.typ" });
    expect(textOf(result)).toMatch(/^Rendered/);
  });

  it("reports nested file errors at their real path and line", async () => {
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(join(dir, "nested", "broken.typ"), "ok\n\n#foo");
    const text = textOf(await run({ path: "nested/broken.typ" }));
    expect(text).toContain("┌─ nested/broken.typ:3:1");
    expect(text).toMatch(/^3 │ #foo$/m);
    expect(text).not.toContain("<stdin>");
  });

  it("renders files outside the cwd", async () => {
    const outside = await mkdtemp(join(tmpdir(), "pi-typst-outside-"));
    try {
      await writeFile(join(outside, "part.typ"), "Part");
      await writeFile(join(outside, "main.typ"), '#include "part.typ"');
      const result = await run({ path: join(outside, "main.typ") });
      expect(textOf(result)).toMatch(/^Rendered/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("lets a file override the preamble's page setup", async () => {
    await writeFile(join(dir, "narrow.typ"), "#set page(width: 50mm)\nHi");
    const result = await run({ path: "narrow.typ" });
    expect(result.details?.image?.widthPx).toBeLessThan(964);
  });

  it("rejects multi-page documents with guidance", async () => {
    const result = await run({ text: "a\n#pagebreak()\nb" });
    expect(textOf(result)).toBe(MULTI_PAGE_MESSAGE);
  });

  it("throws when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run({ text: "$x$" }, controller.signal)).rejects.toThrow(
      "Typst compilation aborted",
    );
  });
});
