import { access, constants } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { type Static, Type } from "typebox";
import { withPreamble } from "./preamble.js";

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

/** Source piped to `typst compile -`, and the project root it compiles against. */
export type PreparedDocument = {
  source: string;
  root: string;
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

export function isWithin(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}

/** `#include` of `file` as a root-relative Typst path (leading `/`). */
export function includeDirective(root: string, file: string): string {
  const rootPath = `/${relative(root, file).split(sep).join("/")}`;
  const literal = rootPath.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `#include "${literal}"`;
}

/**
 * Inline text is piped as-is. Files are included rather than piped so that
 * their relative imports and images resolve against the file's own directory
 * (stdin input resolves them against the root).
 *
 * The root is the cwd, or the file's directory when the file lies outside it.
 */
export async function prepareDocument(
  input: TypstInput,
  cwd: string,
): Promise<PreparedDocument> {
  if (input.kind === "text") {
    return { source: withPreamble(input.text), root: cwd };
  }
  const file = resolve(cwd, input.path);
  await access(file, constants.R_OK);
  const root = isWithin(cwd, file) ? cwd : dirname(file);
  return { source: withPreamble(includeDirective(root, file)), root };
}
