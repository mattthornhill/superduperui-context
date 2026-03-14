import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface LayoutConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultProjectId?: string;
}

const CONFIG_FILENAME = ".layoutrc";
const ENV_KEY = "LAYOUT_API_KEY";
const ENV_BASE_URL = "LAYOUT_BASE_URL";
const DEFAULT_BASE_URL = "https://layout.design";

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), CONFIG_FILENAME);
}

function getLocalConfigPath(): string {
  return path.join(process.cwd(), CONFIG_FILENAME);
}

/**
 * Read config from (in priority order): env vars > local .layoutrc > global ~/.layoutrc
 */
export function readConfig(): LayoutConfig {
  const config: LayoutConfig = {};

  // 1. Global config (~/.layoutrc)
  const globalPath = getGlobalConfigPath();
  if (fs.existsSync(globalPath)) {
    Object.assign(config, parseConfigFile(globalPath));
  }

  // 2. Local config (./.layoutrc) — overrides global
  const localPath = getLocalConfigPath();
  if (fs.existsSync(localPath)) {
    Object.assign(config, parseConfigFile(localPath));
  }

  // 3. Env vars — highest priority
  if (process.env[ENV_KEY]) {
    config.apiKey = process.env[ENV_KEY];
  }
  if (process.env[ENV_BASE_URL]) {
    config.baseUrl = process.env[ENV_BASE_URL];
  }

  if (!config.baseUrl) {
    config.baseUrl = DEFAULT_BASE_URL;
  }

  return config;
}

/**
 * Save config to ~/.layoutrc (global). File is created with 0o600 permissions.
 */
export function saveConfig(updates: Partial<LayoutConfig>): void {
  const configPath = getGlobalConfigPath();
  const existing = fs.existsSync(configPath) ? parseConfigFile(configPath) : {};
  const merged = { ...existing, ...updates };

  const lines: string[] = [
    "# Layout CLI config — https://layout.design",
    "# Do not commit this file to version control",
  ];
  if (merged.apiKey) lines.push(`api_key=${merged.apiKey}`);
  if (merged.baseUrl && merged.baseUrl !== DEFAULT_BASE_URL) {
    lines.push(`base_url=${merged.baseUrl}`);
  }
  if (merged.defaultProjectId) {
    lines.push(`default_project_id=${merged.defaultProjectId}`);
  }

  fs.writeFileSync(configPath, lines.join("\n") + "\n", { mode: 0o600 });
}

/**
 * Delete the global config file.
 */
export function clearConfig(): void {
  const configPath = getGlobalConfigPath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

export function getGlobalConfigLocation(): string {
  return getGlobalConfigPath();
}

function parseConfigFile(filePath: string): LayoutConfig {
  const content = fs.readFileSync(filePath, "utf-8");
  const config: LayoutConfig = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    switch (key) {
      case "api_key":
        config.apiKey = value;
        break;
      case "base_url":
        config.baseUrl = value;
        break;
      case "default_project_id":
        config.defaultProjectId = value;
        break;
    }
  }

  return config;
}
