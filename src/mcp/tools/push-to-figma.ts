import { z } from "zod";
import type { Kit } from "../../kit/types.js";
import { PREVIEW_PORT } from "../../kit/types.js";

export const name = "push-to-figma";

export const description =
  "Push a component to Figma as editable frames. Sends the code to the preview server, " +
  "then returns step-by-step instructions for capturing it via Figma MCP and Playwright MCP. " +
  "Supports multi-viewport capture (desktop, tablet, mobile) with correct responsive rendering. " +
  "Requires both Figma MCP and Playwright MCP servers to be connected.";

export const inputSchema = {
  code: z.string().describe("The component TSX/JSX code to push to Figma as an editable frame"),
  name: z
    .string()
    .optional()
    .describe("Optional frame name in Figma (defaults to 'Layout Component')"),
  viewports: z
    .array(z.enum(["desktop", "tablet", "mobile"]))
    .optional()
    .describe("Viewports to capture (default: ['desktop']). Each gets a separate Figma frame."),
  figmaUrl: z
    .string()
    .optional()
    .describe(
      "Figma file URL to push into (e.g. https://www.figma.com/design/ABC123/...). " +
      "If provided, pushes into this existing file. If omitted, creates a new file."
    ),
};

const VIEWPORT_DIMS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

const DEFAULT_DIMS = VIEWPORT_DIMS.desktop;

export function handler(kit: Kit | null) {
  return async ({
    code,
    name: frameName,
    viewports,
    figmaUrl,
  }: {
    code: string;
    name?: string;
    viewports?: string[];
    figmaUrl?: string;
  }) => {
    const resolvedName = frameName ?? "Layout Component";
    const resolvedViewports = viewports ?? ["desktop"];
    const captureUrl = `http://localhost:${PREVIEW_PORT}/capture`;

    // Parse fileKey from Figma URL if provided
    let resolvedFileKey: string | undefined;
    if (figmaUrl) {
      const match = figmaUrl.match(/\/design\/([^/]+)/);
      if (match) resolvedFileKey = match[1];
    }
    const outputMode = resolvedFileKey ? "existingFile" : "newFile";

    // Step 1: Push code to the preview server so /capture has something to render
    let pushStatus: string;
    try {
      const { WebSocket } = await import("ws");
      const ws = new WebSocket(`ws://localhost:${PREVIEW_PORT}/ws`);

      pushStatus = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Preview server connection timed out"));
        }, 5000);

        ws.on("open", () => {
          ws.send(JSON.stringify({ type: "preview", code, language: "tsx" }));
        });

        ws.on("message", (data: Buffer | string) => {
          try {
            const msg = JSON.parse(String(data));
            if (msg.type === "ack") {
              clearTimeout(timeout);
              ws.close();
              resolve("Component pushed to preview server");
            } else if (msg.type === "error") {
              clearTimeout(timeout);
              ws.close();
              reject(new Error(msg.message ?? "Preview server error"));
            }
          } catch {
            // ignore malformed messages
          }
        });

        ws.on("error", (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Could not push to preview server: ${msg}`,
              "",
              "The preview server needs to be running. It starts automatically with the MCP server.",
              "If it failed to start (e.g. port 4321 in use), stop the other process and restart.",
            ].join("\n"),
          },
        ],
      };
    }

    // Step 2: Build directive capture instructions for Figma MCP + Playwright MCP
    const captureSteps = resolvedViewports
      .map((vp, i) => {
        const dims = VIEWPORT_DIMS[vp as keyof typeof VIEWPORT_DIMS] ?? DEFAULT_DIMS;
        const vpLabel = vp.charAt(0).toUpperCase() + vp.slice(1);
        const frameSuffix = resolvedViewports.length > 1 ? ` — ${vpLabel}` : "";
        const stepBase = i * 6;
        return [
          `### Viewport: ${vpLabel} (${dims.width}×${dims.height})`,
          "",
          `**Step ${stepBase + 1}.** Call \`generate_figma_design\` with:`,
          resolvedFileKey
            ? `  - \`outputMode: "existingFile"\`, \`fileKey: "${resolvedFileKey}"\``
            : `  - \`outputMode: "${outputMode}"\``,
          `  → Save the returned \`captureId\``,
          "",
          `**Step ${stepBase + 2}.** Call \`browser_resize\` with:`,
          `  - \`width: ${dims.width}\`, \`height: ${dims.height}\``,
          "",
          `**Step ${stepBase + 3}.** Call \`browser_navigate\` with:`,
          `  - \`url: "${captureUrl}"\``,
          "",
          `**Step ${stepBase + 4}.** Call \`browser_evaluate\` with this code:`,
          "```javascript",
          "(async () => {",
          "  const script = document.createElement('script');",
          "  script.src = 'https://mcp.figma.com/mcp/html-to-design/capture.js';",
          "  document.head.appendChild(script);",
          "  await new Promise(r => setTimeout(r, 1500));",
          "  location.hash = 'figmacapture=<CAPTURE_ID>&figmaendpoint=https%3A%2F%2Fmcp.figma.com%2Fmcp%2Fcapture%2F<CAPTURE_ID>%2Fsubmit&figmadelay=3000';",
          "})()",
          "```",
          `  Replace \`<CAPTURE_ID>\` with the captureId from step ${stepBase + 1}.`,
          "",
          `**Step ${stepBase + 5}.** Wait 10 seconds.`,
          "",
          `**Step ${stepBase + 6}.** Poll \`generate_figma_design\` with \`captureId\` every 5 seconds until status is \`completed\`.`,
          "",
        ].join("\n");
      })
      .join("\n");

    const response = [
      "# Push to Figma — Execute Immediately",
      "",
      `${pushStatus}. The component is rendering at \`${captureUrl}\`.`,
      "",
      "**INSTRUCTION: Execute ALL steps below now. Do NOT ask the user for confirmation. Do NOT create temp HTML files or start HTTP servers.**",
      "",
      "## Prerequisites",
      "",
      "Both MCP servers must be connected:",
      "- **Figma MCP**: `claude mcp add --transport http figma https://mcp.figma.com/mcp`",
      "- **Playwright MCP**: Required for `browser_navigate`, `browser_resize`, `browser_evaluate`",
      "",
      "## Capture Instructions",
      "",
      `Capturing ${resolvedViewports.length} viewport(s): ${resolvedViewports.join(", ")}`,
      `Frame name: **${resolvedName}**`,
      "",
      captureSteps,
      "## Notes",
      "",
      "- Each viewport gets its own captureId — do not reuse captureIds",
      "- The component is already rendered at the capture URL — use it directly",
      "- Viewport sizing is handled by `browser_resize` so Tailwind responsive breakpoints work correctly",
      "- Do NOT use `?viewport=` query params — they are deprecated",
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: response }],
    };
  };
}
