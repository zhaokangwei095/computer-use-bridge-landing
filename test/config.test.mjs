import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import {
	configPath,
	DEFAULT_DENY_APPS,
	defaultStateRoot,
	effectiveDenyApps,
	loadConfig,
	readConfigList,
	updateConfigList,
} from "../dist/config.js";

const tempDirs = [];

async function tempDir(prefix) {
	const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(directory);
	return directory;
}

after(async () => {
	await Promise.all(tempDirs.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("config", () => {
	test("loads defaults when config.json is absent", async () => {
		const stateRoot = await tempDir("cua-config-defaults-");
		const config = await loadConfig(stateRoot);
		assert.equal(config.approval, "auto");
		assert.equal(config.elicitationFallback, "auto");
		assert.equal(config.verifySignatures, true);
		assert.equal(config.audit, true);
		assert.equal(config.helperTimeoutMs, 60_000);
		assert.equal(config.sessionIdleMs, 600_000);
		assert.deepEqual(config.denyApps, []);
		assert.deepEqual(config.allowApps, []);
		assert.equal(configPath(stateRoot), path.join(stateRoot, "config.json"));
	});

	test("loads explicit values and combines the deny list", async () => {
		const stateRoot = await tempDir("cua-config-values-");
		await writeFile(path.join(stateRoot, "config.json"), JSON.stringify({
			approval: "mcp",
			elicitationFallback: "deny",
			verifySignatures: false,
			denyApps: ["slack.exe"],
			allowApps: ["notepad.exe"],
			maxTextBytes: 4096,
			helperTimeoutMs: 12_000,
			audit: false,
		}));
		const config = await loadConfig(stateRoot);
		assert.equal(config.approval, "mcp");
		assert.equal(config.elicitationFallback, "deny");
		assert.equal(config.verifySignatures, false);
		assert.deepEqual(config.denyApps, ["slack.exe"]);
		assert.deepEqual(config.allowApps, ["notepad.exe"]);
		assert.equal(config.maxTextBytes, 4096);
		assert.equal(config.helperTimeoutMs, 12_000);
		assert.equal(config.audit, false);
		const deny = effectiveDenyApps(config);
		assert.ok(deny.includes("cmd.exe"));
		assert.ok(deny.includes("slack.exe"));
		assert.ok(deny.includes("codex-computer-use.exe"));
		assert.ok(DEFAULT_DENY_APPS.includes("windowsterminal.exe"));
	});

	test("rejects misspelled keys instead of silently removing restrictions", async () => {
		const stateRoot = await tempDir("cua-config-unknown-");
		await writeFile(path.join(stateRoot, "config.json"), JSON.stringify({ approval: "mcp", allowApp: ["notepad.exe"] }));
		await assert.rejects(() => loadConfig(stateRoot), error => {
			assert.equal(error.code, "CONFIG_ERROR");
			assert.match(error.message, /allowApp/);
			assert.match(error.message, /allowApps/);
			return true;
		});
	});

	test("partial configurations retain defaults for omitted keys", async () => {
		const stateRoot = await tempDir("cua-config-partial-");
		await writeFile(path.join(stateRoot, "config.json"), JSON.stringify({allowApps: ["notepad.exe"]}));
		const config = await loadConfig(stateRoot);
		assert.deepEqual(config.allowApps, ["notepad.exe"]);
		assert.equal(config.approval, "auto");
		assert.equal(config.verifySignatures, true);
	});

	test("rejects malformed JSON", async () => {
		const stateRoot = await tempDir("cua-config-invalid-");
		await writeFile(path.join(stateRoot, "config.json"), "{not json");
		await assert.rejects(() => loadConfig(stateRoot), (error) => error.code === "CONFIG_ERROR");
	});

	test("rejects invalid values", async () => {
		const stateRoot = await tempDir("cua-config-schema-");
		await writeFile(path.join(stateRoot, "config.json"), JSON.stringify({ approval: "always" }));
		await assert.rejects(() => loadConfig(stateRoot), (error) => error.code === "CONFIG_ERROR");
	});

	test("honors CODEX_COMPUTER_USE_HOME and otherwise uses a Windows state folder", () => {
		const previous = process.env.CODEX_COMPUTER_USE_HOME;
		try {
			process.env.CODEX_COMPUTER_USE_HOME = "C:\\custom state";
			assert.equal(defaultStateRoot(), "C:\\custom state");
			delete process.env.CODEX_COMPUTER_USE_HOME;
			assert.match(defaultStateRoot(), /codex-computer-use-mcp-win$/i);
		} finally {
			if (previous === undefined) delete process.env.CODEX_COMPUTER_USE_HOME;
			else process.env.CODEX_COMPUTER_USE_HOME = previous;
		}
	});
});

describe("allow list editing", () => {
	test("add creates the file and deduplicates case-insensitively", async () => {
		const stateRoot = await tempDir("cua-allow-add-");
		const result = await updateConfigList(stateRoot, "allowApps", "add", ["chrome.exe", "Chrome.EXE"]);
		assert.deepEqual(result.list, ["chrome.exe"]);
		assert.deepEqual(result.changed, ["chrome.exe"]);
		const file = JSON.parse(await readFile(configPath(stateRoot), "utf8"));
		assert.deepEqual(file, {allowApps: ["chrome.exe"]});
		const listed = await readConfigList(stateRoot, "allowApps");
		assert.deepEqual(listed, ["chrome.exe"]);
	});

	test("add preserves unrelated keys already in the file", async () => {
		const stateRoot = await tempDir("cua-allow-preserve-");
		await writeFile(configPath(stateRoot), JSON.stringify({approval: "mcp", denyApps: ["slack.exe"]}));
		await updateConfigList(stateRoot, "allowApps", "add", ["notepad.exe"]);
		const file = JSON.parse(await readFile(configPath(stateRoot), "utf8"));
		assert.deepEqual(file, {approval: "mcp", denyApps: ["slack.exe"], allowApps: ["notepad.exe"]});
	});

	test("remove deletes exact entries only", async () => {
		const stateRoot = await tempDir("cua-allow-remove-");
		await updateConfigList(stateRoot, "allowApps", "add", ["chrome.exe", "notepad.exe"]);
		const result = await updateConfigList(stateRoot, "allowApps", "remove", ["chrome.exe"]);
		assert.deepEqual(result.list, ["notepad.exe"]);
		assert.deepEqual(result.changed, ["chrome.exe"]);
		const missing = await updateConfigList(stateRoot, "allowApps", "remove", ["chrome.exe"]);
		assert.deepEqual(missing.changed, []);
	});

	test("refuses to write when the existing file is invalid", async () => {
		const stateRoot = await tempDir("cua-allow-invalid-");
		await writeFile(configPath(stateRoot), JSON.stringify({allowApp: ["notepad.exe"]}));
		await assert.rejects(() => updateConfigList(stateRoot, "allowApps", "add", ["chrome.exe"]), error => error.code === "CONFIG_ERROR");
		const file = JSON.parse(await readFile(configPath(stateRoot), "utf8"));
		assert.deepEqual(file, {allowApp: ["notepad.exe"]});
	});

	test("rejects empty entries", async () => {
		const stateRoot = await tempDir("cua-allow-empty-");
		await assert.rejects(() => updateConfigList(stateRoot, "allowApps", "add", ["  "]), error => error.code === "CONFIG_ERROR");
	});
});
