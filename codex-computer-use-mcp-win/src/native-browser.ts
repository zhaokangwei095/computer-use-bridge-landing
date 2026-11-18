import path from "node:path";
import { browserSchemas, type BrowserTool, type BrowserInput } from "./browser-tools.ts";
import { serializeError } from "./error-envelope.ts";
import type { HelperWindow } from "./helper-client.ts";
import type { Sky } from "./sky.ts";

function appIdentity(app: string): string {
	return path.win32.basename(app.trim().replace(/^process:/i, "").replace(/!app$/i, "")).replace(/\.exe$/i, "").toLowerCase();
}

function matchesApp(actual: string, wanted: string): boolean {
	if (/[\\/]/.test(wanted)) {
		return path.win32.normalize(actual.replace(/^process:/i, "")).toLowerCase() === path.win32.normalize(wanted.replace(/^process:/i, "")).toLowerCase();
	}
	return appIdentity(actual) === appIdentity(wanted);
}

export class NativeComputerUseBrowser {
	private generation = 0;
	constructor(private readonly sky: Sky) {}
	cancel(): void { this.generation++; }

	private choose(windows: HelperWindow[], input: BrowserInput): HelperWindow | undefined {
		if (input.window_id !== undefined) {
			const target = windows.find(window => window.id === input.window_id);
			if (!target || input.app && !matchesApp(target.app, input.app)) throw new Error("Requested browser window does not exist or does not match app; use list_windows.");
			return target;
		}
		const matches = windows.filter(window => matchesApp(window.app, input.app ?? "MSEdge"));
		if (matches.length > 1) throw new Error("Multiple browser windows match; provide window_id from list_windows.");
		return matches[0];
	}

	private async target(input: BrowserInput, mayLaunch: boolean, check: () => void): Promise<HelperWindow> {
		check();
		let window = this.choose(await this.sky.list_windows(), input);
		check();
		if (window) return window;
		if (!mayLaunch) throw new Error("No matching browser window is open; provide app/window_id from list_windows.");
		await this.sky.launch_app({ app: input.app ?? "MSEdge" });
		for (let attempt = 0; attempt < 40; attempt += 1) {
			check();
			window = this.choose(await this.sky.list_windows(), input);
			check();
			if (window) return window;
			await new Promise(resolve => setTimeout(resolve, 250));
		}
		throw new Error("Browser launched but no matching window was found; use list_windows.");
	}

	async execute(name: BrowserTool, raw: unknown): Promise<Record<string, unknown>> {
		const generation = this.generation;
		const check = (): void => {
			if (generation !== this.generation) throw new Error("Browser operation cancelled; no further actions were dispatched.");
		};
		const input: BrowserInput = browserSchemas[name].parse(raw);
		if (input.tab_id !== undefined || input.read_all) throw new TypeError("tab_id/read_all refers to the official in-app browser; native Computer Use supports app/window_id and the visible page only.");
		const base = {
			backend: "native-window",
			operation: name,
			source: "windows-computer-use-accessibility",
			navigation_sent: false,
			new_tab_sent: false,
			navigation_verified: false,
			url_verified: false,
			accessibility_available: false,
			accessibility_status: "not_attempted",
			text: "",
			truncated: false,
			max_chars: input.max_chars ?? 100_000,
			...(input.url ? { requested_url: new URL(/^[a-z][a-z0-9+.-]*:/i.test(input.url) ? input.url : `https://${input.url}`).toString() } : {}),
		};
		let window: HelperWindow | undefined;
		let phase = "select_window";
		let dispatched = false;
		try {
			const writing = ["browser_open", "browser_new_tab", "browser_navigate"].includes(name);
			window = await this.target(input, name === "browser_open" || name === "browser_new_tab", check);
			check();
			if (writing) {
				phase = "activate_window";
				dispatched = true;
				await this.sky.activate_window({ window });
				check();
				if (name === "browser_new_tab" || name === "browser_open" && !input.reuse_existing) {
					phase = "new_tab";
					await this.sky.press_key({ window, key: "Control_L+t" });
					base.new_tab_sent = true;
					check();
				}
				if (base.requested_url) {
					phase = "navigation";
					await this.sky.press_key({ window, key: "Control_L+l" });
					check();
					await this.sky.type_text({ window, text: base.requested_url });
					check();
					await this.sky.press_key({ window, key: "Return" });
					base.navigation_sent = true;
				}
			}
			phase = "get_window_state";
			check();
			const state = await this.sky.get_window_state({ window, include_text: true, include_screenshot: false });
			const text = state.accessibility?.document_text || state.accessibility?.tree || "";
			const readable = text.trim().length > 0;
			return {
				...base, ok: readable, window: state.window,
				accessibility_status: readable ? "available" : "unavailable", accessibility_available: readable,
				text: text.slice(0, base.max_chars), truncated: text.length > base.max_chars || text.includes("...[truncated by"),
				...(name === "browser_tabs" ? { scope: "visible_window_accessibility", complete_tab_inventory: false } : {}),
				...(!readable ? { error: serializeError("The helper returned no accessibility text for this browser window.", { code: "BROWSER_TEXT_UNAVAILABLE", action_sent: "not_applicable", retry: "never", method: phase }) } : {}),
			};
		} catch (error) {
			return {
				...base, ok: false, ...(window ? { window } : {}),
				accessibility_status: phase === "get_window_state" ? "blocked" : "not_attempted",
				error: serializeError(error, { method: phase, action_sent: phase === "get_window_state" ? "not_applicable" : dispatched ? "possibly_sent" : "not_sent", retry: "never" }),
			};
		}
	}
}
