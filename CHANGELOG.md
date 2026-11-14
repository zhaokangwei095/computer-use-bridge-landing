# Changelog

## 0.2.0-preview.1

- Preserve structured errors and mutation dispatch evidence through the worker and MCP result.
- Keep raw screenshot data available in JavaScript while suppressing image data URLs in displayed text.
- Report image omissions, duplicate emissions, byte budgets and earlier actions explicitly.
- Add text-first `observe_window`, `list_windows`, `click_element` and `set_value` MCP tools.
- Bind structured element actions to observation/session/window provenance; invalidate on observation, mutation, reset and helper exit.
- Separate successful actions from failed follow-up observations.
- Add `print-config --client qoder|dsh|generic` and `doctor [--live]`. Configuration output never changes client files.

This is a preview. Real DSH/Qoder interaction, application approval and mixed-DPI task acceptance are still outstanding. Full browser integration, screenshot transformations, automatic snapshot diffs and cross-process desktop arbitration are not included.
