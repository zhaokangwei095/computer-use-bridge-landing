import assert from "node:assert/strict";
import { test } from "node:test";
import { JsKernel } from "../dist/js-kernel.js";
import { Sky } from "../dist/sky.js";
import { HelperError } from "../dist/errors.js";
import { serializeError, withErrorContext } from "../dist/error-envelope.js";
import { ComputerUseSession } from "../dist/session.js";

const image = "data:image/png;base64,AAAA";
const window = { id: 1, app: "fixture" };
function fixture(options = {}) {
	const helper = {
		async getWindowState(input) {
			return { window: input.window, screenshots: [{ id: "fixture", url: image, zIndex: 0 }], accessibility: { tree: "0 button OK" } };
		},
		async listWindows() { throw new HelperError("APP_BLOCKED", "Synthetic denied"); },
		async click() {},
		async close() {},
		abort() {},
		...options.helper,
	};
	const sky = new Sky({ helper, ...options.sky });
	return new JsKernel({ sky, ...options.kernel });
}
const stateCall = `await sky.get_window_state({window:${JSON.stringify(window)}})`;

test("preserves raw screenshot data and removes its automatic textual duplicate", async () => {
	const kernel = fixture();
	try {
		const result = await kernel.run(stateCall);
		assert.equal(result.ok, true, result.error);
		assert.equal(result.output.images[0], image);
		assert.doesNotMatch(result.output.text.join(""), /data:image/);
		const raw = await kernel.run(`const state=${stateCall}; state.screenshots[0].url === ${JSON.stringify(image)}`);
		assert.match(raw.output.text.join(""), /true/);
		const json = await kernel.run(`nodeRepl.write(JSON.stringify(await sky.get_window_state({window:${JSON.stringify(window)}})))`);
		assert.doesNotMatch(json.output.text.join(""), /data:image/);
	} finally { await kernel.close(); }
});

test("preserves codes across the VM as primitives and uncaught errors as envelopes", async () => {
	const kernel = fixture();
	try {
		const caught = await kernel.run(`try { await sky.list_windows(); } catch(error) { nodeRepl.write(JSON.stringify({code:error.code, retry:error.retry, sameRealm:error instanceof Error, primitive:typeof error.code})); }`);
		assert.deepEqual(JSON.parse(caught.output.text.join("")), {code: "APP_BLOCKED", retry: "never", sameRealm: true, primitive: "string"});
		const uncaught = await kernel.run("await sky.list_windows()");
		assert.equal(uncaught.errorInfo.code, "APP_BLOCKED");
		assert.equal(uncaught.errorInfo.action_sent, "not_applicable");
	} finally { await kernel.close(); }
});

test("reports kernel and Sky image omissions without altering raw API semantics", async () => {
	for (const options of [{ kernel: { maxTotalImageBytes: 1 } }, { sky: { maxScreenshotBytes: 1 } }]) {
		const kernel = fixture(options);
		try {
			const result = await kernel.run(stateCall);
			assert.equal(result.ok, true, result.error);
			assert.equal(result.output.images.length, 0);
			assert.equal(result.imageReport.requested, 1);
			assert.equal(result.imageReport.omitted, 1);
			assert.equal(result.imageReport.returned, 0);
		} finally { await kernel.close(); }
	}
});

test("reports completed earlier mutations when a later call fails", async () => {
	const kernel = fixture();
	try {
		const result = await kernel.run(`await sky.click({window:${JSON.stringify(window)},x:1,y:1}); await sky.list_windows()`);
		assert.equal(result.ok, false);
		assert.deepEqual(result.actions, [{method: "sky.click", status: "sent"}]);
	} finally { await kernel.close(); }
});

test("marks timed-out in-flight mutations uncertain and never replays them", async () => {
	let calls = 0;
	const kernel = fixture({ helper: { click: async () => { calls += 1; await new Promise(() => {}); } } });
	try {
		const result = await kernel.run(`await sky.click({window:${JSON.stringify(window)},x:1,y:1})`, 100);
		assert.equal(result.errorInfo.action_sent, "possibly_sent");
		assert.equal(result.errorInfo.session_reset, true);
		assert.equal(result.errorInfo.retry, "reobserve");
		await kernel.run("1+1");
		assert.equal(calls, 1);
	} finally { await kernel.close(); }
});

test("rejects pre-cancelled runs without dispatching mutations", async () => {
	let calls = 0;
	const kernel = fixture({helper: {click: async () => { calls += 1; }}});
	try {
		const controller = new AbortController(); controller.abort();
		const result = await kernel.run(`await sky.click({window:${JSON.stringify(window)},x:1,y:1})`, 1000, controller.signal);
		assert.equal(result.errorInfo.action_sent, "not_sent");
		assert.equal(calls, 0);
	} finally { await kernel.close(); }
});

test("serializes transport evidence conservatively and does not invoke error getters", () => {
	const error = withErrorContext(new HelperError("HELPER_TIMEOUT", "timeout"), {method: "click_element", action_sent: "possibly_sent"});
	const wrapped = withErrorContext(error, {action_sent: "not_sent"});
	assert.equal(serializeError(wrapped).action_sent, "possibly_sent");
	assert.equal(serializeError(wrapped).retry, "reobserve");
	let reads = 0; const custom = new Error("x");
	Object.defineProperty(custom, "code", {get() { reads++; return "APP_BLOCKED"; }});
	assert.equal(serializeError(custom).code, "JS_ERROR"); assert.equal(reads, 0);
});

test("session exposes structured failure and image omissions without logging content", async () => {
	const session = new ComputerUseSession({restoreCursor: async () => true});
	const kernel = fixture({kernel: {maxTotalImageBytes: 1}});
	const records = [];
	session.config = {sessionIdleMs: 60000, audit: false};
	session.ensureRuntime = async () => ({kernel});
	session.audit = async record => records.push(record);
	try {
		const output = await session.execute("js", {code: stateCall});
		assert.equal(output.structuredContent.imageReport.omitted, 1);
		assert.match(output.content.map(block => block.text ?? "").join(""), /Images omitted/);
		const failure = await session.execute("js", {code: "await sky.list_windows()"});
		assert.equal(failure.structuredContent.error.code, "APP_BLOCKED");
		assert.equal(records.at(-1).errorCode, "APP_BLOCKED");
		assert.doesNotMatch(JSON.stringify(records), /Synthetic denied|data:image|button OK/);
	} finally { await session.close(); await kernel.close(); }
});

test("reports duplicate and count-limited images separately with exact byte counts", async () => {
	const kernel = fixture({kernel: {maxOutputImages: 1}});
	try {
		const result = await kernel.run(`nodeRepl.emitImage("data:image/png;base64,AA=="); nodeRepl.emitImage("data:image/png;base64,AA=="); nodeRepl.emitImage("data:image/png;base64,AQ==");`);
		assert.equal(result.imageReport.requested, 3);
		assert.equal(result.imageReport.duplicates, 1);
		assert.equal(result.imageReport.omitted, 1);
		assert.equal(result.imageReport.reasons.image_count_limit, 1);
		assert.equal(result.imageReport.bytes, 1);
	} finally { await kernel.close(); }
});

test("does not dispatch delayed mutation RPC from a finished execution", async () => {
	let calls = 0;
	const kernel = fixture({helper: {click: async () => { calls++; }}});
	try {
		await kernel.run(`setTimeout(() => { sky.click({window:${JSON.stringify(window)},x:1,y:1}).catch(() => {}); }, 80);`);
		await kernel.run("await new Promise(resolve => setTimeout(resolve, 150))");
		assert.equal(calls, 0);
	} finally { await kernel.close(); }
});
