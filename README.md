# codex-computer-use-mcp-win

An unofficial Windows port of
[`codex-computer-use-mcp`](https://github.com/tmustier/codex-computer-use-mcp).
It exposes OpenAI's signed Windows Computer Use runtime as an MCP server so a
third-party agent (Claude Code, Codex, Pi, or any MCP client) can inspect and
drive native Windows applications.

There is no nested model. Your MCP client's model decides what to do; this
server only executes `sky` / `cua` JavaScript calls against the signed
`codex-computer-use.exe` helper that the ChatGPT desktop app already installed.

> This project is not affiliated with or endorsed by OpenAI. It does not bundle
> or redistribute OpenAI software. See [NOTICE.md](NOTICE.md).

## How it works

```text
MCP client (Claude Code, Codex, Pi, ...)
        │  stdio MCP: js / js_reset / computer_use_status
        ▼
codex-computer-use-mcp-win
        │  JSONL over stdio, one long-lived helper
        ▼
codex-computer-use.exe  (OpenAI-signed, installed by ChatGPT)
        │  Codex CLI authentication
        ▼
Windows UI Automation + SendInput + Windows Graphics Capture
```

The macOS upstream routes calls through ChatGPT's `node_repl` and native pipe.
On Windows those transports are unreliable from a third-party process. This
port instead spawns the signed helper directly with `--parent-pid <server pid>`,
sets `SKY_CUA_NATIVE_PIPE=0`, and speaks the helper's JSONL protocol. It was
verified end-to-end against the installed runtime: app/window discovery,
approval retry, screenshots, accessibility text, and sandboxed JavaScript.

## Requirements

- Windows 10 version 1809 or newer, or Windows 11.
- Node.js 22 or newer (tested with Node 24).
- ChatGPT desktop for Windows with Codex signed in, or a signed-in Codex CLI.
  The ChatGPT install supplies `codex-computer-use.exe` and the `@oai/sky`
  runtime.
- An interactive desktop session. Computer Use uses the real foreground
  desktop; the user sees every click, key, and scroll.

No OpenAI binary is downloaded, copied, or packaged. Discovery looks in:

- `%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\*\bin\node_modules\@oai\sky\bin\windows\codex-computer-use.exe`
- `NODE_REPL_NODE_MODULE_DIRS` from `%USERPROFILE%\.codex\config.toml`
- the ChatGPT MSIX app bundle
- `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`, `CODEX_CLI_PATH`, the app
  bundle, and `PATH` for the Codex CLI

Both binaries are Authenticode-verified before use. The server requires a
`Valid` signature whose subject contains `OpenAI`, records a SHA-256, and
prefers the newest runtime that passes verification. Symlinked runtime
candidates are ignored. Set `verifySignatures: false` only for a local build you
control.

## Install and build

```powershell
cd codex-computer-use-mcp-win
npm ci
npm run build
node dist\mcp-server.js --status
```

`--status` prints discovery status as JSON and does not start the helper.
If discovery succeeds, `ready` is `true`; otherwise `error` contains the exact
paths that were searched.

## MCP client configuration

Use an absolute, pinned path. Do **not** use `npx -y <package>@latest` for a
tool that controls your desktop.

Generic stdio MCP configuration:

```json
{
  "mcpServers": {
    "computer-use-win": {
      "command": "node",
      "args": [
        "C:\\Users\\you\\tools\\codex-computer-use-mcp-win\\dist\\mcp-server.js"
      ],
      "env": {
        "CODEX_COMPUTER_USE_HOME": "C:\\Users\\you\\AppData\\Local\\codex-computer-use-mcp-win"
      }
    }
  }
}
```

Claude Code:

```powershell
claude mcp add computer-use-win -- node "C:\Users\you\tools\codex-computer-use-mcp-win\dist\mcp-server.js"
```

Codex `~/.codex/config.toml`:

```toml
[mcp_servers.computer_use_win]
command = "node"
args = ["C:\\Users\\you\\tools\\codex-computer-use-mcp-win\\dist\\mcp-server.js"]

[mcp_servers.computer_use_win.env]
CODEX_COMPUTER_USE_HOME = "C:\\Users\\you\\AppData\\Local\\codex-computer-use-mcp-win"
```

Restart the client after changing the configuration.

## Tools

### Structured desktop tools (preview)

`list_windows` lists windows. `observe_window` accepts a `window` descriptor
and defaults to accessibility text without a screenshot. Optional `find`
filters lines, `max_chars` limits returned characters (256–200000, default
24000), and `screenshot: true` requests an image. A missing accessibility
tree is reported explicitly; screenshot capture is not retried automatically.

`click_element` and `set_value` require `window`, `snapshot_id`,
`session_epoch`, and `element_index` from the latest observation. `set_value`
also requires `value`. `observe_after` defaults to true. Results distinguish
`action.action_sent` from `observation.status`; a successful action followed
by failed observation must not be replayed. `verified: false` means the bridge
has not determined whether the user's intended UI change occurred.

Any observation or mutation conservatively invalidates all earlier structured
references in the server. `js_reset`, idle abort, and helper exit invalidate
them too. These are observation-local indices, not stable element identities.
External UI changes remain subject to the helper's own checks. Low-level
`sky` methods retain their existing behavior. Structured calls run through
the same serialized JS kernel, approvals, budgets and audit path.

The structured tools are a preview pending real DSH/Qoder and mixed-DPI
acceptance. They do not add browser tab control, screenshot coordinate
transforms, automatic tree diffs, or cross-process desktop locking.

### Configuration and diagnostics

```powershell
node dist\mcp-server.js print-config --client qoder
node dist\mcp-server.js print-config --client dsh
node dist\mcp-server.js doctor
node dist\mcp-server.js doctor --live
```

Configuration commands print merge fragments and never edit client files.
The DSH fragment is JSON (also valid YAML); merge the entry into the existing
Cordis patch rather than appending a second top-level document or duplicating
the server. Other clients can use `--client generic`.

`doctor` checks discovery and reports the tool catalog without starting the
native helper or proving a client MCP handshake. `doctor --live` additionally
starts the real helper and reports only a window count, then closes it. It
does not click, type, capture, verify application approval, or certify an
interactive client. Real helper startup can maintain Codex state as described
under Privacy. Client handshake, rendering, app authorization, and end-to-end
tasks remain separate checks.

### `js`

Runs JavaScript in a persistent worker thread with a `vm` guardrail. Top-level
`await` works, and top-level `let` / `const` / `function` / `class` bindings
survive between calls. `js_reset` clears them.

The guardrail blocks `eval`, `Function`, `import()`, `process`, `require`,
`Buffer`, `fetch`, and host-realm constructors, but Node's `vm` module is not a
security boundary and the worker shares the server process id and file
descriptors. Treat this tool as code execution by a trusted agent, not as a
container for untrusted third-party code.

Globals:

- `sky` — OpenAI's Windows Computer Use API.
- `cua` — a compatibility facade for code written against the macOS runtime.
- `nodeRepl` — `write(text)`, `emitImage(dataUrl)`, `cwd`, `homeDir`, `tmpDir`.
- `console` — maps to `nodeRepl.write`.

`sky` methods:

| Method | Purpose |
| --- | --- |
| `list_apps()` | Installed/running apps with windows, display names, usage. |
| `list_windows()` | Open windows as `{ app, id, title }`. |
| `get_window({ id, app? })` | Refresh one window descriptor. |
| `get_window_state({ window, include_screenshot?, include_text? })` | Return `{ window, screenshots, accessibility }`. At least one include flag must be true; defaults to screenshot only. Screenshots are also emitted as MCP image content. |
| `activate_window({ window })` | Bring a window to the foreground. |
| `launch_app({ app })` | App id, display name, or absolute `.exe` path. Scripts, shortcuts, URLs, UNC paths, and installers are rejected. |
| `click({ window, element_index })` or `{ window, x, y }` | Prefer `element_index` from the latest state. Optional `click_count`, `mouse_button`. |
| `press_key({ window, key })` | X keysym-style names; the helper splits on `+`. Example: `Control_L+c`, `Return`, `Tab`. |
| `type_text({ window, text })` | Literal text. |
| `scroll({ window, x, y, scrollX, scrollY })` | Mouse-wheel scroll at a point. |
| `set_value({ window, element_index, value })` | Set an editable element's value. |
| `drag({ window, from_x, from_y, to_x, to_y })` | Pointer drag. |
| `perform_secondary_action({ window, element_index, action })` | Invoke a secondary accessibility action. |

Example — inspect first, then act:

```js
const windows = await sky.list_windows();
const target = windows.find((window) => /Notepad/i.test(window.app));
nodeRepl.write(JSON.stringify(target, null, 2));

const state = await sky.get_window_state({
  window: target,
  include_screenshot: true,
  include_text: true,
});

// Element indexes are valid only for this latest state.
await sky.click({ window: target, element_index: 12 });
await sky.type_text({ window: target, text: "hello" });
await sky.press_key({ window: target, key: "Control_L+s" });
```

Facade example:

```js
const app = await cua.getApp("Notepad");
const state = await app.getAXState();          // captures a screenshot by default
nodeRepl.write(state.text);
await app.click(12);
await app.typeText("hello");
await app.pressKey("Return");
```

`app.getAXState({ screenshot: false })` avoids capture. `cua.listTabs()` and
`cua.createBrowserTab()` explicitly report that browser tab control is not
available in this Windows adapter.

For browser work in DSH, run the official `node_repl` Browser Service as a
separate MCP in the same agent session. Keep `NODE_REPL_TRUSTED_SERVICES` mapped
to `@oai/browser-desktop/service` and `@oai/sky/service`, with
`NODE_REPL_NODE_MODULE_DIRS` and `NODE_REPL_NODE_PATH` aligned to the same
installed `cua_node` runtime. To expose the documented browser surface, allow
`CUA_REPL_ENABLED_SURFACES=browser` through `nodeRepl.env`, then run
`await import("@oai/cua/tinyskyAlt")` once in each fresh worker. Use
`cua.getState()` / `cua.listTabs()` to inspect inventory, then
`cua.getTab()` / `cua.createBrowserTab()` for browser tabs and URLs; verify with
`tab.url()`. Hosts that inject `agent` also expose the underlying
`agent.browsers` and `browser.tabs` APIs. The Browser Service still requires the
authorized host session context; if DSH cannot provide it and inventory access is
denied, do not fabricate context or infer URLs from UI. Reload the DSH MCP
configuration after environment changes. The browser service has its own URL/tab
context and JavaScript session, separate from this Windows helper's `js` session.

### Execution results and output budgets

Failed executions include a machine-readable `structuredContent.error` with
`code`, `message`, `method` when known, `retry`, `action_sent`,
`session_reset`, and `side_effect`. `retry: reobserve` means inspect the
application again before planning another action; it never authorizes replay.
A dispatched mutation that times out is `possibly_sent`. An application
blocked before dispatch is `not_sent`. A successful helper response is `sent`,
which does not prove the requested visible UI change occurred.

`structuredContent.actions` records up to 128 mutation methods and statuses
for the execution, including completed earlier actions when a later operation
fails. `actionsTruncated` reports overflow. User cancellation is `retry: never`.
Errors caught inside JavaScript retain primitive metadata properties such as
`error.code`; an intentionally caught error does not fail the whole execution.

Screenshots remain available as data URLs inside JavaScript for compatibility
with `sky` and `cua`. Image data URLs are removed from displayed text output;
use `nodeRepl.emitImage` to emit images. `imageReport` contains requested,
returned, omitted and duplicate counts, returned bytes, omission reasons and
kernel limits. Sky-layer omissions retain their own configuration limits.
Image omissions also produce a text notice for clients that ignore structured
results. Text observations can succeed even when no image fits the budget.

### `js_reset`

Discards all JavaScript bindings, terminates the worker, aborts the helper, and
cancels queued helper requests. Already dispatched actions may have taken effect;
a reset cannot undo them. The server's per-app approval cache survives.

### `computer_use_status`

Returns discovery, signature, helper, approval, warning, and session state as
JSON. It never starts the helper.

## Configuration

State lives in `%LOCALAPPDATA%\codex-computer-use-mcp-win` by default. Override
with `CODEX_COMPUTER_USE_HOME`. The file is `<state>\config.json`:

```json
{
  "approval": "auto",
  "elicitationFallback": "auto",
  "verifySignatures": true,
  "denyApps": [],
  "allowApps": [],
  "maxScreenshotBytes": 8388608,
  "maxTextBytes": 2097152,
  "helperTimeoutMs": 60000,
  "sessionIdleMs": 600000,
  "audit": true
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `approval` | `"auto"` | `auto`: approve apps not on the deny list. `mcp`: ask the MCP client. `deny`: refuse all app approvals. |
| `elicitationFallback` | `"auto"` | Used by `mcp` mode when the client cannot show an approval form. `auto` fails open; `deny` fails closed. |
| `verifySignatures` | `true` | Require valid Authenticode signatures from OpenAI for the helper and Codex CLI. |
| `denyApps` | `[]` | Extra app patterns. Combined with the built-in deny list. `*` is a wildcard. |
| `allowApps` | `[]` | Apps that are approved without a prompt. A full path covers only that location; a bare name or app id covers every location of that identity. Add `*` for a broader pattern. Deny always wins, and apps not listed still follow `approval`. |
| `maxScreenshotBytes` | 8 MiB | Per-screenshot cap after base64 decoding. Larger screenshots are omitted with `urlOmitted`. |
| `maxTextBytes` | 2 MiB | Cap for accessibility text returned by one call. |
| `helperTimeoutMs` | 60 s | Timeout for one helper request. |
| `sessionIdleMs` | 10 min | Close the helper and reset JavaScript after inactivity. |
| `audit` | `true` | Append metadata records to `<state>\audit\computer-use.jsonl`. |
| `helperPath` | auto | Explicit signed helper path. |
| `codexPath` | auto | Explicit signed Codex CLI path. |
| `codexHome` | `$CODEX_HOME` or `~/.codex` | Codex state directory used for authentication. The signed helper may create state files and maintain a `notify` hook in this directory, as it does when ChatGPT launches it. The server never reads `auth.json` and does not copy credentials. |

The built-in deny list covers terminals/shells, the ChatGPT/Codex control plane,
password managers, Windows security and administration surfaces, UAC/secure
desktop, and remote-control tools. Deny matching strips `process:`, lowercases,
and compares full paths, basenames, and executable stems exactly; only a pattern
containing `*` is treated as a glob. Display names are untrusted hints. Allow
matching strips `process:` and compares exact normalized paths, executable
basenames, or app ids; a full path does not cover the same name elsewhere, and
display names never satisfy it. Unknown configuration keys are rejected with the
supported key names; omitted keys retain their defaults. See
[SECURITY.md](SECURITY.md) before relying on it.

### Editing the allow list

`allowApps` is an "approved without a prompt" list, not a wall: anything it does
not contain still follows `approval`. Edit it from the command line instead of
hand-editing the state file:

```powershell
node dist\mcp-server.js allow list
node dist\mcp-server.js allow add chrome.exe "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"
node dist\mcp-server.js allow remove chrome.exe
```

Writes are atomic, deduplicated case-insensitively, and validated first: an
existing invalid `config.json` is reported instead of being overwritten. Combine
it with `approval: "mcp"` to pre-approve your everyday apps and still get a
prompt for everything else, or with `approval: "deny"` to make the allow list the
only way in. Restart the client after editing.

## Approval and safety

`approval: "auto"` is the upstream-compatible default and is convenient for
trusted local automation. It is not an action-level safety gate: any app not on
the deny list can be driven without a separate prompt. For stricter use:

```json
{
  "approval": "mcp",
  "elicitationFallback": "deny",
  "allowApps": ["notepad.exe", "microsoft.paint"]
}
```

Transport-enforced rules, independent of the model's instructions:

- The Windows/Super key, `Ctrl+Alt+Del`, `Alt+F4`, `Alt+Tab`,
  `Ctrl+Shift+Esc`, `Ctrl+Esc`, and `Ctrl+Shift+Enter` are rejected.
- Denied apps are refused before a helper request.
- `launch_app` accepts an app id or absolute `.exe` path only. Scripts,
  shortcuts, installers, URLs, UNC/device paths, and relative paths are
  rejected.
- The helper and Codex CLI must pass Authenticode verification by default.
- The helper is spawned with a minimal environment: unrelated API keys, cloud
  credentials, `NODE_OPTIONS`, and proxy variables are not inherited.

The JavaScript session runs in a worker thread inside a `vm` context with
`eval`, `Function`, static/dynamic `import()`, `process`, `require`, `Buffer`,
and `fetch` unavailable. This is a guardrail against accidental Node access, not
a hard security boundary. Do not treat agent-supplied code as untrusted
third-party code.

## Privacy

Screenshots, accessibility trees, selected text, and document text routinely
contain passwords, one-time codes, private messages, medical/financial data, and
third-party content. They are returned to your MCP client and may be logged by
it. Capture only what you need, avoid password managers and authentication
surfaces, and do not persist captures. The audit log stores metadata only: time,
method, byte counts, outcome, duration, version, content types, and error code.
It never stores code, text, screenshots, window titles, or credentials.

The signed helper runs against the real Codex home because it needs Codex
authentication. As a side effect it may create its own state/sqlite files and
maintain a `notify = [... "turn-ended"]` hook in `%USERPROFILE%\.codex\config.toml`.
That is normal helper behavior, but it means this server can touch ChatGPT's
Codex state. This port deliberately does not copy `auth.json` into a temporary
home; use a dedicated Windows user or VM if you do not want that shared state.
The helper's turn-ended notification can also end the current Computer Use turn;
if calls start failing with a turn-ended error, restart the server or wait for
the idle timeout.

## Troubleshooting

Run:

```powershell
node dist\mcp-server.js --status
```

Common cases:

- **Cannot find the Computer Use helper** — update/open the ChatGPT desktop app
  once, sign in to Codex, then retry. The error lists the searched paths. You can
  set `helperPath` in `config.json`.
- **Cannot find codex.exe** — open ChatGPT/Codex and sign in, or set `codexPath`.
- **Codex could not authenticate** — sign in again. The helper uses
  `CODEX_HOME`; the server never reads `auth.json`.
- **Turn ended / no longer available in this turn** — Codex uses the same
  `CODEX_HOME` and can end the helper's turn. Restart the server or wait for the
  idle timeout. Do not retry the action; re-observe the app first.
- **Window is minimized** — call `sky.activate_window({ window })`, refresh with
  `sky.get_window({ id, app })`, then retry `get_window_state`.
- **The helper cannot determine the current browser URL** — the official Windows
  runtime blocks browser access when it cannot verify the URL confidently. This
  adapter preserves that policy and does not infer the URL from a title or
  screenshot. Use the official DSH `node_repl` Browser Service described above;
  if it lacks authorized host session context, stop and surface that limitation
  instead of retrying through UIA or screenshots.
- **User input was detected** — call `get_window_state` again before acting.
- **Accessibility is null** — some Electron apps (including VS Code in testing)
  do not expose a UIA tree. Screenshots still work; use coordinates or another
  automation surface.
- **Approval denied** — the app is denied, not on the allow list, or the MCP
  client declined. Check `config.json`.
- **Signature invalid** — reinstall/update ChatGPT. If you intentionally use a
  local build, set `verifySignatures: false` and understand the risk.

Computer Use does not work through UAC/secure-desktop prompts, on a locked
desktop, in Session 0, or when the MCP client runs elevated and targets a
higher-integrity window. Keep the target visible and the desktop unlocked.

## Development

```powershell
npm ci
npm run check
npm test          # builds dist, then runs unit/protocol tests with a fake helper
npm run build
npm pack --dry-run
```

The test suite never starts the real helper and does not touch real documents.
It covers configuration, discovery fixtures, Authenticode handling, approval
modes, JSONL protocol and approval retry, sandbox persistence and escapes,
timeouts, output caps, Sky validation, and MCP stdio framing.

Live probing against the installed helper is intentionally separate. Use a
benign app (Notepad, Calculator) and inspect, do not mutate, user content.

## License

MIT. This is a derivative work of `codex-computer-use-mcp` by Thomas Mustier.
See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). OpenAI, ChatGPT, Codex, and
the Computer Use runtime are trademarks or products of OpenAI. This project is
not affiliated with or endorsed by OpenAI.
