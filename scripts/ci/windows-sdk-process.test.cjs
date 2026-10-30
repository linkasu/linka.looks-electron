const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { runProcess, classify, assertSandbox } = require("./windows-sdk-launch.cjs");

test("hosted Windows process negative controls and descendant cleanup", () => {
  assertSandbox(); // This suite must run on Windows, not silently skip elsewhere.
  const dir = fs.mkdtempSync(join(os.tmpdir(), "sdk-process-fixture-"));
  try {
    const exe = join(dir, "fixture.exe");
    const compiler = join(process.env.SystemRoot, "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
    const built = spawnSync(
      compiler,
      ["/nologo", `/out:${exe}`, join(__dirname, "windows-sdk-fixture.cs")],
      { encoding: "utf8", timeout: 30000 }
    );
    assert.equal(built.status, 0, built.stdout);
    for (const mode of ["clean", "environment", "stdin"]) {
      const result = runProcess(exe, mode);
      assert.deepEqual(result, {
        ExitCode: 0,
        TimedOut: false,
        OutputLimit: false,
        Cleanup: true,
        Stdout: "",
        Stderr: ""
      });
    }
    for (const mode of [
      "crash",
      "architecture",
      "bad-image",
      "output",
      "overflow",
      "hang",
      "tree"
    ]) {
      const result = runProcess(exe, mode, 1500);
      assert.equal(result.Cleanup, true, mode);
      assert.throws(() => classify(result), mode);
      if (mode === "hang") assert.equal(result.TimedOut, true);
      if (mode === "overflow") assert.equal(result.OutputLimit, true);
      if (mode === "architecture") assert.equal(result.ExitCode, 0xc000007b);
      if (mode === "tree") {
        const pid = Number(result.Stdout.trim());
        assert(pid > 0);
        assert.throws(() => process.kill(pid, 0), "descendant must no longer exist");
      }
    }
    assert.throws(() => runProcess(join(dir, "missing.exe")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
