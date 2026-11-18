import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { browserSchemas, browserToolDefinitions } from "../dist/browser-tools.js";
import { CodexComputerUseBrowser } from "../dist/codex-browser.js";

test("browser tools expose unrestricted HTTP(S) webpages", () => {
	for (const url of ["https://example.com", "http://localhost:3000", "https://some-random-domain.invalid/path", "example.org"]) {
		assert.equal(browserSchemas.browser_open.safeParse({url, reuse_existing: false}).success, true, url);
	}
	assert.equal(browserSchemas.browser_open.safeParse({url: "file:///C:/private.txt", reuse_existing: false}).success, false);
	assert.equal(browserSchemas.browser_open.safeParse({url: "javascript:alert(1)", reuse_existing: false}).success, false);
	assert.deepEqual(browserToolDefinitions().map(tool => tool.name), ["browser_open", "browser_new_tab", "browser_tabs", "browser_navigate", "browser_read"]);
});

test("browser commands use the official Computer Use browser API", async () => {
	const pages = [{id:"1",browserId:"iab",title:"Example",url:"https://example.com/"}];
	let created = 0;
	const reads = [];
	const tab = {id:"1",async getAXState(options){reads.push(options);return "0 AXWebArea Example content";}};
	const cua = {
		async listTabs(){return pages;},
		async getTab(id){assert.equal(id,"1");return tab;},
		async createBrowserTab(){created++;return tab;},
	};
	const browser = new CodexComputerUseBrowser();
	browser.json = script => runInNewContext(`(async()=>{${script} return payload;})()`,{cua});
	const opened = await browser.execute("browser_open", {url: "https://example.com", reuse_existing: true});
	assert.equal(opened.title, "Example");
	assert.equal(created,0);
	assert.equal(reads[0].disableDiffing,true);
	const tabs = await browser.execute("browser_tabs", {});
	assert.equal(tabs.tabs.length, 1);
	const read = await browser.execute("browser_read", {tab_id: "1", read_all: false, max_chars: 1000});
	assert.equal(read.page.text, "0 AXWebArea Example content");
	const all = await browser.execute("browser_read",{read_all:true,max_chars:1000});
	assert.equal(all.pages.length,1);
	assert.equal(all.pages[0].text,"0 AXWebArea Example content");
});

test("browser client refuses to fabricate context and checks it before spawning", async () => {
	const browser = new CodexComputerUseBrowser();
	let starts = 0;
	browser.ensureClient = async () => { starts++; throw new Error("must not start"); };
	const original = {
		thread: process.env.CODEX_THREAD_ID,
		session: process.env.CODEX_SESSION_ID,
		turn: process.env.CODEX_TOOL_CALL_ID,
	};
	delete process.env.CODEX_THREAD_ID;
	delete process.env.CODEX_SESSION_ID;
	delete process.env.CODEX_TOOL_CALL_ID;
	try {
		assert.equal(browser.canUseOfficialBrowser(), false);
		assert.equal(browser.turnMeta(), null);
		await assert.rejects(() => browser.js("1"), /requires Codex turn context/);
		assert.equal(starts, 0);
	} finally {
		for (const [key, value] of Object.entries({CODEX_THREAD_ID: original.thread, CODEX_SESSION_ID: original.session, CODEX_TOOL_CALL_ID: original.turn})) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});
