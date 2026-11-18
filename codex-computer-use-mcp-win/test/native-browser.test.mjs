import assert from "node:assert/strict";
import { test } from "node:test";
import { Sky } from "../dist/sky.js";
import { JsKernel } from "../dist/js-kernel.js";
import { ComputerUseSession } from "../dist/session.js";
import { dispatchBrowser } from "../dist/browser-dispatch.js";
import { browserSchemas, nativeBrowserCode } from "../dist/browser-tools.js";
import { HelperError } from "../dist/errors.js";

const window = { app: "MSEdge", id: 67480, title: "Old title" };
function fixture(options = {}) {
	const calls = [];
	let windows = options.windows ?? [window];
	const helper = {
		async listWindows() { calls.push(["list"]); return windows; },
		async launchApp(input) { calls.push(["launch", input]); windows = [window]; },
		async activateWindow(input) { calls.push(["activate", input]); },
		async pressKey(input) { calls.push(["key", input]); },
		async typeText(input) { calls.push(["type", input]); },
		async getWindowState(input) {
			calls.push(["read", input]);
			if (options.readError) throw options.readError;
			return {window: input.window, screenshots: [], accessibility: options.noText ? null : {tree: "0 document Test content\n1 text 你好"}};
		},
		abort(reason) { calls.push(["abort", reason]); },
		async close() {},
	};
	const sky = new Sky({helper});
	const kernel = new JsKernel({sky});
	const session = new ComputerUseSession({restoreCursor: async () => true});
	session.config = {sessionIdleMs:60000, audit:false};
	session.ensureRuntime = async () => ({kernel});
	let officialCalls = 0;
	const official = {
		canUseOfficialBrowser: () => options.context ?? false,
		async execute() { officialCalls++; if (options.officialError) throw options.officialError; return {tab_id: "iab-1", text: "official"}; },
	};
	return {
		calls, sky, kernel, session, official,
		officialCalls: () => officialCalls,
		run: (name, input, signal) => dispatchBrowser(name, input, session, official, signal),
		async close() { await session.close(); await kernel.close(); },
	};
}

test("WorkBuddy app and window arguments survive schema validation", () => {
	assert.equal(browserSchemas.browser_open.parse({app:"MSEdge",window_id:67480,url:"https://example.com"}).window_id,67480);
	assert.throws(() => browserSchemas.browser_read.parse({window_id:-1}));
	assert.throws(() => browserSchemas.browser_open.parse({url:"javascript:alert(1)",app:"MSEdge"}));
});

test("no context defaults to native Edge through the real JS kernel and reports sent vs verified", async () => {
	const setup = fixture();
	try {
		const result = await setup.run("browser_open",{url:"https://example.com",reuse_existing:false});
		assert.equal(result.isError,false);
		assert.equal(result.structuredContent.backend,"native-window");
		assert.equal(result.structuredContent.navigation_sent,true);
		assert.equal(result.structuredContent.navigation_verified,false);
		assert.match(result.structuredContent.text,/你好/);
		assert.equal(result.structuredContent.requested_url,"https://example.com/");
		assert.equal(result.structuredContent.url,undefined);
		assert.deepEqual(setup.calls.filter(([name])=>name==="key").map(([,input])=>input.key),["Control_L+t","Control_L+l","Return"]);
		assert.equal(setup.officialCalls(),0);
	} finally { await setup.close(); }
});

test("explicit window wins even with Codex context and never falls back on helper denial", async () => {
	const setup = fixture({context:true, readError:new HelperError("HELPER_ERROR","Computer Use has been stopped for this turn: cannot verify browser URL")});
	try {
		const result = await setup.run("browser_open",{app:"msedge.exe",window_id:67480,url:"https://www.bilibili.com/"});
		assert.equal(result.isError,true);
		assert.equal(result.structuredContent.navigation_sent,true);
		assert.equal(result.structuredContent.accessibility_status,"blocked");
		assert.equal(result.structuredContent.error.code,"HELPER_ERROR");
		assert.equal(result.structuredContent.error.retry,"never");
		assert.match(JSON.parse(result.content[0].text).error.message,/stopped/);
		assert.equal(setup.calls.filter(([name])=>name==="read").length,1);
		assert.equal(setup.officialCalls(),0);
	} finally { await setup.close(); }
});

test("read and tab inspection never launch, activate or navigate", async () => {
	const setup = fixture();
	try {
		for (const name of ["browser_read","browser_tabs"]) {
			const result=await setup.run(name,{app:"MSEdge",window_id:67480});
			assert.equal(result.isError,false);
			if(name==="browser_tabs")assert.equal(result.structuredContent.complete_tab_inventory,false);
		}
		assert.deepEqual(setup.calls.map(([name])=>name),["list","read","list","read"]);
	} finally { await setup.close(); }
});

test("stale IDs, mismatched apps and ambiguous windows fail before input", async () => {
	for(const input of [{app:"MSEdge",window_id:0},{app:"Chrome",window_id:67480},{app:"MSEdge"}]) {
		const setup=fixture({windows:[window,{...window,id:22}]});
		try {
			const result=await setup.run("browser_open",{...input,url:"https://example.org"});
			assert.equal(result.isError,true);
			assert.equal(result.structuredContent.navigation_sent,false);
			assert.deepEqual(setup.calls.map(([name])=>name),["list"]);
		} finally {await setup.close();}
	}
});

test("window_id alone selects that actual window and native navigate reuses the tab", async () => {
	const setup=fixture({windows:[window,{app:"Chrome",id:22}]});
	try {
		const result=await setup.run("browser_navigate",{window_id:22,url:"http://localhost:3000"});
		assert.equal(result.isError,false);
		assert.equal(result.structuredContent.window.app,"Chrome");
		assert.equal(result.structuredContent.new_tab_sent,false);
		assert.deepEqual(setup.calls.filter(([name])=>name==="key").map(([,input])=>input.key),["Control_L+l","Return"]);
	} finally {await setup.close();}
});

test("blank tab is not reported as navigation and opening can start a missing browser", async () => {
	const setup=fixture({windows:[]});
	try {
		const result=await setup.run("browser_new_tab",{app:"MSEdge"});
		assert.equal(result.isError,false);
		assert.equal(result.structuredContent.new_tab_sent,true);
		assert.equal(result.structuredContent.navigation_sent,false);
		assert.equal(setup.calls.filter(([name])=>name==="launch").length,1);
		assert.deepEqual(setup.calls.filter(([name])=>name==="key").map(([,input])=>input.key),["Control_L+t"]);
	} finally {await setup.close();}
});

test("native missing text is an explicit unavailable result, not successful page reading", async () => {
	const setup=fixture({noText:true});
	try{
		const result=await setup.run("browser_read",{app:"MSEdge"});
		assert.equal(result.isError,true);
		assert.equal(result.structuredContent.accessibility_status,"unavailable");
		assert.equal(result.structuredContent.error.code,"BROWSER_TEXT_UNAVAILABLE");
		assert.equal(result.structuredContent.text,"");
	}finally{await setup.close();}
});

test("official errors never execute the native route as a retry", async () => {
	const setup=fixture({context:true,officialError:new Error("Local browser access unavailable")});
	try {
		const result=await setup.run("browser_open",{url:"https://example.com"});
		assert.equal(result.isError,true);
		assert.equal(result.structuredContent.backend,"official-cua");
		assert.equal(result.structuredContent.error.action_sent,"possibly_sent");
		assert.equal(setup.officialCalls(),1);
		assert.equal(setup.calls.length,0);
	}finally{await setup.close();}
});

test("never reinterprets official tab IDs as native window IDs", async () => {
	const setup=fixture();
	try{
		for(const input of [{tab_id:"67480"},{read_all:true},{app:"MSEdge",tab_id:"67480"}]){
			const result=await setup.run("browser_read",input);
			assert.equal(result.isError,true);
			assert.equal(result.structuredContent.error.action_sent,"not_sent");
		}
		assert.equal(setup.calls.length,0);
	}finally{await setup.close();}
});

test("cancellation before and during a native call does not dispatch later keys", async () => {
	const setup=fixture();
	try{
		const before=new AbortController(); before.abort();
		assert.equal((await setup.run("browser_open",{url:"https://example.com"},before.signal)).isError,true);
		assert.equal(setup.calls.length,0);
		const controller=new AbortController();
		setup.sky.type_text=async()=>{controller.abort();await new Promise(()=>{});};
		const result=await setup.run("browser_open",{url:"https://example.com"},controller.signal);
		assert.equal(result.isError,true);
		assert.equal(result.structuredContent.error.code,"CANCELLED");
		assert.equal(result.structuredContent.error.action_sent,"possibly_sent");
		assert.ok(!setup.calls.some(([name,input])=>name==="key"&&input.key==="Return"));
	}finally{await setup.close();}
});

test("generated code treats URL text as data and rejects unsupported read_all before helper calls", async () => {
	const setup=fixture();
	try{
		const result=await setup.kernel.run(nativeBrowserCode("browser_open",{url:"https://example.com/\";throw new Error('inject');//",app:"MSEdge",reuse_existing:true}));
		assert.equal(result.ok,true,result.error);
		assert.equal(JSON.parse(result.output.text.join("")).navigation_sent,true);
		await setup.sky.browserAction("browser_read",{read_all:true}).then(()=>assert.fail("should reject"),()=>{});
		assert.equal(setup.calls.filter(([name])=>name==="read").length,1);
	}finally{await setup.close();}
});

test("late window discovery after cancellation cannot launch a new browser", async () => {
	const setup=fixture();
	const entered=Promise.withResolvers();
	const unblock=Promise.withResolvers();
	setup.sky.list_windows=async()=>{entered.resolve();return await unblock.promise;};
	try {
		const controller=new AbortController();
		const pending=setup.run("browser_open",{url:"https://example.com"},controller.signal);
		await entered.promise;
		controller.abort();
		assert.equal((await pending).isError,true);
		unblock.resolve([]);
		await new Promise(resolve=>setImmediate(resolve));
		assert.ok(!setup.calls.some(([name])=>name==="launch"));
	} finally {unblock.resolve([]);await setup.close();}
});
