// Temporary [DEBUG-bubble-acl] probe: emits only exit codes, durations and a constant marker.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = process.env.SystemRoot;
if (process.platform !== "win32" || !root) throw new Error("Windows probe required");
const minimal = { SystemRoot: root, WINDIR: root };
const folders = { ...minimal };
for (const [key, value] of Object.entries(process.env)) {
  if (
    /^(PATH|SYSTEMDRIVE|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|USERNAME|USERDOMAIN)$/i.test(
      key
    )
  )
    folders[key] = value;
}
for (const [name, env, stdio] of [
  ["minimal", minimal, "pipe"],
  ["known-folders", folders, "pipe"],
  ["minimal-null", minimal, "ignore"]
]) {
  const started = Date.now();
  const result = spawnSync(
    path.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::WriteLine('BUBBLE_PS_BASELINE'); exit 0"
    ],
    { env, stdio, windowsHide: true, encoding: "utf8", timeout: 12000, maxBuffer: 1024 }
  );
  console.log(
    "[DEBUG-bubble-acl]",
    JSON.stringify({
      name,
      elapsedMs: Date.now() - started,
      status: result.status,
      signal: result.signal,
      error: result.error?.code,
      marker: result.stdout?.includes("BUBBLE_PS_BASELINE") || false
    })
  );
}
