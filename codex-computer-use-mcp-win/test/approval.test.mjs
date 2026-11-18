import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	appCandidates,
	ApprovalController,
	buildApprovalElicitationParams,
	isAppDenied,
	isAppPreApproved,
} from "../dist/approval.js";
import { DEFAULT_DENY_APPS } from "../dist/config.js";
import { requestApprovalFromMcpClient } from "../dist/mcp-elicitation.js";

const APP = "process:C:\\Windows\\System32\\notepad.exe";

function controller(overrides = {}) {
	return new ApprovalController({
		mode: "auto",
		fallback: "auto",
		denyApps: [],
		allowApps: [],
		...overrides,
	});
}

describe("app matching", () => {
	test("normalizes process paths, basenames, and display names", () => {
		const candidates = appCandidates(APP, "Note Pad");
		assert.ok(candidates.includes("c:\\windows\\system32\\notepad.exe"));
		assert.ok(candidates.includes("notepad.exe"));
		assert.ok(candidates.includes("notepad"));
		assert.ok(candidates.includes("note pad"));
		assert.ok(candidates.includes("notepad"));
	});

	test("matches executable stems in both directions", () => {
		assert.equal(isAppDenied("cmd", undefined, ["cmd.exe"]), true);
		assert.equal(isAppDenied("C:\\Windows\\System32\\CMD.EXE", undefined, ["cmd"]), true);
		assert.equal(isAppDenied(APP, "Notepad", DEFAULT_DENY_APPS), false);
		assert.equal(isAppDenied("process:C:\\Windows\\System32\\WindowsTerminal.exe", "Terminal", DEFAULT_DENY_APPS), true);
		assert.equal(isAppDenied("OpenAI.Codex_2p2nqsd0c76g0!App", undefined, DEFAULT_DENY_APPS), true);
	});

	test("deny patterns support an explicit wildcard and nothing implicit", () => {
		assert.equal(isAppDenied("C:\\Temp\\steam-helper.exe", undefined, ["steam*"]), true);
		assert.equal(isAppDenied("C:\\Temp\\notepad-helper.exe", undefined, ["notepad.exe"]), false);
		assert.equal(isAppDenied("C:\\Temp\\notepadx.exe", undefined, ["notepad.exe"]), false);
	});

	test("deny list still wins over a matching pre-approval", () => {
		const denied = controller({denyApps: ["notepad.exe"], allowApps: ["notepad.exe"]});
		assert.throws(() => denied.assertAllowed(APP, "Notepad"), error => error.code === "APPROVAL_DENIED");
	});

	test("allow list pre-approves without blocking other apps", async () => {
		const approval = controller({allowApps: ["notepad.exe"]});
		assert.equal(await approval.approve({app: APP, displayName: "Notepad"}), "accept");
		assert.equal(await approval.approve({app: "calc.exe", displayName: "Calculator"}), "accept");
		assert.doesNotThrow(() => approval.assertAllowed("calc.exe", "Calculator"));
	});

	test("allow list skips the client prompt in mcp mode", async () => {
		let prompts = 0;
		const approval = controller({
			mode: "mcp",
			allowApps: ["notepad.exe"],
			elicit: async () => { prompts += 1; return "accept"; },
		});
		assert.equal(await approval.approve({app: APP, displayName: "Notepad"}), "accept");
		assert.equal(prompts, 0);
		assert.equal(await approval.approve({app: "calc.exe", displayName: "Calculator"}), "accept");
		assert.equal(prompts, 1);
	});

	test("allow list is the only path through deny mode", async () => {
		const approval = controller({mode: "deny", allowApps: ["notepad.exe"]});
		assert.equal(await approval.approve({app: APP, displayName: "Notepad"}), "accept");
		await assert.rejects(
			() => approval.approve({app: "calc.exe", displayName: "Calculator"}),
			error => error.code === "APPROVAL_DENIED",
		);
	});

	test("allow list matches bare app ids and executable stems", () => {
		const allow = ["chrome.exe"];
		assert.equal(isAppPreApproved("process:C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", allow), true);
		assert.equal(isAppPreApproved("Chrome", allow), true);
		assert.equal(isAppPreApproved("D:/Other/chrome-helper.exe", allow), false);
		assert.equal(isAppPreApproved("Microsoft.WindowsCalculator_8wekyb3d8bbwe!App", ["Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"]), true);
		assert.equal(isAppPreApproved("Microsoft.WindowsCalculator_8wekyb3d8bbwe!Other", ["Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"]), false);
	});

	test("an allow path covers only that exact location", () => {
		const allow = ["C:/Trusted/notepad.exe"];
		assert.equal(isAppPreApproved("process:C:\\Trusted\\notepad.exe", allow), true);
		assert.equal(isAppPreApproved("D:/Other/notepad.exe", allow), false);
		assert.equal(isAppPreApproved("notepad.exe", allow), false);
	});

	test("pre-approval never uses a display name", () => {
		assert.equal(isAppPreApproved("C:\\temp\\evil.exe", ["notepad.exe"]), false);
	});

	test("assertAllowed reports the actual reason", () => {
		const denied = controller({ denyApps: ["notepad.exe"] });
		assert.throws(() => denied.assertAllowed(APP, "Notepad"), (error) => {
			assert.equal(error.code, "APPROVAL_DENIED");
			assert.match(error.message, /deny list/);
			return true;
		});
		const notListed = controller({ allowApps: ["calculator.exe"] });
		assert.doesNotThrow(() => notListed.assertAllowed(APP, "Notepad"));
	});
});

describe("ApprovalController", () => {
	test("auto approves once and caches per app", async () => {
		const approval = controller();
		assert.equal(await approval.approve({ app: APP, displayName: "Notepad" }), "accept");
		assert.equal(await approval.approve({ app: APP, displayName: "Notepad" }), "accept");
		assert.deepEqual(approval.approvedApps, [APP]);
	});

	test("deny refuses even when the app is otherwise allowed", async () => {
		const approval = controller({ mode: "deny" });
		await assert.rejects(
			() => approval.approve({ app: APP, displayName: "Notepad" }),
			(error) => error.code === "APPROVAL_DENIED" && /approval mode is deny/.test(error.message),
		);
	});

	test("mcp mode asks the client once per app", async () => {
		let calls = 0;
		const approval = controller({
			mode: "mcp",
			elicit: async () => {
				calls += 1;
				return "accept";
			},
		});
		assert.equal(await approval.approve({ app: APP, displayName: "Notepad" }), "accept");
		assert.equal(await approval.approve({ app: APP, displayName: "Notepad" }), "accept");
		assert.equal(calls, 1);
	});

	test("mcp mode maps decline and cancel to approval errors", async () => {
		for (const decision of ["decline", "cancel"]) {
			const approval = controller({ mode: "mcp", elicit: async () => decision });
			await assert.rejects(
				() => approval.approve({ app: APP, displayName: "Notepad" }),
				(error) => error.code === "APPROVAL_DENIED",
			);
		}
	});

	test("mcp mode falls back according to configuration", async () => {
		const fallbackAuto = controller({
			mode: "mcp",
			fallback: "auto",
			elicit: async () => { throw new Error("no elicitation"); },
		});
		assert.equal(await fallbackAuto.approve({ app: APP, displayName: "Notepad" }), "accept");

		const fallbackDeny = controller({
			mode: "mcp",
			fallback: "deny",
			elicit: async () => { throw new Error("no elicitation"); },
		});
		await assert.rejects(
			() => fallbackDeny.approve({ app: APP, displayName: "Notepad" }),
			(error) => error.code === "APPROVAL_DENIED",
		);
	});

	test("elicitation adapter failures reach the configured fallback", async () => {
		for (const fallback of ["auto", "deny"]) {
			const approval = controller({
				mode: "mcp", fallback,
				elicit: (request, options) => requestApprovalFromMcpClient({
					elicitInput: async () => { throw new Error("Client does not support elicitation"); },
				}, request, options?.signal),
			});
			if (fallback === "auto") assert.equal(await approval.approve({ app: APP, displayName: "Notepad" }), "accept");
			else await assert.rejects(() => approval.approve({ app: APP, displayName: "Notepad" }), error => error.code === "APPROVAL_DENIED");
		}
	});

	test("explicit cancellation never uses the auto fallback", async () => {
		const approval = controller({
			mode: "mcp", fallback: "auto",
			elicit: request => requestApprovalFromMcpClient({elicitInput: async () => ({action: "cancel"})}, request),
		});
		await assert.rejects(() => approval.approve({app: APP, displayName: "Notepad"}), error => error.code === "APPROVAL_DENIED");
		assert.deepEqual(approval.approvedApps, []);
	});

	test("no elicitation support follows the fallback", async () => {
		const auto = controller({ mode: "mcp", fallback: "auto" });
		assert.equal(await auto.approve({ app: APP, displayName: "Notepad" }), "accept");
		const deny = controller({ mode: "mcp", fallback: "deny" });
		await assert.rejects(
			() => deny.approve({ app: APP, displayName: "Notepad" }),
			(error) => error.code === "APPROVAL_DENIED" && /does not support approval prompts/.test(error.message),
		);
	});

	test("markApproved and clearApprovals manage the cache", async () => {
		const approval = controller({ mode: "mcp", fallback: "deny" });
		approval.markApproved(APP);
		assert.equal(await approval.approve({ app: APP, displayName: "Notepad" }), "accept");
		approval.clearApprovals();
		await assert.rejects(() => approval.approve({ app: APP, displayName: "Notepad" }));
	});
});

describe("elicitation", () => {
	test("an aborted prompt cannot become an auto approval", async () => {
		const abort = new AbortController();
		const approval = controller({
			mode: "mcp", fallback: "auto",
			elicit: (request, options) => requestApprovalFromMcpClient({
				elicitInput: async () => { abort.abort(); throw new Error("aborted"); },
			}, request, options?.signal),
		});
		await assert.rejects(() => approval.approve({app: APP, displayName: "Notepad"}, {signal: abort.signal}), error => error.code === "APPROVAL_DENIED");
		assert.deepEqual(approval.approvedApps, []);
	});

	test("builds a form that includes the app id and sanitizes display text", () => {
		const params = buildApprovalElicitationParams({
			app: APP,
			displayName: "Evil\nName\u0000With\u0007Controls",
			riskLevel: "high",
		});
		assert.ok(params);
		assert.equal(params.mode, "form");
		assert.match(params.message, /Evil Name With Controls/);
		assert.match(params.message, /App id:/);
		assert.match(params.message, /Risk level: high/);
		assert.equal(params.requestedSchema.required[0], "approve");
	});

	test("accepts only an explicit approve=true response", async () => {
		const client = (response) => ({ elicitInput: async () => response });
		assert.equal(await requestApprovalFromMcpClient(client({ action: "accept", content: { approve: true } }), {
			app: APP, displayName: "Notepad",
		}), "accept");
		assert.equal(await requestApprovalFromMcpClient(client({ action: "accept", content: { approve: false } }), {
			app: APP, displayName: "Notepad",
		}), "decline");
		assert.equal(await requestApprovalFromMcpClient(client({ action: "accept", content: null }), {
			app: APP, displayName: "Notepad",
		}), "decline");
		assert.equal(await requestApprovalFromMcpClient(client({ action: "decline" }), {
			app: APP, displayName: "Notepad",
		}), "decline");
		assert.equal(await requestApprovalFromMcpClient(client({ action: "cancel" }), {
			app: APP, displayName: "Notepad",
		}), "cancel");
		await assert.rejects(() => requestApprovalFromMcpClient({ elicitInput: async () => { throw new Error("nope"); } }, {
			app: APP, displayName: "Notepad",
		}), /nope/);
	});
});
