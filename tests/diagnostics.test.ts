import { describe, expect, it } from "vitest";
import {
  formatCompileError,
  MULTI_PAGE_MESSAGE,
  remapDiagnostics,
  stripWrapperTrace,
} from "../src/diagnostics.js";
import { PREAMBLE_LINE_COUNT } from "../src/preamble.js";

const stderrAt = (line: number) =>
  [
    "error: unknown variable: foo",
    `  ┌─ <stdin>:${line}:1`,
    "  │",
    `${line} │ #foo`,
    "  │  ^^^",
  ].join("\n");

describe("remapDiagnostics", () => {
  it("shifts stdin locations and gutter line numbers", () => {
    expect(remapDiagnostics(stderrAt(5), 3)).toBe(
      [
        "error: unknown variable: foo",
        "  ┌─ <stdin>:2:1",
        "  │",
        "2 │ #foo",
        "  │  ^^^",
      ].join("\n"),
    );
  });

  it("keeps the gutter aligned when the line number gets shorter", () => {
    const out = remapDiagnostics(" 12 │ x\n    │ ^", 3);
    expect(out).toBe("  9 │ x\n    │ ^");
  });

  it("never reports lines before the user's first line", () => {
    expect(remapDiagnostics("<stdin>:2:7", 3)).toBe("<stdin>:1:7");
  });

  it("remaps every location in multi-diagnostic output", () => {
    const out = remapDiagnostics("<stdin>:10:1\n<stdin>:20:2", 3);
    expect(out).toBe("<stdin>:7:1\n<stdin>:17:2");
  });

  it("leaves unrelated numbers untouched", () => {
    const text = "error: expected 2 arguments, found 3";
    expect(remapDiagnostics(text, 3)).toBe(text);
  });
});

describe("formatCompileError", () => {
  it("remaps by the preamble length and trims whitespace", () => {
    const line = PREAMBLE_LINE_COUNT + 1;
    const out = formatCompileError(`\n${stderrAt(line)}\n\n`, 1, "text");
    expect(out).toContain("<stdin>:1:1");
    expect(out.startsWith("error:")).toBe(true);
    expect(out.endsWith("^^^")).toBe(true);
  });

  it("explains the multi-page limitation instead of the raw error", () => {
    const stderr =
      "error: cannot export multiple images without a page number template ({p}, {0p}) in the output path";
    expect(formatCompileError(stderr, 1, "text")).toBe(MULTI_PAGE_MESSAGE);
    expect(formatCompileError(stderr, 1, "path")).toBe(MULTI_PAGE_MESSAGE);
  });

  it("keeps file locations and lines as-is for path input", () => {
    const stderr = [
      "error: unknown variable: foo",
      "  ┌─ sub/d.typ:3:1",
      "  │",
      "3 │ #foo",
      "  │  ^^^",
      "",
      "  while including `/sub/d.typ` at <stdin>:4:1",
      '    include "/sub/d.typ"',
    ].join("\n");
    expect(formatCompileError(stderr, 1, "path")).toBe(
      [
        "error: unknown variable: foo",
        "  ┌─ sub/d.typ:3:1",
        "  │",
        "3 │ #foo",
        "  │  ^^^",
      ].join("\n"),
    );
  });

  it("falls back to the exit code when stderr is empty", () => {
    expect(formatCompileError("  \n", 2, "text")).toBe(
      "typst exited with code 2",
    );
    expect(formatCompileError("", null, "path")).toBe(
      "typst exited with code null",
    );
  });
});

describe("stripWrapperTrace", () => {
  it("removes the include trace pointing at stdin", () => {
    const stderr =
      'error: x\n\n  while including `/a.typ` at <stdin>:4:1\n    include "/a.typ"\nwarning: y';
    expect(stripWrapperTrace(stderr)).toBe("error: x\n\nwarning: y");
  });

  it("keeps include traces between user files", () => {
    const stderr =
      'error: x\n\n  while including `b.typ` at sub/a.typ:1:1\n    include "b.typ"';
    expect(stripWrapperTrace(stderr)).toBe(stderr);
  });
});
