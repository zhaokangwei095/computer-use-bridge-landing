import { types } from "node:util";

export type RetryStrategy = "never" | "reobserve";
export type ActionStatus = "not_applicable" | "not_sent" | "sent" | "possibly_sent";
export interface SerializableError {
	code: string;
	message: string;
	method?: string;
	retry: RetryStrategy;
	action_sent: ActionStatus;
	session_reset: boolean;
	side_effect: "none" | "uncertain";
}

const codes = new Set([
	"DISCOVERY_FAILED", "SIGNATURE_INVALID", "HELPER_START_FAILED", "HELPER_EXITED",
	"HELPER_TIMEOUT", "HELPER_ERROR", "APPROVAL_DENIED", "APP_BLOCKED",
	"JS_TIMEOUT", "JS_ERROR", "CONFIG_ERROR", "CANCELLED", "STALE_STATE",
]);
const mutations = new Set([
	"activate_window", "launch_app", "click", "click_element", "press_key",
	"type_text", "scroll", "set_value", "drag", "perform_secondary_action", "set_value_observed",
]);
const contexts = new WeakMap<Error, Partial<SerializableError>>();

export function isMutation(method: string): boolean {
	return mutations.has(method.replace(/^sky\./, ""));
}

export function withErrorContext(error: unknown, context: Partial<SerializableError>): Error {
	const result = error instanceof Error ? error : new Error(String(error));
	contexts.set(result, { ...context, ...contexts.get(result) });
	return result;
}

function ownValue(error: unknown, key: string): unknown {
	if (!types.isNativeError(error)) return undefined;
	return Object.getOwnPropertyDescriptor(error, key)?.value;
}

export function serializeError(error: unknown, context: Partial<SerializableError> = {}): SerializableError {
	const metadata = types.isNativeError(error) ? contexts.get(error as Error) : undefined;
	const rawCode = ownValue(error, "code");
	const code = context.code ?? (typeof rawCode === "string" && codes.has(rawCode) ? rawCode : "JS_ERROR");
	const methodValue = metadata?.method ?? ownValue(error, "method") ?? ownValue(error, "helperMethod") ?? context.method;
	const method = typeof methodValue === "string" ? methodValue.slice(0, 80) : undefined;
	const rawStatus = metadata?.action_sent ?? ownValue(error, "action_sent") ?? context.action_sent;
	const action_sent = ["not_applicable", "not_sent", "sent", "possibly_sent"].includes(String(rawStatus))
		? rawStatus as ActionStatus
		: method && isMutation(method) ? "possibly_sent" : "not_applicable";
	const messageValue = ownValue(error, "message");
	const message = typeof messageValue === "string" ? messageValue : typeof error === "string" ? error : "JavaScript execution failed";
	const rawRetry = metadata?.retry ?? ownValue(error, "retry") ?? context.retry;
	const retry = rawRetry === "never" || rawRetry === "reobserve" ? rawRetry
		: action_sent === "possibly_sent" || ["HELPER_TIMEOUT", "HELPER_EXITED", "JS_TIMEOUT"].includes(code) ? "reobserve" : "never";
	return {
		code, message: message.slice(0, 4000), ...(method ? { method } : {}), retry, action_sent,
		session_reset: metadata?.session_reset ?? (ownValue(error, "session_reset") === true || context.session_reset === true),
		side_effect: action_sent === "possibly_sent" || action_sent === "sent" ? "uncertain" : "none",
	};
}
