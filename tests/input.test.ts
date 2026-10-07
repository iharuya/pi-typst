import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSource, parseInput } from "../src/input.js";

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

describe("loadSource", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "pi-typst-test-"));
    await writeFile(join(dir, "doc.typ"), "= Hello");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("uses inline text with the cwd as working directory", async () => {
    expect(await loadSource({ kind: "text", text: "$x$" }, dir)).toEqual({
      content: "$x$",
      workingDir: dir,
    });
  });

  it("resolves relative paths against the cwd", async () => {
    expect(await loadSource({ kind: "path", path: "doc.typ" }, dir)).toEqual({
      content: "= Hello",
      workingDir: dir,
    });
  });

  it("accepts absolute paths regardless of the cwd", async () => {
    const source = await loadSource(
      { kind: "path", path: join(dir, "doc.typ") },
      "/",
    );
    expect(source.workingDir).toBe(dir);
  });

  it("rejects when the file does not exist", async () => {
    await expect(
      loadSource({ kind: "path", path: "missing.typ" }, dir),
    ).rejects.toThrow(/ENOENT/);
  });
});
