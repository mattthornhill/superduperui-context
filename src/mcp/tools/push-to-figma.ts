import { z } from "zod";
import type { Kit } from "../../kit/types.js";
import { PREVIEW_PORT } from "../../kit/types.js";

export const name = "push-to-figma";

export const description =
  "Bridges to Figma MCP to push rendered component code as editable Figma frames. " +
  "The component is rendered live at the preview URL (localhost:4321) which Figma MCP " +
  "can capture via generate_figma_design. Requires the Figma MCP server to be connected.";

export const inputSchema = {
  code: z.string().describe("The component code to push to Figma as an editable frame"),
  name: z
    .string()
    .optional()
    .describe("Optional frame name in Figma (defaults to 'SuperDuper Component')"),
  viewports: z
    .array(z.enum(["desktop", "tablet", "mobile"]))
    .optional()
    .describe("Viewports to capture (default: ['desktop']). Each gets a separate Figma frame."),
};

export function handler(kit: Kit | null) {
  return async ({ code, name: frameName, viewports }: { code: string; name?: string; viewports?: string[] }) => {
    const resolvedName = frameName ?? "SuperDuper Component";
    const resolvedViewports = viewports ?? ["desktop"];
    const captureUrl = `http://localhost:${PREVIEW_PORT}/capture`;
    const previewUrl = `http://localhost:${PREVIEW_PORT}`;

    // Build token context for Figma rendering
    let tokenContext = "";
    if (kit?.tokensCss) {
      const tokenLines = kit.tokensCss
        .split("\n")
        .filter(
          (line) =>
            line.includes("--") &&
            (line.includes("color") ||
              line.includes("colour") ||
              line.includes("bg") ||
              line.includes("text") ||
              line.includes("border") ||
              line.includes("radius") ||
              line.includes("spacing") ||
              line.includes("font"))
        )
        .slice(0, 30);

      if (tokenLines.length > 0) {
        tokenContext = `\n\nDesign Tokens:\n${tokenLines.join("\n")}`;
      }
    }

    const viewportUrls = resolvedViewports.map((vp) => {
      const vpParam = vp === "desktop" ? "" : `?viewport=${vp}`;
      return `- **${vp}:** ${captureUrl}${vpParam}`;
    });

    const response = [
      "# Push to Figma",
      "",
      "The component is rendered live at the preview canvas.",
      "",
      "## Auto-Layout",
      "",
      "The Figma capture script automatically converts CSS flexbox/grid to Figma auto-layout frames.",
      "",
      "## Capture URLs",
      "",
      "Each viewport renders the component at the appropriate width:",
      ...viewportUrls,
      "",
      "## Next Steps",
      "",
      "For each viewport above, get a separate `captureId` from `generate_figma_design` and capture:",
      "",
      `1. Call \`generate_figma_design\` with \`outputMode: "existingFile"\` → get captureId`,
      `2. Open the capture URL with hash: \`<url>#figmacapture=<captureId>&figmaendpoint=...&figmadelay=5000\``,
      "3. Poll `generate_figma_design` with `captureId` until completed",
      "",
      `The interactive preview with toolbar is at ${previewUrl}`,
      "",
      "## Setup (if Figma MCP is not connected)",
      "",
      "```bash",
      "claude mcp add --transport http figma https://mcp.figma.com/mcp",
      "```",
      "",
      "Authentication is via OAuth — no API key needed.",
      "",
      "## Component Code",
      "",
      "```tsx",
      code,
      "```",
      tokenContext,
      "",
      `**Frame name:** ${resolvedName}`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: response }],
    };
  };
}
