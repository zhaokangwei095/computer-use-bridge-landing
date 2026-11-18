import { randomUUID } from "node:crypto";
import { serializeError, withErrorContext } from "./error-envelope.ts";
import { HelperError } from "./errors.ts";
import type { HelperWindow } from "./helper-client.ts";
import type { Sky } from "./sky.ts";
import type { ObserveInput, ElementInput } from "./desktop-tools.ts";

export class Observations {
	private epoch = randomUUID();
	private revision = 0;
	private snapshots = new Map<string, { id: string; readable: boolean }>();
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
		this.snapshots.set(this.key(state.window), { id: snapshot_id, readable: fullText.trim().length > 0 });
		return {
			window: state.window, snapshot_id, session_epoch: this.epoch,
			accessibility_available: fullText.trim().length > 0, text: selected.slice(0, input.max_chars),
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
}
