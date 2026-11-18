import { z } from "zod";

const windowSchema = z.object({ app: z.string().min(1), id: z.number().int().nonnegative(), title: z.string().optional() }).strict();
const reference = { window: windowSchema, snapshot_id: z.string().min(1), session_epoch: z.string().min(1), element_index: z.number().int().nonnegative(), observe_after: z.boolean().default(true) };
export const desktopSchemas = {
	list_windows: z.object({}).strict(),
	observe_window: z.object({ window: windowSchema, screenshot: z.boolean().default(false), find: z.string().min(1).max(1000).optional(), max_chars: z.number().int().min(256).max(200000).default(24000) }).strict(),
	click_element: z.object(reference).strict(),
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
	set_value: "Set an editable element from the latest observation, with explicit window and snapshot provenance. Optionally returns fresh text observation. Uses existing helper approval and policy checks.",
};

export function desktopToolDefinitions() {
	return (Object.keys(desktopSchemas) as DesktopTool[]).map(name => {
		const { $schema, ...inputSchema } = z.toJSONSchema(desktopSchemas[name], { io: "input" });
		return { name, description: descriptions[name], inputSchema, annotations: { readOnlyHint: name === "list_windows" || name === "observe_window", destructiveHint: name === "click_element" || name === "set_value", openWorldHint: true } };
	});
}

export function desktopToolCode(name: DesktopTool, args: unknown): string {
	const input = desktopSchemas[name].parse(args);
	const method = name === "set_value" ? "set_value_observed" : name;
	return `nodeRepl.write(JSON.stringify(await sky.${method}(${name === "list_windows" ? "" : JSON.stringify(input)})));`;
}
