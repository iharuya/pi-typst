import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  includeDirective,
  isWithin,
  parseInput,
  prepareDocument,
} from "../src/input.js";
import { PREAMBLE_LINE_COUNT, withPreamble } from "../src/preamble.js";

describe("parseInput", () => {
  it("accepts path only", () => {
    expect(parseInput({ path: "a.typ" })).toEqual({
      kind: "path",
      path: "a.typ",
    });
  });

  it("accepts text only", () => {
    expect(parseInput({ text: "$x$" })).toEqual({ kind: "text", text: "$x$" });
  });

  it.each([
    ["neither", {}],
    ["both", { path: "a.typ", text: "$x$" }],
    ["empty strings", { path: "", text: "" }],
  ])("rejects %s", (_, params) => {
    expect(parseInput(params)).toBeNull();
  });

  it("treats an empty counterpart as absent", () => {
    expect(parseInput({ path: "a.typ", text: "" })?.kind).toBe("path");
    expect(parseInput({ path: "", text: "$x$" })?.kind).toBe("text");
  });
});

describe("isWithin", () => {
  it.each([
    ["/a", "/a/b.typ", true],
    ["/a", "/a/b/c.typ", true],
    ["/a", "/a/..b.typ", true],
    ["/a", "/a", false],
    ["/a", "/b.typ", false],
    ["/a", "/ab/c.typ", false],
    ["/a/b", "/a/c.typ", false],
  ])("isWithin(%s, %s) is %s", (dir, file, expected) => {
    expect(isWithin(dir, file)).toBe(expected);
  });
});

describe("includeDirective", () => {
  it("uses a root-relative path", () => {
    expect(includeDirective("/proj", "/proj/sub/a.typ")).toBe(
      '#include "/sub/a.typ"',
    );
  });

  it("escapes quotes and backslashes", () => {
    expect(includeDirective("/proj", '/proj/a"b\\c.typ')).toBe(
      '#include "/a\\"b\\\\c.typ"',
    );
  });
});

describe("prepareDocument", () => {
  let base: string;
  let cwd: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "pi-typst-test-"));
    cwd = join(base, "proj");
    await mkdir(join(cwd, "sub"), { recursive: true });
    await mkdir(join(base, "outside"));
    await writeFile(join(cwd, "sub", "doc.typ"), "= Hello");
    await writeFile(join(base, "outside", "doc.typ"), "= Hello");
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("pipes inline text after the preamble, rooted at the cwd", async () => {
    const document = await prepareDocument({ kind: "text", text: "$x$" }, cwd);
    expect(document).toEqual({ source: withPreamble("$x$"), root: cwd });
  });

  it("includes files inside the cwd relative to the cwd", async () => {
    const document = await prepareDocument(
      { kind: "path", path: "sub/doc.typ" },
      cwd,
    );
    expect(document.root).toBe(cwd);
    expect(document.source.split("\n")[PREAMBLE_LINE_COUNT]).toBe(
      '#include "/sub/doc.typ"',
    );
  });

  it("accepts absolute paths", async () => {
    const document = await prepareDocument(
      { kind: "path", path: join(cwd, "sub", "doc.typ") },
      cwd,
    );
    expect(document.root).toBe(cwd);
  });

  it("roots files outside the cwd at their own directory", async () => {
    const document = await prepareDocument(
      { kind: "path", path: "../outside/doc.typ" },
      cwd,
    );
    expect(document.root).toBe(join(base, "outside"));
    expect(document.source).toContain('#include "/doc.typ"');
  });

  it("rejects when the file does not exist", async () => {
    await expect(
      prepareDocument({ kind: "path", path: "missing.typ" }, cwd),
    ).rejects.toThrow(/ENOENT/);
  });
});
