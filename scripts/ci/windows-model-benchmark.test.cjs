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
