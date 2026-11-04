// Fixed DEV recommendation / owner-frozen FINAL; never training or production approval.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import modelImportOrigin from "./model-import-origin.cjs";
import {
  verifySeal,
  verifySealMetadata,
  verifySplitSeparation,
  validateDataset,
  verifyAppBindings
} from "./predictor-evaluation.mjs";
import {
  evaluateRows,
  summarizeGroups,
  bootstrapUI,
  qualifiesUI,
  recommendDev
} from "./predictor-evaluation-ui.mjs";

const repository = "linkasu/linka.predictor-rust";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hex = (value, length = 64) =>
  typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
const json = (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const rowsOf = (bytes) =>
  bytes
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
const configKeys = [
  "frequency_only",
  "letters",
  "spaces",
  "external_lexicon",
  "full_scan_oracle",
  "candidate_limit",
  "max_operations",
  "letter_cost",
  "space_cost"
];

export function decodeBundle(encoded, mode = "final") {
  try {
    assert(["dev", "final"].includes(mode));
    assert(typeof encoded === "string" && encoded.length > 0 && encoded.length <= 65000);
    assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded));
    const compressed = Buffer.from(encoded, "base64");
    assert.equal(compressed.toString("base64"), encoded);
    const bytes = gunzipSync(compressed, { maxOutputLength: 2 * 1024 * 1024 });
    const bundle = json(bytes);
    const fields = [
      "dev_jsonl",
      "manifest_json",
      "run_freeze_json",
      ...(mode === "final" ? ["final_jsonl", "dev_report_json"] : [])
    ];
    keys(bundle, ["schema", ...fields]);
    assert.equal(
      bundle.schema,
      mode === "final" ? "linka-final-bundle-v1" : "linka-ui-dev-bundle-v1"
    );
    for (const key of fields) assert(typeof bundle[key] === "string" && bundle[key].length > 0);
    return bundle;
  } catch {
    throw new Error("FINAL_BUNDLE_INVALID");
  }
}

export function validateMetadata(input, metadata, archiveBytes) {
  assert.equal(metadata.repository, repository);
  const { run, artifact } = metadata;
  assert.equal(String(run.id), input.candidate_run_id);
  assert.equal(run.repository.full_name, repository);
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(metadata.candidate_workflow.path, ".github/workflows/model-candidates.yml");
  assert.equal(String(artifact.id), input.candidate_artifact_id);
  assert.equal(String(artifact.workflow_run.id), input.candidate_run_id);
  assert.equal(artifact.workflow_run.head_sha, run.head_sha);
  assert.equal(artifact.expired, false);
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  assert.equal(artifact.name, `model-candidates-${input.candidate_run_id}-${run.run_attempt}`);
  assert(
    Number.isSafeInteger(artifact.size_in_bytes) &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= 300 * 1024 * 1024
  );
  if (archiveBytes !== undefined)
    modelImportOrigin.validateModelArchiveOrigin(input, metadata, archiveBytes);
  else {
    assert(!Object.hasOwn(metadata, "model_import"), "archive bytes required for import metadata");
    assert.equal(run.head_sha, input.source_sha, "legacy source origin");
  }
}

export function validateConfig(config) {
  keys(config, configKeys);
  for (const key of configKeys.slice(0, 5)) assert.equal(typeof config[key], "boolean");
  assert(
    Number.isSafeInteger(config.candidate_limit) &&
      config.candidate_limit >= 1 &&
      config.candidate_limit <= 100000
  );
  assert(
    Number.isSafeInteger(config.max_operations) &&
      config.max_operations >= 1 &&
      config.max_operations <= 1000000
  );
  for (const key of ["letter_cost", "space_cost"])
    assert(Number.isFinite(config[key]) && config[key] >= 0);
}

// One in-flight request per owned child; stdout is never connected to workflow logs.
export function openStream(executable, args) {
  const child = spawn(executable, args, { stdio: ["pipe", "pipe", "ignore"] });
  let id = 0;
  let pending;
  let buffer = Buffer.alloc(0);
  let failure;
  let ending = false;
  const closed = new Promise((resolveClose) => {
    child.once("close", (code) => {
      if (!ending || code !== 0) fail();
      resolveClose(code);
    });
  });
  const fail = () => {
    failure ??= new Error("FINAL_STREAM_INVALID");
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(failure);
      pending = undefined;
    }
    child.kill("SIGKILL");
  };
  child.once("error", fail);
  child.stdin.on("error", fail);
  child.stdout.on("data", (chunk) => {
    if (failure) return;
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 256 * 1024 + 1) return fail();
    let newline;
    while ((newline = buffer.indexOf(10)) >= 0) {
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      try {
        assert(pending && line.length <= 256 * 1024);
        const response = json(line);
        keys(response, ["id", "text", "pos", "endOfWord"]);
        assert.equal(response.id, pending.id);
        const current = pending;
        pending = undefined;
        clearTimeout(current.timer);
        current.resolve({
          input: current.input,
          text: response.text,
          pos: response.pos,
          endOfWord: response.endOfWord
        });
      } catch {
        fail();
      }
    }
  });
  return {
    predict(input) {
      if (failure || ending || pending) return Promise.reject(new Error("FINAL_STREAM_INVALID"));
      return new Promise((resolveRequest, reject) => {
        const requestId = ++id;
        pending = {
          id: requestId,
          input,
          resolve: resolveRequest,
          reject,
          timer: setTimeout(fail, 10000)
        };
        child.stdin.write(
          JSON.stringify({
            id: requestId,
            q: input.text.slice(0, input.caret),
            lang: "ru",
            limit: 5
          }) + "\n"
        );
      });
    },
    async finish() {
      assert(!pending && !failure);
      ending = true;
      child.stdin.end();
      const timer = setTimeout(fail, 5000);
      try {
        assert.equal(await closed, 0);
        assert(!failure && buffer.length === 0);
      } finally {
        clearTimeout(timer);
      }
    },
    async abort() {
      ending = true;
      child.kill("SIGKILL");
      await closed;
    }
  };
}

export function validateComponents(index, finalRows, devRows, componentMap, seal, mode = "final") {
  assert(["dev", "final"].includes(mode));
  assert.equal(index.schema, "linka-eval-exclusions-v1");
  assert.equal(index.normalizer, "nfc-lower-v1");
  assert.equal(index.source_seal_sha256, seal);
  const finalGroups = new Set(finalRows.map((row) => row.group));
  const devGroups = new Set(
    mode === "final"
      ? devRows.map((row) => row.group)
      : index.families.map((family) => family.group_id).filter((group) => !finalGroups.has(group))
  );
  keys(componentMap, [...finalGroups]);
  for (const value of Object.values(componentMap))
    assert(typeof value === "string" && /^[a-z0-9-]{1,128}$/.test(value));
  assert(
    new Set(Object.values(componentMap)).size >= (mode === "final" ? 500 : 1),
    "insufficient independent components"
  );
  assert(
    Array.isArray(index.families) && index.families.length > 0 && index.families.length <= 10000
  );
  const covered = new Set();
  const byShingle = new Map();
  const byHash = new Map();
  const compatible = (a, b) => {
    if (a.group_id === b.group_id) return;
    assert.equal(
      finalGroups.has(a.group_id),
      finalGroups.has(b.group_id),
      "cross-split family dependency"
    );
    if (finalGroups.has(a.group_id))
      assert.equal(
        componentMap[a.group_id],
        componentMap[b.group_id],
        "unfrozen component dependency"
      );
  };
  for (const family of index.families) {
    assert(finalGroups.has(family.group_id) || devGroups.has(family.group_id));
    assert(
      hex(family.sha256) && Number.isSafeInteger(family.token_count) && family.token_count > 0
    );
    assert(
      Array.isArray(family.shingles) &&
        family.shingles.length > 0 &&
        family.shingles.every((s) => hex(s))
    );
    covered.add(family.group_id);
    if (byHash.has(family.sha256)) compatible(family, byHash.get(family.sha256));
    byHash.set(family.sha256, family);
    const shingles = new Set(family.shingles);
    const neighbors = new Set();
    for (const shingle of shingles)
      for (const prior of byShingle.get(shingle) ?? []) neighbors.add(prior);
    for (const prior of neighbors) {
      const intersection = [...shingles].filter((s) => prior.shingles.has(s)).length;
      if (5 * intersection >= 4 * (shingles.size + prior.shingles.size - intersection))
        compatible(family, prior.family);
    }
    const entry = { family, shingles };
    for (const shingle of shingles) {
      if (!byShingle.has(shingle)) byShingle.set(shingle, []);
      byShingle.get(shingle).push(entry);
    }
  }
  assert.deepEqual(covered, new Set([...finalGroups, ...devGroups]));
}

export function validateFreeze(input, freeze, manifest, metadata, mode = "final") {
  assert(["dev", "final"].includes(mode));
  keys(freeze, [
    "schema",
    "state",
    "metric",
    "frozen_at_utc",
    "source_sha",
    "app_tooling_sha",
    "workflow_sha256",
    "source_stream_sha256",
    "stream_binary_sha256",
    "source_exclusion_helper_sha256",
    "source_manifest_sha256",
    "exclusions_file",
    "exclusions_sha256",
    "candidate_run_id",
    "candidate_artifact_id",
    "candidate_artifact_sha256",
    "candidate_model_file",
    "candidate_model_sha256",
    "frequency_model_file",
    "frequency_model_sha256",
    "frequencies_sha256",
    "candidate_config",
    "frequency_config",
    "final_seal_sha256",
    "protocol_sha256",
    "dev_sha256",
    "typescript_version",
    "node_version",
    "comparison",
    "components",
    "owner_approved",
    "independence_approved",
    "pretraining_chronology_attested",
    "dev_only_selection",
    "selection_cost",
    "resamples",
    "seed",
    ...(mode === "final" ? ["ui_dev_report_sha256"] : [])
  ]);
  assert.equal(
    freeze.schema,
    mode === "final" ? "linka-final-run-freeze-v1" : "linka-ui-dev-plan-v1"
  );
  assert.equal(
    freeze.state,
    mode === "final" ? "DEV_FROZEN_FINAL_UNOPENED" : "DEV_PARAMETERS_FIXED_FINAL_UNOPENED"
  );
  if (mode === "final") assert(hex(freeze.ui_dev_report_sha256));
  assert.equal(freeze.metric, "UI_KSR_V1");
  for (const key of [
    "source_sha",
    "app_tooling_sha",
    "candidate_run_id",
    "candidate_artifact_id",
    "candidate_model_sha256",
    "final_seal_sha256",
    "protocol_sha256"
  ])
    assert.equal(freeze[key], input[key]);
  for (const key of [
    "workflow_sha256",
    "source_stream_sha256",
    "stream_binary_sha256",
    "source_exclusion_helper_sha256",
    "source_manifest_sha256",
    "exclusions_sha256",
    "candidate_artifact_sha256",
    "frequency_model_sha256",
    "frequencies_sha256"
  ])
    assert(hex(freeze[key]));
  assert.equal(freeze.workflow_sha256, metadata.executing_workflow_sha256);
  assert.equal(metadata.artifact.digest, `sha256:${freeze.candidate_artifact_sha256}`);
  assert.equal(freeze.protocol_sha256, manifest.bindings["docs/model-400-evaluation.md"]);
  assert.equal(freeze.dev_sha256, manifest.dev.sha256);
  assert.equal(freeze.node_version, process.version);
  assert.equal(freeze.typescript_version, ts.version);
  assert(["general", "contextual"].includes(freeze.comparison));
  for (const key of [
    "owner_approved",
    "independence_approved",
    "pretraining_chronology_attested",
    "dev_only_selection"
  ])
    assert.equal(freeze[key], true);
  assert.equal(freeze.selection_cost, 1);
  assert.equal(freeze.resamples, 10000);
  assert.equal(freeze.seed, 40003);
  assert(/^[UT]\.lpk$/.test(freeze.candidate_model_file));
  assert.equal(freeze.frequency_model_file, "U.lpk");
  assert(/^provenance\/[a-zA-Z0-9._-]+\.json$/.test(freeze.exclusions_file));
  validateConfig(freeze.candidate_config);
  validateConfig(freeze.frequency_config);
  assert.equal(freeze.frequency_config.frequency_only, true);
  assert.equal(
    freeze.comparison,
    freeze.candidate_model_file === "T.lpk" ? "contextual" : "general"
  );
  if (freeze.candidate_model_file === "U.lpk") {
    assert.equal(freeze.candidate_model_sha256, freeze.frequency_model_sha256);
    assert.deepEqual(freeze.candidate_config, freeze.frequency_config);
  }
  const time = Date.parse(freeze.frozen_at_utc);
  assert(
    Number.isFinite(time) && Date.parse(metadata.run.updated_at) <= time && time <= Date.now()
  );
  assert(
    Date.parse(manifest.frozenAtUTC) <= Date.parse(metadata.run.created_at),
    "seal must precede candidate training"
  );
}

export function validateDevReport(report, freeze, manifest, metadata) {
  assert.equal(report.schema, "linka-ui-dev-aggregate-v1");
  assert.equal(report.mode, "dev");
  assert.equal(report.metric, "UI_KSR_V1");
  assert.equal(report.status, "DIAGNOSTIC_SELECTION_ONLY");
  assert.equal(report.productionApproved, false);
  assert.equal(report.clinicalAAC, false);
  for (const [key, expected] of Object.entries({
    sourceSha: freeze.source_sha,
    appToolingSha: freeze.app_tooling_sha,
    manifestSha256: freeze.final_seal_sha256,
    protocolSha256: freeze.protocol_sha256,
    devSha256: manifest.dev.sha256,
    candidateRunId: freeze.candidate_run_id,
    artifactId: freeze.candidate_artifact_id,
    candidateArtifactSha256: freeze.candidate_artifact_sha256,
    binarySha256: freeze.stream_binary_sha256,
    sourceStreamSha256: freeze.source_stream_sha256,
    workflowSha256: metadata.executing_workflow_sha256
  }))
    assert.equal(report[key], expected);
  assert.equal(report.rows, manifest.dev.statistics.rows);
  assert.equal(report.bootstrap.seed, 40003);
  assert.equal(report.bootstrap.resamples, 10000);
  const u = report.models.U;
  assert.equal(u.modelSha256, freeze.frequency_model_sha256);
  assert.deepEqual(u.searchConfig, freeze.frequency_config);
  const recommendation = recommendDev(
    report.models.T ? report.bootstrap.deltaCI : null,
    report.models.T?.bytes
  );
  assert.equal(report.recommendedModel, recommendation);
  const chosen = freeze.candidate_model_file[0];
  assert(chosen === "U" || recommendation === "T", "T needs positive paired UI_DEV evidence");
  const selected = report.models[chosen];
  assert.equal(selected.modelSha256, freeze.candidate_model_sha256);
  assert.deepEqual(selected.searchConfig, freeze.candidate_config);
  assert(
    Date.parse(report.completedAtUTC) <= Date.parse(freeze.frozen_at_utc),
    "DEV report must precede FINAL freeze"
  );
}

async function checkedContext(sourceRoot, tempRoot) {
  const event = json(await readFile(process.env.GITHUB_EVENT_PATH));
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
  assert(["dev", "final"].includes(input.mode));
  for (const key of ["source_sha", "app_tooling_sha"]) assert(hex(input[key], 40));
  for (const key of [
    "candidate_model_sha256",
    "final_seal_sha256",
    "protocol_sha256",
    "run_freeze_sha256"
  ])
    assert(hex(input[key]));
  for (const key of ["candidate_run_id", "candidate_artifact_id"])
    assert(/^[1-9][0-9]{0,15}$/.test(input[key]));
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  assert.equal(process.env.GITHUB_REF, `refs/heads/${event.repository.default_branch}`);
  const appRoot = fileURLToPath(new URL("../../", import.meta.url));
  const head = (root) =>
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  assert.equal(head(sourceRoot), input.source_sha);
  assert.equal(head(appRoot), input.app_tooling_sha);
  const metadata = json(await readFile(join(tempRoot, "eval-candidate-meta.json")));
  validateMetadata(input, metadata, await readFile(join(tempRoot, "eval-candidate.zip")));
  const bundle = decodeBundle(input.sealed_bundle, input.mode);
  assert.equal(hash(bundle.manifest_json), input.final_seal_sha256);
  assert.equal(hash(bundle.run_freeze_json), input.run_freeze_sha256);
  const manifest = JSON.parse(bundle.manifest_json);
  const freeze = JSON.parse(bundle.run_freeze_json);
  verifySealMetadata(manifest);
  assert.equal(manifest.canonicalMetric, "UI_KSR_V1");
  const devBytes = Buffer.from(bundle.dev_jsonl);
  assert.equal(hash(devBytes), manifest.dev.sha256);
  assert.deepEqual(validateDataset(devBytes, manifest.dev.groups), manifest.dev.statistics);
  assert.equal(
    manifest.dev.statistics.rows,
    30,
    "canonical private DEV contains exactly 30 records"
  );
  await verifyAppBindings(manifest);
  validateFreeze(input, freeze, manifest, metadata, input.mode);
  let rows = rowsOf(devBytes);
  if (input.mode === "final") {
    const finalBytes = Buffer.from(bundle.final_jsonl);
    assert.deepEqual(verifySeal(finalBytes, manifest), manifest.statistics);
    verifySplitSeparation(finalBytes, devBytes);
    assert.equal(hash(bundle.dev_report_json), freeze.ui_dev_report_sha256);
    validateDevReport(JSON.parse(bundle.dev_report_json), freeze, manifest, metadata);
    rows = rowsOf(finalBytes);
  }
  for (const [path, expected] of [
    ["crates/predictor-cli/examples/model_final_stream.rs", freeze.source_stream_sha256],
    [
      "crates/predictor-cli/examples/make_eval_exclusions.rs",
      freeze.source_exclusion_helper_sha256
    ],
    [freeze.exclusions_file, freeze.exclusions_sha256]
  ]) {
    const file = join(sourceRoot, path);
    assert((await lstat(file)).isFile());
    assert.equal(hash(await readFile(file)), expected);
    execFileSync("git", ["ls-files", "--error-unmatch", path], { cwd: sourceRoot, stdio: "pipe" });
  }
  validateComponents(
    json(await readFile(join(sourceRoot, freeze.exclusions_file))),
    rows,
    input.mode === "final" ? rowsOf(devBytes) : [],
    freeze.components,
    input.final_seal_sha256,
    input.mode
  );
  return { input, manifest, freeze, metadata, rows };
}

const extractPython = String.raw`
import zipfile,sys,pathlib,stat
archive,out,*names=sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    infos=z.infolist()
    assert len(infos)<=100 and len({i.filename for i in infos})==len(infos)
    for i in infos:
        assert i.filename and len(i.filename)<=200 and '/' not in i.filename and chr(92) not in i.filename and i.filename not in ('.','..')
        assert stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG)
    for name in set(names):
        optional=name.startswith('?')
        name=name[1:] if optional else name
        if optional and name not in z.namelist(): continue
        i=z.getinfo(name)
        bound=134217728 if name.endswith('.lpk') else 67108864
        assert 0<i.file_size<=bound
        with z.open(i) as src, open(pathlib.Path(out)/name,'xb') as dst:
            total=0
            while True:
                chunk=src.read(1048576)
                if not chunk: break
                total+=len(chunk)
                assert total<=bound
                dst.write(chunk)
        assert total==i.file_size
`;

export async function extractArtifact(archive, output, freeze, mode = "final") {
  assert(["dev", "final"].includes(mode));
  assert(/^[UT]\.lpk$/.test(freeze.candidate_model_file));
  assert.equal(freeze.frequency_model_file, "U.lpk");
  const models = [...new Set(["U", freeze.candidate_model_file[0]])];
  assert((await lstat(archive)).isFile() && (await lstat(archive)).size <= 300 * 1024 * 1024);
  assert.equal(hash(await readFile(archive)), freeze.candidate_artifact_sha256);
  execFileSync(
    "python3",
    [
      "-c",
      extractPython,
      archive,
      output,
      freeze.candidate_model_file,
      freeze.frequency_model_file,
      ...models.flatMap((name) => [`${name}.receipt.json`, `${name}.dev.json`]),
      ...(mode === "dev" && !models.includes("T") ? ["?T.receipt.json"] : []),
      "source-manifest.json",
      "provenance.json",
      "frequencies.tsv"
    ],
    { stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }
  );
  const provenance = json(await readFile(join(output, "provenance.json")));
  assert.equal(provenance.schema, "linka-model-candidates-v1");
  assert.equal(provenance.source_revision, freeze.source_sha);
  assert.equal(provenance.source_manifest_sha256, freeze.source_manifest_sha256);
  assert.equal(provenance.exclusions_sha256, freeze.exclusions_sha256);
  assert.equal(provenance.quality_approved, false);
  assert.equal(provenance.redistribution_approved, false);
  assert.equal(provenance.final_evaluated, false);
  for (const [file, expected] of [
    [freeze.candidate_model_file, freeze.candidate_model_sha256],
    [freeze.frequency_model_file, freeze.frequency_model_sha256],
    ["source-manifest.json", freeze.source_manifest_sha256],
    ["frequencies.tsv", freeze.frequencies_sha256]
  ]) {
    assert.equal(hash(await readFile(join(output, file))), expected);
    assert.equal(provenance.files_sha256[file], expected);
  }
  for (const name of models) {
    const receiptFile = `${name}.receipt.json`;
    const receiptBytes = await readFile(join(output, receiptFile));
    const receipt = json(receiptBytes);
    keys(receipt, ["state", "child_reaped", "code", "model_sha256", "bytes"]);
    assert.equal(receipt.state, "COMPLETED");
    assert.equal(receipt.child_reaped, true);
    assert.equal(receipt.code, 0);
    assert.equal(receipt.model_sha256, hash(await readFile(join(output, `${name}.lpk`))));
    assert.equal(receipt.bytes, (await lstat(join(output, `${name}.lpk`))).size);
    assert.equal(provenance.files_sha256[receiptFile], hash(receiptBytes));
    // Core DEV diagnostics are hash-bound evidence, never a substitute for UI_KSR_V1.
    assert.equal(
      provenance.files_sha256[`${name}.dev.json`],
      hash(await readFile(join(output, `${name}.dev.json`)))
    );
  }
  if (mode === "dev") {
    let tReceipt;
    try {
      const bytes = await readFile(join(output, "T.receipt.json"));
      assert.equal(hash(bytes), provenance.files_sha256["T.receipt.json"]);
      tReceipt = json(bytes);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    let eligible = false;
    if (tReceipt) {
      assert(["COMPLETED", "FAILED"].includes(tReceipt.state));
      assert.equal(tReceipt.child_reaped, true);
      if (tReceipt.state === "COMPLETED") {
        assert.equal(tReceipt.code, 0);
        assert(Number.isSafeInteger(tReceipt.bytes) && tReceipt.bytes > 0);
        eligible = tReceipt.bytes <= 128 * 1024 * 1024;
      } else assert(Number.isSafeInteger(tReceipt.code) && tReceipt.code !== 0);
    }
    assert.equal(
      freeze.candidate_model_file,
      eligible ? "T.lpk" : "U.lpk",
      "DEV must compare completed size-fitting T, otherwise U only"
    );
  }
}

async function main() {
  assert(["preflight", "run"].includes(process.argv[2]) && process.argv.length === 4);
  const sourceRoot = resolve(process.argv[3]);
  const tempRoot = process.env.RUNNER_TEMP;
  assert(tempRoot && process.version === "v22.22.2");
  const context = await checkedContext(sourceRoot, tempRoot);
  return runPreparedEvaluation(context, {
    sourceRoot,
    tempRoot,
    preflightOnly: process.argv[2] === "preflight"
  });
}

export async function runPreparedEvaluation(
  context,
  { sourceRoot, tempRoot, preflightOnly = false }
) {
  const work = await mkdtemp(join(tempRoot, "ui-eval-"));
  let candidate;
  let frequency;
  try {
    const { freeze, input, manifest, rows } = context;
    await extractArtifact(join(tempRoot, "eval-candidate.zip"), work, freeze, input.mode);
    if (preflightOnly) {
      console.log("FINAL_PREFLIGHT_VALID_NO_INFERENCE");
      return;
    }
    const binary = join(sourceRoot, "target/release/examples/model_final_stream");
    assert((await lstat(binary)).isFile());
    assert.equal(
      hash(await readFile(binary)),
      freeze.stream_binary_sha256,
      "unfrozen stream binary"
    );
    for (const [name, config] of [
      ["candidate", freeze.candidate_config],
      ["frequency", freeze.frequency_config]
    ])
      await writeFile(join(work, `${name}.json`), JSON.stringify(config), { mode: 0o600 });
    if (freeze.candidate_model_file === "T.lpk")
      candidate = openStream(binary, [
        join(work, freeze.candidate_model_file),
        join(work, "candidate.json")
      ]);
    frequency = openStream(binary, [
      join(work, freeze.frequency_model_file),
      join(work, "frequency.json")
    ]);
    const evaluation = await evaluateRows(
      rows,
      candidate?.predict ?? frequency.predict,
      frequency.predict
    );
    if (candidate) await candidate.finish();
    await frequency.finish();
    const summary = summarizeGroups(evaluation.counts, freeze.components);
    assert(summary.units.length >= (input.mode === "final" ? 500 : 1));
    const intervals = bootstrapUI(summary.units);
    const qualified = input.mode === "final" && qualifiesUI(intervals, freeze.comparison);
    const report = {
      schema: "linka-final-aggregate-v1",
      metric: "UI_KSR_V1",
      mode: input.mode,
      completedAtUTC: new Date().toISOString(),
      evaluationRunId: process.env.GITHUB_RUN_ID ?? null,
      evaluationRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      status: qualified ? "QUALIFIED_SIMULATION_ONLY" : "NOT_QUALIFIED",
      productionApproved: false,
      clinicalAAC: false,
      synthetic: true,
      sourceSha: input.source_sha,
      appToolingSha: input.app_tooling_sha,
      manifestSha256: input.final_seal_sha256,
      finalSha256: manifest.sha256,
      protocolSha256: input.protocol_sha256,
      runFreezeSha256: input.run_freeze_sha256,
      candidateRunId: input.candidate_run_id,
      artifactId: input.candidate_artifact_id,
      candidateArtifactSha256: freeze.candidate_artifact_sha256,
      workflowSha256: context.metadata.executing_workflow_sha256,
      candidateModelSha256: freeze.candidate_model_sha256,
      frequencyModelSha256: freeze.frequency_model_sha256,
      binarySha256: hash(await readFile(binary)),
      sourceStreamSha256: freeze.source_stream_sha256,
      rows: rows.length,
      groups: input.mode === "final" ? manifest.groups : manifest.dev.groups,
      components: summary.units.length,
      statistics: input.mode === "final" ? manifest.statistics : manifest.dev.statistics,
      selectionCost: 1,
      bootstrap: {
        seed: 40003,
        resamples: 10000,
        rng: "xorshift32-u32-modulo-v1",
        quantile: "floor((n-1)*p)",
        ...intervals
      },
      ksr: summary.ksr,
      frequencyKsr: summary.frequencyKsr,
      delta: summary.delta,
      groupMeanCounts: {
        manual: summary.manual,
        candidate: summary.candidate,
        frequency: summary.frequency
      },
      words: evaluation.words,
      descriptiveRowPooledStrata: evaluation.descriptiveRowPooledStrata,
      diagnostics: evaluation.diagnostics,
      safety: evaluation.safety
    };
    if (input.mode === "dev") {
      const uIntervals = bootstrapUI(
        summary.units.map((unit) => ({ ...unit, candidate: unit.frequency }))
      );
      report.schema = "linka-ui-dev-aggregate-v1";
      report.status = "DIAGNOSTIC_SELECTION_ONLY";
      delete report.finalSha256;
      report.devSha256 = manifest.dev.sha256;
      report.models = {
        U: {
          modelSha256: freeze.frequency_model_sha256,
          bytes: (await lstat(join(work, "U.lpk"))).size,
          searchConfig: freeze.frequency_config,
          ksr: summary.frequencyKsr,
          ksrCI: uIntervals.ksrCI
        },
        T: candidate
          ? {
              modelSha256: freeze.candidate_model_sha256,
              bytes: (await lstat(join(work, "T.lpk"))).size,
              searchConfig: freeze.candidate_config,
              ksr: summary.ksr,
              ksrCI: intervals.ksrCI
            }
          : null
      };
      report.recommendedModel = recommendDev(
        report.models.T ? intervals.deltaCI : null,
        report.models.T?.bytes
      );
      report.limitation =
        "30-record synthetic DEV diagnostic selection, not broad AAC evidence or production approval";
    }
    await writeFile(
      join(tempRoot, `${input.mode}-aggregate.json`),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx", mode: 0o600 }
    );
    console.log(
      input.mode === "dev"
        ? "UI_DEV_DIAGNOSTIC_SELECTION_COMPLETE_NO_FINAL_OPENED"
        : qualified
          ? "UI_KSR_V1_QUALIFIED_SIMULATION_ONLY"
          : "UI_KSR_V1_NOT_QUALIFIED_NO_RETUNING"
    );
    if (input.mode === "final" && !qualified) process.exitCode = 2;
    return report;
  } finally {
    await Promise.allSettled([candidate?.abort(), frequency?.abort()]);
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch {
    console.error("FINAL_EVALUATION_BLOCKED_NO_CONTENT_LOGGED_NO_RETUNING");
    process.exitCode = 1;
  }
}
