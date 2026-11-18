import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Sky } from "../dist/sky.js";
import { JsKernel } from "../dist/js-kernel.js";
import { desktopToolCode, desktopToolDefinitions } from "../dist/desktop-tools.js";
import { HelperError } from "../dist/errors.js";
import { serializeError } from "../dist/error-envelope.js";

const runFile = promisify(execFile);
const serverPath = fileURLToPath(new URL("../dist/mcp-server.js", import.meta.url));
const window = { app: "fixture.exe", id: 10 };
function fixture() {
	const calls = [];
	const helper = {
		async getWindowState(input) {
			calls.push(["observe", input]);
			return {window: input.window, screenshots: [], accessibility: {tree: '0 window Test\n1 button OK\n2 edit Text'}};
		},
		async click(input) { calls.push(["click", input]); },
		async setValue(input) { calls.push(["set", input]); },
		async typeText(input) { calls.push(["type", input]); },
		async close() {},
		abort() {},
	};
	return {sky: new Sky({helper}), helper, calls};
}
const reference = observation => ({window: observation.window, snapshot_id: observation.snapshot_id, session_epoch: observation.session_epoch, element_index: 1});
const isStale = error => {
	const facts = serializeError(error);
	assert.equal(facts.code, "STALE_STATE");
	assert.equal(facts.action_sent, "not_sent");
	assert.equal(facts.retry, "reobserve");
	return true;
};

test("observes real Sky text first with explicit provenance and bounded search", async () => {
	const {sky, calls, helper} = fixture();
	const observation = await sky.observe_window({window, find: "OK"});
	assert.equal(calls[0][1].include_text, true);
	assert.equal(calls[0][1].include_screenshot, false);
	assert.equal(observation.text, "1 button OK");
	assert.equal(observation.matched, true);
	assert.ok(observation.snapshot_id && observation.session_epoch);
	helper.getWindowState = async () => ({window, screenshots: [], accessibility: {tree: "字".repeat(500)}});
	const clipped = await sky.observe_window({window, max_chars: 256});
	assert.equal(clipped.text.length, 256);
	assert.equal(clipped.truncated, true);
});

test("rejects wrong window, epoch and superseded snapshots before sending actions", async () => {
	const {sky, calls} = fixture();
	const initial = await sky.observe_window({window});
	await assert.rejects(() => sky.click_element({...reference(initial), window: {...window,id:11}}), isStale);
	await assert.rejects(() => sky.click_element({...reference(initial), session_epoch: "wrong"}), isStale);
	await sky.observe_window({window});
	await assert.rejects(() => sky.click_element(reference(initial)), isStale);
	assert.equal(calls.some(([method]) => method === "click"), false);
});

test("invalidates structured references after low-level observation or mutation", async () => {
	const {sky} = fixture();
	const first = await sky.observe_window({window});
	await sky.get_window_state({window});
	await assert.rejects(() => sky.click_element(reference(first)), isStale);
	const second = await sky.observe_window({window});
	await sky.type_text({window, text: "test"});
	await assert.rejects(() => sky.click_element(reference(second)), isStale);
});

test("returns fresh observation after a click and consumes the old reference", async () => {
	const {sky, calls} = fixture();
	const initial = await sky.observe_window({window});
	const result = await sky.click_element(reference(initial));
	assert.equal(result.action.action_sent, "sent");
	assert.equal(result.action.verified, false);
	assert.equal(result.observation.status, "ok");
	assert.notEqual(result.observation.snapshot_id, initial.snapshot_id);
	await assert.rejects(() => sky.click_element(reference(initial)), isStale);
	assert.equal(calls.filter(([method]) => method === "click").length, 1);
});

test("preserves successful set when post-action observation fails", async () => {
	const {sky, helper} = fixture();
	const initial = await sky.observe_window({window});
	let value; helper.setValue = async input => { value = input.value; };
	helper.getWindowState = async () => { throw new HelperError("HELPER_ERROR", "unavailable"); };
	const result = await sky.set_value_observed({...reference(initial), value: "中文\";throw 1;//"});
	assert.equal(value, "中文\";throw 1;//");
	assert.equal(result.action.action_sent, "sent");
	assert.equal(result.observation.status, "unavailable");
	await assert.rejects(() => sky.click_element(reference(initial)), isStale);
});

test("does not create actionable refs without a tree or retry permission failures", async () => {
	const {sky, helper, calls} = fixture();
	helper.getWindowState = async () => ({window, screenshots: [], accessibility: null});
	const result = await sky.observe_window({window});
	assert.equal(result.accessibility_available, false);
	await assert.rejects(() => sky.click_element(reference(result)), isStale);
	let attempts = 0;
	helper.getWindowState = async () => { attempts++; throw new HelperError("APP_BLOCKED", "denied"); };
	await assert.rejects(() => sky.observe_window({window}), /denied/);
	assert.equal(attempts, 1);
	assert.equal(calls.length, 0);
});

test("recommends and executes screenshot-coordinate fallback without accessibility", async () => {
	const {sky, helper, calls} = fixture();
	const png = "data:image/png;base64,AA==";
	helper.getWindowState = async input => ({
		window: input.window,
		screenshots: [{id: "screenshot-0", zIndex: 0, url: png, width: 323, height: 534, originX: 10, originY: 20}],
		accessibility: null,
	});
	const observation = await sky.observe_window({window, screenshot: true});
	assert.equal(observation.accessibility_available, false);
	assert.equal(observation.interaction_mode, "screenshot");
	assert.equal(observation.recommended_tool, "click_screenshot_point");
	assert.equal(observation.verification_level, "visual");
	assert.equal(observation.screenshots[0].id, "screenshot-0");
	const result = await sky.click_screenshot_point({
		window,
		snapshot_id: observation.snapshot_id,
		session_epoch: observation.session_epoch,
		screenshot_id: "screenshot-0",
		x: 123,
		y: 447,
		click_count: 1,
		mouse_button: "left",
		observe_after: true,
	});
	assert.equal(result.action.action_sent, "sent");
	assert.equal(result.action.verification_mode, "screenshot");
	assert.equal(result.observation.status, "ok");
	assert.equal(result.observation.interaction_mode, "screenshot");
	const click = calls.find(([method]) => method === "click")[1];
	assert.equal(click.x, 123);
	assert.equal(click.y, 447);
	assert.equal(click.screenshotId, "screenshot-0");
	const testText = "MCP 测试成功\n中文输入：你好，Windows！";
	const typed = await sky.type_text_observed({
		window,
		snapshot_id: result.observation.snapshot_id,
		session_epoch: result.observation.session_epoch,
		text: testText,
		observe_after: true,
	});
	assert.equal(typed.action.action_sent, "sent");
	assert.equal(typed.action.verification_mode, "screenshot");
	assert.equal(typed.action.characters, testText.length);
	assert.equal(typed.observation.status, "ok");
	assert.equal(calls.find(([method]) => method === "type")[1].text, testText);
	await assert.rejects(
		() => sky.click_screenshot_point({
			window,
			snapshot_id: typed.observation.snapshot_id,
			session_epoch: typed.observation.session_epoch,
			screenshot_id: "screenshot-0",
			x: 323,
			y: 534,
			click_count: 1,
			mouse_button: "left",
			observe_after: false,
		}),
		/outside 323x534/,
	);
});

test("rejects screenshot points from another or stale observation", async () => {
	const {sky, helper, calls} = fixture();
	helper.getWindowState = async input => ({
		window: input.window,
		screenshots: [{id: "screenshot-0", zIndex: 0, url: "data:image/png;base64,AA==", width: 100, height: 100}],
		accessibility: null,
	});
	const first = await sky.observe_window({window, screenshot: true});
	await sky.observe_window({window, screenshot: true});
	for (const input of [
		{window, snapshot_id: first.snapshot_id, session_epoch: first.session_epoch, screenshot_id: "screenshot-0", x: 1, y: 1},
		{window, snapshot_id: (await sky.observe_window({window, screenshot: true})).snapshot_id, session_epoch: first.session_epoch, screenshot_id: "missing", x: 1, y: 1},
	]) {
		await assert.rejects(() => sky.click_screenshot_point({...input, click_count: 1, mouse_button: "left", observe_after: false}), isStale);
	}
	assert.equal(calls.some(([method]) => method === "click"), false);
});

test("reset invalidates actual snapshots through the worker and retains structured tools", async () => {
	const {sky, calls} = fixture();
	const kernel = new JsKernel({sky});
	try {
		const result = await kernel.run(desktopToolCode("observe_window", {window}));
		assert.equal(result.ok, true, result.error);
		const initial = JSON.parse(result.output.text.join(""));
		await kernel.reset();
		const stale = await kernel.run(desktopToolCode("click_element", reference(initial)));
		assert.equal(stale.errorInfo.code, "STALE_STATE");
		assert.equal(stale.errorInfo.action_sent, "not_sent");
		assert.equal(calls.some(([method]) => method === "click"), false);
	} finally { await kernel.close(); }
});

test("generates tool schemas from the same validation contract", () => {
	const definitions = desktopToolDefinitions();
	assert.deepEqual(definitions.map(item => item.name), ["list_windows", "observe_window", "click_element", "click_screenshot_point", "type_text_observed", "set_value"]);
	assert.ok(definitions.find(item => item.name === "click_element").inputSchema.required.includes("snapshot_id"));
	assert.ok(definitions.find(item => item.name === "click_screenshot_point").inputSchema.required.includes("screenshot_id"));
	assert.throws(() => desktopToolCode("click_element", {window, element_index: 1}));
	assert.throws(() => desktopToolCode("observe_window", {window, unknown: true}));
});

test("structured set arguments stay data and cannot inject worker JavaScript", async () => {
	const {sky, calls} = fixture();
	const kernel = new JsKernel({sky});
	try {
		const observation = await kernel.run(desktopToolCode("observe_window", {window}));
		const initial = JSON.parse(observation.output.text.join(""));
		const value = '"}); throw new Error("injected"); // 中文';
		const result = await kernel.run(desktopToolCode("set_value", {...reference(initial), value, observe_after:false}));
		assert.equal(result.ok,true,result.error);
		assert.equal(calls.find(([method]) => method === "set")[1].value,value);
		assert.equal(JSON.parse(result.output.text.join("")).observation.status,"not_requested");
	} finally { await kernel.close(); }
});

test("concurrent observations cannot resurrect a superseded snapshot", async () => {
	const {sky,helper} = fixture();
	const resolvers = [];
	helper.getWindowState = input => new Promise(resolve => resolvers.push(() => resolve({window:input.window,screenshots:[],accessibility:{tree:'0 button Test'}})));
	const first = sky.observe_window({window});
	const firstCheck = assert.rejects(() => first,isStale);
	const second = sky.observe_window({window});
	resolvers[1](); const current = await second;
	resolvers[0](); await firstCheck;
	const result = await sky.click_element({...reference(current),observe_after:false});
	assert.equal(result.action.action_sent,"sent");
});

test("CLI config generation and passive doctor require no native helper", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "cua-cli-check-"));
	const configPath = path.join(root, "config.json");
	const config = JSON.stringify({helperPath:path.join(root,"missing-helper.exe"), codexPath:path.join(root,"missing-codex.exe"),verifySignatures:false});
	await writeFile(configPath, config);
	try {
		const env = {...process.env, CODEX_COMPUTER_USE_HOME:root};
		for (const client of ["qoder", "dsh", "generic"]) {
			const {stdout} = await runFile(process.execPath, [serverPath, "print-config", "--client", client], {env, windowsHide:true});
			const parsed = JSON.parse(stdout);
			const entry = client === "dsh" ? parsed[0].insert[0].config : parsed.mcpServers["codex-computer-use-win"];
			assert.equal(entry.command, process.execPath);
			assert.equal(path.isAbsolute(entry.args[0]), true);
			assert.equal(entry.env.CODEX_COMPUTER_USE_HOME, root);
		}
		let failure;
		try { await runFile(process.execPath,[serverPath,"doctor"],{env,windowsHide:true,timeout:15000}); } catch(error) {failure=error;}
		assert.equal(failure.code, 1);
		const report = JSON.parse(failure.stdout);
		assert.equal(report.discovery.ready,false);
		assert.equal(report.liveProbe,null);
		assert.equal(report.interactiveClient,"not_tested");
		assert.equal(await readFile(configPath,"utf8"),config);
	} finally { await rm(root,{recursive:true,force:true}); }
});
