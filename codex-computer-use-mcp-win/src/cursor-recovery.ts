import { spawn, spawnSync } from "node:child_process";

const POWERSHELL_ARGS = ["-NoProfile", "-NonInteractive", "-EncodedCommand"];
let active: Promise<void> | null = null;
let lastStartedAt = 0;

export function cursorRecoveryScript(): string {
	return [
		"Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WinCursor { [DllImport(\"user32.dll\", SetLastError = true)] public static extern bool SystemParametersInfoW(uint action, uint param, IntPtr value, uint flags); }'",
		"$ok = [WinCursor]::SystemParametersInfoW(0x0057, 0, [IntPtr]::Zero, 0)",
		"if (-not $ok) { exit 1 }",
	].join("\n");
}

function encodedScript(): string {
	return Buffer.from(cursorRecoveryScript(), "utf16le").toString("base64");
}

function powershellCommand(): string {
	return process.env.SystemRoot
		? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
		: "powershell.exe";
}

/**
 * Reload the current Windows cursor scheme. This does not alter its selected
 * size, color, files or registry values; SPI_SETCURSORS applies the existing
 * scheme again after Computer Use leaves a blank system cursor behind.
 */
export async function restoreSystemCursors(reason = "computer-use-ended"): Promise<boolean> {
	if (process.platform !== "win32") return false;
	if (active) return await active.then(() => true, () => false);
	const now = Date.now();
	if (now - lastStartedAt < 250) return true;
	lastStartedAt = now;
	active = new Promise<void>((resolve, reject) => {
		const child = spawn(powershellCommand(), [...POWERSHELL_ARGS, encodedScript()], {
			windowsHide: true,
			stdio: "ignore",
		});
		const timeout = setTimeout(() => {
			try { child.kill(); } catch {}
			reject(new Error(`cursor recovery timed out (${reason})`));
		}, 5_000);
		child.once("error", error => { clearTimeout(timeout); reject(error); });
		child.once("exit", code => {
			clearTimeout(timeout);
			if (code === 0) resolve();
			else reject(new Error(`cursor recovery exited with code ${code ?? "unknown"} (${reason})`));
		});
	});
	try {
		await active;
		return true;
	} finally {
		active = null;
	}
}

/** Last-resort synchronous refresh for process-exit hooks. */
export function restoreSystemCursorsSync(): boolean {
	if (process.platform !== "win32") return false;
	try {
		return spawnSync(powershellCommand(), [...POWERSHELL_ARGS, encodedScript()], {
			windowsHide: true,
			stdio: "ignore",
			timeout: 5_000,
		}).status === 0;
	} catch {
		return false;
	}
}
