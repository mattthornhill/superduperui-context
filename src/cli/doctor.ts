import { execFileSync } from "node:child_process";
import chalk from "chalk";

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
  requiredBy?: string;
}

/**
 * `layout-context doctor` — checks Node.js, Claude CLI, and MCP dependencies.
 */
export async function doctorCommand(): Promise<void> {
  console.log();
  console.log(chalk.bold("Layout Context — Dependency Check"));
  console.log();

  const results: CheckResult[] = [
    checkNodeVersion(),
    checkClaudeCli(),
    ...checkMcpServers(),
  ];

  let issues = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(chalk.green("  ✅ ") + r.label + chalk.dim(` — ${r.detail}`));
    } else {
      issues++;
      console.log(chalk.yellow("  ⚠️  ") + r.label);
      console.log(chalk.dim(`     ${r.detail}`));
      if (r.fix) {
        console.log(chalk.cyan(`     Fix: ${r.fix}`));
      }
      if (r.requiredBy) {
        console.log(chalk.dim(`     Required for: ${r.requiredBy}`));
      }
    }
  }

  console.log();
  if (issues === 0) {
    console.log(chalk.green("All checks passed. Full functionality available."));
  } else {
    console.log(
      chalk.yellow(`${issues} issue${issues > 1 ? "s" : ""} found. Fix warnings above for full functionality.`)
    );
  }
  console.log();
}

function checkNodeVersion(): CheckResult {
  const [major] = process.versions.node.split(".").map(Number);
  if (major !== undefined && major >= 18) {
    return {
      label: `Node.js v${process.versions.node}`,
      ok: true,
      detail: "requires >=18",
    };
  }
  return {
    label: `Node.js v${process.versions.node}`,
    ok: false,
    detail: `Node.js 18+ is required, you have ${process.versions.node}`,
    fix: "Install Node.js 18+ from https://nodejs.org",
  };
}

function checkClaudeCli(): CheckResult {
  try {
    execFileSync("which", ["claude"], { stdio: "ignore" });
    return {
      label: "Claude CLI",
      ok: true,
      detail: "found",
    };
  } catch {
    return {
      label: "Claude CLI",
      ok: false,
      detail: "not found in PATH",
      fix: "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
      requiredBy: "MCP server registration, doctor checks",
    };
  }
}

function checkMcpServers(): CheckResult[] {
  let mcpListOutput: string;
  try {
    mcpListOutput = execFileSync("claude", ["mcp", "list"], {
      encoding: "utf-8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return [
      {
        label: "MCP server list",
        ok: false,
        detail: "Could not run `claude mcp list`",
        fix: "Ensure Claude CLI is installed and authenticated",
      },
    ];
  }

  const results: CheckResult[] = [];

  // Check for Figma MCP
  const hasFigma = mcpListOutput.toLowerCase().includes("figma");
  results.push(
    hasFigma
      ? {
          label: "Figma MCP",
          ok: true,
          detail: "configured",
        }
      : {
          label: "Figma MCP",
          ok: false,
          detail: "not found in MCP server list",
          fix: "claude mcp add --transport http figma https://mcp.figma.com/mcp",
          requiredBy: "push-to-figma, design-in-figma, url-to-figma",
        }
  );

  // Check for Playwright MCP
  const hasPlaywright = mcpListOutput.toLowerCase().includes("playwright");
  results.push(
    hasPlaywright
      ? {
          label: "Playwright MCP",
          ok: true,
          detail: "configured",
        }
      : {
          label: "Playwright MCP",
          ok: false,
          detail: "not found in MCP server list",
          fix: "npx @anthropic-ai/mcp-playwright install",
          requiredBy: "push-to-figma, url-to-figma",
        }
  );

  // Check for Layout MCP itself
  const hasLayout =
    mcpListOutput.toLowerCase().includes("layout") ||
    mcpListOutput.toLowerCase().includes("layoutdesign");
  results.push(
    hasLayout
      ? {
          label: "Layout MCP",
          ok: true,
          detail: "configured",
        }
      : {
          label: "Layout MCP",
          ok: false,
          detail: "not found in MCP server list",
          fix: "npx @layoutdesign/context install",
          requiredBy: "all design system tools",
        }
  );

  return results;
}
