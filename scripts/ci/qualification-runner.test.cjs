const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  verifySoftware,
  nativeEvidence,
  selectMode,
  verifyGateArtifact,
  software,
  aggregateStatus,
  aggregate,
  baselineOrigin,
  classifyGateError
} = require("./qualification-runner.cjs");
const sha = "a".repeat(40);
test("typed transport failure is infrastructure, checksum assertion is a failed gate; neither qualifies", () => {
  const transport = Object.assign(new Error("private transport detail"), {
    code: "CI_INFRA_ERROR"
  });
  let checksum;
  try {
    assert.equal("actual hash", "expected hash");
  } catch (error) {
    checksum = error;
  }
  assert.equal(classifyGateError(transport), "INFRA_ERROR");
  assert.equal(classifyGateError(checksum), "FAIL");
  for (const error of [transport, checksum]) {
    const status = aggregateStatus({ security: { status: classifyGateError(error) } }, [
      "security"
    ]);
    assert.notEqual(status, "PASS");
  }
});
test("aggregation separates unselected, missing, cancelled and genuine failed gates", () => {
  const gates = Object.fromEntries(
    ["software", "packaged", "security", "upgrade"].map((s) => [
      s,
      { status: s === "security" ? "PASS" : "NOT_RUN" }
    ])
  );
  assert.equal(aggregateStatus(gates, ["security"]), "PASS");
  assert.equal(aggregateStatus(gates, ["software", "security"]), "INFRA_ERROR");
  gates.security.status = "FAIL";
  assert.equal(aggregateStatus(gates, ["security"]), "FAIL");
  gates.security.status = "CANCELLED";
  assert.equal(aggregateStatus(gates, ["security"]), "CANCELLED");
});

test("software never cherry-picks an older green run or a prior successful attempt", async () => {
  const own = { full_name: "linkasu/linka.looks-electron" };
  const green = {
    id: 7,
    run_attempt: 1,
    event: "push",
    repository: own,
    head_repository: own,
    path: ".github/workflows/ci.yml",
    head_sha: sha,
    head_branch: "main",
    status: "completed",
    conclusion: "success"
  };
  for (const latest of [
    { ...green, id: 9, conclusion: "failure" },
    { ...green, id: 9, conclusion: "cancelled" },
    { ...green, id: 9, status: "in_progress", conclusion: null },
    { ...green, id: 9, repository: { full_name: "fork/repo" } }
  ]) {
    const api = async (url) => {
      assert(!url.includes("status=success"));
      if (url.includes("/workflows/")) return { total_count: 2, workflow_runs: [green, latest] };
      assert(url.endsWith("/runs/9"));
      return latest;
    };
    await assert.rejects(software({ appSha: sha }, { githubJson: api, timeoutMs: 0 }));
  }
  const api = async (url) => {
    if (url.includes("/workflows/")) return { total_count: 1, workflow_runs: [green] };
    if (url.endsWith("/runs/7")) return { ...green, run_attempt: 2, conclusion: "failure" };
    throw new Error("must reject before reading successful old-attempt jobs");
  };
  await assert.rejects(software({ appSha: sha }, { githubJson: api, timeoutMs: 0 }));
  let currentReads = 0;
  let superseded = false;
  const goodApi = async (url) => {
    if (url.includes("/workflows/")) return { total_count: 1, workflow_runs: [green] };
    if (url.endsWith("/runs/7")) {
      currentReads++;
      return superseded && currentReads > 1
        ? { ...green, run_attempt: 2, status: "in_progress", conclusion: null }
        : green;
    }
    if (url.includes("/attempts/1/jobs?"))
      return {
        jobs: [
          {
            name: "ci-required",
            run_id: 7,
            run_attempt: 1,
            head_sha: sha,
            status: "completed",
            conclusion: "success",
            check_run_url: "https://api.github.com/repos/linkasu/linka.looks-electron/check-runs/8"
          }
        ]
      };
    return {
      id: 8,
      name: "ci-required",
      head_sha: sha,
      status: "completed",
      conclusion: "success",
      app: { slug: "github-actions" }
    };
  };
  assert.equal((await software({ appSha: sha }, { githubJson: goodApi })).workflowRunId, "7");
  currentReads = 0;
  superseded = true;
  await assert.rejects(software({ appSha: sha }, { githubJson: goodApi }));
});
test("workflow exposes exact candidate diagnostic inputs and only read-only permissions", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const text = fs.readFileSync(
    path.join(__dirname, "../../.github/workflows/windows-qualification.yml"),
    "utf8"
  );
  const workflow = require("yaml").parse(text);
  assert.equal(workflow.name, "Windows candidate qualification");
  assert.deepEqual(workflow.permissions, { contents: "read", actions: "read", checks: "read" });
  assert.deepEqual(workflow.on.workflow_run.workflows, ["Windows candidate build"]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.suite.options, [
    "all",
    "upgrade",
    "packaged",
    "security"
  ]);
  assert.equal(workflow.on.workflow_dispatch.inputs.diagnostic.default, true);
  assert.equal(workflow.jobs.windows["runs-on"], "windows-2022");
  assert.deepEqual(workflow.jobs.windows.needs, ["prepare", "software"]);
  assert(!text.includes("electron:build") && !text.includes("test:unit"));
  assert(!text.includes("secrets.") && !text.includes("GITHUB_SHA:"));
});

test("aggregator emits honest single-suite PASS, missing-report INFRA_ERROR and actual CANCELLED", async (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { digest } = require("./candidate-contract.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qualification-aggregate-"));
  const env = Object.fromEntries(
    ["GATE_NEEDS", "GITHUB_SHA", "GITHUB_OUTPUT"].map((k) => [k, process.env[k]])
  );
  t.after(() => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const c = require("./candidate-contract.test.cjs").fixture().candidate;
  const resolved = { candidate: c, candidateId: "12", candidateSha256: "b".repeat(64) };
  const binding = {
    candidateId: "12",
    candidateSha256: resolved.candidateSha256,
    installerSha256: c.installer.sha256,
    harnessSha: sha,
    runId: "34",
    runAttempt: 2,
    mode: "diagnostic"
  };
  const name = "qualification-gates-security-34-1";
  const input = path.join(directory, name);
  fs.mkdirSync(input);
  const r = {
    schema: "linka-ci-gate-v1",
    suite: "security",
    ...binding,
    runAttempt: 1,
    status: "PASS",
    job: "security",
    data: {
      status: "REVIEWED_SOURCE_ONLY",
      inventorySha256: "b".repeat(64),
      auditSha256: "b".repeat(64),
      lockSha256: "b".repeat(64),
      candidateInstallerSha256: c.installer.sha256,
      remainingFindings: 6
    }
  };
  const bytes = Buffer.from(JSON.stringify(r));
  fs.writeFileSync(path.join(input, "security.json"), bytes);
  const outputs = {
    artifact_id: "56",
    artifact_digest: "c".repeat(64),
    attempt: "1",
    manifest: JSON.stringify({ "security.json": { bytes: bytes.length, sha256: digest(bytes) } })
  };
  const job = {
    name: "security",
    run_id: 34,
    run_attempt: 1,
    head_sha: sha,
    status: "completed",
    conclusion: "success"
  };
  const artifact = {
    id: 56,
    name,
    digest: `sha256:${outputs.artifact_digest}`,
    expired: false,
    workflow_run: { id: 34, head_sha: sha }
  };
  process.env.GITHUB_SHA = sha;
  process.env.GITHUB_OUTPUT = path.join(directory, "outputs");
  for (const scenario of ["pass", "missing-output", "missing-file", "cancelled"]) {
    process.env.GATE_NEEDS = JSON.stringify({
      prepare: { outputs: { suite: "security" } },
      security: {
        result: scenario === "cancelled" ? "cancelled" : "success",
        outputs: scenario === "missing-output" ? {} : outputs
      }
    });
    if (scenario === "missing-file") fs.unlinkSync(path.join(input, "security.json"));
    const api = async (url) =>
      url.includes("/jobs?")
        ? { jobs: [{ ...job, conclusion: scenario === "cancelled" ? "cancelled" : "success" }] }
        : artifact;
    const q = await aggregate(directory, {
      githubJson: api,
      resolved,
      binding,
      outputDirectory: path.join(directory, scenario)
    });
    assert.equal(
      q.status,
      {
        pass: "PASS",
        "missing-output": "INFRA_ERROR",
        "missing-file": "INFRA_ERROR",
        cancelled: "CANCELLED"
      }[scenario]
    );
    assert.equal(q.gates.upgrade.status, "NOT_RUN");
  }
  assert(!fs.readFileSync(process.env.GITHUB_OUTPUT, "utf8").includes("eligible=true"));
});

test("baseline asset origin requires the actual published SHA-256 digest", async () => {
  const c = require("./candidate-contract.test.cjs").fixture().candidate;
  const b = c.baseline;
  let actualDigest = `sha256:${b.installer.sha256}`;
  const api = async (url) => {
    if (url.includes("/releases/assets/"))
      return {
        id: Number(b.assetId),
        name: b.installer.name,
        size: b.installer.bytes,
        browser_download_url: b.installer.url,
        digest: actualDigest
      };
    if (url.includes("/releases/"))
      return {
        id: Number(b.releaseId),
        tag_name: b.tag,
        draft: false,
        prerelease: false,
        published_at: "2026-01-01",
        assets: [{ id: Number(b.assetId) }]
      };
    return { sha: b.sourceSha };
  };
  await baselineOrigin(c, { githubJson: api });
  actualDigest = `sha256:${"e".repeat(64)}`;
  await assert.rejects(baselineOrigin(c, { githubJson: api }));
});
test("rerun keeps original successful artifact attempt and fails closed on missing reuse metadata", () => {
  const q = { runId: "34", runAttempt: 2, harnessSha: sha };
  const output = { artifact_id: "56", attempt: "1", artifact_digest: "b".repeat(64) };
  const artifact = {
    id: 56,
    name: "qualification-gates-windows-34-1",
    expired: false,
    digest: `sha256:${output.artifact_digest}`,
    workflow_run: { id: 34, head_sha: sha }
  };
  const job = {
    name: "windows",
    run_id: 34,
    run_attempt: 1,
    head_sha: sha,
    status: "completed",
    conclusion: "success"
  };
  assert.equal(verifyGateArtifact(q, "windows", output, { artifact, jobs: [job] }), job);
  for (const patch of [
    { run_attempt: undefined },
    { run_attempt: 2 },
    { conclusion: "cancelled" },
    { run_id: 35 },
    { head_sha: "c".repeat(40) }
  ])
    assert.throws(() =>
      verifyGateArtifact(q, "windows", output, { artifact, jobs: [{ ...job, ...patch }] })
    );
  assert.throws(() =>
    verifyGateArtifact(q, "windows", output, {
      artifact: { ...artifact, digest: `sha256:${"e".repeat(64)}` },
      jobs: [job]
    })
  );
});
test("software requires actual trusted exact-SHA CI run, job and check origin", () => {
  const run = {
    id: 7,
    run_attempt: 2,
    event: "push",
    repository: { full_name: "linkasu/linka.looks-electron" },
    path: ".github/workflows/ci.yml",
    head_repository: { full_name: "linkasu/linka.looks-electron" },
    head_branch: "main",
    head_sha: sha,
    status: "completed",
    conclusion: "success"
  };
  const job = {
    name: "ci-required",
    run_id: 7,
    run_attempt: 2,
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    check_run_url: "https://api.github.com/repos/linkasu/linka.looks-electron/check-runs/8"
  };
  const check = {
    id: 8,
    name: "ci-required",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    app: { slug: "github-actions" }
  };
  verifySoftware(sha, { run, jobs: [job], check });
  for (const patch of [
    { head_sha: "b".repeat(40) },
    { conclusion: "cancelled" },
    { path: ".github/workflows/other.yml" },
    { head_branch: "other" }
  ])
    assert.throws(() => verifySoftware(sha, { run: { ...run, ...patch }, jobs: [job], check }));
  assert.throws(() => verifySoftware(sha, { run, jobs: [], check }));
  assert.throws(() => verifySoftware(sha, { run, jobs: [{ ...job, run_attempt: 1 }], check }));
  assert.throws(() =>
    verifySoftware(sha, { run: { ...run, event: "pull_request" }, jobs: [job], check })
  );
  assert.throws(() =>
    verifySoftware(sha, { run, jobs: [job], check: { ...check, app: { slug: "other" } } })
  );
});
test("diagnostics never become release, manual release requires main/all", () => {
  assert.equal(selectMode("workflow_run", "main", "all", false), "release");
  assert.equal(selectMode("workflow_dispatch", "topic", "all", true), "diagnostic");
  assert.throws(() => selectMode("workflow_dispatch", "topic", "all", false));
  assert.throws(() => selectMode("workflow_dispatch", "main", "upgrade", false));
});
test("native PASS must include all genuine stages and distinct installed-app assertions", () => {
  assert.throws(() => nativeEvidence({ status: "PASS", stages: [] }));
  assert.throws(() => nativeEvidence({ status: "FAIL" }));
});

test("genuine native evidence validates actual preservation before emitting publisher assertions", () => {
  const { UPGRADE_STAGES } = require("./real-upgrade-contract.cjs");
  const r = {
    status: "PASS",
    old: { version: "4.0.0" },
    candidate: { version: "4.1.0" },
    resources: { runtimeSha256: "a".repeat(64), modelSha256: "b".repeat(64) },
    oldProcessExit: { exitCode: 0, signalCode: null },
    restart: { automaticNSISRestart: true, responding: true },
    installedExecutable: { old: "a".repeat(64), new: "b".repeat(64) },
    model: {
      "lp-electron.exe": { size: 1, sha256: "a".repeat(64) },
      "model.lpk": { size: 2, sha256: "b".repeat(64) }
    },
    stages: UPGRADE_STAGES.map((label, i) =>
      label.endsWith("-rejected")
        ? { label }
        : {
            label,
            config: {
              pcHash: "test",
              telemetryConsent: "disabled",
              first_calibrate: true,
              defaultSetsDownloaded: 1,
              colors_primary: "#123456",
              button_timeout: 1730,
              button_clickSound: false,
              layoutSettings_fontSize: 29,
              futureUnknownV9: { unicode: "😀" },
              ...(i >= 10 ? { eyeTypingDraftV1: { text: "хо", caret: 2 } } : {})
            },
            consent: { preference: "disabled" },
            archive: i >= 9 ? "saved" : "original",
            entries: {
              "изображения/Кот 😀.png": "c".repeat(64),
              "звук/Тишина №1.wav": "d".repeat(64)
            }
          }
    )
  };
  assert.equal(nativeEvidence(r).upgrade.draftPreserved, true);
  r.resources.modelSha256 = "e".repeat(64);
  assert.throws(() => nativeEvidence(r));
  r.resources.modelSha256 = "b".repeat(64);
  r.stages.at(-1).config.eyeTypingDraftV1.text = "lost";
  assert.throws(() => nativeEvidence(r));
});
