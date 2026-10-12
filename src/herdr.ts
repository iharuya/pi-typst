import type { ImageProtocol } from "@earendil-works/pi-tui";

const HERDR_WARNING =
  "Herdr can display inline images, but Pi disables them inside Herdr. Set PI_IMAGE_PROTOCOL=kitty to render formulas.";

/**
 * Warns Herdr users whose images are off only because pi-tui turns them off inside Herdr.
 * Herdr renders pane Kitty graphics by default since 0.9.0.
 */
export function herdrImageWarning(
  env: NodeJS.ProcessEnv,
  images: ImageProtocol,
): string | undefined {
  if (images || !rendersPaneGraphics(env)) {
    return undefined;
  }
  return HERDR_WARNING;
}

function rendersPaneGraphics(env: NodeJS.ProcessEnv): boolean {
  if (env.TERM_PROGRAM?.toLowerCase() !== "herdr") {
    return false;
  }
  const version = /^(\d+)\.(\d+)/.exec(env.TERM_PROGRAM_VERSION ?? "");
  const major = Number(version?.[1]);
  const minor = Number(version?.[2]);
  return major > 0 || minor >= 9;
}
