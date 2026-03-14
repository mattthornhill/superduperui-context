import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { readConfig } from "./config.js";
import { LAYOUT_DIR } from "../kit/types.js";

interface PullResponse {
  project: {
    id: string;
    name: string;
    sourceType: string;
    updatedAt: string;
  };
  files: Record<string, string>;
}

interface PullOptions {
  output?: string;
  formats?: string;
  projectId?: string;
}

export async function pullCommand(
  projectIdArg: string | undefined,
  options: PullOptions
): Promise<void> {
  const config = readConfig();

  if (!config.apiKey) {
    console.log(chalk.red("Error:"), "Not authenticated.");
    console.log(`  Run ${chalk.cyan("layout-context login <api-key>")} first.`);
    process.exit(1);
  }

  const projectId = projectIdArg ?? options.projectId ?? config.defaultProjectId;
  const outputDir = options.output ?? LAYOUT_DIR;
  const baseUrl = config.baseUrl ?? "https://layout.design";

  // Build query params
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (options.formats) params.set("formats", options.formats);

  const url = `${baseUrl}/api/export/pull${params.toString() ? `?${params}` : ""}`;

  console.log(chalk.dim("Pulling design context..."));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch (err) {
    console.log(
      chalk.red("Error:"),
      `Could not connect to ${baseUrl}: ${err instanceof Error ? err.message : "unknown error"}`
    );
    process.exit(1);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
      error?: string;
    };
    console.log(chalk.red("Error:"), body.error ?? `HTTP ${res.status}`);
    process.exit(1);
  }

  const data = (await res.json()) as PullResponse;
  const fileEntries = Object.entries(data.files);

  if (fileEntries.length === 0) {
    console.log(chalk.yellow("Warning:"), "No files returned. Check your project has extraction data.");
    process.exit(1);
  }

  // Write files
  const cwd = process.cwd();
  let created = 0;
  let updated = 0;

  for (const [relativePath, content] of fileEntries) {
    const fullPath = path.join(cwd, outputDir, relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const existed = fs.existsSync(fullPath);
    fs.writeFileSync(fullPath, content, "utf-8");

    if (existed) {
      updated++;
    } else {
      created++;
    }
  }

  console.log();
  console.log(chalk.green("✓"), `Pulled ${chalk.bold(data.project.name)}`);
  console.log();

  for (const relativePath of Object.keys(data.files)) {
    console.log(`  ${chalk.dim("•")} ${outputDir}/${relativePath}`);
  }

  console.log();
  console.log(
    chalk.dim(`  ${created} created, ${updated} updated — ${fileEntries.length} files total`)
  );

  // Merge CLAUDE.md into root if present
  const claudeMdPath = path.join(cwd, outputDir, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    mergeClaudeMd(cwd, claudeMdPath);
  }

  console.log();
  console.log(
    `Run ${chalk.cyan("layout-context install")} to connect the MCP server.`
  );
}

/** Markers for idempotent CLAUDE.md injection */
const SECTION_START = "<!-- layout:design-system:start -->";
const SECTION_END = "<!-- layout:design-system:end -->";

function mergeClaudeMd(cwd: string, sourcePath: string): void {
  const content = fs.readFileSync(sourcePath, "utf-8").trim();
  if (!content) return;

  const wrapped = `${SECTION_START}\n${content}\n${SECTION_END}`;
  const rootPath = path.join(cwd, "CLAUDE.md");

  if (fs.existsSync(rootPath)) {
    const existing = fs.readFileSync(rootPath, "utf-8");

    const startIdx = existing.indexOf(SECTION_START);
    const endIdx = existing.indexOf(SECTION_END);

    if (startIdx !== -1 && endIdx !== -1) {
      const before = existing.slice(0, startIdx);
      const after = existing.slice(endIdx + SECTION_END.length);
      fs.writeFileSync(rootPath, before + wrapped + after);
      console.log(`  ${chalk.dim("•")} CLAUDE.md (updated design system section)`);
      return;
    }

    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    fs.writeFileSync(rootPath, existing + separator + wrapped + "\n");
    console.log(`  ${chalk.dim("•")} CLAUDE.md (appended design system section)`);
    return;
  }

  fs.writeFileSync(rootPath, wrapped + "\n");
  console.log(`  ${chalk.dim("•")} CLAUDE.md (created with design system section)`);
}
