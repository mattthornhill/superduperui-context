import chalk from "chalk";
import { readConfig, saveConfig, clearConfig, getGlobalConfigLocation } from "./config.js";

export async function loginCommand(apiKey: string): Promise<void> {
  if (!apiKey.startsWith("lyt_")) {
    console.log(chalk.red("Error:"), "Invalid API key format. Keys start with lyt_");
    process.exit(1);
  }

  const config = readConfig();
  const baseUrl = config.baseUrl ?? "https://layout.design";

  console.log(chalk.dim("Validating API key..."));

  try {
    const res = await fetch(`${baseUrl}/api/export/pull`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.status === 401) {
      console.log(chalk.red("Error:"), "Invalid or revoked API key.");
      process.exit(1);
    }

    if (res.status === 403) {
      console.log(chalk.red("Error:"), "API key does not have read scope.");
      process.exit(1);
    }

    // 404 is fine — means auth worked but no projects exist yet
    if (!res.ok && res.status !== 404) {
      console.log(chalk.red("Error:"), `Unexpected response: ${res.status}`);
      process.exit(1);
    }
  } catch (err) {
    console.log(
      chalk.red("Error:"),
      `Could not connect to ${baseUrl}: ${err instanceof Error ? err.message : "unknown error"}`
    );
    process.exit(1);
  }

  saveConfig({ apiKey });

  const preview = `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
  console.log(chalk.green("✓"), `Authenticated as ${chalk.bold(preview)}`);
  console.log(chalk.dim(`  Key saved to ${getGlobalConfigLocation()}`));
  console.log();
  console.log(`Run ${chalk.cyan("layout-context pull")} to fetch your design system.`);
}

export function logoutCommand(): void {
  clearConfig();
  console.log(chalk.green("✓"), "Logged out. API key removed from ~/.layoutrc");
}

export function whoamiCommand(): void {
  const config = readConfig();

  if (!config.apiKey) {
    console.log(chalk.yellow("Not authenticated."));
    console.log(`  Run ${chalk.cyan("layout-context login <api-key>")} to get started.`);
    return;
  }

  const preview = `${config.apiKey.slice(0, 7)}...${config.apiKey.slice(-4)}`;
  console.log(chalk.green("✓"), `Authenticated as ${chalk.bold(preview)}`);
  console.log(`  Base URL: ${chalk.dim(config.baseUrl)}`);
  if (config.defaultProjectId) {
    console.log(`  Default project: ${chalk.dim(config.defaultProjectId)}`);
  }
}
