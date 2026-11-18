import { z } from "zod";

const webpage = z.string().min(1).max(16_384).refine(value => {
	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}, "A valid http:// or https:// webpage URL is required");

const windowTarget = { app: z.string().trim().min(1).optional(), window_id: z.number().int().nonnegative().optional() };
export const browserSchemas = {
	browser_open: z.object({ url: webpage, reuse_existing: z.boolean().default(false), ...windowTarget }).strict(),
	browser_new_tab: z.object({ url: webpage.optional(), ...windowTarget }).strict(),
	browser_tabs: z.object(windowTarget).strict(),
	browser_navigate: z.object({ tab_id: z.string().min(1).optional(), url: webpage, ...windowTarget }).strict(),
	browser_read: z.object({
		tab_id: z.string().min(1).optional(),
		read_all: z.boolean().default(false),
		max_chars: z.number().int().min(256).max(200_000).default(100_000),
		...windowTarget,
	}).strict(),
};

export type BrowserTool = keyof typeof browserSchemas;
export function isBrowserTool(name: string): name is BrowserTool {
	return Object.hasOwn(browserSchemas, name);
}

const descriptions: Record<BrowserTool, string> = {
	browser_open: "Open any HTTP(S) webpage using Computer Use. app/window_id selects a native browser window; without Codex context the native route defaults to Edge. Navigation sent is not proof of loading. No domain allowlist.",
	browser_new_tab: "Create a tab using Computer Use, optionally navigating to an HTTP(S) URL. app/window_id selects the native window route; official helper refusals are returned without retry.",
	browser_tabs: "With a native window target, read its visible accessibility tree (not a complete tab inventory). With official in-app context, list its managed tabs. Does not launch or activate a native browser.",
	browser_navigate: "Navigate via Computer Use. Supply app/window_id for a native window or tab_id for an official in-app tab. These identifiers are not interchangeable.",
	browser_read: "Read exposed accessibility text. app/window_id selects a native window; tab_id/read_all requires official in-app context. Native reads do not launch or activate windows, and helper URL denials remain errors.",
};

export function browserToolDefinitions() {
	return (Object.keys(browserSchemas) as BrowserTool[]).map(name => {
		const { $schema, ...inputSchema } = z.toJSONSchema(browserSchemas[name], { io: "input" });
		return {
			name,
			description: descriptions[name],
			inputSchema,
			annotations: {
				readOnlyHint: name === "browser_tabs" || name === "browser_read",
				destructiveHint: name === "browser_navigate" || name === "browser_open" || name === "browser_new_tab",
				openWorldHint: true,
			},
		};
	});
}

export type BrowserInput = {
	app?: string;
	window_id?: number;
	tab_id?: string;
	read_all?: boolean;
	url?: string;
	reuse_existing?: boolean;
	max_chars?: number;
};

export function nativeBrowserCode(name: BrowserTool, input: BrowserInput): string {
	return `nodeRepl.write(JSON.stringify(await sky.${name}(${JSON.stringify(input)})));`;
}
