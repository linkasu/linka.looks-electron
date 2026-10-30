const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join, win32 } = require("node:path");

function assertSandbox(env = process.env, platform = process.platform) {
  assert.equal(platform, "win32", "SDK execution is hosted Windows CI only");
  assert.equal(env.GITHUB_ACTIONS, "true");
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.equal(env.RUNNER_OS, "Windows");
  assert.equal(env.GITHUB_REPOSITORY, "linkasu/linka.looks-electron");
  assert.equal(env.GITHUB_EVENT_NAME, "pull_request");
  assert.equal(env.EYELOG_SANDBOX_GATE, "1", "explicit test-only workflow gate required");
  for (const name of Object.keys(env)) {
    assert(
      !/^(GH_TOKEN|GITHUB_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN|CSC_.*(?:PASSWORD|LINK)|APPLE_.+|AWS_.+|AZURE_.+)$/i.test(
        name
      ) || !env[name],
      "credential-bearing launch environment"
    );
  }
}

function runProcess(executable, args = "", timeoutMs = 10000) {
  const systemRoot = process.env.SystemRoot;
  assert(win32.isAbsolute(systemRoot), "Windows system root required");
  const result = spawnSync(
    join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      join(__dirname, "windows-sdk-process.ps1"),
      "-Executable",
      executable,
      "-Arguments",
      args,
      "-TimeoutMs",
      String(timeoutMs)
    ],
    {
      env: { SystemRoot: systemRoot, WINDIR: systemRoot },
      windowsHide: true,
      encoding: "utf8",
      timeout: 40000,
      maxBuffer: 32768
    }
  );
  assert(
    !result.error && result.status === 0 && result.stderr === "",
    `Windows containment supervisor failed (${result.error?.code || result.status}): ${(result.stderr || "").slice(0, 8192)}`
  );
  return JSON.parse(result.stdout);
}

function classify(result) {
  assert.equal(result.Cleanup, true, "SDK process tree cleanup failed");
  assert.equal(result.TimedOut, false, "SDK hung/timed out");
  assert.equal(result.OutputLimit, false, "SDK output limit exceeded");
  assert.equal(result.Stdout, "", "Unexpected SDK stdout");
  // No exception is allowlisted until its exact hosted-runner signature is corroborated.
  assert.equal(result.Stderr, "", "Unclassified SDK startup error (not a missing-runtime pass)");
  assert.equal(result.ExitCode, 0, "Unexpected SDK exit");
  throw new Error("Unexplained SDK exit: public source has no clean no-device shutdown");
}

function launch(executable) {
  assertSandbox();
  const result = runProcess(executable);
  // Bounded SDK-only evidence; never print the runner environment or supervisor diagnostics.
  console.log("EyeLog sandbox observation:", JSON.stringify(result));
  console.log("EyeLog sandbox outcome:", classify(result));
}

module.exports = { assertSandbox, runProcess, classify, launch };
