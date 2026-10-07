import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { type Static, Type } from "typebox";

export const TypstParams = Type.Object({
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

export type TypstParamsType = Static<typeof TypstParams>;

export type TypstInput =
  | { kind: "path"; path: string }
  | { kind: "text"; text: string };

export type LoadedSource = {
  content: string;
  workingDir: string;
};

export const INVALID_INPUT_MESSAGE =
  "Exactly one of 'path' or 'text' must be provided.";

/** Returns null unless exactly one non-empty input is given. */
export function parseInput(params: TypstParamsType): TypstInput | null {
  const { path, text } = params;
  if (path && !text) {
    return { kind: "path", path };
  }
  if (text && !path) {
    return { kind: "text", text };
  }
  return null;
}

export async function loadSource(
  input: TypstInput,
  cwd: string,
): Promise<LoadedSource> {
  if (input.kind === "text") {
    return { content: input.text, workingDir: cwd };
  }
  const resolvedPath = resolve(cwd, input.path);
  return {
    content: await readFile(resolvedPath, "utf-8"),
    workingDir: dirname(resolvedPath),
  };
}
