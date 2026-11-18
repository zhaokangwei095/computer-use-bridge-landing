import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCodexHome, defaultStateRoot } from "./config.ts";

export function clientConfiguration(client: string): string {
	if (!["qoder", "dsh", "generic"].includes(client)) throw new Error("client must be qoder, dsh or generic");
	const serverPath = fileURLToPath(new URL("./mcp-server.js", import.meta.url));
	if (!existsSync(process.execPath) || !existsSync(serverPath)) throw new Error("Node or built MCP server is missing; build the project first");
	const codexHome = path.resolve(defaultCodexHome());
	const stateRoot = path.resolve(defaultStateRoot());
	for (const directory of [codexHome, stateRoot]) {
		if (existsSync(directory) && !statSync(directory).isDirectory()) throw new Error(`State path must be a directory: ${directory}`);
	}
	const server = { command: process.execPath, args: [serverPath], env: { CODEX_HOME: codexHome, CODEX_COMPUTER_USE_HOME: stateRoot } };
	return client === "dsh" ? JSON.stringify([{ insert: [{ id: "mcp-codex-computer-use-win", name: "@deepseek-ai/dsh-mcp-client", config: {serverName: "codex-computer-use-win", transport: "stdio", ...server} }] }], null, 2)
		: JSON.stringify({mcpServers: {"codex-computer-use-win": {type: "stdio", ...server}}}, null, 2);
}
