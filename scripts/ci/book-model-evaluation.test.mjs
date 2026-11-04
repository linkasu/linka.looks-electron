import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  parseBookReceipt,
  assertBookRuntime,
  decodeBookImport,
  wrapImportedBookReport,
  assertImportedSemantics,
  validateBookAggregate
} from "./book-model-evaluation.mjs";
import { validateDevReport } from "./predictor-evaluation-runner.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = () => ({
  schema: "linka-book-execution-v1",
  host: "book.local",
  colima_profile: "linka-model-400",
  book_job_id: "a".repeat(32),
  attempt: 1,
  image_digest: "sha256:93ce27a88655056a51dbdd8f5f2d7ddc071c7b0070fb288a37b5a285fc83971e",
  source_sha: "b".repeat(40),
  limits: { memory_bytes: 6442450944, cpus: 2, tasks: 128 }
});
const canonical = (value) =>
  value && typeof value === "object"
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])])
      )
    : value;
const context = () => {
  const bytes = Buffer.from(JSON.stringify(canonical(receipt())) + "\n");
  return parseBookReceipt(bytes, hash(bytes));
};

test("Book receipt uses exact canonical keys and external byte hash, never self-reference or aliases", () => {
  const execution = context();
  assert.equal(execution.kind, "book-local-linux-container");
  assert.equal(execution.colima_profile, "linka-model-400");
  for (const mutate of [
    (r) => ({ ...r, profile: r.colima_profile }),
    (r) => ({ ...r, receipt_sha256: "0".repeat(64) }),
    (r) => ({ ...r, attempt: 0 }),
    (r) => ({ ...r, limits: { ...r.limits, pids: 128 } }),
    (r) => ({ ...r, limits: { ...r.limits, memory_bytes: 8589934592 } }),
    (r) => ({ ...r, host: "other" })
  ]) {
    const bytes = Buffer.from(JSON.stringify(mutate(receipt())));
    assert.throws(() => parseBookReceipt(bytes, hash(bytes)));
  }
  const bytes = Buffer.from(JSON.stringify(receipt()));
  assert.throws(() => parseBookReceipt(bytes, "0".repeat(64)));
});

test("actual Book process must be native Linux ARM64 with exact cgroups and no fake GHA flags", () => {
  const facts = {
    platform: "linux",
    arch: "arm64",
    env: {},
    memoryMax: "6442450944\n",
    cpuMax: "200000 100000\n",
    pidsMax: "128\n"
  };
  assertBookRuntime(facts);
  for (const change of [
    { platform: "darwin" },
    { arch: "x64" },
    { memoryMax: "max" },
    { cpuMax: "100000 100000" },
    { pidsMax: "max" },
    { env: { GITHUB_ACTIONS: "true" } },
    { env: { GITHUB_EVENT_NAME: "workflow_dispatch" } },
    { env: { GITHUB_REPOSITORY: "linkasu/linka.predictor-rust" } }
  ])
    assert.throws(() => assertBookRuntime({ ...facts, ...change }));
});

test("CI import codec accepts aggregates/metadata only and rejects DEV/FINAL target payloads", () => {
  const encode = (x) => gzipSync(Buffer.from(JSON.stringify(x))).toString("base64");
  const dev = {
    schema: "linka-book-ui-import-v1",
    aggregate_report_json: "{}",
    manifest_json: "{}",
    run_freeze_json: "{}",
    book_receipt_json: "{}"
  };
  assert.equal(decodeBookImport(encode(dev), "dev").schema, dev.schema);
  for (const key of ["dev_jsonl", "final_jsonl", "targets", "dev_report_json"])
    assert.throws(() => decodeBookImport(encode({ ...dev, [key]: "private-fixture" }), "dev"));
  assert.throws(() => decodeBookImport(encode(dev), "final"));
  decodeBookImport(encode({ ...dev, dev_report_json: "{}" }), "final");
  assert.throws(() => decodeBookImport("x".repeat(65001), "dev"));
  assert.throws(() => decodeBookImport(gzipSync(Buffer.alloc(2097153)).toString("base64"), "dev"));
});

test("CI wrapper preserves original Book semantics and records distinct real CI import IDs", () => {
  const original = {
    kind: "book-local-linux-container",
    inferenceLocation: "book.local",
    execution: context(),
    evaluationRunId: null,
    evaluationRunAttempt: null,
    ksr: 0.25,
    bootstrap: { deltaCI: [0.01, 0.1] }
  };
  const bytes = Buffer.from(JSON.stringify(original, null, 2) + "\n");
  const wrapped = wrapImportedBookReport(bytes, "12345", "2");
  assert.equal(wrapped.originalBookReportSha256, hash(bytes));
  assert.equal(wrapped.execution.book_job_id, receipt().book_job_id);
  assert.equal(wrapped.ciImport.runId, "12345");
  assert.equal(wrapped.ciImport.inferencePerformed, false);
  assertImportedSemantics(original, wrapped);
  assert.throws(() => assertImportedSemantics(original, { ...wrapped, ksr: 0.26 }));
  assert.throws(() =>
    assertImportedSemantics(original, {
      ...wrapped,
      execution: { ...wrapped.execution, host: "ci" }
    })
  );
  assert.throws(() =>
    assertImportedSemantics(original, {
      ...wrapped,
      evaluationRunId: "PUBLIC_TARGET_FIXTURE",
      ciImport: { ...wrapped.ciImport, runId: "PUBLIC_TARGET_FIXTURE" }
    })
  );
  assert.throws(() => wrapImportedBookReport(bytes, receipt().book_job_id, "1"));
});

test("import validation rejects raw text fields and non-preregistered Book reports", () => {
  assert.throws(() => validateBookAggregate({ text: "PUBLIC_TARGET_FIXTURE" }, {}, {}, {}, "dev"));
  assert.throws(() =>
    validateBookAggregate(
      { schema: "linka-ui-dev-aggregate-v1", mode: "dev", execution: context() },
      {},
      {},
      {},
      "dev"
    )
  );
});

test("complete public synthetic Book DEV aggregate is accepted, but extra target channels and altered pins fail", () => {
  const h = "c".repeat(64),
    source = "b".repeat(40),
    app = "d".repeat(40);
  const stats = {
    rows: 30,
    groups: 30,
    domains: { fixture: 30 },
    lengths: { short: 30, medium: 0, long: 0 },
    yo: 0,
    negation: 0
  };
  const cfg = {
    frequency_only: true,
    letters: false,
    spaces: false,
    external_lexicon: false,
    full_scan_oracle: false,
    candidate_limit: 128,
    max_operations: 12000,
    letter_cost: 1.5,
    space_cost: 1
  };
  const inputs = {
    source_sha: source,
    app_tooling_sha: app,
    final_seal_sha256: h,
    protocol_sha256: h,
    run_freeze_sha256: h,
    candidate_run_id: "123",
    candidate_artifact_id: "456"
  };
  const freeze = {
    execution: context(),
    source_code_hashes: { "scripts/ci/book-model-evaluation.mjs": h },
    candidate_artifact_sha256: h,
    workflow_sha256: h,
    candidate_model_sha256: h,
    frequency_model_sha256: h,
    stream_binary_sha256: h,
    source_stream_sha256: h,
    candidate_model_file: "U.lpk",
    candidate_config: cfg,
    frequency_config: cfg,
    components: Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`fixture-${i}`, `fixture-${i}`])
    ),
    frozen_at_utc: "2026-01-01T00:00:00Z"
  };
  const diagnostic = {
    queries: 30,
    eligible: 20,
    coverage: 10,
    top1: 5,
    top3: 5,
    selections: 10,
    prefixes: Object.fromEntries(
      ["1", "2", "3", "4"].map((key) => [key, { queries: 5, coverage: 2, top1: 1, top3: 1 }])
    )
  };
  const safety = {
    probes: 60,
    prefix: 30,
    middle: 0,
    noPrefix: 30,
    exact: 10,
    exactDenominator: 30,
    prefixes: { 1: 30, 2: 0, 3: 0, 4: 0 }
  };
  const report = {
    schema: "linka-ui-dev-aggregate-v1",
    metric: "UI_KSR_V1",
    mode: "dev",
    completedAtUTC: "2026-01-02T00:00:00Z",
    evaluationRunId: null,
    evaluationRunAttempt: null,
    status: "DIAGNOSTIC_SELECTION_ONLY",
    productionApproved: false,
    clinicalAAC: false,
    synthetic: true,
    sourceSha: source,
    appToolingSha: app,
    manifestSha256: h,
    protocolSha256: h,
    runFreezeSha256: h,
    candidateRunId: "123",
    artifactId: "456",
    candidateArtifactSha256: h,
    workflowSha256: h,
    candidateModelSha256: h,
    frequencyModelSha256: h,
    binarySha256: h,
    sourceStreamSha256: h,
    rows: 30,
    groups: 30,
    components: 30,
    statistics: stats,
    selectionCost: 1,
    bootstrap: {
      seed: 40003,
      resamples: 10000,
      rng: "xorshift32-u32-modulo-v1",
      quantile: "floor((n-1)*p)",
      ksrCI: [0.4, 0.6],
      deltaCI: [0, 0]
    },
    ksr: 0.5,
    frequencyKsr: 0.5,
    delta: 0,
    groupMeanCounts: { manual: 60, candidate: 30, frequency: 30 },
    words: 30,
    descriptiveRowPooledStrata: {
      "domain:fixture": { rows: 30, manual: 60, candidate: 30, frequency: 30 }
    },
    diagnostics: { candidate: diagnostic, frequency: diagnostic },
    safety: { candidate: safety, frequency: safety },
    kind: "book-local-linux-container",
    inferenceLocation: "book.local",
    execution: freeze.execution,
    source_code_hashes: freeze.source_code_hashes,
    devSha256: h,
    models: {
      U: { modelSha256: h, bytes: 8, searchConfig: cfg, ksr: 0.5, ksrCI: [0.4, 0.6] },
      T: null
    },
    recommendedModel: "U",
    limitation:
      "30-record synthetic DEV diagnostic selection, not broad AAC evidence or production approval"
  };
  const manifest = { dev: { sha256: h, statistics: stats } };
  validateBookAggregate(report, freeze, manifest, inputs, "dev");
  for (const change of [
    { q: "PUBLIC_TARGET_FIXTURE" },
    { evaluationRunId: "1234" },
    { ksr: 0.6 },
    { sourceSha: "e".repeat(40) },
    { completedAtUTC: "Thu, 02 Jan 2026 (PUBLIC_TARGET_FIXTURE)" },
    { limitation: "PUBLIC_TARGET_FIXTURE" },
    { source_code_hashes: { "raw-target.txt": h } }
  ])
    assert.throws(() =>
      validateBookAggregate({ ...report, ...change }, freeze, manifest, inputs, "dev")
    );
  const wrapped = wrapImportedBookReport(Buffer.from(JSON.stringify(report)), "789", "1");
  assertImportedSemantics(report, wrapped);
  assert.throws(() =>
    assertImportedSemantics(report, {
      ...wrapped,
      ciImport: { ...wrapped.ciImport, inferencePerformed: true }
    })
  );
  const finalCore = {
    ...freeze,
    source_sha: source,
    app_tooling_sha: app,
    final_seal_sha256: h,
    protocol_sha256: h,
    candidate_run_id: "123",
    candidate_artifact_id: "456",
    frozen_at_utc: "2026-01-03T00:00:00Z"
  };
  const fullManifest = { ...manifest, dev: { ...manifest.dev, groups: 30 } };
  validateDevReport(report, finalCore, fullManifest, { executing_workflow_sha256: h });
  validateDevReport(wrapped, finalCore, fullManifest, { executing_workflow_sha256: h });
  const finalStats = {
    ...stats,
    rows: 530,
    groups: 525,
    domains: { fixture: 530 },
    lengths: { short: 530, medium: 0, long: 0 }
  };
  const finalReport = {
    ...report,
    schema: "linka-final-aggregate-v1",
    mode: "final",
    status: "QUALIFIED_SIMULATION_ONLY",
    finalSha256: h,
    rows: 530,
    groups: 525,
    components: 525,
    statistics: finalStats,
    words: 530,
    groupMeanCounts: { manual: 5250, candidate: 2625, frequency: 2625 }
  };
  for (const key of ["devSha256", "models", "recommendedModel", "limitation"])
    delete finalReport[key];
  const finalFrozen = {
    ...freeze,
    comparison: "general",
    components: Object.fromEntries(Array.from({ length: 525 }, (_, i) => [`f-${i}`, `f-${i}`]))
  };
  validateBookAggregate(
    finalReport,
    finalFrozen,
    { sha256: h, statistics: finalStats },
    inputs,
    "final"
  );
  const fewer = {
    ...finalFrozen,
    components: Object.fromEntries(Object.entries(finalFrozen.components).slice(0, 499))
  };
  assert.throws(() =>
    validateBookAggregate(
      { ...finalReport, components: 499 },
      fewer,
      { sha256: h, statistics: finalStats },
      inputs,
      "final"
    )
  );
});
