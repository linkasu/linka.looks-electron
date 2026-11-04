const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateRun,
  validateArtifact,
  validateEntries,
  validateProvenance,
  validateModelBundle,
  hash,
  summarize,
  modelName
} = require("./windows-model-benchmark.cjs");
const sha = "a".repeat(40);
const run = {
  id: 12,
  run_attempt: 1,
  head_branch: "main",
  status: "completed",
  conclusion: "success",
  head_sha: sha,
  path: ".github/workflows/model-candidates.yml",
  event: "workflow_dispatch",
  repository: { full_name: "linkasu/linka.predictor-rust" },
  head_repository: { full_name: "linkasu/linka.predictor-rust" }
};
test("model source and selected bytes must match candidate-only provenance", () => {
  const digest = "b".repeat(64);
  const provenance = {
    source_revision: sha,
    schema: "linka-model-candidates-v1",
    source_manifest_sha256: "e".repeat(64),
    exclusions_sha256: "f".repeat(64),
    quality_approved: false,
    redistribution_approved: false,
    final_evaluated: false,
    files_sha256: { "U.lpk": digest }
  };
  validateProvenance(provenance, run, "U.lpk", digest);
  for (const bad of [
    { ...provenance, source_revision: "c".repeat(40) },
    { ...provenance, final_evaluated: true },
    { ...provenance, quality_approved: true },
    { ...provenance, redistribution_approved: true },
    { ...provenance, schema: "linka-model-review-v1" },
    { ...provenance, source_manifest_sha256: undefined },
    { ...provenance, exclusions_sha256: undefined, exclusion_sha256: "f".repeat(64) },
    { ...provenance, files_sha256: { "U.lpk": "d".repeat(64) } }
  ])
    assert.throws(() => validateProvenance(bad, run, "U.lpk", digest));
});
// Synthetic producer bytes only: attempt_candidate's exact receipt fields, no real model.
function producerFixture(tCompleted = false) {
  const files = new Map();
  const json = (name, value) => files.set(name, Buffer.from(JSON.stringify(value)));
  const exclusions = "f".repeat(64);
  json("source-manifest.json", { source: { profile: "synthetic" } });
  json("source-review.json", { exclusions_sha256: exclusions });
  json("review-report.json", { mode: "review", exclusions_sha256: exclusions });
  files.set("NOTICES.txt", Buffer.from("synthetic only"));
  for (const variant of ["U", "T"]) {
    if (variant === "T" && !tCompleted) {
      json("T.receipt.json", {
        state: "FAILED",
        child_reaped: true,
        code: 7,
        log: "synthetic",
        log_sha256: null
      });
    } else {
      const model = Buffer.from(`synthetic-${variant}-not-a-real-model`);
      files.set(`${variant}.lpk`, model);
      json(`${variant}.dev.json`, { synthetic: true });
      json(`${variant}.receipt.json`, {
        state: "COMPLETED",
        child_reaped: true,
        code: 0,
        model_sha256: hash(model),
        bytes: model.length
      });
    }
  }
  const provenance = {
    schema: "linka-model-candidates-v1",
    source_revision: sha,
    source_manifest_sha256: hash(files.get("source-manifest.json")),
    exclusions_sha256: exclusions,
    files_sha256: Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)])),
    quality_approved: false,
    redistribution_approved: false,
    final_evaluated: false
  };
  const get = (name) => {
    assert.ok(files.has(name), "missing fixture file");
    return files.get(name);
  };
  const seal = () => json("provenance.json", provenance);
  seal();
  return { files, provenance, get, json, seal };
}
test("actual producer seam: required U qualifies despite failed optional T; completed T qualifies", () => {
  const u = producerFixture();
  assert.deepEqual(
    validateModelBundle(u.get, run, "U.lpk", hash(u.get("U.lpk"))).model,
    u.get("U.lpk")
  );
  assert.throws(() => validateModelBundle(u.get, run, "T.lpk", "b".repeat(64)));
  const t = producerFixture(true);
  assert.deepEqual(
    validateModelBundle(t.get, run, "T.lpk", hash(t.get("T.lpk"))).model,
    t.get("T.lpk")
  );
  t.json("T.receipt.json", { state: "FAILED", code: 7, child_reaped: true });
  t.provenance.files_sha256["T.receipt.json"] = hash(t.get("T.receipt.json"));
  t.seal();
  assert.throws(() => validateModelBundle(t.get, run, "T.lpk", hash(t.get("T.lpk"))));
  validateModelBundle(t.get, run, "U.lpk", hash(t.get("U.lpk")));
});
test("metadata-only staging preserves training and import workflow identity in source.json", async (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");
  const Zip = require("adm-zip");
  const { createHash } = require("node:crypto");
  const { prepare } = require("./windows-model-benchmark.cjs");
  const f = producerFixture();
  const modelRun = { ...run, head_sha: "c".repeat(40) };
  const manifest = {
    schema: "linka-book-candidate-import-v1",
    model_source_sha: sha,
    app_tooling_sha: "d".repeat(40),
    source_manifest: "source.json",
    source_review: "review.json",
    review_report: "report.json",
    exclusion_file: "exclusions.json",
    book_release_id: "1",
    book_archive_sha256: "e".repeat(64),
    book_archive_bytes: 200,
    book_transport: "repository-secret"
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  f.provenance.execution = { source_sha: sha };
  f.provenance.ci_import = {
    schema: "linka-model-ci-import-v1",
    run_id: "12",
    run_attempt: 1,
    workflow_sha: modelRun.head_sha,
    manifest_path: "provenance/import.json",
    manifest_sha256: hash(manifestBytes),
    model_source_sha: sha
  };
  f.seal();
  assert.throws(() => validateModelBundle(f.get, modelRun, "U.lpk", hash(f.get("U.lpk"))));
  const context = {
    manifest,
    manifestSha256: hash(manifestBytes),
    manifest_json: manifestBytes.toString()
  };
  validateModelBundle(f.get, modelRun, "U.lpk", hash(f.get("U.lpk")), context);
  const runtimeRun = { ...run, id: 13, path: ".github/workflows/windows-runtime.yml" };
  const runtimeFiles = {
    "lp-electron.exe": Buffer.from("synthetic-not-executable"),
    "source.txt": Buffer.from(sha),
    "toolchain.txt": Buffer.from("rustc 1.98.1 crt-static=true"),
    "smoke.txt": Buffer.from("PASS: native RU JSON"),
    "dll-imports.txt": Buffer.from("KERNEL32.dll"),
    "dependencies.txt": Buffer.from("synthetic"),
    "sha256.txt": Buffer.from("synthetic")
  };
  const zip = (files) => {
    const z = new Zip();
    for (const [name, data] of files) z.addFile(name, data);
    return z.toBuffer();
  };
  const modelZip = zip(f.files),
    runtimeZip = zip(Object.entries(runtimeFiles));
  const artifact = (r, id, bytes, name) => ({
    id,
    name,
    expired: false,
    digest: `sha256:${hash(bytes)}`,
    size_in_bytes: bytes.length,
    workflow_run: { id: r.id, head_sha: r.head_sha }
  });
  const modelArtifact = artifact(modelRun, 21, modelZip, "model-candidates-12-1");
  const runtimeArtifact = artifact(
    runtimeRun,
    22,
    runtimeZip,
    `windows-runtime-manual-reviewed-${sha}`
  );
  const routes = {
    "actions/runs/12": modelRun,
    "actions/runs/13": runtimeRun,
    "actions/artifacts/21": modelArtifact,
    "actions/artifacts/22": runtimeArtifact,
    "actions/runs/12/artifacts?per_page=100&page=1": { artifacts: [modelArtifact] },
    "actions/runs/13/artifacts?per_page=100&page=1": { artifacts: [runtimeArtifact] },
    [`contents/provenance/import.json?ref=${modelRun.head_sha}`]: {
      type: "file",
      path: "provenance/import.json",
      encoding: "base64",
      content: manifestBytes.toString("base64"),
      size: manifestBytes.length,
      sha: createHash("sha1")
        .update(`blob ${manifestBytes.length}\0`)
        .update(manifestBytes)
        .digest("hex")
    }
  };
  t.mock.method(globalThis, "fetch", async (url) => {
    const prefix = "https://api.github.com/repos/linkasu/linka.predictor-rust/";
    assert(url.startsWith(prefix));
    const route = url.slice(prefix.length);
    const bytes =
      route === "actions/artifacts/21/zip"
        ? modelZip
        : route === "actions/artifacts/22/zip"
          ? runtimeZip
          : Buffer.from(JSON.stringify(routes[route]));
    assert(bytes, "unexpected network request");
    return { ok: true, body: [bytes] };
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "windows-origin-synthetic-"));
  const cwd = process.cwd(),
    platform = Object.getOwnPropertyDescriptor(process, "platform");
  const env = {
    GITHUB_ACTIONS: "true",
    MODEL_VARIANT: "U",
    MODEL_SHA256: hash(f.get("U.lpk")),
    EXE_SHA256: hash(runtimeFiles["lp-electron.exe"]),
    APP_TOOLING_SHA: manifest.app_tooling_sha,
    MODEL_RUN_ID: "12",
    MODEL_ARTIFACT_ID: "21",
    RUNTIME_RUN_ID: "13",
    RUNTIME_ARTIFACT_ID: "22",
    GH_TOKEN: "SYNTHETIC"
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  t.after(() => {
    process.chdir(cwd);
    Object.defineProperty(process, "platform", platform);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  process.chdir(root);
  Object.defineProperty(process, "platform", { ...platform, value: "win32" });
  Object.assign(process.env, env);
  await prepare();
  const receipt = JSON.parse(fs.readFileSync("qualification/source.json"));
  assert.equal(receipt.model.source_sha, sha);
  assert.equal(receipt.model.workflow_sha, modelRun.head_sha);
  assert.equal(receipt.model.import_manifest_sha256, hash(manifestBytes));
  assert.equal(receipt.runtime.source_sha, sha);
  assert.equal(receipt.runtime.workflow_sha, undefined);
  assert.equal(receipt.production_approved, false);
});
test("receipt state, code, reaping, size and hash cannot masquerade as completed training", () => {
  for (const change of [
    { state: "FAILED" },
    { state: "RUNNING" },
    { code: 7 },
    { child_reaped: false },
    { bytes: 1 },
    { model_sha256: "b".repeat(64) }
  ]) {
    const f = producerFixture(true);
    f.json("U.receipt.json", { ...JSON.parse(f.get("U.receipt.json")), ...change });
    f.provenance.files_sha256["U.receipt.json"] = hash(f.get("U.receipt.json"));
    f.seal();
    assert.throws(() => validateModelBundle(f.get, run, "T.lpk", hash(f.get("T.lpk"))));
  }
  for (const name of ["provenance.json", "U.receipt.json", "U.dev.json", "review-report.json"]) {
    const f = producerFixture();
    f.files.delete(name);
    assert.throws(() => validateModelBundle(f.get, run, "U.lpk", hash(f.get("U.lpk"))));
  }
  const f = producerFixture();
  f.files.set("U.lpk", Buffer.from("tampered"));
  assert.throws(() => validateModelBundle(f.get, run, "U.lpk", hash(f.get("U.lpk"))));
  const reviewOnly = producerFixture();
  reviewOnly.provenance.schema = "linka-model-review-v1";
  reviewOnly.seal();
  assert.throws(() =>
    validateModelBundle(reviewOnly.get, run, "U.lpk", hash(reviewOnly.get("U.lpk")))
  );
});
test("run origin, workflow, successful conclusion and exact IDs are mandatory", () => {
  validateRun(run, "model", "12");
  for (const bad of [
    { ...run, conclusion: "failure" },
    { ...run, id: 13 },
    { ...run, path: "evil.yml" },
    { ...run, head_repository: { full_name: "fork/repo" } },
    { ...run, event: "pull_request" }
  ])
    assert.throws(() => validateRun(bad, "model", "12"));
});
test("artifact membership, immutable digest and expiry fail closed", () => {
  const a = {
    id: 7,
    expired: false,
    size_in_bytes: 2,
    name: "model-candidates-12-1",
    digest: `sha256:${"b".repeat(64)}`,
    workflow_run: { id: 12, head_sha: sha }
  };
  validateArtifact(a, run, "model", "7");
  for (const bad of [
    { ...a, expired: true },
    { ...a, id: 8 },
    { ...a, digest: null },
    { ...a, name: "model-review-12-1" },
    { ...a, workflow_run: { id: 11, head_sha: sha } }
  ])
    assert.throws(() => validateArtifact(bad, run, "model", "7"));
});
test("ZIP paths, duplicates, symlinks and declared expansion are bounded before decode", () => {
  const entry = (name, size = 1) => ({ entryName: name, header: { size, attr: 0 } });
  validateEntries(
    [
      "U.lpk",
      "T.lpk",
      "U.dev.json",
      "T.dev.json",
      "U.receipt.json",
      "T.receipt.json",
      "review-report.json"
    ].map((n) => entry(n)),
    "model"
  );
  for (const entries of [
    [entry("../U.lpk")],
    [entry("unigram.lpk")],
    [entry("mkn3.lpk")],
    [entry("FINAL.jsonl")],
    [entry("U.lpk"), entry("U.lpk")],
    [entry("U.lpk", 134217729)],
    [{ ...entry("U.lpk"), header: { size: 1, attr: 0xa0000000 } }]
  ])
    assert.throws(() => validateEntries(entries, "model"));
});
test("variant selection and completed-request percentile gate", () => {
  assert.equal(modelName("U"), "U.lpk");
  assert.equal(modelName("T"), "T.lpk");
  assert.throws(() => modelName("latest"));
  const samples = Array.from({ length: 1000 }, (_, id) => ({
    id,
    start: id,
    end: id + 20,
    count: 0
  }));
  assert.equal(summarize(samples).p99_ms, 20);
  assert.throws(() => summarize(samples.slice(1)));
  assert.throws(() => summarize([...samples.slice(1), samples[1]]));
  assert.equal(summarize(samples.map((s) => ({ ...s, end: s.start + 751 }))).within_budget, false);
  assert.throws(() => summarize(samples.map((s) => ({ ...s, count: -1 }))));
});
