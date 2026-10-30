const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { join } = require("node:path");
const { assertSandbox, classify } = require("./windows-sdk-launch.cjs");

const sandbox = {
  GITHUB_ACTIONS: "true",
  RUNNER_ENVIRONMENT: "github-hosted",
  RUNNER_OS: "Windows",
  GITHUB_REPOSITORY: "linkasu/linka.looks-electron",
  GITHUB_EVENT_NAME: "pull_request",
  EYELOG_SANDBOX_GATE: "1"
};

test("only explicitly enabled hosted test-only Windows accepts launch", () => {
  assertSandbox(sandbox, "win32");
  for (const key of Object.keys(sandbox)) {
    assert.throws(() => assertSandbox({ ...sandbox, [key]: "" }, "win32"));
  }
  assert.throws(() => assertSandbox(sandbox, "darwin"));
  for (const key of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_ID",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN"
  ]) {
    assert.throws(() => assertSandbox({ ...sandbox, [key]: "synthetic-not-a-secret" }, "win32"));
  }
});

const clean = {
  ExitCode: 0,
  TimedOut: false,
  OutputLimit: false,
  Cleanup: true,
  Stdout: "",
  Stderr: ""
};
test("unexpected startup outcomes cannot masquerade as missing runtime", () => {
  for (const delta of [
    {},
    { TimedOut: true },
    { Cleanup: false },
    { OutputLimit: true },
    { Stdout: "gaze:1,2,3" },
    { ExitCode: 1 },
    { ExitCode: 0xc000007b },
    { Stderr: "Tobii.Interaction BadImageFormatException Host..ctor" },
    { Stderr: "Tobii.Interaction DllNotFoundException anything" },
    { Stderr: "EyeX unexpected exception" }
  ])
    assert.throws(() => classify({ ...clean, ...delta }));
});

test("both candidate Windows workflows require launch, not only equality", () => {
  const pr = fs.readFileSync(join(__dirname, "../../.github/workflows/pr-test.yaml"), "utf8");
  const acceptance = fs.readFileSync(
    join(__dirname, "../../.github/workflows/release-gates.yml"),
    "utf8"
  );
  assert.match(pr, /persist-credentials: false/);
  assert.match(
    pr,
    /name: Sandboxed packaged Windows SDK launch\s+if:.*steps.packaged.outcome == 'success'.*\s+env:\s+EYELOG_SANDBOX_GATE: "1"\s+run: npm run test:packaged-resources/
  );
  assert.match(
    acceptance,
    /name: Sandboxed packaged Windows SDK launch\s+if:.*matrix.revision == 'candidate'.*runner.os == 'Windows'.*\s+working-directory: app\s+env:\s+EYELOG_SANDBOX_GATE: "1"/
  );
});
