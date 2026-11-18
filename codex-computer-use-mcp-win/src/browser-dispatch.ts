import { browserSchemas, nativeBrowserCode, type BrowserTool, type BrowserInput } from "./browser-tools.ts";
import type { ComputerUseSession, SessionResponse } from "./session.ts";
import type { CodexComputerUseBrowser } from "./codex-browser.ts";
import { serializeError } from "./error-envelope.ts";

export async function dispatchBrowser(
	name: BrowserTool,
	raw: unknown,
	session: Pick<ComputerUseSession, "execute">,
	official: Pick<CodexComputerUseBrowser, "execute" | "canUseOfficialBrowser">,
	signal?: AbortSignal,
): Promise<SessionResponse> {
	let backend = "native-window";
	let dispatched = false;
	try {
		const input: BrowserInput = browserSchemas[name].parse(raw);
		const explicitWindow = input.app !== undefined || input.window_id !== undefined;
		if (explicitWindow && (input.tab_id !== undefined || input.read_all)) throw new TypeError("Use app/window_id or tab_id/read_all, not both target types.");
		backend = explicitWindow || !official.canUseOfficialBrowser() ? "native-window" : "official-cua";
		if (backend === "native-window" && (input.tab_id !== undefined || input.read_all)) throw new TypeError("tab_id/read_all requires an authorized official in-app browser context. Use app/window_id for native Computer Use.");
		if (signal?.aborted) throw new Error("Browser request cancelled before execution");
		dispatched = true;
		if (backend === "official-cua") {
			const result = { ...await official.execute(name, input, { signal }), backend };
			return { isError: false, content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
		}
		const response = await session.execute("js", { code: nativeBrowserCode(name, input) }, { signal });
		if (response.isError) {
			return { ...response, structuredContent: { ...response.structuredContent, backend } };
		}
		const block = response.content.find(content => content.type === "text");
		if (!block || block.type !== "text") throw new Error("Native browser returned no result");
		const result = JSON.parse(block.text) as Record<string, unknown>;
		return {
			...response, isError: result.ok !== true,
			structuredContent: { ...response.structuredContent, ...result, result },
		};
	} catch (error) {
		const failure = serializeError(error, {
			action_sent: dispatched && ["browser_open", "browser_new_tab", "browser_navigate"].includes(name) ? "possibly_sent" : "not_sent",
			retry: "never",
		});
		const result = { ok: false, backend, error: failure };
		return { isError: true, content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
	}
}
