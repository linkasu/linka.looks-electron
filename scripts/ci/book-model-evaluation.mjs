// Book executes the frozen UI evaluator. CI imports evidence only; never loads a predictor.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile, writeFile, lstat, mkdtemp, rm, chmod } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  decodeBundle,
  validateMetadata,
  validateConfig,
  validateFreeze,
  validateDevReport,
  validateComponents,
  extractArtifact,
  runPreparedEvaluation
} from "./predictor-evaluation-runner.mjs";
import {
  verifySealMetadata,
  verifySeal,
  verifySplitSeparation,
  validateDataset,
  verifyAppBindings
} from "./predictor-evaluation.mjs";
import { qualifiesUI, recommendDev } from "./predictor-evaluation-ui.mjs";
import candidateImporter from "./import-book-candidate.cjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hex = (value, n = 64) =>
  typeof value === "string" && new RegExp(`^[a-f0-9]{${n}}$`).test(value);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
const parse = (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const rowsOf = (bytes) => bytes.toString("utf8").trimEnd().split("\n").map(JSON.parse);
const image = "sha256:93ce27a88655056a51dbdd8f5f2d7ddc071c7b0070fb288a37b5a285fc83971e";
const receiptKeys = [
  "schema",
  "host",
  "colima_profile",
  "book_job_id",
  "attempt",
  "image_digest",
  "source_sha",
  "limits"
];
const bookPaths = [
  "scripts/ci/book-model-evaluation.mjs",
  "scripts/ci/book-model-evaluation.test.mjs"
];
const executionValidatorPath = "scripts/ci/import-book-candidate.cjs";
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const bounded = async (path, maximum = 2 * 1024 * 1024) => {
  const info = await lstat(path);
  assert(info.isFile() && info.size <= maximum);
  return readFile(path);
};

function receiptShape(receipt) {
  keys(receipt, receiptKeys);
  assert(hex(receipt.source_sha, 40));
  assert.equal(receipt.image_digest, image);
}

export function parseBookReceipt(bytes, expectedSha256) {
  assert(bytes.length <= 65536 && hex(expectedSha256));
  assert.equal(hash(bytes), expectedSha256, "external receipt SHA mismatch");
  const receipt = parse(bytes);
  receiptShape(receipt);
  const execution = {
    ...receipt,
    kind: "book-local-linux-container",
    receipt_sha256: expectedSha256
  };
  executionShape(execution);
  return execution;
}

function executionShape(execution) {
  keys(execution, [...receiptKeys, "kind", "receipt_sha256"]);
  const receipt = { ...execution };
  delete receipt.kind;
  delete receipt.receipt_sha256;
  receiptShape(receipt);
  candidateImporter.validateExecution(
    execution,
    execution.source_sha,
    `book-candidate-${execution.book_job_id}`
  );
}

export function assertBookRuntime(facts) {
  assert.equal(facts.platform, "linux");
  assert.equal(facts.arch, "arm64");
  for (const key of [
    "GITHUB_ACTIONS",
    "GITHUB_EVENT_NAME",
    "GITHUB_REPOSITORY",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT"
  ])
    assert.equal(facts.env[key], undefined, "Book is not a GHA job");
  assert.equal(facts.memoryMax.trim(), "6442450944");
  assert.equal(facts.cpuMax.trim(), "200000 100000");
  assert.equal(facts.pidsMax.trim(), "128");
}

export function decodeBookImport(encoded, phase) {
  try {
    assert(["dev", "final"].includes(phase));
    assert(typeof encoded === "string" && encoded.length > 0 && encoded.length <= 65000);
    const compressed = Buffer.from(encoded, "base64");
    assert.equal(compressed.toString("base64"), encoded);
    const payload = parse(gunzipSync(compressed, { maxOutputLength: 2097152 }));
    const fields = [
      "aggregate_report_json",
      "manifest_json",
      "run_freeze_json",
      "book_receipt_json",
      ...(phase === "final" ? ["dev_report_json"] : [])
    ];
    keys(payload, ["schema", ...fields]);
    assert.equal(payload.schema, "linka-book-ui-import-v1");
    for (const field of fields)
      assert(typeof payload[field] === "string" && payload[field].length > 0);
    return payload;
  } catch {
    throw new Error("BOOK_IMPORT_INVALID_NO_TARGETS_ACCEPTED");
  }
}

export function assertImportedSemantics(original, wrapped) {
  keys(wrapped.ciImport, [
    "kind",
    "runId",
    "runAttempt",
    "bookJobId",
    "inferencePerformed",
    "inferenceLocation"
  ]);
  assert.equal(wrapped.ciImport.kind, "book-result-import");
  assert.equal(wrapped.ciImport.inferencePerformed, false);
  assert.equal(wrapped.ciImport.inferenceLocation, "book.local");
  assert(
    /^[1-9][0-9]{0,15}$/.test(wrapped.ciImport.runId) &&
      /^[1-9][0-9]{0,15}$/.test(wrapped.ciImport.runAttempt)
  );
  assert.equal(wrapped.ciImport.bookJobId, original.execution.book_job_id);
  assert.equal(wrapped.evaluationRunId, wrapped.ciImport.runId);
  assert.equal(wrapped.evaluationRunAttempt, wrapped.ciImport.runAttempt);
  assert(hex(wrapped.originalBookReportSha256));
  const preserved = { ...wrapped };
  delete preserved.ciImport;
  delete preserved.originalBookReportSha256;
  preserved.evaluationRunId = null;
  preserved.evaluationRunAttempt = null;
  assert.deepEqual(
    preserved,
    original,
    "import must not alter Book semantics, metrics or execution"
  );
}

export function wrapImportedBookReport(rawBytes, runId, runAttempt) {
  const original = parse(rawBytes);
  assert.equal(original.evaluationRunId, null);
  assert.equal(original.evaluationRunAttempt, null);
  assert.equal(original.kind, "book-local-linux-container");
  assert.equal(original.inferenceLocation, "book.local");
  executionShape(original.execution);
  assert(/^[1-9][0-9]{0,15}$/.test(runId) && /^[1-9][0-9]*$/.test(runAttempt));
  const wrapped = {
    ...original,
    evaluationRunId: runId,
    evaluationRunAttempt: runAttempt,
    originalBookReportSha256: hash(rawBytes),
    ciImport: {
      kind: "book-result-import",
      runId,
      runAttempt,
      bookJobId: original.execution.book_job_id,
      inferencePerformed: false,
      inferenceLocation: "book.local"
    }
  };
  assertImportedSemantics(parse(rawBytes), wrapped);
  return wrapped;
}

function counters(value, fields) {
  keys(value, fields);
  for (const number of Object.values(value)) assert(Number.isSafeInteger(number) && number >= 0);
}
function interval(value, minimum = -1) {
  assert(
    Array.isArray(value) &&
      value.length === 2 &&
      value.every((n) => Number.isFinite(n) && n >= minimum && n <= 1) &&
      value[0] <= value[1]
  );
}

// Strict metadata-only report schema: no free text, queries, targets or per-row fields.
export function validateBookAggregate(report, freeze, manifest, inputs, phase, schemaOnly = false) {
  const core = [
    "schema",
    "metric",
    "mode",
    "completedAtUTC",
    "evaluationRunId",
    "evaluationRunAttempt",
    "status",
    "productionApproved",
    "clinicalAAC",
    "synthetic",
    "sourceSha",
    "appToolingSha",
    "manifestSha256",
    "protocolSha256",
    "runFreezeSha256",
    "candidateRunId",
    "artifactId",
    "candidateArtifactSha256",
    "workflowSha256",
    "candidateModelSha256",
    "frequencyModelSha256",
    "binarySha256",
    "sourceStreamSha256",
    "rows",
    "groups",
    "components",
    "statistics",
    "selectionCost",
    "bootstrap",
    "ksr",
    "frequencyKsr",
    "delta",
    "groupMeanCounts",
    "words",
    "descriptiveRowPooledStrata",
    "diagnostics",
    "safety",
    "kind",
    "inferenceLocation",
    "execution",
    "source_code_hashes"
  ];
  keys(report, [
    ...core,
    ...(phase === "dev"
      ? ["devSha256", "models", "recommendedModel", "limitation"]
      : ["finalSha256"])
  ]);
  assert.equal(
    report.schema,
    phase === "dev" ? "linka-ui-dev-aggregate-v1" : "linka-final-aggregate-v1"
  );
  assert.equal(report.mode, phase);
  assert.equal(report.metric, "UI_KSR_V1");
  assert.equal(report.kind, "book-local-linux-container");
  assert.equal(report.inferenceLocation, "book.local");
  assert.equal(report.evaluationRunId, null);
  assert.equal(report.evaluationRunAttempt, null);
  assert.equal(report.productionApproved, false);
  assert.equal(report.clinicalAAC, false);
  assert.equal(report.synthetic, true);
  executionShape(report.execution);
  assert(hex(report.sourceSha, 40) && hex(report.appToolingSha, 40));
  for (const field of [
    "manifestSha256",
    "protocolSha256",
    "runFreezeSha256",
    "candidateArtifactSha256",
    "workflowSha256",
    "candidateModelSha256",
    "frequencyModelSha256",
    "binarySha256",
    "sourceStreamSha256"
  ])
    assert(hex(report[field]));
  for (const field of ["candidateRunId", "artifactId"])
    assert(/^[1-9][0-9]{0,15}$/.test(report[field]));
  if (!schemaOnly) {
    assert.deepEqual(report.execution, freeze.execution);
    assert.deepEqual(report.source_code_hashes, freeze.source_code_hashes);
    for (const [field, expected] of Object.entries({
      sourceSha: inputs.source_sha,
      appToolingSha: inputs.app_tooling_sha,
      manifestSha256: inputs.final_seal_sha256,
      protocolSha256: inputs.protocol_sha256,
      runFreezeSha256: inputs.run_freeze_sha256,
      candidateRunId: inputs.candidate_run_id,
      artifactId: inputs.candidate_artifact_id,
      candidateArtifactSha256: freeze.candidate_artifact_sha256,
      workflowSha256: freeze.workflow_sha256,
      candidateModelSha256: freeze.candidate_model_sha256,
      frequencyModelSha256: freeze.frequency_model_sha256,
      binarySha256: freeze.stream_binary_sha256,
      sourceStreamSha256: freeze.source_stream_sha256
    }))
      assert.equal(report[field], expected);
  }
  const stats = phase === "dev" ? manifest.dev.statistics : manifest.statistics;
  assert.deepEqual(report.statistics, stats);
  assert.equal(report.rows, stats.rows);
  assert.equal(report.groups, stats.groups);
  if (!schemaOnly) assert.equal(report.components, new Set(Object.values(freeze.components)).size);
  assert(
    Number.isSafeInteger(report.components) &&
      report.components <= report.groups &&
      report.components >= (phase === "final" ? 500 : 1)
  );
  assert.equal(
    report[phase === "dev" ? "devSha256" : "finalSha256"],
    phase === "dev" ? manifest.dev.sha256 : manifest.sha256
  );
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(report.completedAtUTC));
  assert(Number.isFinite(Date.parse(report.completedAtUTC)));
  assert(
    Date.parse(report.completedAtUTC) <= Date.now(),
    "Book completion cannot be in the future"
  );
  if (!schemaOnly) assert(Date.parse(freeze.frozen_at_utc) <= Date.parse(report.completedAtUTC));
  assert.equal(report.selectionCost, 1);
  assert(Number.isSafeInteger(report.words) && report.words > 0);
  keys(report.bootstrap, ["seed", "resamples", "rng", "quantile", "ksrCI", "deltaCI"]);
  assert.equal(report.bootstrap.seed, 40003);
  assert.equal(report.bootstrap.resamples, 10000);
  assert.equal(report.bootstrap.rng, "xorshift32-u32-modulo-v1");
  assert.equal(report.bootstrap.quantile, "floor((n-1)*p)");
  interval(report.bootstrap.ksrCI, 0);
  interval(report.bootstrap.deltaCI);
  keys(report.groupMeanCounts, ["manual", "candidate", "frequency"]);
  const { manual, candidate, frequency } = report.groupMeanCounts;
  assert(
    [manual, candidate, frequency].every((n) => Number.isFinite(n) && n > 0) &&
      candidate <= manual &&
      frequency <= manual
  );
  assert.equal(report.ksr, 1 - candidate / manual);
  assert.equal(report.frequencyKsr, 1 - frequency / manual);
  assert.equal(report.delta, (frequency - candidate) / manual);
  keys(report.diagnostics, ["candidate", "frequency"]);
  keys(report.safety, ["candidate", "frequency"]);
  for (const name of ["candidate", "frequency"]) {
    const diagnostic = { ...report.diagnostics[name] };
    const prefixes = diagnostic.prefixes;
    delete diagnostic.prefixes;
    counters(diagnostic, ["queries", "eligible", "coverage", "top1", "top3", "selections"]);
    keys(prefixes, ["1", "2", "3", "4"]);
    for (const bin of Object.values(prefixes))
      counters(bin, ["queries", "coverage", "top1", "top3"]);
    const safety = { ...report.safety[name] };
    const bins = safety.prefixes;
    delete safety.prefixes;
    counters(safety, ["probes", "prefix", "middle", "noPrefix", "exact", "exactDenominator"]);
    counters(bins, ["1", "2", "3", "4"]);
  }
  const strata = new Set([
    ...Object.keys(stats.domains).map((d) => `domain:${d}`),
    ...["short", "medium", "long"].map((n) => `length:${n}`),
    "yo:yes",
    "yo:no",
    "negation:yes",
    "negation:no"
  ]);
  for (const [key, value] of Object.entries(report.descriptiveRowPooledStrata)) {
    assert(strata.has(key));
    counters(value, ["rows", "manual", "candidate", "frequency"]);
  }
  if (phase === "dev") {
    keys(report.models, ["U", "T"]);
    for (const [name, model] of Object.entries(report.models))
      if (model) {
        keys(model, ["modelSha256", "bytes", "searchConfig", "ksr", "ksrCI"]);
        assert(hex(model.modelSha256));
        assert(Number.isSafeInteger(model.bytes) && model.bytes > 0 && model.bytes <= 134217728);
        interval(model.ksrCI, 0);
        assert(Number.isFinite(model.ksr) && model.ksr >= 0 && model.ksr <= 1);
        validateConfig(model.searchConfig);
        if (!schemaOnly) {
          assert.equal(
            model.modelSha256,
            name === "U" ? freeze.frequency_model_sha256 : freeze.candidate_model_sha256
          );
          assert.deepEqual(
            model.searchConfig,
            name === "U" ? freeze.frequency_config : freeze.candidate_config
          );
        }
      }
    assert(report.models.U);
    if (!schemaOnly)
      assert.equal(Boolean(report.models.T), freeze.candidate_model_file === "T.lpk");
    assert.equal(
      report.recommendedModel,
      recommendDev(report.models.T ? report.bootstrap.deltaCI : null, report.models.T?.bytes)
    );
    assert.equal(report.status, "DIAGNOSTIC_SELECTION_ONLY");
    assert.equal(
      report.limitation,
      "30-record synthetic DEV diagnostic selection, not broad AAC evidence or production approval"
    );
  } else
    assert.equal(
      report.status,
      qualifiesUI(report.bootstrap, freeze.comparison)
        ? "QUALIFIED_SIMULATION_ONLY"
        : "NOT_QUALIFIED"
    );
}

async function codeBindings(manifest, freeze) {
  await verifyAppBindings(manifest);
  const extra = manifest.bookEvaluationBindings;
  assert(
    extra && Object.hasOwn(extra, bookPaths[0]) && Object.hasOwn(extra, executionValidatorPath),
    "new Book executor and shared execution-validator bindings required before data"
  );
  for (const [path, expected] of Object.entries(extra)) {
    assert([...bookPaths, executionValidatorPath].includes(path) && hex(expected));
    assert.equal(hash(await bounded(join(appRoot, path))), expected);
  }
  assert.deepEqual(freeze.source_code_hashes, { ...manifest.bindings, ...extra });
}

async function preparedContext(payload, inputs, metadata, sourceRoot, execution, withTargets) {
  assert.equal(hash(payload.manifest_json), inputs.final_seal_sha256);
  assert.equal(hash(payload.run_freeze_json), inputs.run_freeze_sha256);
  const manifest = JSON.parse(payload.manifest_json);
  verifySealMetadata(manifest);
  const frozen = JSON.parse(payload.run_freeze_json);
  assert.deepEqual(frozen.execution, execution);
  assert.equal(execution.source_sha, inputs.source_sha);
  await codeBindings(manifest, frozen);
  const freeze = { ...frozen };
  delete freeze.execution;
  delete freeze.source_code_hashes;
  validateMetadata(inputs, metadata);
  validateFreeze(inputs, freeze, manifest, metadata, inputs.mode);
  const head = (root) =>
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  assert.equal(head(sourceRoot), inputs.source_sha);
  assert.equal(head(appRoot), inputs.app_tooling_sha);
  for (const [path, expected] of [
    ["crates/predictor-cli/examples/model_final_stream.rs", freeze.source_stream_sha256],
    [
      "crates/predictor-cli/examples/make_eval_exclusions.rs",
      freeze.source_exclusion_helper_sha256
    ],
    [freeze.exclusions_file, freeze.exclusions_sha256]
  ]) {
    assert.equal(hash(await bounded(join(sourceRoot, path), 16 * 1024 * 1024)), expected);
    execFileSync("git", ["ls-files", "--error-unmatch", path], { cwd: sourceRoot, stdio: "pipe" });
  }
  const index = parse(await bounded(join(sourceRoot, freeze.exclusions_file), 16 * 1024 * 1024));
  let rows;
  if (withTargets) {
    const dev = Buffer.from(payload.dev_jsonl);
    assert.equal(hash(dev), manifest.dev.sha256);
    assert.deepEqual(validateDataset(dev, manifest.dev.groups), manifest.dev.statistics);
    assert.equal(manifest.dev.statistics.rows, 30);
    rows = rowsOf(dev);
    if (inputs.mode === "final") {
      const final = Buffer.from(payload.final_jsonl);
      assert.deepEqual(verifySeal(final, manifest), manifest.statistics);
      verifySplitSeparation(final, dev);
      rows = rowsOf(final);
    }
    validateComponents(
      index,
      rows,
      inputs.mode === "final" ? rowsOf(dev) : [],
      freeze.components,
      inputs.final_seal_sha256,
      inputs.mode
    );
  } else {
    rows = Object.keys(freeze.components).map((group) => ({ group }));
    const other = [...new Set(index.families.map((f) => f.group_id))]
      .filter((group) => !Object.hasOwn(freeze.components, group))
      .map((group) => ({ group }));
    validateComponents(
      index,
      rows,
      inputs.mode === "final" ? other : [],
      freeze.components,
      inputs.final_seal_sha256,
      inputs.mode
    );
  }
  if (inputs.mode === "final") {
    assert.equal(hash(payload.dev_report_json), freeze.ui_dev_report_sha256);
    const report = JSON.parse(payload.dev_report_json);
    assert.equal(report.kind, "book-local-linux-container");
    assert.equal(report.inferenceLocation, "book.local");
    executionShape(report.execution);
    assert.equal(report.execution.source_sha, inputs.source_sha);
    assert.deepEqual(report.source_code_hashes, frozen.source_code_hashes);
    const rawDev = { ...report };
    if (report.ciImport) {
      delete rawDev.ciImport;
      delete rawDev.originalBookReportSha256;
      rawDev.evaluationRunId = null;
      rawDev.evaluationRunAttempt = null;
      assertImportedSemantics(rawDev, report);
    }
    validateBookAggregate(rawDev, null, manifest, null, "dev", true);
    validateDevReport(report, freeze, manifest, metadata);
  }
  return { input: inputs, manifest, freeze, metadata, rows, frozen };
}

async function assertBookOrigin(work, sourceSha) {
  const provenance = parse(await bounded(join(work, "provenance.json"), 64 * 1024 * 1024));
  executionShape(provenance.execution);
  assert.equal(provenance.execution.source_sha, sourceSha);
}

async function trackedPlan(path) {
  const bytes = await bounded(path);
  const repository = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: dirname(resolve(path)),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  const name = relative(repository, resolve(path));
  assert(name && !name.startsWith("..") && !name.includes("\\"));
  execFileSync("git", ["ls-files", "--error-unmatch", "--", name], {
    cwd: repository,
    stdio: "pipe"
  });
  const committed = execFileSync("git", ["show", `HEAD:${name}`], {
    cwd: repository,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 2097152
  });
  assert.deepEqual(
    bytes,
    committed,
    "Book plan must equal committed approval bytes, not a dirty draft"
  );
  return bytes;
}

async function book(configPath, receiptSha) {
  assertBookRuntime({
    platform: process.platform,
    arch: process.arch,
    env: process.env,
    memoryMax: await readFile("/sys/fs/cgroup/memory.max", "utf8"),
    cpuMax: await readFile("/sys/fs/cgroup/cpu.max", "utf8"),
    pidsMax: await readFile("/sys/fs/cgroup/pids.max", "utf8")
  });
  const receiptPath = "/work/metadata/execution.json";
  assert.equal((await lstat(receiptPath)).mode & 0o777, 0o444);
  const execution = parseBookReceipt(await bounded(receiptPath, 65536), receiptSha);
  const config = parse(await bounded(configPath));
  keys(config, [
    "inputs",
    "sourceRoot",
    "tempRoot",
    "bundlePath",
    "metadataPath",
    "manifestPath",
    "planPath",
    ...(config.inputs?.mode === "final" ? ["devReportPath"] : [])
  ]);
  const { inputs, sourceRoot, tempRoot } = config;
  keys(inputs, [
    "mode",
    "source_sha",
    "app_tooling_sha",
    "candidate_run_id",
    "candidate_artifact_id",
    "candidate_model_sha256",
    "final_seal_sha256",
    "protocol_sha256",
    "run_freeze_sha256"
  ]);
  assert(["dev", "final"].includes(inputs.mode));
  const metadata = parse(await bounded(config.metadataPath));
  const control = {
    manifest_json: (await bounded(config.manifestPath)).toString("utf8"),
    run_freeze_json: (await trackedPlan(config.planPath)).toString("utf8")
  };
  if (inputs.mode === "final")
    control.dev_report_json = (await bounded(config.devReportPath)).toString("utf8");
  // Metadata, code, actual ARM binary and imported model provenance are checked before target bytes.
  const beforeTargets = await preparedContext(
    control,
    inputs,
    metadata,
    sourceRoot,
    execution,
    false
  );
  const binary = await bounded(
    join(sourceRoot, "target/release/examples/model_final_stream"),
    64 * 1024 * 1024
  );
  assert.equal(hash(binary), beforeTargets.freeze.stream_binary_sha256);
  assert.equal(binary.subarray(0, 4).toString("hex"), "7f454c46");
  assert.equal(binary[4], 2);
  assert.equal(binary[5], 1);
  assert.equal(binary.readUInt16LE(18), 183, "Book requires ARM64 stream, not CI x64");
  const audit = await mkdtemp(join(tempRoot, "book-origin-"));
  try {
    await extractArtifact(
      join(tempRoot, "eval-candidate.zip"),
      audit,
      beforeTargets.freeze,
      inputs.mode
    );
    await assertBookOrigin(audit, inputs.source_sha);
  } finally {
    await rm(audit, { recursive: true, force: true });
  }
  const payload = decodeBundle(
    (await bounded(config.bundlePath, 65000)).toString("utf8"),
    inputs.mode
  );
  for (const [field, bytes] of Object.entries(control))
    assert.equal(payload[field], bytes, "target transport must use the prechecked control bytes");
  const context = await preparedContext(payload, inputs, metadata, sourceRoot, execution, true);
  const report = await runPreparedEvaluation(context, { sourceRoot, tempRoot });
  assert.equal(report.evaluationRunId, null);
  assert.equal(report.evaluationRunAttempt, null);
  Object.assign(report, {
    kind: "book-local-linux-container",
    inferenceLocation: "book.local",
    execution,
    source_code_hashes: context.frozen.source_code_hashes
  });
  validateBookAggregate(report, context.frozen, context.manifest, inputs, inputs.mode);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  const originalPath = join(tempRoot, `${inputs.mode}-book-original-aggregate.json`);
  await writeFile(originalPath, bytes, { flag: "wx", mode: 0o600 });
  await chmod(originalPath, 0o444);
  const evidencePath = join(tempRoot, `${inputs.mode}-book-evidence.json`);
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        schema: "linka-book-ui-evidence-v1",
        originalBookReportSha256: hash(bytes),
        runFreezeSha256: inputs.run_freeze_sha256,
        execution,
        source_code_hashes: context.frozen.source_code_hashes,
        inferenceLocation: "book.local",
        productionApproved: false,
        status: report.status
      },
      null,
      2
    ) + "\n",
    { flag: "wx", mode: 0o600 }
  );
  await chmod(evidencePath, 0o444);
  // Canonical Book output is also Book-labelled. Original bytes above are never overwritten.
  await writeFile(join(tempRoot, `${inputs.mode}-aggregate.json`), bytes, { mode: 0o600 });
  console.log("BOOK_UI_EVALUATION_COMPLETE_NO_CI_INFERENCE");
}

async function importEvidence(sourceRoot) {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(process.env.GITHUB_REPOSITORY, "linkasu/linka.predictor-rust");
  const event = parse(await bounded(process.env.GITHUB_EVENT_PATH));
  assert.equal(process.env.GITHUB_REF, `refs/heads/${event.repository.default_branch}`);
  const input = event.inputs;
  keys(input, [
    "mode",
    "source_sha",
    "app_tooling_sha",
    "candidate_run_id",
    "candidate_artifact_id",
    "candidate_model_sha256",
    "final_seal_sha256",
    "protocol_sha256",
    "run_freeze_sha256",
    "sealed_bundle"
  ]);
  assert(["import-dev", "import-final"].includes(input.mode));
  const phase = input.mode.slice(7),
    inputs = { ...input, mode: phase };
  const payload = decodeBookImport(input.sealed_bundle, phase);
  const frozen = JSON.parse(payload.run_freeze_json);
  executionShape(frozen.execution);
  const execution = parseBookReceipt(
    Buffer.from(payload.book_receipt_json),
    frozen.execution.receipt_sha256
  );
  const tempRoot = process.env.RUNNER_TEMP,
    metadata = parse(await bounded(join(tempRoot, "eval-candidate-meta.json")));
  const context = await preparedContext(payload, inputs, metadata, sourceRoot, execution, false);
  const work = await mkdtemp(join(tempRoot, "book-import-origin-"));
  try {
    await extractArtifact(join(tempRoot, "eval-candidate.zip"), work, context.freeze, phase);
    await assertBookOrigin(work, inputs.source_sha);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  const raw = Buffer.from(payload.aggregate_report_json),
    report = parse(raw);
  validateBookAggregate(report, context.frozen, context.manifest, inputs, phase);
  assert.notEqual(
    process.env.GITHUB_RUN_ID,
    inputs.candidate_run_id,
    "model import and evaluation import are different runs"
  );
  const wrapped = wrapImportedBookReport(
    raw,
    process.env.GITHUB_RUN_ID,
    process.env.GITHUB_RUN_ATTEMPT
  );
  assertImportedSemantics(report, wrapped);
  const originalPath = join(tempRoot, `${phase}-book-original-aggregate.json`);
  await writeFile(originalPath, raw, { flag: "wx", mode: 0o600 });
  await chmod(originalPath, 0o444);
  await writeFile(
    join(tempRoot, `${phase}-aggregate.json`),
    JSON.stringify(wrapped, null, 2) + "\n",
    { flag: "wx", mode: 0o600 }
  );
  console.log("BOOK_AGGREGATE_IMPORTED_NO_CI_INFERENCE_NO_PRODUCTION_APPROVAL");
  if (phase === "final" && report.status !== "QUALIFIED_SIMULATION_ONLY") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === "--book" && process.argv.length === 5)
      await book(process.argv[3], process.argv[4]);
    else if (process.argv[2] === "--import" && process.argv.length === 4)
      await importEvidence(process.argv[3]);
    else throw new Error("invalid mode");
  } catch {
    console.error("BOOK_EVALUATION_OR_IMPORT_BLOCKED_NO_CONTENT_LOGGED");
    process.exitCode = 1;
  }
}
