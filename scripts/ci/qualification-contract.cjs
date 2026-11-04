const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const repository = "linkasu/linka.looks-electron";
const suites = ["software", "packaged", "security", "upgrade"];
const digest = (b) => createHash("sha256").update(b).digest("hex");
const positive = (v) =>
  typeof v === "string" && /^[1-9]\d{0,15}$/.test(v) && Number.isSafeInteger(Number(v));
const hash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const sha = (v) => typeof v === "string" && /^[a-f0-9]{40}$/.test(v);
const filename = (v) => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(v);
const statuses = ["PASS", "FAIL", "CANCELLED", "INFRA_ERROR", "NOT_RUN"];

function validateGateData(report, q) {
  const d = report.data;
  assert(d && typeof d === "object" && Object.keys(d).length > 0, "semantic evidence required");
  if (report.status !== "PASS") return;
  if (report.suite === "software") {
    assert(positive(d.workflowRunId) && positive(d.checkRunId));
    assert.equal(d.appSha, q.appSha);
    assert.equal(d.conclusion, "success");
  } else if (report.suite === "security") {
    assert.equal(d.status, "REVIEWED_SOURCE_ONLY");
    for (const key of ["inventorySha256", "auditSha256", "lockSha256"]) assert(hash(d[key]));
    assert.equal(d.candidateInstallerSha256, q.installerSha256);
    assert(Number.isSafeInteger(d.remainingFindings) && d.remainingFindings >= 0);
  } else if (report.suite === "upgrade") {
    assert.equal(d.status, "PASS");
    assert.equal(d.newVersion, q.version);
    assert(require("./candidate-contract.cjs").below(d.oldVersion, d.newVersion));
    for (const key of [
      "oldProcessExited",
      "settingsPreserved",
      "archivePreserved",
      "mediaPreserved",
      "unknownFieldsPreserved",
      "draftPreserved",
      "nsisRestartResponsive"
    ])
      assert.equal(d[key], true, key);
    assert.equal(d.oldProcessExit.exitCode, 0);
    assert.equal(d.oldProcessExit.signalCode, null);
    assert.equal(d.restart.automaticNSISRestart, true);
    assert.equal(d.restart.responding, true);
    assert.deepEqual(d.stages, require("./real-upgrade-contract.cjs").UPGRADE_STAGES);
  } else {
    assert(hash(d.installedExecutable));
    for (const name of ["lp-electron.exe", "model.lpk"]) {
      assert(hash(d.model[name].sha256));
      assert(Number.isSafeInteger(d.model[name].size) && d.model[name].size > 0);
    }
    assert.equal(d.model["model.lpk"].sha256, d.resources.modelSha256);
    assert.equal(d.model["lp-electron.exe"].sha256, d.resources.runtimeSha256);
    assert.equal(d.hardware, "NOT_TESTED");
    assert(Array.isArray(d.assertions) && d.assertions.length >= 5);
  }
}

function validateQualification(q) {
  assert.deepEqual(
    Object.keys(q).sort(),
    [
      "schema",
      "repository",
      "candidateId",
      "candidateSha256",
      "version",
      "appSha",
      "buildToolingSha",
      "installerSha256",
      "harnessSha",
      "runId",
      "runAttempt",
      "mode",
      "status",
      "gates",
      "reports"
    ].sort()
  );
  assert.equal(q.schema, "linka-windows-qualification-v1");
  assert.equal(q.repository, repository);
  assert(positive(q.candidateId) && positive(q.runId));
  assert(Number.isSafeInteger(q.runAttempt) && q.runAttempt > 0);
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(q.version));
  for (const k of ["candidateSha256", "installerSha256"]) assert(hash(q[k]), k);
  for (const k of ["appSha", "buildToolingSha", "harnessSha"]) assert(sha(q[k]), k);
  assert(["release", "diagnostic"].includes(q.mode));
  assert(statuses.slice(0, 4).includes(q.status));
  assert.deepEqual(Object.keys(q.gates).sort(), [...suites].sort());
  assert(Array.isArray(q.reports) && q.reports.length <= 4);
  const names = new Set();
  for (const r of q.reports) {
    assert.deepEqual(Object.keys(r).sort(), ["name", "bytes", "sha256"].sort());
    assert(filename(r.name) && !names.has(r.name));
    names.add(r.name);
    assert(Number.isSafeInteger(r.bytes) && r.bytes > 0 && r.bytes <= 1024 * 1024);
    assert(hash(r.sha256));
  }
  for (const [suite, g] of Object.entries(q.gates)) {
    assert.deepEqual(Object.keys(g).sort(), ["report", "status"]);
    assert(statuses.includes(g.status));
    assert.equal(g.report, `${suite}.json`);
    if (g.status !== "NOT_RUN") assert(names.has(g.report), "missing gate report");
  }
  assert.equal(
    q.reports.length,
    Object.values(q.gates).filter((g) => g.status !== "NOT_RUN").length
  );
  if (q.status === "PASS") {
    assert(suites.some((s) => q.gates[s].status === "PASS"));
    assert(
      suites.every(
        (s) =>
          q.gates[s].status === "PASS" ||
          (q.mode === "diagnostic" && q.gates[s].status === "NOT_RUN")
      )
    );
  }
  if (q.status === "CANCELLED") assert(suites.some((s) => q.gates[s].status === "CANCELLED"));
  if (q.status === "FAIL") assert(suites.some((s) => q.gates[s].status === "FAIL"));
  const observed = suites.map((s) => q.gates[s].status);
  for (const status of ["CANCELLED", "INFRA_ERROR", "FAIL"]) {
    if (observed.includes(status)) {
      assert.equal(q.status, status);
      break;
    }
  }
  return q;
}

function requireReleaseQualification(q, { candidate: c, candidateId, candidateSha256 }) {
  validateQualification(q);
  assert.equal(q.mode, "release");
  assert.equal(q.status, "PASS");
  assert(suites.every((s) => q.gates[s].status === "PASS"));
  assert.equal(q.candidateId, String(candidateId));
  assert.equal(q.candidateSha256, candidateSha256);
  for (const k of ["repository", "version", "appSha", "buildToolingSha"])
    assert.equal(q[k], c[k], k);
  assert.equal(q.installerSha256, c.installer.sha256);
  return q;
}

function verifyQualificationFiles(q, directory, context) {
  validateQualification(q);
  if (context) {
    const c = context.candidate;
    assert.equal(q.candidateId, context.candidateId);
    assert.equal(q.candidateSha256, context.candidateSha256);
    for (const k of ["repository", "version", "appSha", "buildToolingSha"])
      assert.equal(q[k], c[k]);
    assert.equal(q.installerSha256, c.installer.sha256);
  }
  assert(fs.lstatSync(directory).isDirectory(), "regular report directory required");
  for (const r of q.reports) {
    const file = path.join(directory, r.name);
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && stat.size === r.bytes, "regular bounded report required");
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length, r.bytes);
    assert.equal(digest(bytes), r.sha256);
    const report = JSON.parse(bytes);
    assert.deepEqual(
      Object.keys(report).sort(),
      [
        "schema",
        "suite",
        "mode",
        "status",
        "candidateId",
        "candidateSha256",
        "installerSha256",
        "harnessSha",
        "runId",
        "runAttempt",
        "job",
        "data"
      ].sort()
    );
    assert.equal(report.schema, "linka-ci-gate-v1");
    assert(suites.includes(report.suite));
    assert.equal(q.gates[report.suite].report, r.name);
    assert.equal(report.status, q.gates[report.suite].status);
    for (const k of [
      "mode",
      "candidateId",
      "candidateSha256",
      "installerSha256",
      "harnessSha",
      "runId"
    ])
      assert.equal(report[k], q[k], k);
    // Successful jobs reused by Actions retain their producing attempt, never a fabricated current attempt.
    assert(
      Number.isSafeInteger(report.runAttempt) &&
        report.runAttempt > 0 &&
        report.runAttempt <= q.runAttempt
    );
    assert.equal(
      report.job,
      { software: "software", packaged: "windows", upgrade: "windows", security: "security" }[
        report.suite
      ]
    );
    validateGateData(report, q);
    if (context && report.status === "PASS") {
      const c = context.candidate;
      if (report.suite === "packaged") assert.deepEqual(report.data.resources, c.resources);
      if (report.suite === "upgrade") {
        assert.equal(report.data.oldVersion, c.baseline.version);
        const b = report.data.baseline;
        assert.equal(b.version, c.baseline.version);
        assert.equal(b.source, c.baseline.sourceSha);
        assert.equal(b.url, c.baseline.installer.url);
        assert.equal(b.size, c.baseline.installer.bytes);
        assert.equal(b.sha256, c.baseline.installer.sha256);
      }
    }
  }
  return q;
}

function validateQualificationOrigin(q, { run, artifact, jobs }) {
  validateQualification(q);
  assert.equal(q.mode, "release");
  assert.equal(q.status, "PASS");
  assert.equal(String(run.id), q.runId);
  assert.equal(run.run_attempt, q.runAttempt);
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(run.repository.full_name, repository);
  assert.equal(run.path, ".github/workflows/windows-qualification.yml");
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_sha, q.harnessSha);
  assert(["workflow_run", "workflow_dispatch"].includes(run.event));
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert(positive(String(artifact.id)));
  assert.equal(artifact.name, `qualification-${q.runId}-${q.runAttempt}`);
  assert.equal(artifact.expired, false);
  assert.equal(String(artifact.workflow_run.id), q.runId);
  assert.equal(artifact.workflow_run.head_sha, q.harnessSha);
  for (const name of ["software", "windows", "security", "ready"]) {
    const matches = jobs.filter((j) => j.name === name);
    assert.equal(matches.length, 1, `missing/ambiguous job: ${name}`);
    const j = matches[0];
    assert.equal(String(j.run_id), q.runId);
    assert.equal(j.head_sha, q.harnessSha);
    assert(
      Number.isSafeInteger(j.run_attempt) && j.run_attempt > 0 && j.run_attempt <= q.runAttempt
    );
    assert.equal(j.status, "completed");
    assert.equal(j.conclusion, "success");
    if (name === "ready") assert.equal(j.run_attempt, q.runAttempt);
  }
  return q;
}
module.exports = {
  validateQualification,
  requireReleaseQualification,
  verifyQualificationFiles,
  validateQualificationOrigin
};
