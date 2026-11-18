# Reload the user's configured Windows cursor scheme without changing preferences.
$ErrorActionPreference = 'Stop'
if (-not ('WorkspaceCursorRecovery' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WorkspaceCursorRecovery {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SystemParametersInfo(uint action, uint param, IntPtr value, uint flags);
}
'@
}
$restored = [WorkspaceCursorRecovery]::SystemParametersInfo(0x0057, 0, [IntPtr]::Zero, 0)
if (-not $restored) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "Could not reload the Windows cursor scheme (Windows error $code)."
}
Write-Output 'Cursor scheme reloaded. Move the mouse to check visibility.'
