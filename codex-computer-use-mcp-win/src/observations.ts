import { randomUUID } from "node:crypto";
import { serializeError, withErrorContext } from "./error-envelope.ts";
import { HelperError } from "./errors.ts";
import type { HelperWindow } from "./helper-client.ts";
import type { Sky } from "./sky.ts";
import type { ObserveInput, ElementInput } from "./desktop-tools.ts";

export class Observations {
	private epoch = randomUUID();
	private revision = 0;
	private snapshots = new Map<string, {
		id: string;
		readable: boolean;
		screenshots: Map<string, { width?: number; height?: number }>;
	}>();
	constructor(private readonly sky: Sky) {}
	private key(window: HelperWindow): string { return JSON.stringify([window.app, window.id]); }
	invalidate(reset = false): void {
		this.revision++;
		this.snapshots.clear();
		if (reset) this.epoch = randomUUID();
	}
	private stale(): Error {
		const error = new HelperError("STALE_STATE", "The observation is stale, belongs to another window/session, or has no accessibility tree. Observe the window again.");
		return withErrorContext(error, { action_sent: "not_sent", retry: "reobserve" });
	}
	async observe(input: ObserveInput) {
		const pending = this.sky.get_window_state({ window: input.window, include_text: true, include_screenshot: input.screenshot });
		const revision = this.revision;
		const state = await pending;
		if (revision !== this.revision) throw this.stale();
		const fullText = state.accessibility?.tree ?? "";
		const selected = input.find ? fullText.split(/\r?\n/).filter(line => line.toLocaleLowerCase().includes(input.find!.toLocaleLowerCase())).join("\n") : fullText;
		const snapshot_id = randomUUID();
		const readable = fullText.trim().length > 0;
		const screenshots = new Map(state.screenshots.filter(screenshot => screenshot.url).map(screenshot => [
			screenshot.id,
			{ width: screenshot.width, height: screenshot.height },
		]));
		this.snapshots.set(this.key(state.window), { id: snapshot_id, readable, screenshots });
		return {
			window: state.window, snapshot_id, session_epoch: this.epoch,
			accessibility_available: readable,
			accessibility_status: readable ? "available" : "unavailable",
			interaction_mode: readable ? "elements" : screenshots.size > 0 ? "screenshot" : "needs_screenshot",
			recommended_tool: readable ? "click_element" : screenshots.size > 0 ? "click_screenshot_point" : "observe_window",
			verification_level: readable ? "text" : screenshots.size > 0 ? "visual" : "none",
			text: selected.slice(0, input.max_chars),
			truncated: selected.length > input.max_chars || fullText.includes("...[truncated by"), max_chars: input.max_chars,
			matched: input.find ? selected.length > 0 : null,
			screenshots: state.screenshots.map(({ url, ...metadata }) => ({ ...metadata, available: Boolean(url) })),
			note: "References belong only to this observation. External user/UI changes may still invalidate them; the helper's policies remain authoritative.",
		};
	}
	async act(kind: "click" | "set", input: ElementInput & { value?: string }) {
		const snapshot = this.snapshots.get(this.key(input.window));
		if (input.session_epoch !== this.epoch || snapshot?.id !== input.snapshot_id || !snapshot.readable) throw this.stale();
		if (kind === "click") await this.sky.click({ window: input.window, element_index: input.element_index });
		else await this.sky.set_value({ window: input.window, element_index: input.element_index, value: input.value! });
		const action = { action_sent: "sent" as const, verified: false };
		if (!input.observe_after) return { action, observation: { status: "not_requested" } };
		try {
			return { action, observation: { status: "ok", ...await this.observe({ window: input.window, screenshot: false, max_chars: 24000 }) } };
		} catch (error) {
			return { action, observation: { status: "unavailable", error: serializeError(error, { action_sent: "not_applicable", retry: "reobserve" }) } };
		}
	}
	async clickScreenshot(input: {
		window: HelperWindow;
		snapshot_id: string;
		session_epoch: string;
		screenshot_id: string;
		x: number;
		y: number;
		click_count: number;
		mouse_button: "left" | "right" | "middle";
		observe_after: boolean;
	}) {
		const snapshot = this.snapshots.get(this.key(input.window));
		if (
			input.session_epoch !== this.epoch ||
			snapshot?.id !== input.snapshot_id ||
			!snapshot.screenshots.has(input.screenshot_id)
		) throw this.stale();
		const screenshot = snapshot.screenshots.get(input.screenshot_id)!;
		if (
			(typeof screenshot.width === "number" && input.x >= screenshot.width) ||
			(typeof screenshot.height === "number" && input.y >= screenshot.height)
		) throw new TypeError(`Screenshot point (${input.x}, ${input.y}) is outside ${screenshot.width ?? "?"}x${screenshot.height ?? "?"}`);
		await this.sky.click({
			window: input.window,
			x: input.x,
			y: input.y,
			screenshotId: input.screenshot_id,
			click_count: input.click_count,
			mouse_button: input.mouse_button,
		});
		const action = {
			action_sent: "sent" as const,
			verified: false,
			verification_mode: "screenshot" as const,
			screenshot_id: input.screenshot_id,
		};
		if (!input.observe_after) return { action, observation: { status: "not_requested" } };
		try {
			return {
				action,
				observation: {
					status: "ok",
					...await this.observe({ window: input.window, screenshot: true, max_chars: 24000 }),
				},
			};
		} catch (error) {
			return {
				action,
				observation: {
					status: "unavailable",
					error: serializeError(error, { action_sent: "not_applicable", retry: "reobserve" }),
				},
			};
		}
	}
	async typeText(input: {
		window: HelperWindow;
		snapshot_id: string;
		session_epoch: string;
		text: string;
		observe_after: boolean;
	}) {
		const snapshot = this.snapshots.get(this.key(input.window));
		if (input.session_epoch !== this.epoch || snapshot?.id !== input.snapshot_id) throw this.stale();
		await this.sky.type_text({window: input.window, text: input.text});
		const action = {
			action_sent: "sent" as const,
			verified: false,
			verification_mode: snapshot.readable ? "text" as const : "screenshot" as const,
			characters: input.text.length,
		};
		if (!input.observe_after) return {action, observation: {status: "not_requested"}};
		try {
			return {
				action,
				observation: {
					status: "ok",
					...await this.observe({window: input.window, screenshot: !snapshot.readable, max_chars: 24000}),
				},
			};
		} catch (error) {
			return {
				action,
				observation: {status: "unavailable", error: serializeError(error, {action_sent: "not_applicable", retry: "reobserve"})},
			};
		}
	}
}
