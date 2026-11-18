import { z } from "zod";

const windowSchema = z.object({ app: z.string().min(1), id: z.number().int().nonnegative(), title: z.string().optional() }).strict();
const reference = { window: windowSchema, snapshot_id: z.string().min(1), session_epoch: z.string().min(1), element_index: z.number().int().nonnegative(), observe_after: z.boolean().default(true) };
const screenshotReference = {
	window: windowSchema,
	snapshot_id: z.string().min(1),
	session_epoch: z.string().min(1),
	screenshot_id: z.string().min(1),
	x: z.number().int().nonnegative(),
	y: z.number().int().nonnegative(),
	click_count: z.number().int().min(1).max(3).default(1),
	mouse_button: z.enum(["left", "right", "middle"]).default("left"),
	observe_after: z.boolean().default(true),
};
export const desktopSchemas = {
	list_windows: z.object({}).strict(),
	observe_window: z.object({ window: windowSchema, screenshot: z.boolean().default(false), find: z.string().min(1).max(1000).optional(), max_chars: z.number().int().min(256).max(200000).default(24000) }).strict(),
	click_element: z.object(reference).strict(),
	click_screenshot_point: z.object(screenshotReference).strict(),
	type_text_observed: z.object({
		window: windowSchema,
		snapshot_id: z.string().min(1),
		session_epoch: z.string().min(1),
		text: z.string().max(100000),
		observe_after: z.boolean().default(true),
	}).strict(),
	set_value: z.object({ ...reference, value: z.string().max(100000) }).strict(),
};
export type DesktopTool = keyof typeof desktopSchemas;
export type ObserveInput = z.infer<typeof desktopSchemas.observe_window>;
export type ElementInput = z.infer<typeof desktopSchemas.click_element>;

export function isDesktopTool(name: string): name is DesktopTool {
	return Object.hasOwn(desktopSchemas, name);
}

const descriptions: Record<DesktopTool, string> = {
	list_windows: "List Windows application windows. Does not activate or edit them.",
	observe_window: "Observe a window's accessibility text, with optional screenshot and text search. Returns snapshot_id and session_epoch for element actions; a new observation or mutation invalidates older references. No automatic screenshot retry on authorization failure.",
	click_element: "Click an element from the latest observation of the same window. Requires snapshot_id and session_epoch; optionally returns fresh text observation. Sent does not prove the expected UI change.",
	click_screenshot_point: "Click screenshot coordinates from the latest observation when accessibility element indexes are unavailable. Validates snapshot_id, session_epoch and screenshot_id, then optionally returns a fresh screenshot observation. Coordinates are in the referenced screenshot.",
	type_text_observed: "Type literal text into the focused control after the latest observation. Works when no element index is available. Optionally returns a fresh screenshot observation and reports visual verification mode.",
	set_value: "Set an editable element from the latest observation, with explicit window and snapshot provenance. Optionally returns fresh text observation. Uses existing helper approval and policy checks.",
};

export function desktopToolDefinitions() {
	return (Object.keys(desktopSchemas) as DesktopTool[]).map(name => {
		const { $schema, ...inputSchema } = z.toJSONSchema(desktopSchemas[name], { io: "input" });
		return { name, description: descriptions[name], inputSchema, annotations: { readOnlyHint: name === "list_windows" || name === "observe_window", destructiveHint: name === "click_element" || name === "click_screenshot_point" || name === "type_text_observed" || name === "set_value", openWorldHint: true } };
	});
}

export function desktopToolCode(name: DesktopTool, args: unknown): string {
	const input = desktopSchemas[name].parse(args);
	const method = name === "set_value" ? "set_value_observed" : name;
	return `nodeRepl.write(JSON.stringify(await sky.${method}(${name === "list_windows" ? "" : JSON.stringify(input)})));`;
}
