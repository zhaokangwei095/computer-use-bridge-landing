import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { CuaError, errorMessage } from "./errors.ts";

export const CONFIG_FILENAME = "config.json";

/**
 * Apps the server never drives, even in `auto` approval mode. Matching is
 * case-insensitive and accepts either an executable basename, an app id, or a
 * display name. Keep this list boring: it is a floor, not a complete security
 * boundary.
 */
export const DEFAULT_DENY_APPS = [
	// Shells and terminals.
	"windowsterminal.exe", "wt.exe", "cmd.exe", "powershell.exe", "pwsh.exe",
	"conhost.exe", "openconsole.exe", "wsl.exe", "bash.exe", "ubuntu.exe",
	"debian.exe", "kali.exe", "mintty.exe", "cygwin.exe",
	// The Computer Use control plane itself. Driving it can recurse or loop.
	"chatgpt.exe", "codex.exe", "codex-computer-use.exe", "cua-driver.exe",
	"cua-driver-uia.exe", "openai.codex*",
	// Credential stores.
	"1password.exe", "1password7.exe", "keepass.exe", "keepassxc.exe",
	"bitwarden.exe", "lastpass.exe", "dashlane.exe", "nordpass.exe",
	"enpass.exe", "roboform.exe",
	// Security and system administration surfaces.
	"securityhealthsystray.exe", "msmpeng.exe", "nissrv.exe", "mpcmdrun.exe",
	"taskmgr.exe", "regedit.exe", "gpedit.msc", "mmc.exe", "services.msc",
	"eventvwr.msc", "lockapp.exe", "winlogon.exe", "logonui.exe",
	"credentialui.exe", "consent.exe", "useraccountcontrolsettings.exe",
	// Remote-control surfaces.
	"mstsc.exe", "quickassist.exe", "teamviewer.exe", "anydesk.exe",
] as const;

const configSchema = z.strictObject({
	/** Absolute path to the signed OpenAI Computer Use helper. */
	helperPath: z.string().min(1).optional(),
	/** Absolute path to the signed Codex CLI executable used for helper auth. */
	codexPath: z.string().min(1).optional(),
	/** Codex state directory containing auth.json. Defaults to CODEX_HOME or ~/.codex. */
	codexHome: z.string().min(1).optional(),
	/** auto: approve non-denied apps. mcp: ask the MCP client. deny: refuse all. */
	approval: z.enum(["auto", "mcp", "deny"]).default("auto"),
	/** Used when approval is "mcp" but the client has no elicitation support. */
	elicitationFallback: z.enum(["auto", "deny"]).default("auto"),
	/** Verify Authenticode signatures before running the helper or Codex. */
	verifySignatures: z.boolean().default(true),
	/** Extra app patterns to deny. Combined with DEFAULT_DENY_APPS. `*` is a wildcard. */
	denyApps: z.array(z.string().min(1)).default([]),
	/** Apps pre-approved without a prompt. Matching is exact unless a pattern contains `*`. */
	allowApps: z.array(z.string().min(1)).default([]),
	/** Maximum single screenshot accepted from the helper, after base64 decoding. */
	maxScreenshotBytes: z.number().int().min(0).max(32 * 1024 * 1024).default(8 * 1024 * 1024),
	/** Maximum accessibility text returned by one call. */
	maxTextBytes: z.number().int().min(0).max(16 * 1024 * 1024).default(2 * 1024 * 1024),
	/** Timeout for one helper request. */
	helperTimeoutMs: z.number().int().min(1_000).max(600_000).default(60_000),
	/** Close the helper and JS session after this much inactivity. */
	sessionIdleMs: z.number().int().min(1_000).max(3_600_000).default(600_000),
	/** Append bounded metadata records to <stateRoot>/audit/. */
	audit: z.boolean().default(true),
});

export type AppConfig = z.infer<typeof configSchema>;

export function defaultStateRoot(): string {
	const override = process.env.CODEX_COMPUTER_USE_HOME;
	if (override && override.trim()) return override.trim();
	const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
	return path.join(localAppData, "codex-computer-use-mcp-win");
}

export function configPath(stateRoot = defaultStateRoot()): string {
	return path.join(stateRoot, CONFIG_FILENAME);
}

export function defaultCodexHome(): string {
	return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

async function readRawObject(file: string): Promise<Record<string, unknown>> {
	let text: string;
	try {
		text = await readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw new CuaError("CONFIG_ERROR", `Cannot read ${file}: ${errorMessage(error)}`, { cause: error });
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		throw new CuaError("CONFIG_ERROR", `Cannot read ${file}: ${errorMessage(error)}`, { cause: error });
	}
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new CuaError("CONFIG_ERROR", `Invalid ${file}: expected a JSON object`);
	}
	return raw as Record<string, unknown>;
}

function parseConfig(file: string, raw: unknown): AppConfig {
	const parsed = configSchema.safeParse(raw);
	if (!parsed.success) {
		const unknownKeys = parsed.error.issues.some(issue => issue.code === "unrecognized_keys");
		const hint = unknownKeys ? ` Supported keys: ${Object.keys(configSchema.shape).join(", ")}.` : "";
		throw new CuaError("CONFIG_ERROR", `Invalid ${file}: ${parsed.error.message}${hint}`);
	}
	return parsed.data;
}

export async function loadConfig(stateRoot = defaultStateRoot()): Promise<AppConfig> {
	const file = configPath(stateRoot);
	const raw = await readRawObject(file);
	return parseConfig(file, raw);
}

export type ConfigListKey = "allowApps" | "denyApps";

export async function readConfigList(stateRoot: string, key: ConfigListKey): Promise<string[]> {
	return (await loadConfig(stateRoot))[key];
}

export interface ConfigListUpdate {
	file: string;
	key: ConfigListKey;
	list: string[];
	changed: string[];
}

/** Adds or removes entries and writes the file atomically. Never writes an invalid config. */
export async function updateConfigList(
	stateRoot: string,
	key: ConfigListKey,
	operation: "add" | "remove",
	values: string[],
): Promise<ConfigListUpdate> {
	const file = configPath(stateRoot);
	const raw = await readRawObject(file);
	const config = parseConfig(file, raw);
	const entries = values.map(value => value.trim()).filter(Boolean);
	if (entries.length === 0) throw new CuaError("CONFIG_ERROR", `No ${key} entries were provided`);
	let list = [...config[key]];
	const changed: string[] = [];
	if (operation === "add") {
		const present = new Set(list.map(entry => entry.toLowerCase()));
		for (const entry of entries) {
			if (present.has(entry.toLowerCase())) continue;
			present.add(entry.toLowerCase());
			list.push(entry);
			changed.push(entry);
		}
	} else {
		const dropped = new Set(entries.map(entry => entry.toLowerCase()));
		list = list.filter(entry => {
			if (!dropped.has(entry.toLowerCase())) return true;
			changed.push(entry);
			return false;
		});
	}
	if (changed.length === 0) return { file, key, list, changed };
	const next = { ...raw, [key]: list };
	parseConfig(file, next);
	await mkdir(stateRoot, { recursive: true });
	const temporary = `${file}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	await rename(temporary, file);
	return { file, key, list, changed };
}

export function effectiveDenyApps(config: AppConfig): string[] {
	return [...DEFAULT_DENY_APPS, ...config.denyApps];
}
