import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { setCapabilities } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import typstExtension from "../src/index.js";
import type { TypstToolDetails } from "../src/render.js";

type Params = { path?: string; text?: string };

const typstAvailable = (() => {
  try {
    execFileSync("typst", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function loadTool(): ToolDefinition<TSchema, TypstToolDetails> {
  let tool: ToolDefinition<TSchema, TypstToolDetails> | undefined;
  const pi = {
    registerTool: (definition: ToolDefinition<TSchema, TypstToolDetails>) => {
      tool = definition;
    },
  } as unknown as ExtensionAPI;
  typstExtension(pi);
  if (!tool) {
    throw new Error("typst tool was not registered");
  }
  return tool;
}

function textOf(result: AgentToolResult<TypstToolDetails>): string {
  return result.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

const tool = loadTool();
let workDir: string;

async function writeFiles(dir: string, files: Record<string, string>) {
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

function run(
  params: Params,
  options: { cwd?: string; signal?: AbortSignal } = {},
): Promise<AgentToolResult<TypstToolDetails>> {
  const ctx = {
    cwd: options.cwd ?? workDir,
    hasUI: false,
  } as unknown as ExtensionToolContext;
  return tool.execute("call", params, options.signal, undefined, ctx);
}

beforeEach(async () => {
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
  workDir = await mkdtemp(join(tmpdir(), "pi-typst-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("typst tool", () => {
  it.each<Params>([{}, { path: "a.typ", text: "a" }])(
    "requires exactly one of path or text: %o",
    async (params) => {
      const result = await run(params);
      expect(result.isError).toBe(true);
    },
  );

  it("fails when the terminal cannot display images", async () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const result = await run({ text: "$x$" });
    expect(result.isError).toBe(true);
  });
});

describe.skipIf(!typstAvailable)("typst tool with the typst CLI", () => {
  it("renders text into an image that stays out of the LLM context", async () => {
    const result = await run({ text: "Euler: $e^(i pi) + 1 = 0$" });

    expect(result.isError).toBeFalsy();
    expect(result.details.image?.widthPx).toBeGreaterThan(0);
    expect(result.details.image?.heightPx).toBeGreaterThan(0);
    expect(result.content.every((part) => part.type === "text")).toBe(true);
    expect(textOf(result)).not.toContain(result.details.image?.data);
  });

  it("reports text errors at the line numbers the agent wrote", async () => {
    const result = await run({ text: "fine\n#undefined-function()" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("<stdin>:2:");
  });

  it("keeps line numbers of files included from text", async () => {
    await writeFiles(workDir, {
      "part.typ": "one\ntwo\nthree\nfour\n#undefined-function()",
    });
    const result = await run({ text: '#include "part.typ"' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("part.typ:5:");
    expect(textOf(result)).toMatch(/^\s*5 │/m);
  });

  it("resolves paths inside a file relative to that file", async () => {
    await writeFiles(workDir, {
      "sub/doc.typ": '#include "part.typ"',
      "sub/part.typ": "$a^2 + b^2 = c^2$",
    });
    const result = await run({ path: "sub/doc.typ" });

    expect(textOf(result)).not.toMatch(/error/i);
    expect(result.isError).toBeFalsy();
  });

  it("renders files outside the working directory", async () => {
    const otherDir = await mkdtemp(join(tmpdir(), "pi-typst-other-"));
    try {
      await writeFiles(otherDir, {
        "doc.typ": '#include "part.typ"',
        "part.typ": "$x$",
      });
      const result = await run({ path: join(otherDir, "doc.typ") });

      expect(result.isError).toBeFalsy();
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  });

  it("reports file errors with the file's own path and line", async () => {
    await writeFiles(workDir, {
      "sub/doc.typ": "fine\n#undefined-function()",
    });
    const result = await run({ path: "sub/doc.typ" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("sub/doc.typ:2:");
  });

  it("reports a missing file", async () => {
    const result = await run({ path: "missing.typ" });

    expect(result.isError).toBe(true);
  });

  it("asks for a single page when the content breaks pages", async () => {
    const result = await run({ text: "a\n#pagebreak()\nb" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("#pagebreak()");
  });

  it("throws when aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      run({ text: "$x$" }, { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
