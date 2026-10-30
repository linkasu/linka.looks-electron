const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join, win32 } = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

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
      !/^(GH_TOKEN|GITHUB_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN|CSC_.*(?:PASSWORD|LINK)|APPLE_(ID|APP_SPECIFIC_PASSWORD|API_KEY|API_KEY_ID|API_ISSUER)|AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)|AZURE_(CLIENT_SECRET|CLIENT_CERTIFICATE_PASSWORD|FEDERATED_TOKEN_FILE))$/i.test(
        name
      ) || !env[name],
      `credential-bearing launch environment: ${name}`
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

function probeRuntime() {
  const root = process.env.SystemRoot;
  const directory = fs.mkdtempSync(join(os.tmpdir(), "sdk-runtime-probe-"));
  try {
    const executable = join(directory, "probe.exe");
    const compiled = spawnSync(
      join(root, "Microsoft.NET/Framework64/v4.0.30319/csc.exe"),
      ["/nologo", "/platform:x86", `/out:${executable}`, join(__dirname, "windows-sdk-runtime.cs")],
      {
        env: { SystemRoot: root, WINDIR: root, TEMP: directory, TMP: directory },
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 8192,
        windowsHide: true
      }
    );
    assert(!compiled.error && compiled.status === 0, "Runtime probe compilation failed");
    const result = runProcess(executable);
    assert.deepEqual(
      { ...result, Stdout: "" },
      { ExitCode: 0, TimedOut: false, OutputLimit: false, Cleanup: true, Stdout: "", Stderr: "" },
      "Runtime probe failed"
    );
    return JSON.parse(result.Stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const missingRuntimeStderr = [
  "",
  "Unhandled Exception: System.DllNotFoundException: Unable to load DLL 'Tobii.EyeX.Client.dll': The specified module could not be found. (Exception from HRESULT: 0x8007007E)",
  "   at Tobii.Interaction.Client.Interop.EyeX.IsEyeXInitialized(Int32& pInitialized)",
  "   at Tobii.Interaction.Model.Environment.get_IsInitialized()",
  "   at Tobii.Interaction.Host..ctor(String name)",
  "   at EyeLog.Program.Main(String[] args)",
  ""
].join("\n");
const missingRuntimeWithSymbols = missingRuntimeStderr.replace(
  "at EyeLog.Program.Main(String[] args)",
  "at EyeLog.Program.Main(String[] args) in D:\\a\\EyeLog\\EyeLog\\EyeLog\\Program.cs:line 57"
);

function classify(result, runtime) {
  assert.equal(result.Cleanup, true, "SDK process tree cleanup failed");
  assert.equal(result.TimedOut, false, "SDK hung/timed out");
  assert.equal(result.OutputLimit, false, "SDK output limit exceeded");
  assert.equal(result.Stdout, "", "Unexpected SDK stdout");
  assert(
    [missingRuntimeStderr, missingRuntimeWithSymbols].includes(
      result.Stderr.replace(/\r\n/g, "\n")
    ),
    "Unclassified SDK startup error"
  );
  assert.equal(result.ExitCode, 0xe0434352, "Unexpected SDK exit");
  assert.equal(runtime?.Bits, 32, "Runtime evidence must match SDK architecture");
  const codes = [runtime.Msvcp110, runtime.Msvcr110];
  assert(
    codes.every((code) => code === 0 || code === 126) && codes.includes(126),
    "VC110 missing-runtime cause not corroborated"
  );
  return "missing-vc110-runtime-only; NOT hardware/runtime acceptance";
}

function launch(executable) {
  assertSandbox();
  const runtime = probeRuntime();
  console.log("EyeLog x86 system-runtime probe:", JSON.stringify(runtime));
  const result = runProcess(executable);
  // Bounded SDK-only evidence; never print the runner environment or supervisor diagnostics.
  console.log("EyeLog sandbox observation:", JSON.stringify(result));
  console.log("EyeLog sandbox outcome:", classify(result, runtime));
}

module.exports = {
  assertSandbox,
  runProcess,
  classify,
  launch,
  missingRuntimeStderr,
  missingRuntimeWithSymbols
};
