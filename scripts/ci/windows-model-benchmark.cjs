// Candidate-only qualification. No FINAL data, production approval or artifact discovery by latest.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { cpus, totalmem } = require("node:os");
const REPO = "linkasu/linka.predictor-rust";
const LIMIT = 134217728;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function modelName(variant) {
  assert.ok(["U", "T"].includes(variant), "variant must be U or T");
  return `${variant}.lpk`;
}
function validateProvenance(provenance, run, name, digest) {
  assert.ok(["U.lpk", "T.lpk"].includes(name));
  assert.equal(provenance.schema, "linka-model-candidates-v1");
  assert.equal(provenance.source_revision, run.head_sha);
  assert.match(provenance.source_manifest_sha256 || "", /^[a-f0-9]{64}$/);
  assert.match(provenance.exclusions_sha256 || "", /^[a-f0-9]{64}$/);
  assert.equal(provenance.quality_approved, false);
  assert.equal(provenance.redistribution_approved, false);
  assert.equal(provenance.final_evaluated, false);
  assert.equal(provenance.files_sha256?.[name], digest);
}
function validateModelBundle(get, run, name, digest) {
  const provenance = JSON.parse(get("provenance.json"));
  validateProvenance(provenance, run, name, digest);
  const verified = (file) => {
    const bytes = get(file);
    assert.equal(hash(bytes), provenance.files_sha256?.[file], "bundle file hash mismatch");
    return bytes;
  };
  const manifest = verified("source-manifest.json");
  assert.equal(hash(manifest), provenance.source_manifest_sha256);
  for (const file of ["source-review.json", "review-report.json"]) {
    assert.equal(JSON.parse(verified(file)).exclusions_sha256, provenance.exclusions_sha256);
  }
  verified("NOTICES.txt");
  let model;
  for (const variant of ["U", "T"]) {
    const receipt = JSON.parse(verified(`${variant}.receipt.json`));
    assert.equal(receipt.child_reaped, true);
    if (variant === "T" && receipt.state === "FAILED") {
      assert.ok(Number.isInteger(receipt.code) && receipt.code > 0);
      assert.notEqual(name, "T.lpk", "failed optional T is not qualifiable");
      continue;
    }
    assert.equal(receipt.state, "COMPLETED");
    assert.equal(receipt.code, 0);
    assert.ok(Number.isSafeInteger(receipt.bytes) && receipt.bytes > 0 && receipt.bytes <= LIMIT);
    assert.equal(receipt.model_sha256, provenance.files_sha256?.[`${variant}.lpk`]);
    assert.match(receipt.model_sha256 || "", /^[a-f0-9]{64}$/);
    // U must always be complete and hash-bound, even when qualifying T.
    const bytes = verified(`${variant}.lpk`);
    assert.equal(bytes.length, receipt.bytes);
    verified(`${variant}.dev.json`);
    if (name === `${variant}.lpk`) model = bytes;
  }
  assert.ok(model, "selected completed model missing");
  assert.equal(hash(model), digest, "selected model differs from qualified SHA256");
  return { model, provenance };
}
function validateRun(run, kind, id) {
  assert.match(String(id), /^[1-9][0-9]*$/);
  assert.equal(String(run.id), String(id));
  assert.equal(run.repository?.full_name, REPO);
  assert.equal(run.head_repository?.full_name, REPO, "fork artifacts are not executable inputs");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  assert.equal(
    run.path,
    `.github/workflows/${kind === "model" ? "model-candidates" : "windows-runtime"}.yml`
  );
  assert.ok(
    (kind === "model" ? ["workflow_dispatch"] : ["workflow_dispatch", "pull_request"]).includes(
      run.event
    )
  );
}
function validateArtifact(a, run, kind, id) {
  assert.equal(String(a.id), String(id));
  assert.equal(a.expired, false);
  assert.equal(a.workflow_run?.id, run.id);
  assert.equal(a.workflow_run?.head_sha, run.head_sha);
  assert.match(a.digest || "", /^sha256:[a-f0-9]{64}$/);
  assert.ok(a.size_in_bytes > 0 && a.size_in_bytes <= 300 * 1024 ** 2);
  const name =
    kind === "model"
      ? `model-candidates-${run.id}-${run.run_attempt || 1}`
      : `windows-runtime-${run.event === "pull_request" ? "pr-unreviewed" : "manual-reviewed"}-${run.head_sha}`;
  assert.equal(a.name, name);
}
const modelFiles = [
  "U.lpk",
  "T.lpk",
  "U.dev.json",
  "T.dev.json",
  "U.receipt.json",
  "T.receipt.json",
  "report.json",
  "frequencies.tsv",
  "train.groups.tsv",
  "dev.groups.tsv",
  "attribution.jsonl.bz2",
  "source-manifest.json",
  "source-review.json",
  "review-report.json",
  "KenLM-LICENSE",
  "NOTICES.txt",
  "provenance.json"
];
const runtimeFiles = [
  "lp-electron.exe",
  "LICENSE",
  "tiny-runtime-v1.lpk",
  "tiny-NOTICE.md",
  "source.txt",
  "toolchain.txt",
  "dependencies.txt",
  "dll-imports.txt",
  "sha256.txt",
  "smoke.txt"
];
function validateEntries(entries, kind) {
  const allowed = new Set(kind === "model" ? modelFiles : runtimeFiles);
  const seen = new Set();
  let total = 0;
  for (const e of entries) {
    assert.ok(
      allowed.has(e.entryName) && !seen.has(e.entryName),
      "unexpected or duplicate ZIP path"
    );
    seen.add(e.entryName);
    assert.notEqual((e.header.attr >>> 16) & 0xf000, 0xa000, "ZIP symlink forbidden");
    const size = e.header.size;
    assert.ok(
      Number.isSafeInteger(size) &&
        size >= 0 &&
        size <=
          (e.entryName.endsWith(".lpk")
            ? LIMIT
            : e.entryName === "lp-electron.exe"
              ? 16 * 1024 ** 2
              : 64 * 1024 ** 2)
    );
    total += size;
    assert.ok(total <= 512 * 1024 ** 2, "ZIP expansion budget exceeded");
  }
}
function summarize(samples) {
  assert.ok(samples.length >= 1000, "at least 1000 completed UI requests required");
  const ids = new Set();
  const durations = samples
    .map((s) => {
      assert.ok(Number.isSafeInteger(s.id) && !ids.has(s.id));
      ids.add(s.id);
      assert.ok(Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start);
      assert.ok(Number.isInteger(s.count) && s.count >= 0 && s.count <= 3);
      return s.end - s.start;
    })
    .sort((a, b) => a - b);
  const p95_ms = durations[Math.ceil(durations.length * 0.95) - 1];
  const p99_ms = durations[Math.ceil(durations.length * 0.99) - 1];
  return {
    completed: samples.length,
    zero_suggestions: samples.filter((s) => !s.count).length,
    p95_ms,
    p99_ms,
    within_budget: p95_ms <= 300 && p99_ms <= 750
  };
}
async function bounded(response, limit) {
  assert.ok(response.ok, `HTTP status ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= limit, "HTTP response budget exceeded");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function prepare() {
  assert.equal(process.platform, "win32", "native qualification is Windows only");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const env = process.env;
  for (const name of ["MODEL_SHA256", "EXE_SHA256"])
    assert.match(env[name] || "", /^[a-f0-9]{64}$/);
  assert.match(env.APP_TOOLING_SHA || "", /^[a-f0-9]{40}$/);
  const name = modelName(env.MODEL_VARIANT);
  const root = resolve(".windows-model-candidate");
  assert.ok(!existsSync(root), "do not resume an unknown candidate directory");
  mkdirSync(root);
  const receipt = {
    schema: "windows-model-candidate-v1",
    production_approved: false,
    hardware: "NOT_TESTED",
    app_tooling_sha: env.APP_TOOLING_SHA,
    model_variant: env.MODEL_VARIANT,
    model_sha256: env.MODEL_SHA256,
    exe_sha256: env.EXE_SHA256,
    runner: {
      platform: process.platform,
      cpu: cpus()[0]?.model,
      logical_cpu: cpus().length,
      ram_bytes: totalmem(),
      image: env.ImageVersion
    }
  };
  const api = async (path) =>
    JSON.parse(
      (
        await bounded(
          await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
            headers: {
              Authorization: `Bearer ${env.GH_TOKEN}`,
              Accept: "application/vnd.github+json"
            },
            signal: AbortSignal.timeout(60000)
          }),
          4 * 1024 ** 2
        )
      ).toString("utf8")
    );
  for (const kind of ["model", "runtime"]) {
    const prefix = kind.toUpperCase();
    const id = env[`${prefix}_RUN_ID`],
      aid = env[`${prefix}_ARTIFACT_ID`];
    assert.match(id || "", /^[1-9][0-9]*$/);
    assert.match(aid || "", /^[1-9][0-9]*$/);
    const run = await api(`actions/runs/${id}`);
    validateRun(run, kind, id);
    const artifact = await api(`actions/artifacts/${aid}`);
    validateArtifact(artifact, run, kind, aid);
    // The per-run endpoint is an independent membership check, not discovery by artifact name.
    let member = false;
    for (let page = 1; page <= 10 && !member; page++) {
      const list = await api(`actions/runs/${id}/artifacts?per_page=100&page=${page}`);
      member = list.artifacts.some((a) => String(a.id) === aid);
      if (list.artifacts.length < 100) break;
    }
    assert.ok(member, "artifact does not belong to requested run");
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/actions/artifacts/${aid}/zip`,
      {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}` },
        signal: AbortSignal.timeout(120000)
      }
    );
    const bytes = await bounded(response, 300 * 1024 ** 2);
    assert.equal(`sha256:${hash(bytes)}`, artifact.digest, "archive digest mismatch");
    // This reviewed decoder caps inflate output at declared size; older versions did not.
    assert.equal(require("adm-zip/package.json").version, "0.6.1");
    const zip = new (require("adm-zip"))(bytes);
    validateEntries(zip.getEntries(), kind);
    const get = (filename) => {
      const e = zip.getEntry(filename);
      assert.ok(e, "required bundle member missing");
      const data = e.getData();
      assert.equal(data.length, e.header.size);
      return data;
    };
    if (kind === "model") {
      const { model } = validateModelBundle(get, run, name, env.MODEL_SHA256);
      for (const f of [
        "source-manifest.json",
        "source-review.json",
        "review-report.json",
        "U.receipt.json",
        "T.receipt.json",
        "NOTICES.txt"
      ]) {
        writeFileSync(join(root, f), get(f));
      }
      writeFileSync(join(root, "model.lpk"), model);
      writeFileSync(join(root, "provenance.json"), get("provenance.json"));
    } else {
      const exe = get("lp-electron.exe");
      assert.equal(hash(exe), env.EXE_SHA256);
      const source = get("source.txt")
        .toString("utf8")
        .replace(/^\uFEFF/, "");
      assert.equal(source.split(/\r?\n/)[0].trim(), run.head_sha);
      const toolchain = get("toolchain.txt").toString("utf8");
      assert.match(toolchain, /rustc 1\.98\.1/);
      assert.match(toolchain, /crt-static=true/);
      assert.match(get("smoke.txt").toString("utf8"), /^\uFEFF?PASS: native RU JSON/);
      assert.doesNotMatch(
        get("dll-imports.txt").toString("utf8"),
        /(VCRUNTIME|MSVCP|ucrtbase|api-ms-win-crt).*\.dll/i
      );
      writeFileSync(join(root, "lp-electron.exe"), exe);
      for (const f of [
        "source.txt",
        "toolchain.txt",
        "dependencies.txt",
        "dll-imports.txt",
        "sha256.txt",
        "smoke.txt"
      ])
        writeFileSync(join(root, f), get(f));
    }
    receipt[kind] = {
      repository: REPO,
      run_id: run.id,
      artifact_id: artifact.id,
      archive_digest: artifact.digest,
      source_sha: run.head_sha,
      workflow_path: run.path,
      event: run.event,
      trust_scope: run.event === "pull_request" ? "pr-unreviewed" : "manual-candidate-only"
    };
  }
  mkdirSync("qualification", { recursive: true });
  writeFileSync("qualification/source.json", JSON.stringify(receipt, null, 2));
}
function stage() {
  assert.equal(process.platform, "win32");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const receipt = JSON.parse(readFileSync("qualification/source.json", "utf8"));
  mkdirSync("predictor-resources", { recursive: true });
  for (const [file, expected] of [
    ["model.lpk", receipt.model_sha256],
    ["lp-electron.exe", receipt.exe_sha256]
  ]) {
    const source = join(".windows-model-candidate", file);
    assert.equal(hash(readFileSync(source)), expected, "candidate changed before staging");
    copyFileSync(source, join("predictor-resources", file));
  }
}
module.exports = {
  validateRun,
  validateArtifact,
  validateEntries,
  validateProvenance,
  validateModelBundle,
  summarize,
  modelName,
  hash
};
if (require.main === module)
  Promise.resolve()
    .then(() => {
      assert.ok(
        process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--stage")
      );
      return process.argv[2] === "--stage" ? stage() : prepare();
    })
    .catch(() => {
      console.error("Candidate verification/staging failed (no inputs or paths logged)");
      process.exitCode = 1;
    });
