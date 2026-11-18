# Changelog

## 0.4.1-preview.1

- Restore `app` / `window_id` and native Computer Use browser routing for third-party agents without Codex context.
- Select the backend before executing: native selectors take precedence; do not retry another backend after a denial.
- Return explicit MCP errors for failed readback while preserving navigation dispatch facts.
- Read existing native windows without launching or activating them; reject ambiguous or stale window targets.
- Preserve official browser-access verification variables and check missing context before spawning its runtime.
- Native URL verification failures remain an upstream limitation; this release does not claim general third-party webpage readback.

## 0.4.0-preview.1

- Route `browser_*` tools through the official Codex Computer Use in-app browser runtime instead of browser-window URL inference.
- Open and read any HTTP(S) page with no adapter-level domain allowlist.
- Return actual page accessibility text from existing Computer Use browser tabs.

## 0.3.2-preview.1

- Add `click_screenshot_point` for applications without an accessibility tree.
- Add `type_text_observed` for structured text input without element indexes.
- Report `interaction_mode`, `recommended_tool` and `verification_level` from `observe_window`.
- Bind screenshot-coordinate clicks to the latest snapshot, session and screenshot ID.

## 0.3.1-preview.1

- Reload the current Windows cursor scheme before helper startup, after executions, and after helper close, abort, timeout, exit, or MCP shutdown.
- Keep cursor size, color, selected files and registry values unchanged.

## 0.3.0-preview.1

- Add Computer Use based `browser_open`, `browser_new_tab`, `browser_navigate`, `browser_tabs`, and `browser_read`.
- Accept any HTTP(S) webpage with no adapter-level domain allowlist.
- Keep browser automation on the same signed helper and persistent JavaScript execution path.

## 0.2.0-preview.1

- Preserve structured errors and mutation dispatch evidence through the worker and MCP result.
- Keep raw screenshot data available in JavaScript while suppressing image data URLs in displayed text.
- Report image omissions, duplicate emissions, byte budgets and earlier actions explicitly.
- Add text-first `observe_window`, `list_windows`, `click_element` and `set_value` MCP tools.
- Bind structured element actions to observation/session/window provenance; invalidate on observation, mutation, reset and helper exit.
- Separate successful actions from failed follow-up observations.
- Add `print-config --client qoder|dsh|generic` and `doctor [--live]`. Configuration output never changes client files.

This is a preview. Real DSH/Qoder interaction, application approval and mixed-DPI task acceptance are still outstanding. Full browser integration, screenshot transformations, automatic snapshot diffs and cross-process desktop arbitration are not included.
