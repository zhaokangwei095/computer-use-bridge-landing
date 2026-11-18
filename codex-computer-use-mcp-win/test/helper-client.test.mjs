import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, test } from "node:test";
import { ApprovalController } from "../dist/approval.js";
import { HelperClient, codexRequestMetadata, minimalHelperEnv } from "../dist/helper-client.js";
import { serializeError } from "../dist/error-envelope.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeHelper = path.join(here, "fixtures", "fake-helper.mjs");
const APP = "process:C:\\Windows\\System32\\notepad.exe";

const tempDirs = [];
const clients = [];

async function tempDir(prefix) {
	const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(directory);
	return directory;
}

after(async () => {
	await Promise.all(clients.map((client) => client.close().catch(() => undefined)));
	await Promise.all(tempDirs.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeClient(options = {}) {
	const root = options.root ?? await tempDir("cua-helper-");
	const codexHome = path.join(root, "codex-home");
	const logPath = options.logPath ?? path.join(root, "requests.jsonl");
	const restoreCalls = [];
	const client = new HelperClient({
		helperPath: process.execPath,
		helperArgs: [fakeHelper],
		codexPath: process.execPath,
		codexHome,
		timeoutMs: options.timeoutMs ?? 3_000,
		approval: options.approval ?? new ApprovalController({
			mode: "auto",
			fallback: "auto",
			denyApps: [],
			allowApps: [],
		}),
		env: {
			FAKE_HELPER_LOG: logPath,
			...options.env,
		},
		logger: () => undefined,
		restoreCursor: async reason => { restoreCalls.push(reason); return true; },
	});
	clients.push(client);
	return { client, root, logPath, restoreCalls };
}

async function readLog(logPath) {
	const text = await readFile(logPath, "utf8");
	return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

describe("minimalHelperEnv", () => {
	test("builds current-turn metadata without exposing it elsewhere", () => {
		assert.deepEqual(codexRequestMetadata({
			CODEX_THREAD_ID: "thread-test",
			CODEX_SESSION_ID: "session-test",
			CODEX_TOOL_CALL_ID: "turn-test",
		}), {"x-codex-turn-metadata": {thread_id: "thread-test", session_id: "session-test", turn_id: "turn-test"}});
		assert.deepEqual(codexRequestMetadata({}), {});
	});

	test("drops secrets and unrelated environment variables", () => {
		const env = minimalHelperEnv({
			SystemRoot: "C:\\Windows",
			PATH: "C:\\evil",
			NODE_OPTIONS: "--require evil",
			TAVILY_API_KEY: "secret",
			CUA_TEST_SECRET: "secret",
			USERPROFILE: "C:\\Users\\tester",
			TEMP: "C:\\Temp",
		});
		assert.equal(env.NODE_OPTIONS, undefined);
		assert.equal(env.TAVILY_API_KEY, undefined);
		assert.equal(env.CUA_TEST_SECRET, undefined);
		assert.equal(env.USERPROFILE, "C:\\Users\\tester");
		assert.equal(env.TEMP, "C:\\Temp");
		assert.match(env.PATH, /System32/);
		assert.doesNotMatch(env.PATH, /evil/);
	});
});

describe("HelperClient protocol", () => {
	test("reports denied mutations before helper dispatch", async () => {
		const approval = new ApprovalController({mode: "auto", fallback: "deny", denyApps: ["notepad.exe"], allowApps: []});
		const { client } = await makeClient({approval});
		await assert.rejects(() => client.click({window: {app: APP, id: 101}, element_index: 1}), error => {
			const facts = serializeError(error);
			assert.equal(facts.action_sent, "not_sent");
			assert.equal(facts.retry, "never");
			return true;
		});
		assert.equal(client.isRunning, false);
	});

	test("marks a transmitted click timeout uncertain with no replay", async () => {
		const { client, logPath } = await makeClient({timeoutMs: 700, env: {FAKE_HELPER_SLOW_MS: "2000", FAKE_HELPER_SLOW_METHOD: "click_element"}});
		await client.listApps();
		await assert.rejects(() => client.click({window: {app: APP, id: 101}, element_index: 1}), error => {
			const facts = serializeError(error);
			assert.equal(facts.code, "HELPER_TIMEOUT");
			assert.equal(facts.action_sent, "possibly_sent");
			assert.equal(facts.retry, "reobserve");
			return true;
		});
		assert.equal((await readLog(logPath)).filter(record => record.method === "click_element").length, 1);
	});

	test("reports approval refusal as a mutation that did not execute", async () => {
		const approval = new ApprovalController({mode: "deny", fallback: "deny", denyApps: [], allowApps: []});
		const { client } = await makeClient({approval, env: {FAKE_HELPER_APPROVAL: "1", FAKE_HELPER_APPROVAL_METHOD: "click_element"}});
		await assert.rejects(() => client.click({window: {app: APP, id: 101}, element_index: 1}), error => {
			assert.equal(serializeError(error).code, "APPROVAL_DENIED");
			assert.equal(serializeError(error).action_sent, "not_sent");
			return true;
		});
	});
	test("spawns with a sanitized environment and speaks JSONL", async () => {
		const previousSecret = process.env.CUA_TEST_SECRET;
		const previousGrant = process.env.BROWSER_USE_ACCESS_EXECUTOR_ID;
		process.env.CUA_TEST_SECRET = "must-not-leak";
		process.env.BROWSER_USE_ACCESS_EXECUTOR_ID = "browser-grant-for-test";
		const { client, logPath } = await makeClient();
		try {
			const apps = await client.listApps();
			assert.equal(Array.isArray(apps), true);
			assert.equal(apps[0].id, APP);
			const windows = await client.listWindows();
			assert.equal(windows.length, 2);
			const log = await readLog(logPath);
			assert.equal(log[0].method, "list_apps");
			assert.equal(log[0].envSubset.CODEX_HOME.endsWith("codex-home"), true);
			assert.equal(log[0].envSubset.CODEX_CLI_PATH, process.execPath);
			assert.equal(log[0].envSubset.SKY_CUA_NATIVE_PIPE, "0");
			assert.equal(log[0].envSubset.SKY_ENABLE_AUDIO, "0");
			assert.equal(log[0].envSubset.SKY_CUA_NATIVE_PIPE_DIRECTORY, undefined);
			assert.equal(log[0].envKeys.includes("CUA_TEST_SECRET"), false);
			assert.equal(log[0].envKeys.includes("BROWSER_USE_ACCESS_EXECUTOR_ID"), true);
			assert.equal(log[0].envKeys.includes("CODEX_HOME"), true);
			assert.equal(log[0].argv.includes("--parent-pid"), true);
			assert.equal(log[0].argv.includes(fakeHelper), true);
		} finally {
			if (previousSecret === undefined) delete process.env.CUA_TEST_SECRET;
			else process.env.CUA_TEST_SECRET = previousSecret;
			if (previousGrant === undefined) delete process.env.BROWSER_USE_ACCESS_EXECUTOR_ID;
			else process.env.BROWSER_USE_ACCESS_EXECUTOR_ID = previousGrant;
		}
	});

	test("retries with approval metadata after an approvalRequest", async () => {
		const { client, logPath } = await makeClient({ env: { FAKE_HELPER_APPROVAL: "1" } });
		const state = await client.getWindowState({
			window: { app: APP, id: 101, title: "Untitled - Notepad" },
			include_screenshot: true,
			include_text: true,
		});
		assert.equal(state.screenshots[0].url.startsWith("data:image/png;base64,"), true);
		assert.equal(state.accessibility.tree.includes("Hello"), true);
		const log = await readLog(logPath);
		const requests = log.filter((entry) => entry.method === "get_window_state");
		assert.equal(requests.length, 2);
		assert.equal(requests[0].meta["x-oai-cua-approved-app"], undefined);
		assert.equal(requests[0].meta["x-oai-cua-request-budget-ms"], 3_000);
		assert.equal(requests[1].meta["x-oai-cua-approved-app"], APP);
		assert.equal(requests[1].meta["x-oai-cua-request-budget-ms"], 3_000);
	});

	test("does not execute an action approved after cancellation", async () => {
		let release;
		const gate = new Promise((resolve) => { release = resolve; });
		let markElicited;
		const elicited = new Promise((resolve) => { markElicited = resolve; });
		const approval = new ApprovalController({
			mode: "mcp",
			fallback: "deny",
			denyApps: [],
			allowApps: [],
			elicit: async () => {
				markElicited();
				await gate;
				return "accept";
			},
		});
		const { client, logPath } = await makeClient({ approval, env: { FAKE_HELPER_APPROVAL: "1" } });
		const pending = client.getWindowState({ window: { app: APP, id: 101 }, include_text: true });
		await Promise.race([
			elicited,
			new Promise((_, reject) => setTimeout(() => reject(new Error("no approval request")), 1_000)),
		]);
		client.abort("test stop");
		release();
		await assert.rejects(() => pending, /cancelled|test stop/);
		await new Promise((resolve) => setTimeout(resolve, 100));
		const log = await readLog(logPath);
		assert.equal(log.filter((entry) => entry.method === "get_window_state").length, 1);
	});

	test("selects click_element for element indexes and click for coordinates", async () => {
		const { client, logPath } = await makeClient();
		const window = { app: APP, id: 101 };
		await client.click({ window, element_index: 2, click_count: 2, mouse_button: "left" });
		await client.click({ window, x: 10, y: 20 });
		const log = await readLog(logPath);
		const element = log.find((entry) => entry.method === "click_element");
		const coordinate = log.find((entry) => entry.method === "click");
		assert.equal(element.params.element_index, 2);
		assert.equal(element.params.click_count, 2);
		assert.equal(coordinate.params.x, 10);
		assert.equal(coordinate.params.y, 20);
	});

	test("explains when the official helper blocks unverifiable browser URLs", async () => {
		const { client } = await makeClient({ env: { FAKE_HELPER_BROWSER_URL_FAILURE: "1" } });
		await assert.rejects(
			() => client.getWindowState({
				window: { app: "MSEdge", id: 303, title: "Microsoft Edge" },
				include_screenshot: true,
			}),
			(error) => error.code === "HELPER_ERROR" && /no domain allowlist.*does not bypass that helper policy/.test(error.message),
		);
	});

	test("adds a recovery hint for minimized windows", async () => {
		const { client } = await makeClient();
		await assert.rejects(
			() => client.getWindowState({
				window: { app: APP, id: 202 },
				include_text: true,
			}),
			(error) => error.code === "HELPER_ERROR" && /activate_window/.test(error.message),
		);
	});

	test("surfaces helper exits with stderr", async () => {
		const { client } = await makeClient();
		await assert.rejects(
			() => client.getWindow({ id: 500 }),
			(error) => error.code === "HELPER_EXITED" && /fake helper crash/.test(error.message),
		);
	});

	test("times out a slow request and kills the helper", async () => {
		const { client, restoreCalls } = await makeClient({
			timeoutMs: 150,
			env: { FAKE_HELPER_SLOW_MS: "1000" },
		});
		await assert.rejects(
			() => client.listWindows(),
			(error) => error.code === "HELPER_TIMEOUT" && /timed out/.test(error.message),
		);
		assert.ok(restoreCalls.includes("helper-timeout"));
	});

	test("abort rejects an in-flight request", async () => {
		const { client } = await makeClient({ env: { FAKE_HELPER_SLOW_MS: "1000" } });
		const pending = client.listWindows();
		await new Promise((resolve) => setTimeout(resolve, 40));
		client.abort("test stop");
		await assert.rejects(() => pending, /test stop/);
	});

	test("close sends the close method and shuts down", async () => {
		const { client, logPath, restoreCalls } = await makeClient();
		await client.listApps();
		await client.close();
		const log = await readLog(logPath);
		assert.equal(log.at(-1).method, "close");
		assert.equal(client.isRunning, false);
		assert.ok(restoreCalls.includes("helper-close") || restoreCalls.includes("helper-exit"));
	});
});
