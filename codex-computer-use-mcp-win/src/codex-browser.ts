import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as TOML from "smol-toml";
import { browserSchemas, type BrowserTool } from "./browser-tools.ts";

type Config = {
	mcp_servers?: {
		node_repl?: {
			command: string;
			args?: string[];
			env?: Record<string, string>;
		};
	};
};
type ToolResult = {isError?: boolean; content?: Array<{type: string; text?: string}>};
const RESULT_MARKER = "\n__MCP_BROWSER_RESULT__";

function normalizeUrl(value: string): string {
	return new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`).toString();
}

export class CodexComputerUseBrowser {
	private client: Client | null = null;
	private transport: StdioClientTransport | null = null;
	private connectPromise: Promise<void> | null = null;

	private async ensureClient(): Promise<Client> {
		if (this.connectPromise) { await this.connectPromise; return this.client!; }
		if (this.client) return this.client;
		this.connectPromise = (async () => {
			const configPath = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml");
			const config = TOML.parse(await readFile(configPath, "utf8")) as Config;
			const entry = config.mcp_servers?.node_repl;
			if (!entry) throw new Error(`Codex node_repl MCP is not configured in ${configPath}`);
			const moduleDirs = entry.env?.NODE_REPL_NODE_MODULE_DIRS?.split(";").filter(Boolean) ?? [];
			const browserService = moduleDirs
				.map(directory => path.join(directory, "@oai", "browser-desktop", "scripts", "browser-service.mjs"))
				.find(candidate => existsSync(candidate));
			if (!browserService) throw new Error("Codex browser-service.mjs was not configured");
			const env: NodeJS.ProcessEnv = {
				...process.env,
				...(entry.env ?? {}),
				CUA_REPL_ENABLED_SURFACES: "browser",
				NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: "CUA_REPL_ENABLED_SURFACES,CODEX_WINDOWS_REGISTERED_CORE",
				NODE_REPL_TRUSTED_SERVICES: JSON.stringify({browser: browserService.replaceAll("\\", "/"), sky: "@oai/sky/service"}),
				NODE_REPL_TRUSTED_CODE_PATHS: `${entry.env?.NODE_REPL_TRUSTED_CODE_PATHS ?? ""};${moduleDirs.join(";")}`,
			};
			const transportEnv = Object.fromEntries(
				Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
			);
			this.transport = new StdioClientTransport({command: entry.command, args: entry.args ?? [], env: transportEnv, stderr: "pipe"});
			this.transport.stderr?.on("data", () => undefined);
			this.client = new Client({name: "codex-computer-use-mcp-win-browser", version: "1.0.0"}, {capabilities: {}});
			await this.client.connect(this.transport);
		})();
		try {
			await this.connectPromise;
			return this.client!;
		} catch (error) {
			await this.close();
			throw error;
		} finally {
			this.connectPromise = null;
		}
	}

	private turnMeta() {
		const thread_id = process.env.CODEX_THREAD_ID;
		const session_id = process.env.CODEX_SESSION_ID;
		const turn_id = process.env.CODEX_TOOL_CALL_ID;
		return thread_id && session_id && turn_id ? {"x-codex-turn-metadata": {thread_id, session_id, turn_id}} : null;
	}

	canUseOfficialBrowser(): boolean {
		return this.turnMeta() !== null;
	}

	private async js(code: string, timeoutMs = 60_000): Promise<string> {
		const meta = this.turnMeta();
		if (!meta) {
			throw new Error("Official Computer Use browser requires Codex turn context (CODEX_THREAD_ID, CODEX_SESSION_ID, CODEX_TOOL_CALL_ID)");
		}
		const client = await this.ensureClient();
		const result = await client.callTool({
			name: "js",
			arguments: {code, timeout_ms: timeoutMs},
			_meta: meta,
		}, undefined, {timeout: timeoutMs + 30_000}) as ToolResult;
		const text = (result.content ?? []).filter(block => block.type === "text" && typeof block.text === "string").map(block => block.text!).join("\n");
		if (result.isError) throw new Error(text || "Computer Use browser operation failed");
		const index = text.lastIndexOf(RESULT_MARKER);
		if (index < 0) throw new Error("Computer Use browser returned no structured result");
		return text.slice(index + RESULT_MARKER.length).trim();
	}

	private async json(script: string) {
		const payload = await this.js(`await import("@oai/cua/tinyskyAlt"); ${script} nodeRepl.write(${JSON.stringify(RESULT_MARKER)}+JSON.stringify(payload));`);
		const start = payload.indexOf("{");
		if (start < 0) throw new Error("Computer Use browser returned no JSON result");
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let index = start; index < payload.length; index += 1) {
			const character = payload[index];
			if (inString) {
				if (escaped) escaped = false;
				else if (character === "\\") escaped = true;
				else if (character === "\"") inString = false;
				continue;
			}
			if (character === "\"") inString = true;
			else if (character === "{") depth += 1;
			else if (character === "}") {
				depth -= 1;
				if (depth === 0) return JSON.parse(payload.slice(start, index + 1)) as Record<string, unknown>;
			}
		}
		throw new Error("Computer Use browser returned incomplete JSON");
	}

	async execute(name: BrowserTool, rawArgs: unknown, options: { signal?: AbortSignal } = {}): Promise<Record<string, unknown>> {
		if (options.signal?.aborted) throw new Error("Browser request cancelled");
		const abort = () => { void this.close(); };
		options.signal?.addEventListener("abort", abort, { once: true });
		try {
			return await this.executeCommand(name, rawArgs);
		} finally {
			options.signal?.removeEventListener("abort", abort);
		}
	}

	private async executeCommand(name: BrowserTool, rawArgs: unknown): Promise<Record<string, unknown>> {
		const input = browserSchemas[name].parse(rawArgs);
		if ("app" in input && input.app !== undefined || "window_id" in input && input.window_id !== undefined) {
			throw new TypeError("Native window targets must use the native browser route");
		}
		if (name === "browser_navigate" && (!("tab_id" in input) || !input.tab_id)) throw new TypeError("Official browser navigation requires tab_id");
		switch (name) {
			case "browser_open": {
				const input = browserSchemas.browser_open.parse(rawArgs);
				const url = normalizeUrl(input.url);
				return await this.json(`let tabs=await cua.listTabs(); const existing=${input.reuse_existing ? "tabs.find(t=>t.url===" + JSON.stringify(url) + ")" : "null"}; const tab=existing?await cua.getTab(String(existing.id),{browser:existing.browserId}):await cua.createBrowserTab("iab", ${JSON.stringify(url)}, {sessionName:"codex-computer-use-mcp-win"}); const state=await tab.getAXState({disableDiffing:true}); tabs=await cua.listTabs(); const info=tabs.find(t=>String(t.id)===String(tab.id))??{}; const payload={tab_id:String(tab.id),title:info.title??"",url:info.url??${JSON.stringify(url)},text:state};`);
			}
			case "browser_new_tab": {
				const input = browserSchemas.browser_new_tab.parse(rawArgs);
				const url = normalizeUrl(input.url ?? "about:blank");
				return await this.json(`const tab=await cua.createBrowserTab("iab", ${JSON.stringify(url)}, {sessionName:"codex-computer-use-mcp-win"}); const state=await tab.getAXState({disableDiffing:true}); const tabs=await cua.listTabs(); const info=tabs.find(t=>String(t.id)===String(tab.id))??{}; const payload={tab_id:String(tab.id),title:info.title??"",url:info.url??${JSON.stringify(url)},text:state};`);
			}
			case "browser_tabs":
				return await this.json(`const tabs=await cua.listTabs(); const payload={tabs:tabs.map(t=>({tab_id:String(t.id),title:t.title??"",url:t.url??""}))};`);
			case "browser_navigate": {
				const input = browserSchemas.browser_navigate.parse(rawArgs);
				const url = normalizeUrl(input.url);
				return await this.json(`const tab=await cua.getTab(${JSON.stringify(input.tab_id)}); await tab.pressKey("Control_L+l"); await tab.typeText(${JSON.stringify(url)}); await tab.pressKey("Return"); await new Promise(r=>setTimeout(r,1000)); const state=await tab.getAXState(); const tabs=await cua.listTabs(); const info=tabs.find(t=>String(t.id)===String(tab.id))??{}; const payload={tab_id:String(tab.id),title:info.title??"",url:info.url??${JSON.stringify(url)},text:state};`);
			}
			case "browser_read": {
				const input = browserSchemas.browser_read.parse(rawArgs);
				if (input.read_all) {
					return await this.json(`const tabs=await cua.listTabs(); const pages=[]; for(const info of tabs){const tab=await cua.getTab(String(info.id),{browser:info.browserId}); const text=await tab.getAXState({disableDiffing:true}); pages.push({tab_id:String(info.id),title:info.title??"",url:info.url??"",text:String(text).slice(0,${input.max_chars}),truncated:String(text).length>${input.max_chars}})} const payload={pages};`);
				}
				const target = input.tab_id
					? `const info=(await cua.listTabs()).find(t=>String(t.id)===${JSON.stringify(input.tab_id)}); if(!info)throw new Error("Browser tab not found"); const tab=await cua.getTab(String(info.id));`
					: `const info=(await cua.listTabs())[0]; if(!info)throw new Error("No browser tabs are open"); const tab=await cua.getTab(String(info.id));`;
				return await this.json(`${target} const text=await tab.getAXState({disableDiffing:true}); const payload={page:{tab_id:String(info.id),title:info.title??"",url:info.url??"",text:String(text).slice(0,${input.max_chars}),truncated:String(text).length>${input.max_chars}}};`);
			}
		}
	}

	async close(): Promise<void> {
		await this.client?.close().catch(() => undefined);
		await this.transport?.close().catch(() => undefined);
		this.client = null;
		this.transport = null;
	}
}
