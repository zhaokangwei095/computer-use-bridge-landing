import path from "node:path";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ElicitRequestParamsSchema, type ElicitRequestParams, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "./config.ts";
import { effectiveDenyApps } from "./config.ts";
import { ApprovalDeniedError } from "./errors.ts";

export interface HelperApprovalRequest {
	app: string;
	displayName: string;
	riskLevel?: "low" | "high";
	allowPersistentApproval?: boolean;
}

export type ApprovalDecision = "accept" | "decline" | "cancel";

export interface ElicitationClient {
	elicitInput(params: ElicitRequestParams, options?: RequestOptions): Promise<ElicitResult>;
}

function normalizeApp(value: string): string {
	let normalized = value.trim().toLowerCase();
	if (normalized.startsWith("process:")) normalized = normalized.slice("process:".length);
	normalized = normalized.replace(/!app$/i, "");
	return normalized;
}

export function appIdentityCandidates(app: string): string[] {
	const normalized = normalizeApp(app);
	if (!normalized) return [];
	const values = new Set<string>([
		normalized,
		path.win32.basename(normalized),
		normalized.replace(/\.exe$/i, ""),
	]);
	return [...values].filter(Boolean);
}

export function appCandidates(app: string, displayName?: string): string[] {
	const values = new Set<string>(appIdentityCandidates(app));
	if (displayName) {
		const display = displayName.trim().toLowerCase();
		if (display) {
			values.add(display);
			values.add(display.replace(/\s+/g, ""));
		}
	}
	return [...values].filter(Boolean);
}

function stripExe(value: string): string {
	return value.replace(/\.exe$/i, "");
}

function globMatch(value: string, pattern: string): boolean {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`, "i").test(value);
}

function matchesPattern(candidates: string[], pattern: string): boolean {
	const wanted = pattern.trim().toLowerCase();
	if (!wanted) return false;
	const wantedBase = path.win32.basename(wanted);
	const wantedStem = stripExe(wantedBase);
	const wildcard = wanted.includes("*");
	return candidates.some((candidate) => {
		const candidateBase = path.win32.basename(candidate);
		const candidateStem = stripExe(candidateBase);
		if (wildcard) {
			return [candidate, candidateBase, candidateStem].some((value) => globMatch(value, wanted) || globMatch(value, wantedBase));
		}
		return candidate === wanted ||
			candidate === wantedBase ||
			candidateBase === wantedBase ||
			(wantedStem !== "" && candidateStem === wantedStem);
	});
}

/**
 * Pre-approval matching is exact on purpose: a full path covers only that
 * location, a bare executable name or app id covers every location of that
 * identity, and display names are ignored because they are spoofable. Write an
 * explicit `*` to opt into broader matching.
 */
function matchesAllowedApp(app: string, pattern: string): boolean {
	const wanted = pattern.trim().toLowerCase().replace(/^process:/, "").replace(/!app$/i, "");
	if (!wanted) return false;
	const identity = appCandidates(app);
	if (/[\\/]/.test(wanted) && !wanted.includes("*")) {
		const normalized = path.win32.normalize(wanted);
		return identity.some((candidate) => /[\\/]/.test(candidate) && path.win32.normalize(candidate) === normalized);
	}
	if (wanted.includes("*")) return matchesPattern(identity, wanted);
	const wantedBase = path.win32.basename(wanted);
	const wantedStem = stripExe(wantedBase);
	return identity.includes(wanted) || identity.includes(wantedBase) || identity.includes(wantedStem);
}

function denialReason(candidates: string[], denyPatterns: string[]): string | null {
	// Deny matching may use display names as extra evidence.
	if (denyPatterns.some((pattern) => matchesPattern(candidates, pattern))) return "the app is on the deny list";
	return null;
}

export function isAppDenied(app: string, displayName: string | undefined, denyPatterns: string[]): boolean {
	return denialReason(appCandidates(app, displayName), denyPatterns) !== null;
}

export function isAppPreApproved(app: string, allowPatterns: string[]): boolean {
	return allowPatterns.some((pattern) => matchesAllowedApp(app, pattern));
}

export interface ApprovalControllerOptions {
	mode: AppConfig["approval"];
	fallback: AppConfig["elicitationFallback"];
	denyApps: string[];
	allowApps: string[];
	elicit?: (request: HelperApprovalRequest, options?: RequestOptions) => Promise<ApprovalDecision>;
	label?: (request: HelperApprovalRequest) => string;
}

/**
 * Decides whether an app may be controlled. The deny list is a hard floor. A
 * matching allow-list entry is pre-approved, so it skips the configured mode;
 * everything else follows `auto` / `mcp` / `deny`. In mcp mode, one accepted
 * approval is remembered for the life of the server process; the helper still
 * receives its own retry metadata for each request that it gates.
 */
export class ApprovalController {
	readonly mode: AppConfig["approval"];
	readonly fallback: AppConfig["elicitationFallback"];
	private readonly denyApps: string[];
	private readonly allowApps: string[];
	private readonly elicit?: ApprovalControllerOptions["elicit"];
	private readonly label: (request: HelperApprovalRequest) => string;
	private readonly approved = new Set<string>();

	constructor(options: ApprovalControllerOptions) {
		this.mode = options.mode;
		this.fallback = options.fallback;
		this.denyApps = options.denyApps;
		this.allowApps = options.allowApps;
		this.elicit = options.elicit;
		this.label = options.label ?? ((request) => request.displayName || request.app);
	}

	static fromConfig(config: AppConfig, options: Omit<ApprovalControllerOptions, "mode" | "fallback" | "denyApps" | "allowApps"> = {}): ApprovalController {
		return new ApprovalController({
			mode: config.approval,
			fallback: config.elicitationFallback,
			denyApps: effectiveDenyApps(config),
			allowApps: config.allowApps,
			...options,
		});
	}

	assertAllowed(app: string, displayName?: string): void {
		const name = displayName || app;
		const reason = denialReason(appCandidates(app, displayName), this.denyApps);
		if (reason) throw new ApprovalDeniedError(app, name, reason);
	}

	/** Throws unless the app may be driven. Returns the decision for audit. */
	async approve(request: HelperApprovalRequest, options?: RequestOptions): Promise<ApprovalDecision> {
		this.assertAllowed(request.app, request.displayName);
		if (this.approved.has(request.app)) return "accept";
		if (isAppPreApproved(request.app, this.allowApps)) {
			this.approved.add(request.app);
			return "accept";
		}
		if (this.mode === "deny") {
			throw new ApprovalDeniedError(request.app, request.displayName, "approval mode is deny");
		}
		if (this.mode === "auto") {
			this.approved.add(request.app);
			return "accept";
		}
		if (!this.elicit) {
			if (this.fallback === "auto") {
				this.approved.add(request.app);
				return "accept";
			}
			throw new ApprovalDeniedError(request.app, request.displayName, "the MCP client does not support approval prompts");
		}
		let decision: ApprovalDecision;
		try {
			decision = await this.elicit(request, options);
		} catch {
			if (this.fallback === "auto") {
				this.approved.add(request.app);
				return "accept";
			}
			throw new ApprovalDeniedError(request.app, request.displayName, "the approval prompt failed");
		}
		if (decision !== "accept") {
			throw new ApprovalDeniedError(request.app, request.displayName, decision === "cancel" ? "the approval prompt was cancelled" : "the user declined");
		}
		this.approved.add(request.app);
		return "accept";
	}

	markApproved(app: string): void {
		this.approved.add(app);
	}

	clearApprovals(): void {
		this.approved.clear();
	}

	get approvedApps(): string[] {
		return [...this.approved];
	}
}

function promptLabel(value: string): string {
	const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
	return cleaned.slice(0, 200);
}

export function buildApprovalElicitationParams(request: HelperApprovalRequest): ElicitRequestParams | undefined {
	const label = promptLabel(request.displayName || request.app) || promptLabel(request.app) || "the requested application";
	const lines = [
		`Allow Computer Use to control ${JSON.stringify(label)}?`,
		`App id: ${JSON.stringify(promptLabel(request.app))}`,
	];
	if (request.riskLevel) lines.push(`Risk level: ${request.riskLevel}`);
	lines.push("Only approve this if you recognize the application and expect an agent to control it.");
	const params = {
		mode: "form" as const,
		message: lines.join("\n"),
		requestedSchema: {
			type: "object",
			properties: {
				approve: {
					type: "boolean",
					title: "Allow this app",
					description: "Allow Computer Use to inspect and control this app for the rest of this session.",
					default: false,
				},
			},
			required: ["approve"],
			additionalProperties: false,
		},
	};
	const parsed = ElicitRequestParamsSchema.safeParse(params);
	return parsed.success ? parsed.data : undefined;
}
