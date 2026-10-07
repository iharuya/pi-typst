import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { setCapabilities, setCellDimensions } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MULTI_PAGE_MESSAGE } from "../src/diagnostics.js";
import type { TypstParamsType } from "../src/input.js";
import { PREAMBLE_LINE_COUNT } from "../src/preamble.js";
import { typstTool } from "../src/tool.js";
import { compileToPng, isTypstInstalled } from "../src/typst-cli.js";
import { makePngHeader } from "./helpers.js";

vi.mock("../src/typst-cli.js", () => ({
  compileToPng: vi.fn(),
  isTypstInstalled: vi.fn(),
}));

const compile = vi.mocked(compileToPng);
const installed = vi.mocked(isTypstInstalled);
const notify = vi.fn();
const ctx = {
  cwd: "/work",
  hasUI: true,
  ui: { notify },
} as unknown as ExtensionToolContext;

const run = (params: TypstParamsType, signal?: AbortSignal) =>
  typstTool.execute("call-1", params, signal, undefined, ctx);

const textOf = (r: Awaited<ReturnType<typeof run>>) =>
  r.content[0]?.type === "text" ? r.content[0].text : undefined;

beforeEach(() => {
  vi.clearAllMocks();
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
  setCellDimensions({ widthPx: 10, heightPx: 20 });
  installed.mockResolvedValue(true);
  compile.mockResolvedValue({ ok: true, png: makePngHeader(300, 95) });
});

describe("typst tool", () => {
  it("is registered under the expected name", () => {
    expect(typstTool.name).toBe("typst");
  });

  it.each<[string, TypstParamsType]>([
    ["neither", {}],
    ["both", { path: "a.typ", text: "$x$" }],
  ])("rejects %s input before doing any work", async (_, params) => {
    const result = await run(params);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Exactly one of 'path' or 'text'/);
    expect(installed).not.toHaveBeenCalled();
    expect(compile).not.toHaveBeenCalled();
  });

  it("fails and notifies when the terminal cannot show images", async () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const result = await run({ path: "a.typ" });
    expect(result.isError).toBe(true);
    expect(result.details).toEqual({
      path: "a.typ",
      error: "Terminal does not support image display.",
    });
    expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
    expect(compile).not.toHaveBeenCalled();
  });

  it("fails and notifies when typst is not installed", async () => {
    installed.mockResolvedValue(false);
    const result = await run({ text: "$x$" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("typst command not found.");
    expect(result.details?.error).toMatch(/PATH/);
    expect(notify).toHaveBeenCalledWith(expect.any(String), "error");
  });

  it("does not notify without a UI", async () => {
    installed.mockResolvedValue(false);
    await typstTool.execute("call-1", { text: "$x$" }, undefined, undefined, {
      ...ctx,
      hasUI: false,
    } as ExtensionToolContext);
    expect(notify).not.toHaveBeenCalled();
  });

  it("compiles inline text with the preamble from the cwd", async () => {
    const signal = new AbortController().signal;
    await run({ text: "$x^2$" }, signal);
    expect(compile).toHaveBeenCalledOnce();
    const options = compile.mock.calls[0]?.[0];
    expect(options?.source.split("\n")[PREAMBLE_LINE_COUNT]).toBe("$x^2$");
    expect(options).toMatchObject({ cwd: "/work", root: "/work", signal });
  });

  it("returns the image and a summary for the model", async () => {
    const result = await run({ text: "$x$" });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      "Rendered (300x95 px, ~5 rows) Displayed to user; do not repeat rendered content in text.",
    );
    expect(result.details?.image).toEqual({
      data: makePngHeader(300, 95).toString("base64"),
      widthPx: 300,
      heightPx: 95,
    });
  });

  it("falls back to a default size for unreadable PNG output", async () => {
    compile.mockResolvedValue({ ok: true, png: Buffer.from("not a png") });
    const result = await run({ text: "$x$" });
    expect(result.details?.image).toMatchObject({
      widthPx: 800,
      heightPx: 600,
    });
  });

  it("maps compiler errors back to the user's file and lines", async () => {
    compile.mockResolvedValue({
      ok: false,
      exitCode: 1,
      stderr: `error: oops\n  ┌─ <stdin>:${PREAMBLE_LINE_COUNT + 2}:3\n`,
    });
    const result = await run({ text: "a\nb" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("error: oops\n  ┌─ <stdin>:2:3");
    expect(result.details?.error).toBe(textOf(result));
  });

  it("explains multi-page failures", async () => {
    compile.mockResolvedValue({
      ok: false,
      exitCode: 1,
      stderr:
        "error: cannot export multiple images without a page number template",
    });
    expect(textOf(await run({ text: "a" }))).toBe(MULTI_PAGE_MESSAGE);
  });

  it("reports a missing file as an error result", async () => {
    const result = await run({ path: "/definitely/missing.typ" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ENOENT/);
    expect(result.details?.path).toBe("/definitely/missing.typ");
    expect(compile).not.toHaveBeenCalled();
  });

  it("throws when aborted", async () => {
    const controller = new AbortController();
    compile.mockImplementation(async () => {
      controller.abort();
      throw new Error("The operation was aborted");
    });
    await expect(run({ text: "$x$" }, controller.signal)).rejects.toThrow(
      "Typst compilation aborted",
    );
  });

  it("reports unexpected failures as error results", async () => {
    compile.mockRejectedValue(new Error("spawn EACCES"));
    const result = await run({ text: "$x$" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("spawn EACCES");
  });
});
