import assert from "node:assert/strict";
import { test } from "node:test";
import { cursorRecoveryScript, restoreSystemCursors } from "../dist/cursor-recovery.js";

test("cursor recovery reloads the current scheme without changing its configuration", () => {
	const script = cursorRecoveryScript();
	assert.match(script, /SystemParametersInfoW/);
	assert.match(script, /0x0057/);
	assert.doesNotMatch(script, /SetSystemCursor/);
	assert.doesNotMatch(script, /Registry|Set-ItemProperty|New-ItemProperty/i);
});

test("cursor recovery succeeds on Windows", {skip: process.platform !== "win32"}, async () => {
	assert.equal(await restoreSystemCursors("automated-test"), true);
});
