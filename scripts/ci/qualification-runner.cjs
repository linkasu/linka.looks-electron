const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { digest, verifyCandidateFiles, REPOSITORY } = require("./candidate-contract.cjs");
const {
  validateQualification,
  verifyQualificationFiles,
  validateProducingJob
} = require("./qualification-contract.cjs");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const root = `/repos/${REPOSITORY}`;
const suites = ["software", "packaged", "security", "upgrade"];
const positive = (v) =>
  typeof v === "string" && /^[1-9]\d{0,15}$/.test(v) && Number.isSafeInteger(Number(v));
function selectMode(event, branch, suite, diagnostic) {
  assert(["workflow_run", "workflow_dispatch"].includes(event));
  assert(["all", ...suites.filter((s) => s !== "software")].includes(suite));
  if (event === "workflow_run") {
    assert.equal(branch, "main");
    assert.equal(suite, "all");
    return "release";
  }
  if (diagnostic) return "diagnostic";
  assert.equal(branch, "main", "release qualification requires trusted main");
  assert.equal(suite, "all", "release qualification requires every suite");
  return "release";
}
function verifySoftware(appSha, { run, jobs, check }) {
  assert(positive(String(run.id)) && positive(String(check.id)));
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  assert.equal(run.path, ".github/workflows/ci.yml");
  assert.equal(run.repository.full_name, REPOSITORY);
  assert(["push", "workflow_dispatch"].includes(run.event));
  assert.equal(run.head_repository.full_name, REPOSITORY);
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_sha, appSha);
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  const matched = jobs.filter((j) => j.name === "ci-required");
  assert.equal(matched.length, 1);
  const job = matched[0];
  assert.equal(String(job.run_id), String(run.id));
  assert.equal(job.run_attempt, run.run_attempt);
  assert.equal(job.head_sha, appSha);
  assert.equal(job.status, "completed");
  assert.equal(job.conclusion, "success");
  assert.equal(job.check_run_url, `https://api.github.com${root}/check-runs/${check.id}`);
  assert.equal(check.app.slug, "github-actions");
  assert.equal(check.name, "ci-required");
  assert.equal(check.head_sha, appSha);
  assert.equal(check.status, "completed");
  assert.equal(check.conclusion, "success");
  return {
    workflowRunId: String(run.id),
    appSha,
    checkRunId: String(check.id),
    conclusion: "success"
  };
}
function nativeEvidence(result) {
  assert.equal(result.status, "PASS");
  const required = require("./real-upgrade-contract.cjs").UPGRADE_STAGES;
  assert.deepEqual(
    result.stages.map((s) => s.label),
    required
  );
  assert.equal(result.oldProcessExit.exitCode, 0);
  assert.equal(result.oldProcessExit.signalCode, null);
  assert.equal(result.restart.automaticNSISRestart, true);
  assert.equal(result.restart.responding, true);
  assert.notEqual(result.installedExecutable.old, result.installedExecutable.new);
  assert(result.model["lp-electron.exe"] && result.model["model.lpk"]);
  assert.equal(result.model["model.lpk"].sha256, result.resources.modelSha256);
  assert.equal(result.model["lp-electron.exe"].sha256, result.resources.runtimeSha256);
  const snapshots = result.stages.filter((s) => s.config);
  const initial = snapshots[0];
  assert(initial && snapshots.length === 10);
  for (const key of [
    "pcHash",
    "telemetryConsent",
    "first_calibrate",
    "defaultSetsDownloaded",
    "colors_primary",
    "button_timeout",
    "button_clickSound",
    "layoutSettings_fontSize",
    "futureUnknownV9"
  ])
    assert(Object.hasOwn(initial.config, key), `Missing synthetic preservation seed: ${key}`);
  for (const snapshot of snapshots) {
    for (const key of [
      "pcHash",
      "telemetryConsent",
      "first_calibrate",
      "defaultSetsDownloaded",
      "colors_primary",
      "button_timeout",
      "button_clickSound",
      "layoutSettings_fontSize",
      "futureUnknownV9"
    ])
      assert.deepEqual(snapshot.config[key], initial.config[key]);
    assert.deepEqual(snapshot.consent, initial.consent);
    for (const name of ["изображения/Кот 😀.png", "звук/Тишина №1.wav"]) {
      assert(/^[a-f0-9]{64}$/.test(initial.entries[name]));
      assert.equal(snapshot.entries[name], initial.entries[name]);
    }
  }
  for (const label of [
    "after-corruption",
    "after-interruption",
    "downloaded-before-confirmation",
    "after-automatic-restart",
    "new-reader-no-save",
    "new-editor-unsaved"
  ])
    assert.equal(result.stages.find((s) => s.label === label).archive, initial.archive);
  const saved = result.stages.find((s) => s.label === "new-editor-explicit-save");
  assert.notEqual(saved.archive, initial.archive);
  assert.equal(snapshots.at(-1).archive, saved.archive);
  assert.deepEqual(
    result.stages.find((s) => s.label === "new-draft-persisted").config.eyeTypingDraftV1,
    { text: "хо", caret: 2 }
  );
  assert.deepEqual(snapshots.at(-1).config.eyeTypingDraftV1, { text: "хо", caret: 2 });
  return {
    packaged: {
      scenario: "same genuine upgrade; not a separate cold install",
      installedExecutable: result.installedExecutable.new,
      model: result.model,
      resources: result.resources,
      assertions: [
        "packaged target version",
        "responsive root",
        "set reader/editor",
        "model suggestions",
        "draft restored"
      ],
      hardware: "NOT_TESTED"
    },
    upgrade: {
      status: "PASS",
      oldVersion: result.old.version,
      newVersion: result.candidate.version,
      oldProcessExited: true,
      settingsPreserved: true,
      archivePreserved: true,
      mediaPreserved: true,
      unknownFieldsPreserved: true,
      draftPreserved: true,
      nsisRestartResponsive: true,
      stages: required,
      oldProcessExit: result.oldProcessExit,
      restart: result.restart,
      baseline: result.old,
      assertions: [
        "corruption rejected",
        "interruption rejected",
        "explicit confirmation",
        "settings/archive/media/unknown fields preserved",
        "historical reader"
      ],
      hardware: "NOT_TESTED"
    }
  };
}
function identity(resolved) {
  const { candidate: c, candidateId, candidateSha256 } = resolved;
  return {
    candidateId,
    candidateSha256,
    installerSha256: c.installer.sha256,
    harnessSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    mode: process.env.QUALIFICATION_MODE
  };
}
function report(suite, binding, status, data) {
  return {
    schema: "linka-ci-gate-v1",
    suite,
    ...binding,
    status,
    job: { software: "software", packaged: "windows", upgrade: "windows", security: "security" }[
      suite
    ],
    data
  };
}
function classifyGateError(error) {
  return error.code === "CI_INFRA_ERROR" ? "INFRA_ERROR" : error.qualificationStatus || "FAIL";
}
async function resolve(directory, parts = []) {
  const { resolveCandidate, downloadCandidatePart } = require("./candidate-io.cjs");
  const resolved = await resolveCandidate(process.env.CANDIDATE_ID);
  fs.mkdirSync(directory, { recursive: true });
  for (const kind of parts) await downloadCandidatePart(resolved, kind, path.join(directory, kind));
  // Write the original descriptor bytes: consumers bind to candidateSha256, not reserialized JSON.
  const descriptor = path.join(directory, "candidate.json");
  assert(resolved.descriptorBytes && digest(resolved.descriptorBytes) === resolved.candidateSha256);
  fs.writeFileSync(descriptor, resolved.descriptorBytes, { flag: "wx" });
  return resolved;
}
async function software(
  c,
  { githubJson = require("./candidate-io.cjs").githubJson, timeoutMs = 120000 } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let run;
  while (true) {
    const result = await githubJson(
      `${root}/actions/workflows/ci.yml/runs?head_sha=${c.appSha}&branch=main&per_page=100`
    );
    assert(
      Number.isSafeInteger(result.total_count) && result.total_count < 100,
      "CI run pagination required"
    );
    const matches = result.workflow_runs.filter(
      (r) => r.head_sha === c.appSha && r.head_branch === "main"
    );
    assert(matches.length > 0, "No exact-application-SHA CI run");
    for (const r of matches) assert(positive(String(r.id)));
    const latest = matches.sort((a, b) => b.id - a.id)[0];
    run = await githubJson(`${root}/actions/runs/${latest.id}`);
    assert.equal(String(run.id), String(latest.id));
    assert.equal(run.repository.full_name, REPOSITORY);
    assert.equal(run.head_repository.full_name, REPOSITORY);
    assert.equal(run.head_sha, c.appSha);
    assert.equal(run.head_branch, "main");
    assert.equal(run.path, ".github/workflows/ci.yml");
    assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
    assert(["push", "workflow_dispatch"].includes(run.event));
    if (run.status === "completed") {
      if (run.conclusion !== "success")
        throw Object.assign(new Error("Latest exact-SHA CI run did not succeed"), {
          qualificationStatus: run.conclusion === "cancelled" ? "CANCELLED" : "FAIL"
        });
      break;
    }
    if (Date.now() >= deadline)
      throw Object.assign(new Error("Latest exact-SHA CI run has not completed before deadline"), {
        code: "CI_INFRA_ERROR"
      });
    await require("node:timers/promises").setTimeout(Math.min(1000, deadline - Date.now()));
  }
  const jobs = (
    await githubJson(`${root}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  ).jobs;
  assert(jobs.length < 100, "job pagination required");
  const job = jobs.find((j) => j.name === "ci-required");
  assert(
    job &&
      /^https:\/\/api.github.com\/repos\/linkasu\/linka.looks-electron\/check-runs\/[1-9]\d*$/.test(
        job.check_run_url
      )
  );
  const check = await githubJson(new URL(job.check_run_url).pathname);
  const current = await githubJson(`${root}/actions/runs/${run.id}`);
  assert.equal(String(current.id), String(run.id));
  assert.equal(current.run_attempt, run.run_attempt, "CI attempt changed during verification");
  return verifySoftware(c.appSha, { run: current, jobs, check });
}
async function baselineOrigin(c, { githubJson = require("./candidate-io.cjs").githubJson } = {}) {
  const b = c.baseline;
  const release = await githubJson(`${root}/releases/${b.releaseId}`);
  assert.equal(String(release.id), b.releaseId);
  assert.equal(release.tag_name, b.tag);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
  assert(release.published_at);
  const asset = await githubJson(`${root}/releases/assets/${b.assetId}`);
  assert.equal(String(asset.id), b.assetId);
  assert(release.assets.some((a) => String(a.id) === b.assetId));
  assert.equal(asset.name, b.installer.name);
  assert.equal(asset.size, b.installer.bytes);
  assert.equal(asset.browser_download_url, b.installer.url);
  assert.equal(asset.digest, `sha256:${b.installer.sha256}`);
  const commit = await githubJson(`${root}/commits/${b.tag}`);
  assert.equal(commit.sha, b.sourceSha);
}
async function gate(job, directory) {
  assert(["software", "windows", "security"].includes(job), "unknown qualification job");
  const selected = job === "windows" ? ["packaged", "upgrade"] : [job];
  fs.mkdirSync("gate-reports", { recursive: true });
  let binding;
  try {
    const resolved = await resolve(
      directory,
      job === "security" ? ["windows", "security"] : job === "windows" ? ["windows"] : []
    );
    binding = identity(resolved);
    assert.equal(
      binding.harnessSha,
      process.env.GITHUB_SHA,
      "truthful exact harness checkout required"
    );
    if (job === "software")
      write(
        "gate-reports/software.json",
        report("software", binding, "PASS", await software(resolved.candidate))
      );
    if (job === "security") {
      for (const kind of ["windows", "security"])
        verifyCandidateFiles(resolved.candidate, kind, path.join(directory, kind));
      const securityDir = path.join(directory, "security");
      const provenance = read(path.join(directory, "windows/provenance-windows.json"));
      const guard = require("./real-upgrade-contract.cjs");
      guard.verifyCandidate(
        path.join(directory, "windows"),
        guard.candidateConfiguration(resolved.candidate).expected
      );
      assert.equal(provenance.version, resolved.candidate.version);
      assert.equal(provenance.app, resolved.candidate.appSha);
      assert.equal(provenance.tooling, resolved.candidate.buildToolingSha);
      assert.equal(provenance.run, resolved.candidate.buildRunId);
      const data = require("./release-security-audit.cjs").verify({
        inventory: read(path.join(securityDir, "inventory.json")),
        audit: read(path.join(securityDir, "audit.json")),
        provenance,
        lock: fs.readFileSync(path.join(securityDir, "package-lock.json"))
      });
      write(
        "gate-reports/security.json",
        report("security", binding, "PASS", {
          ...data,
          inventorySha256: digest(fs.readFileSync(path.join(securityDir, "inventory.json"))),
          auditSha256: digest(fs.readFileSync(path.join(securityDir, "audit.json"))),
          candidateInstallerSha256: resolved.candidate.installer.sha256,
          scope: "reviewed scoped residual moderates; exact candidate inventory and lock"
        })
      );
    }
    if (job === "windows") {
      verifyCandidateFiles(resolved.candidate, "windows", path.join(directory, "windows"));
      await baselineOrigin(resolved.candidate);
      // The launcher revalidates the descriptor and bytes before any executable is launched.
      execFileSync(
        "pwsh",
        [
          "-NoProfile",
          "-File",
          "scripts/ci/real-upgrade.ps1",
          "-CandidateDirectory",
          path.join(directory, "windows"),
          "-Descriptor",
          path.join(directory, "candidate.json")
        ],
        { stdio: "inherit", timeout: 28 * 60 * 1000 }
      );
      const native = read("release-evidence/qualification/upgrade-result.json");
      assert.equal(native.harnessSha, binding.harnessSha);
      assert.equal(native.candidate.version, resolved.candidate.version);
      assert.deepEqual(native.resources, resolved.candidate.resources);
      const evidence = nativeEvidence(native);
      for (const suite of selected)
        write(`gate-reports/${suite}.json`, report(suite, binding, "PASS", evidence[suite]));
    }
  } catch (error) {
    // Never serialize arbitrary error stacks, environment, tokens or user data into public receipts.
    if (binding)
      for (const suite of selected)
        write(
          `gate-reports/${suite}.json`,
          report(suite, binding, classifyGateError(error), {
            failure: "Gate failed; bounded synthetic native evidence is in the diagnostic artifact",
            code: String(error.code || "ASSERTION").slice(0, 80)
          })
        );
    throw error;
  }
}
async function prepare() {
  const { githubJson, resolveCandidate } = require("./candidate-io.cjs");
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY);
  const event = read(process.env.GITHUB_EVENT_PATH);
  const automatic = process.env.GITHUB_EVENT_NAME === "workflow_run";
  const suite = automatic ? "all" : event.inputs.suite || "all";
  const mode = selectMode(
    process.env.GITHUB_EVENT_NAME,
    process.env.GITHUB_REF_NAME,
    suite,
    !automatic && String(event.inputs.diagnostic) === "true"
  );
  let id = event.inputs?.candidate_id;
  if (automatic) {
    const run = event.workflow_run;
    assert.equal(run.name, "Windows candidate build");
    assert.equal(run.head_repository.full_name, REPOSITORY);
    assert.equal(run.head_branch, "main");
    assert.equal(run.status, "completed");
    assert.equal(run.conclusion, "success");
    const artifacts = await githubJson(`${root}/actions/runs/${run.id}/artifacts?per_page=100`);
    assert(artifacts.total_count < 100, "artifact pagination required");
    const matches = artifacts.artifacts.filter(
      (a) => a.name === `candidate-${run.id}-${run.run_attempt}` && !a.expired
    );
    assert.equal(matches.length, 1, "exact producer descriptor required");
    id = String(matches[0].id);
  }
  const resolved = await resolveCandidate(id);
  const harness = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(harness, process.env.GITHUB_SHA);
  // Candidate sources must be genuine main ancestors even in branch-harness diagnostics.
  for (const sha of [resolved.candidate.appSha, resolved.candidate.buildToolingSha])
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"]);
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `candidate_id=${resolved.candidateId}\nmode=${mode}\nsuite=${suite}\nharness_sha=${harness}\n`
  );
}
function verifyGateArtifact(q, job, output, { artifact, jobs, producingJobs }) {
  assert(positive(output.artifact_id));
  const attempt = Number(output.attempt);
  assert(Number.isSafeInteger(attempt) && attempt > 0 && attempt <= q.runAttempt);
  assert.equal(String(artifact.id), output.artifact_id);
  assert.equal(artifact.name, `qualification-gates-${job}-${q.runId}-${attempt}`);
  assert.equal(String(artifact.workflow_run.id), q.runId);
  assert.equal(artifact.workflow_run.head_sha, q.harnessSha);
  assert.equal(artifact.expired, false);
  assert.equal(
    artifact.digest,
    `sha256:${output.artifact_digest}`.replace("sha256:sha256:", "sha256:")
  );
  return validateProducingJob(q, { job, runAttempt: attempt }, { jobs, producingJobs });
}
function aggregateStatus(gates, selected) {
  const values = selected.map((s) => gates[s].status);
  for (const status of ["CANCELLED", "INFRA_ERROR", "FAIL"])
    if (values.includes(status)) return status;
  return values.length > 0 && values.every((s) => s === "PASS") ? "PASS" : "INFRA_ERROR";
}
async function aggregate(
  directory,
  {
    githubJson = require("./candidate-io.cjs").githubJson,
    resolved: supplied,
    binding: suppliedBinding,
    outputDirectory = "qualification"
  } = {}
) {
  const resolved = supplied || (await resolve("receipt-candidate"));
  const binding = suppliedBinding || identity(resolved);
  assert.equal(binding.harnessSha, process.env.GITHUB_SHA);
  const c = resolved.candidate;
  const q = {
    schema: "linka-windows-qualification-v1",
    repository: REPOSITORY,
    ...binding,
    version: c.version,
    appSha: c.appSha,
    buildToolingSha: c.buildToolingSha,
    status: "FAIL",
    gates: {},
    reports: []
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const suite of suites) q.gates[suite] = { status: "NOT_RUN", report: `${suite}.json` };
  q.status = "INFRA_ERROR";
  validateQualification(q);
  write(path.join(outputDirectory, "qualification.json"), q);
  const needs = JSON.parse(process.env.GATE_NEEDS);
  const suite = needs.prepare.outputs.suite;
  assert(["all", "security", "packaged", "upgrade"].includes(suite));
  const selected =
    suite === "all" ? suites : suite === "security" ? ["security"] : ["packaged", "upgrade"];
  if (q.mode === "release") assert.equal(suite, "all");
  const jobs = (await githubJson(`${root}/actions/runs/${q.runId}/jobs?filter=latest&per_page=100`))
    .jobs;
  assert(jobs.length < 100);
  const producingAttempts = new Map();
  for (const suite of suites) {
    const job = { packaged: "windows", upgrade: "windows" }[suite] || suite;
    const output = needs[job]?.outputs;
    q.gates[suite] = { status: "NOT_RUN", report: `${suite}.json` };
    if (!selected.includes(suite)) continue;
    const retain = (bytes) => {
      const r = JSON.parse(bytes);
      fs.writeFileSync(path.join(outputDirectory, `${suite}.json`), bytes);
      q.gates[suite] = { status: r.status, report: `${suite}.json` };
      q.reports.push({ name: `${suite}.json`, bytes: bytes.length, sha256: digest(bytes) });
    };
    const actual = jobs.filter((j) => j.name === job);
    const cancelled =
      actual.length === 1 &&
      String(actual[0].run_id) === q.runId &&
      actual[0].head_sha === q.harnessSha &&
      actual[0].status === "completed" &&
      actual[0].conclusion === "cancelled";
    if (cancelled || !output?.artifact_id) {
      if (!cancelled && needs[job]?.result === "skipped") continue;
      const metadataBinding = cancelled
        ? { ...binding, runAttempt: actual[0].run_attempt }
        : binding;
      retain(
        Buffer.from(
          JSON.stringify(
            report(suite, metadataBinding, cancelled ? "CANCELLED" : "INFRA_ERROR", {
              source: "Actions job metadata",
              failure: cancelled
                ? "Actual gate job cancelled"
                : "Required producing job output unavailable; gate not proven"
            })
          )
        )
      );
      continue;
    }
    const attempt = Number(output.attempt);
    assert(Number.isSafeInteger(attempt) && attempt > 0 && attempt <= q.runAttempt);
    let producingJobs;
    if (attempt < q.runAttempt) {
      if (!producingAttempts.has(attempt)) {
        const result = await githubJson(
          `${root}/actions/runs/${q.runId}/attempts/${attempt}/jobs?per_page=100`
        );
        assert(
          Array.isArray(result.jobs) &&
            result.jobs.length < 100 &&
            Number.isSafeInteger(result.total_count) &&
            result.total_count === result.jobs.length,
          "complete bounded producing-attempt jobs required"
        );
        producingAttempts.set(attempt, result.jobs);
      }
      producingJobs = producingAttempts.get(attempt);
    }
    const artifact = await githubJson(`${root}/actions/artifacts/${output.artifact_id}`);
    const producing = verifyGateArtifact(q, job, output, { artifact, jobs, producingJobs });
    const file = path.join(directory, artifact.name, `${suite}.json`);
    if (!fs.existsSync(file)) {
      retain(
        Buffer.from(
          JSON.stringify(
            report(suite, binding, "INFRA_ERROR", {
              source: "artifact membership",
              failure: "Required gate report missing from original artifact"
            })
          )
        )
      );
      continue;
    }
    const stat = fs.lstatSync(file);
    assert(
      stat.isFile() && stat.size > 0 && stat.size <= 1024 * 1024,
      "regular bounded gate report required"
    );
    const bytes = fs.readFileSync(file);
    assert(bytes.length <= 1024 * 1024);
    const manifest = JSON.parse(output.manifest);
    assert.equal(
      manifest[`${suite}.json`]?.sha256,
      digest(bytes),
      "original job report digest mismatch"
    );
    assert.equal(manifest[`${suite}.json`]?.bytes, bytes.length);
    const r = JSON.parse(bytes);
    assert.equal(r.runAttempt, attempt);
    if (r.status === "PASS") assert.equal(producing.conclusion, "success");
    retain(bytes);
  }
  q.status = aggregateStatus(q.gates, selected);
  validateQualification(q);
  verifyQualificationFiles(q, outputDirectory, resolved);
  write(path.join(outputDirectory, "qualification.json"), q);
  const eligible =
    q.mode === "release" &&
    q.status === "PASS" &&
    suites.every((s) => q.gates[s].status === "PASS");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `eligible=${eligible}\n`);
  if (q.mode === "release" && !eligible) process.exitCode = 1;
  return q;
}
module.exports = {
  classifyGateError,
  selectMode,
  verifySoftware,
  nativeEvidence,
  verifyGateArtifact,
  aggregateStatus,
  aggregate,
  software,
  baselineOrigin
};
if (require.main === module) {
  const [command, directory = "candidate"] = process.argv.slice(2);
  const manifest = async () => {
    const files = fs.existsSync("gate-reports") ? fs.readdirSync("gate-reports") : [];
    const entries = Object.fromEntries(
      files.map((name) => {
        const b = fs.readFileSync(path.join("gate-reports", name));
        return [name, { bytes: b.length, sha256: digest(b) }];
      })
    );
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `manifest=${JSON.stringify(entries)}\nattempt=${process.env.GITHUB_RUN_ATTEMPT}\n`
    );
  };
  const artifactIds = async () => {
    const needs = JSON.parse(process.env.GATE_NEEDS);
    const ids = ["software", "windows", "security"]
      .map((job) => needs[job]?.outputs?.artifact_id)
      .filter(Boolean);
    assert(ids.every(positive));
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `ids=${ids.join(",")}\n`);
  };
  (command === "prepare"
    ? prepare()
    : command === "artifact-ids"
      ? artifactIds()
      : command === "manifest"
        ? manifest()
        : command === "aggregate"
          ? aggregate(directory)
          : gate(command, directory)
  ).catch((error) => {
    fs.mkdirSync("qualification", { recursive: true });
    write("qualification/diagnostic-error.json", {
      status: "INFRA_ERROR",
      stage: command,
      failure: "Qualification prerequisite or verification failed; no eligible receipt issued",
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT)
    });
    console.error(
      error.code === "CI_INFRA_ERROR"
        ? "Qualification infrastructure request failed"
        : String(error.message).slice(0, 1000)
    );
    process.exitCode = 1;
  });
}
