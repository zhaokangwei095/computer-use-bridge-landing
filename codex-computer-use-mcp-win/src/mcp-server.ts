#!/usr/bin/env node
import { Server, type ServerOptions } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
	type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { requestApprovalFromMcpClient } from "./mcp-elicitation.ts";
import { ComputerUseSession } from "./session.ts";
import {
	CUA_TOOL_DEFINITIONS,
	SERVER_INSTRUCTIONS,
	STATUS_TOOL_DEFINITION,
	isCuaReplTool,
	type CuaReplTool,
	type JsonObject,
} from "./tools.ts";
import { PACKAGE_VERSION } from "./version.ts";
import { desktopToolDefinitions, desktopToolCode, isDesktopTool } from "./desktop-tools.ts";
import { clientConfiguration } from "./cli-support.ts";
import { configPath, defaultStateRoot, readConfigList, updateConfigList } from "./config.ts";
import { serializeError } from "./error-envelope.ts";
import { browserToolDefinitions, isBrowserTool } from "./browser-tools.ts";
import { CodexComputerUseBrowser } from "./codex-browser.ts";
import { dispatchBrowser } from "./browser-dispatch.ts";

const USAGE = `Usage: codex-computer-use-mcp-win [--status | --version | --help]
       codex-computer-use-mcp-win print-config --client qoder|dsh|generic
       codex-computer-use-mcp-win doctor [--live]
       codex-computer-use-mcp-win allow list
       codex-computer-use-mcp-win allow add <app...>
       codex-computer-use-mcp-win allow remove <app...>

Runs a stdio MCP server that exposes OpenAI's signed Windows Computer Use
helper through a persistent, sandboxed JavaScript session.

Environment:
  CODEX_COMPUTER_USE_HOME  state directory (default: %LOCALAPPDATA%\\codex-computer-use-mcp-win)
  CODEX_HOME               Codex state directory (default: ~/.codex)

Configuration: <state>/config.json
  approval              "auto" | "mcp" | "deny" (default: auto)
  elicitationFallback   "auto" | "deny" (default: auto)
  verifySignatures      boolean (default: true)
  denyApps              apps that are always refused; * is a wildcard
  allowApps             apps approved without a prompt; exact unless it contains *
  helperPath / codexPath / codexHome
  helperTimeoutMs / sessionIdleMs / maxScreenshotBytes / maxTextBytes
`;

function printAndExit(text: string, code = 0): void {
	process.stdout.write(text.endsWith("\n") ? text : `${text}\n`, () => process.exit(code));
}

async function allowCommand(rest: string[]): Promise<void> {
	const [operation, ...values] = rest;
	const stateRoot = defaultStateRoot();
	try {
		if (operation === "list") {
			printAndExit(JSON.stringify({ file: configPath(stateRoot), allowApps: await readConfigList(stateRoot, "allowApps") }, null, 2));
			return;
		}
		if (operation === "add" || operation === "remove") {
			printAndExit(JSON.stringify(await updateConfigList(stateRoot, "allowApps", operation, values), null, 2));
			return;
		}
		console.error("Usage: codex-computer-use-mcp-win allow list|add|remove [app...]");
		process.exit(1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

async function printStatus(): Promise<void> {
	const session = new ComputerUseSession();
	const status = await session.status();
	await session.close().catch(() => undefined);
	printAndExit(JSON.stringify(status, null, 2), 0);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	if (args.length === 3 && args[0] === "print-config" && args[1] === "--client") {
		printAndExit(clientConfiguration(args[2])); return;
	}
	if (args[0] === "allow") {
		await allowCommand(args.slice(1)); return;
	}
	if ((args.length === 1 || args.length === 2 && args[1] === "--live") && args[0] === "doctor") {
		const session = new ComputerUseSession();
		let report: Record<string, unknown>;
		let exitCode = 1;
		try {
			const status = await session.status();
			const live = args.includes("--live") && status.ready ? await session.execute("js", {code: "nodeRepl.write(JSON.stringify({windowCount:(await sky.list_windows()).length}));"}) : null;
			report = {discovery: status, liveProbe: live, interactiveClient: "not_tested", mcpHandshake: "not_tested", appApproval: "not_tested", browserDomainPolicy: "unrestricted-http-https", tools: [...CUA_TOOL_DEFINITIONS, STATUS_TOOL_DEFINITION, ...desktopToolDefinitions(), ...browserToolDefinitions()].map(tool => tool.name)};
			exitCode = status.ready && !live?.isError ? 0 : 1;
		} finally { await session.close(); }
		printAndExit(JSON.stringify(report, null, 2), exitCode);
		return;
	}
	if (args.length > 0) {
		if (args.length === 1 && args[0] === "--status") {
			await printStatus();
			return;
		}
		if (args.length === 1 && args[0] === "--version") {
			printAndExit(PACKAGE_VERSION);
			return;
		}
		if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
			printAndExit(USAGE);
			return;
		}
		console.error(USAGE);
		process.exit(1);
	}

	const serverOptions: ServerOptions = {
		capabilities: { tools: {} },
		instructions: SERVER_INSTRUCTIONS,
	};
	const server = new Server(
		{ name: "codex-computer-use-mcp-win", version: PACKAGE_VERSION },
		serverOptions,
	);
	const codexBrowser = new CodexComputerUseBrowser();
	const session = new ComputerUseSession({
		onElicitation: (request, options) => requestApprovalFromMcpClient(
			{ elicitInput: (params, requestOptions) => server.elicitInput(params, requestOptions) },
			request,
			options?.signal,
		),
	});
	let closing = false;
	const close = async (): Promise<void> => {
		if (closing) return;
		closing = true;
		await session.close().catch((error) => {
			console.error(`[computer-use] close failed: ${error instanceof Error ? error.message : String(error)}`);
		});
		await codexBrowser.close().catch((error) => {
			console.error(`[browser] close failed: ${error instanceof Error ? error.message : String(error)}`);
		});
	};
	server.onclose = () => { void close(); };

	server.setRequestHandler(ListToolsRequestSchema, () => Promise.resolve({
		tools: [...CUA_TOOL_DEFINITIONS, STATUS_TOOL_DEFINITION, ...desktopToolDefinitions(), ...browserToolDefinitions()],
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
		const name = request.params.name;
		if (name === STATUS_TOOL_DEFINITION.name) {
			const status = await session.status();
			return {
				content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
				structuredContent: status as unknown as Record<string, unknown>,
			};
		}
		if (isBrowserTool(name)) {
			const response = await dispatchBrowser(name, request.params.arguments ?? {}, session, codexBrowser, extra.signal);
			return { ...response, content: response.content as CallToolResult["content"] };
		}
		if (!isCuaReplTool(name) && !isDesktopTool(name) && !isBrowserTool(name)) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
		try {
			const args = z.record(z.string(), z.json()).parse(request.params.arguments ?? {}) as JsonObject;
			const response = isDesktopTool(name)
				? await session.execute("js", {code: desktopToolCode(name, args)}, {signal: extra.signal})
				: await session.execute(name as CuaReplTool, args, { signal: extra.signal });
			if (isDesktopTool(name) && !response.isError) {
				const first = response.content.find(block => block.type === "text");
				if (first?.type === "text") {
					try { response.structuredContent = { ...response.structuredContent, result: JSON.parse(first.text) }; } catch {}
				}
			}
			const result: CallToolResult = {
				content: response.content as CallToolResult["content"],
				isError: response.isError,
			};
			if (response.structuredContent) result.structuredContent = response.structuredContent;
			return result;
		} catch (error) {
			return {
				content: [{ type: "text", text: error instanceof Error ? error.message : "Computer Use failed" }],
				structuredContent: { error: serializeError(error, { action_sent: "not_sent", retry: "never" }) },
				isError: true,
			};
		}
	});

	const shutdown = (signal: string): void => {
		console.error(`[computer-use] received ${signal}; closing`);
		void close().finally(() => process.exit(0));
	};
	process.once("SIGINT", () => shutdown("SIGINT"));
	process.once("SIGTERM", () => shutdown("SIGTERM"));
	process.once("SIGBREAK", () => shutdown("SIGBREAK"));

	await server.connect(new StdioServerTransport());
}

await main();
