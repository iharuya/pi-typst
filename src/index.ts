import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { typstTool } from "./tool.js";

export default function typstExtension(pi: ExtensionAPI): void {
  pi.registerTool(typstTool);
}
