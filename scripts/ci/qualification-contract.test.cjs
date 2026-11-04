const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  validateQualification,
  requireReleaseQualification,
  verifyQualificationFiles,
  validateQualificationOrigin
} = require("./qualification-contract.cjs");
const sha = "a".repeat(40);
const hash = "b".repeat(64);
function fixture() {
  const q = {
    schema: "linka-windows-qualification-v1",
    repository: "linkasu/linka.looks-electron",
    candidateId: "12",
    candidateSha256: hash,
    version: "4.1.0",
    appSha: sha,
    buildToolingSha: sha,
    installerSha256: hash,
    harnessSha: sha,
    runId: "34",
    runAttempt: 2,
    mode: "release",
    status: "PASS",
    gates: {},
    reports: []
  };
  for (const suite of ["software", "packaged", "security", "upgrade"]) {
    const report = `${suite}.json`;
    q.gates[suite] = { status: "PASS", report };
    q.reports.push({
      name: report,
      bytes: 2,
      sha256: createHash("sha256").update("{}").digest("hex")
    });
  }
  return q;
}
test("receipt rejects missing gates, diagnostic eligibility and candidate substitution", () => {
  const q = fixture();
  validateQualification(q);
  const context = {
    candidate: {
      repository: q.repository,
      version: q.version,
      appSha: sha,
      buildToolingSha: sha,
      installer: { sha256: hash }
    },
    candidateId: "12",
    candidateSha256: hash
  };
  requireReleaseQualification(q, context);
  assert.throws(() => requireReleaseQualification({ ...q, mode: "diagnostic" }, context));
  assert.throws(() => requireReleaseQualification(q, { ...context, candidateId: "13" }));
  delete q.gates.upgrade;
  assert.throws(() => validateQualification(q));
});
test("single-suite diagnostic PASS keeps other gates NOT_RUN; release still needs all four", () => {
  const q = fixture();
  q.mode = "diagnostic";
  for (const suite of ["software", "packaged", "upgrade"]) q.gates[suite].status = "NOT_RUN";
  q.reports = q.reports.filter((r) => r.name === "security.json");
  validateQualification(q);
  assert.throws(() => validateQualification({ ...q, mode: "release" }));
  q.gates.security.status = "CANCELLED";
  assert.throws(() => validateQualification(q));
  q.status = "CANCELLED";
  validateQualification(q);
  q.candidateId = "9007199254740992";
  assert.throws(() => validateQualification(q));
});

test("file verification rejects altered, missing and symlink reports", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qualification-"));
  try {
    const q = fixture();
    for (const r of q.reports) fs.writeFileSync(path.join(dir, r.name), "{}");
    // Invalid semantic reports cannot be accepted merely because their hashes match.
    assert.throws(() => verifyQualificationFiles(q, dir));
    fs.writeFileSync(path.join(dir, "software.json"), "changed");
    assert.throws(() => verifyQualificationFiles(q, dir));
    fs.unlinkSync(path.join(dir, "software.json"));
    assert.throws(() => verifyQualificationFiles(q, dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("valid semantic reports verify and bind every suite and original attempt", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qualification-valid-"));
  try {
    const q = fixture();
    q.reports = [];
    for (const suite of Object.keys(q.gates)) {
      const r = {
        schema: "linka-ci-gate-v1",
        suite,
        mode: q.mode,
        status: "PASS",
        candidateId: q.candidateId,
        candidateSha256: q.candidateSha256,
        installerSha256: q.installerSha256,
        harnessSha: q.harnessSha,
        runId: q.runId,
        runAttempt: 1,
        job: { packaged: "windows", upgrade: "windows" }[suite] || suite,
        data: {
          software: {
            workflowRunId: "7",
            checkRunId: "8",
            appSha: q.appSha,
            conclusion: "success"
          },
          security: {
            status: "REVIEWED_SOURCE_ONLY",
            inventorySha256: hash,
            auditSha256: hash,
            lockSha256: hash,
            candidateInstallerSha256: hash,
            remainingFindings: 6
          },
          packaged: {
            installedExecutable: hash,
            resources: { modelSha256: hash, runtimeSha256: hash },
            model: {
              "lp-electron.exe": { sha256: hash, size: 3 },
              "model.lpk": { sha256: hash, size: 4 }
            },
            hardware: "NOT_TESTED",
            assertions: ["version", "root", "editor", "model", "draft"]
          },
          upgrade: {
            status: "PASS",
            oldVersion: "4.0.0",
            baseline: {
              version: "4.0.0",
              source: sha,
              url: "https://github.com/linkasu/linka.looks-electron/releases/download/v4.0.0/linka.looks-4.0.0-win-x64.exe",
              size: 2,
              sha256: hash
            },
            newVersion: q.version,
            oldProcessExited: true,
            settingsPreserved: true,
            archivePreserved: true,
            mediaPreserved: true,
            unknownFieldsPreserved: true,
            draftPreserved: true,
            nsisRestartResponsive: true,
            oldProcessExit: { exitCode: 0, signalCode: null },
            restart: { automaticNSISRestart: true, responding: true },
            stages: require("./real-upgrade-contract.cjs").UPGRADE_STAGES
          }
        }[suite]
      };
      const b = Buffer.from(JSON.stringify(r));
      fs.writeFileSync(path.join(dir, `${suite}.json`), b);
      q.reports.push({
        name: `${suite}.json`,
        bytes: b.length,
        sha256: createHash("sha256").update(b).digest("hex")
      });
    }
    verifyQualificationFiles(q, dir);
    const context = {
      candidateId: q.candidateId,
      candidateSha256: q.candidateSha256,
      candidate: {
        repository: q.repository,
        version: q.version,
        appSha: q.appSha,
        buildToolingSha: q.buildToolingSha,
        installer: { sha256: q.installerSha256 },
        resources: { modelSha256: hash, runtimeSha256: hash },
        baseline: {
          version: "4.0.0",
          sourceSha: sha,
          installer: {
            url: "https://github.com/linkasu/linka.looks-electron/releases/download/v4.0.0/linka.looks-4.0.0-win-x64.exe",
            bytes: 2,
            sha256: hash
          }
        }
      }
    };
    verifyQualificationFiles(q, dir, context);
    context.candidate.resources.modelSha256 = "e".repeat(64);
    assert.throws(() => verifyQualificationFiles(q, dir, context));
    context.candidate.resources.modelSha256 = hash;
    context.candidate.baseline.sourceSha = "e".repeat(40);
    assert.throws(() => verifyQualificationFiles(q, dir, context));
    const good = fs.readFileSync(path.join(dir, "software.json"));
    fs.unlinkSync(path.join(dir, "software.json"));
    fs.writeFileSync(path.join(dir, "outside.json"), good);
    fs.symlinkSync(path.join(dir, "outside.json"), path.join(dir, "software.json"));
    assert.throws(() => verifyQualificationFiles(q, dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("origin requires exact successful trusted workflow, artifact membership and all real jobs", () => {
  const q = fixture();
  const run = {
    id: 34,
    run_attempt: 2,
    head_sha: sha,
    head_branch: "main",
    head_repository: { full_name: q.repository },
    repository: { full_name: q.repository },
    path: ".github/workflows/windows-qualification.yml",
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch"
  };
  const artifact = {
    id: 56,
    name: "qualification-34-2",
    expired: false,
    workflow_run: { id: 34, head_sha: sha }
  };
  const jobs = ["software", "windows", "security", "ready"].map((name) => ({
    name,
    run_id: 34,
    run_attempt: 2,
    head_sha: sha,
    status: "completed",
    conclusion: "success"
  }));
  validateQualificationOrigin(q, { run, artifact, jobs });
  for (const change of [
    { conclusion: "cancelled" },
    { head_branch: "other" },
    { head_sha: "c".repeat(40) },
    { run_attempt: 1 }
  ])
    assert.throws(() =>
      validateQualificationOrigin(q, { run: { ...run, ...change }, artifact, jobs })
    );
  assert.throws(() =>
    validateQualificationOrigin(q, {
      run,
      artifact: { ...artifact, name: "qualification-diagnostics-34-2" },
      jobs
    })
  );
  assert.throws(() => validateQualificationOrigin(q, { run, artifact, jobs: jobs.slice(1) }));
});
