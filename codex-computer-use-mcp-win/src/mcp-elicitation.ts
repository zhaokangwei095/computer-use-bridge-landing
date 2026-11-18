import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
	buildApprovalElicitationParams,
	type ApprovalDecision,
	type ElicitationClient,
	type HelperApprovalRequest,
} from "./approval.ts";

/**
 * Ask the MCP client to approve one app. The client must have declared the
 * elicitation capability; otherwise the SDK throws and the approval controller
 * applies its configured fallback.
 */
export async function requestApprovalFromMcpClient(
	client: ElicitationClient,
	request: HelperApprovalRequest,
	signal?: AbortSignal,
): Promise<ApprovalDecision> {
	const params = buildApprovalElicitationParams(request);
	if (!params) return "cancel";
	const options: RequestOptions | undefined = signal ? { signal } : undefined;
	if (signal?.aborted) return "cancel";
	let response;
	try {
		response = await client.elicitInput(params, options);
	} catch (error) {
		if (signal?.aborted) return "cancel";
		throw error;
	}
	if (signal?.aborted) return "cancel";
	if (response.action === "decline") return "decline";
	if (response.action !== "accept") return "cancel";
	const content = response.content;
	if (!content || typeof content !== "object" || Array.isArray(content)) return "decline";
	return (content as Record<string, unknown>).approve === true ? "accept" : "decline";
}
