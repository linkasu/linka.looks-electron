import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { bindingPaths, validateDataset } from "./predictor-evaluation.mjs";
import {
  decodeBundle,
  validateMetadata,
  validateConfig,
  validateFreeze,
  validateDevReport,
  validateComponents,
  extractArtifact,
  openStream
} from "./predictor-evaluation-runner.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const config = {
  frequency_only: false,
  letters: false,
  spaces: false,
  external_lexicon: false,
  full_scan_oracle: false,
  candidate_limit: 128,
  max_operations: 12000,
  letter_cost: 1.5,
  space_cost: 1
};

test("bounded bundle transport rejects malformed base64, gzip bombs, schema and raw error disclosure", () => {
  for (const value of [
    "",
    "x".repeat(65001),
    "YWJj!",
    Buffer.from("private-fixture-marker").toString("base64"),
    gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1)).toString("base64"),
    gzipSync(Buffer.from('{"private-fixture-marker":true}')).toString("base64")
  ]) {
    assert.throws(
      () => decodeBundle(value),
      (error) => error.message === "FINAL_BUNDLE_INVALID"
    );
  }
  const payload = {
    schema: "linka-final-bundle-v1",
    final_jsonl: "fixture\n",
    dev_jsonl: "fixture\n",
    manifest_json: "{}",
    run_freeze_json: "{}",
    dev_report_json: "{}"
  };
  assert.equal(
    decodeBundle(gzipSync(Buffer.from(JSON.stringify(payload))).toString("base64")).final_jsonl,
    "fixture\n"
  );
  assert.throws(() =>
    decodeBundle(
      gzipSync(Buffer.from(JSON.stringify({ ...payload, path: "../x" }))).toString("base64")
    )
  );
});

test("DEV payload never accepts FINAL text; FINAL requires its own schema and frozen DEV report", () => {
  const encode = (value) => gzipSync(Buffer.from(JSON.stringify(value))).toString("base64");
  const final = {
    schema: "linka-final-bundle-v1",
    final_jsonl: "public-final-fixture\n",
    dev_jsonl: "public-dev-fixture\n",
    manifest_json: "{}",
    run_freeze_json: "{}",
    dev_report_json: "{}"
  };
  const dev = {
    schema: "linka-ui-dev-bundle-v1",
    dev_jsonl: "public-dev-fixture\n",
    manifest_json: "{}",
    run_freeze_json: "{}"
  };
  assert.throws(() => decodeBundle(encode(final), "dev"));
  assert.equal(decodeBundle(encode(dev), "dev").dev_jsonl, dev.dev_jsonl);
  assert.throws(() => decodeBundle(encode({ ...dev, final_jsonl: "public-final-fixture" }), "dev"));
  assert.throws(() => decodeBundle(encode(dev), "final"));
  assert.throws(() => decodeBundle(encode({ ...final, dev_report_json: undefined }), "final"));
});

test("same-repository successful exact-source candidate metadata, workflow and artifact are mandatory", () => {
  const input = { source_sha: "a".repeat(40), candidate_run_id: "11", candidate_artifact_id: "12" };
  const metadata = {
    repository: "linkasu/linka.predictor-rust",
    run: {
      id: 11,
      run_attempt: 1,
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      head_sha: input.source_sha,
      repository: { full_name: "linkasu/linka.predictor-rust" }
    },
    candidate_workflow: { path: ".github/workflows/model-candidates.yml" },
    artifact: {
      id: 12,
      expired: false,
      name: "model-candidates-11-1",
      size_in_bytes: 1234,
      workflow_run: { id: 11, head_sha: input.source_sha }
    }
  };
  validateMetadata(input, metadata);
  for (const change of [
    { conclusion: "failure" },
    { status: "in_progress" },
    { head_sha: "b".repeat(40) },
    { repository: { full_name: "other/repo" } }
  ]) {
    assert.throws(() =>
      validateMetadata(input, { ...metadata, run: { ...metadata.run, ...change } })
    );
  }
  assert.throws(() =>
    validateMetadata(input, { ...metadata, artifact: { ...metadata.artifact, expired: true } })
  );
});

test("SearchConfig must be complete and bounded; no defaults chosen after FINAL", () => {
  validateConfig(config);
  for (const value of [
    {},
    { ...config, unknown: 1 },
    { ...config, candidate_limit: 0 },
    { ...config, max_operations: 1000001 },
    { ...config, letter_cost: -1 }
  ])
    assert.throws(() => validateConfig(value));
});

test("private child JSONL validates request IDs, bounds and nonzero completion without model inference", async () => {
  const code = `let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const x=JSON.parse(b.slice(0,i));b=b.slice(i+1);process.stdout.write(JSON.stringify({id:x.id,text:[],pos:0,endOfWord:false})+"\\n");}});`;
  const child = openStream(process.execPath, ["-e", code]);
  const input = { text: "фикстура", caret: 8, language: "ru" };
  assert.deepEqual((await child.predict(input)).text, []);
  await child.finish();
  const bad = openStream(process.execPath, [
    "-e",
    "process.stdin.once('data',()=>process.stdout.write('{\"id\":99,\"text\":[]}\\n')); "
  ]);
  await assert.rejects(bad.predict(input));
  await bad.abort();
  const badExit = openStream(process.execPath, [
    "-e",
    code + "process.stdin.on('end',()=>process.exit(7));"
  ]);
  await badExit.predict(input);
  await assert.rejects(badExit.finish());
  await badExit.abort();
  const oversized = openStream(process.execPath, [
    "-e",
    "process.stdin.once('data',()=>process.stdout.write('x'.repeat(262146))); "
  ]);
  await assert.rejects(oversized.predict(input));
  await oversized.abort();
});

test("model q excludes preserved right suffix even for separate editing probes", async () => {
  const code = `let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const x=JSON.parse(b.slice(0,i));b=b.slice(i+1);process.stdout.write(JSON.stringify({id:x.id,text:[x.q],pos:0,endOfWord:true})+"\\n");}});`;
  const child = openStream(process.execPath, ["-e", code]);
  try {
    const input = { text: "лево правыйсуффикс", caret: 4, language: "ru" };
    const result = await child.predict(input);
    assert.deepEqual(result.text, ["лево"]);
    assert.deepEqual(result.input, input);
    await child.finish();
  } finally {
    await child.abort();
  }
});

test("run-freeze enforces approved UI_KSR_V1, refs/hashes/configs and chronology", () => {
  const h = "a".repeat(64);
  const input = {
    source_sha: "b".repeat(40),
    app_tooling_sha: "c".repeat(40),
    candidate_run_id: "11",
    candidate_artifact_id: "12",
    candidate_model_sha256: h,
    final_seal_sha256: h,
    protocol_sha256: h
  };
  const metadata = {
    executing_workflow_sha256: h,
    artifact: { digest: `sha256:${h}` },
    run: { created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" }
  };
  const manifest = {
    frozenAtUTC: "2026-01-01T00:00:00Z",
    dev: { sha256: h, statistics: { rows: 30 } },
    bindings: { "docs/model-400-evaluation.md": h }
  };
  const freeze = {
    ...input,
    schema: "linka-final-run-freeze-v1",
    state: "DEV_FROZEN_FINAL_UNOPENED",
    metric: "UI_KSR_V1",
    frozen_at_utc: "2026-01-04T00:00:00Z",
    workflow_sha256: h,
    source_stream_sha256: h,
    stream_binary_sha256: h,
    source_exclusion_helper_sha256: h,
    source_manifest_sha256: h,
    exclusions_file: "provenance/exclusions.json",
    exclusions_sha256: h,
    candidate_artifact_sha256: h,
    candidate_model_file: "T.lpk",
    frequency_model_file: "U.lpk",
    frequency_model_sha256: h,
    frequencies_sha256: h,
    candidate_config: config,
    frequency_config: { ...config, frequency_only: true },
    dev_sha256: h,
    typescript_version: ts.version,
    node_version: process.version,
    comparison: "contextual",
    components: {},
    owner_approved: true,
    independence_approved: true,
    pretraining_chronology_attested: true,
    dev_only_selection: true,
    selection_cost: 1,
    resamples: 10000,
    seed: 40003,
    ui_dev_report_sha256: h
  };
  validateFreeze(input, freeze, manifest, metadata);
  const devPlan = {
    ...freeze,
    schema: "linka-ui-dev-plan-v1",
    state: "DEV_PARAMETERS_FIXED_FINAL_UNOPENED"
  };
  delete devPlan.ui_dev_report_sha256;
  validateFreeze(input, devPlan, manifest, metadata, "dev");
  assert.throws(() => validateFreeze(input, devPlan, manifest, metadata, "final"));
  const report = {
    schema: "linka-ui-dev-aggregate-v1",
    mode: "dev",
    metric: "UI_KSR_V1",
    status: "DIAGNOSTIC_SELECTION_ONLY",
    productionApproved: false,
    clinicalAAC: false,
    sourceSha: freeze.source_sha,
    appToolingSha: freeze.app_tooling_sha,
    manifestSha256: freeze.final_seal_sha256,
    protocolSha256: freeze.protocol_sha256,
    devSha256: h,
    candidateRunId: freeze.candidate_run_id,
    artifactId: freeze.candidate_artifact_id,
    candidateArtifactSha256: h,
    binarySha256: h,
    sourceStreamSha256: h,
    workflowSha256: h,
    rows: 30,
    bootstrap: { seed: 40003, resamples: 10000, deltaCI: [0.01, 0.2] },
    models: {
      U: { modelSha256: h, bytes: 10, searchConfig: freeze.frequency_config },
      T: { modelSha256: h, bytes: 10, searchConfig: freeze.candidate_config }
    },
    recommendedModel: "T",
    completedAtUTC: "2026-01-03T01:00:00Z"
  };
  validateDevReport(report, freeze, manifest, metadata);
  validateDevReport(
    report,
    {
      ...freeze,
      candidate_model_file: "U.lpk",
      candidate_config: freeze.frequency_config,
      comparison: "general"
    },
    manifest,
    metadata
  );
  assert.throws(() =>
    validateDevReport({ ...report, appToolingSha: "d".repeat(40) }, freeze, manifest, metadata)
  );
  assert.throws(() =>
    validateDevReport(
      { ...report, recommendedModel: "U", bootstrap: { ...report.bootstrap, deltaCI: [0, 0.2] } },
      freeze,
      manifest,
      metadata
    )
  );
  assert.throws(() =>
    validateDevReport(
      { ...report, completedAtUTC: "2026-01-05T00:00:00Z" },
      freeze,
      manifest,
      metadata
    )
  );
  for (const change of [
    { seed: 906 },
    { metric: "core_DEV_phrase_mean" },
    { owner_approved: false },
    { state: "RUNNING" },
    { source_sha: "d".repeat(40) },
    { frequency_config: config },
    { frozen_at_utc: "2026-01-02T00:00:00Z" },
    { unknown: true },
    { exclusions_file: "../private.json" },
    { source_manifest_sha256: "bad" },
    { candidate_model_file: "mkn3.lpk" },
    { candidate_model_file: "unigram.lpk" },
    { frequency_model_file: "unigram.lpk" },
    { candidate_model_sha256: "d".repeat(64) }
  ])
    assert.throws(() => validateFreeze(input, { ...freeze, ...change }, manifest, metadata));
  assert.throws(() =>
    validateFreeze(input, freeze, { ...manifest, frozenAtUTC: "2026-01-05T00:00:00Z" }, metadata)
  );
});

test("hash-only component audit enforces exact/near family grouping, split isolation and >=500 units", () => {
  const finalRows = Array.from({ length: 501 }, (_, i) => ({ group: `g-${i}` }));
  const devRows = [{ group: "dev-0" }];
  const components = Object.fromEntries(finalRows.map((row) => [row.group, row.group]));
  const families = [...finalRows, ...devRows].map((row, i) => ({
    id: `row-${i}`,
    group_id: row.group,
    sha256: digest(`family-${i}`),
    token_count: 1,
    shingles: [digest(`shingle-${i}`)]
  }));
  const seal = "a".repeat(64);
  const index = {
    schema: "linka-eval-exclusions-v1",
    normalizer: "nfc-lower-v1",
    source_seal_sha256: seal,
    families
  };
  validateComponents(index, finalRows, devRows, components, seal);
  const exact = structuredClone(index);
  exact.families[1].sha256 = exact.families[0].sha256;
  assert.throws(() => validateComponents(exact, finalRows, devRows, components, seal));
  validateComponents(exact, finalRows, devRows, { ...components, "g-1": "g-0" }, seal);
  const cross = structuredClone(index);
  cross.families.at(-1).sha256 = cross.families[0].sha256;
  assert.throws(() => validateComponents(cross, finalRows, devRows, components, seal));
  const near = structuredClone(index);
  near.families[0].shingles = [0, 1, 2, 3, 4].map((i) => digest(`near-${i}`));
  near.families[1].shingles = near.families[0].shingles.slice(0, 4);
  assert.throws(() => validateComponents(near, finalRows, devRows, components, seal));
  assert.throws(() =>
    validateComponents(
      index,
      finalRows,
      devRows,
      Object.fromEntries(finalRows.map((row) => [row.group, "one"])),
      seal
    )
  );
});

test("artifact extractor checks hashes/provenance and rejects path traversal without loading a model", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ui-final-fixture-"));
  try {
    const model = Buffer.from("fixture-not-a-model");
    const freq = Buffer.from("fixture-counts");
    const h = digest(model);
    const f = digest(freq);
    const sourceManifest = JSON.stringify({ fixture: "not a training source" });
    const sourceManifestHash = digest(sourceManifest);
    const freeze = {
      source_sha: "a".repeat(40),
      source_manifest_sha256: sourceManifestHash,
      exclusions_sha256: "b".repeat(64),
      candidate_model_file: "T.lpk",
      candidate_model_sha256: h,
      frequency_model_file: "U.lpk",
      frequency_model_sha256: h,
      frequencies_sha256: f
    };
    const completed = JSON.stringify({
      state: "COMPLETED",
      child_reaped: true,
      code: 0,
      model_sha256: h,
      bytes: model.length
    });
    const payload = {
      "T.lpk": model.toString(),
      "U.lpk": model.toString(),
      "U.receipt.json": completed,
      "T.receipt.json": completed,
      "U.dev.json": "{}",
      "T.dev.json": "{}",
      "source-manifest.json": sourceManifest,
      "frequencies.tsv": freq.toString()
    };
    const withProvenance = (files, override = {}) => ({
      ...files,
      "provenance.json": JSON.stringify({
        schema: "linka-model-candidates-v1",
        source_revision: freeze.source_sha,
        source_manifest_sha256: sourceManifestHash,
        exclusions_sha256: freeze.exclusions_sha256,
        quality_approved: false,
        redistribution_approved: false,
        final_evaluated: false,
        files_sha256: Object.fromEntries(
          Object.entries(files).map(([file, value]) => [file, digest(value)])
        ),
        ...override
      })
    });
    const makeZip = (data) =>
      execFileSync(
        "python3",
        [
          "-c",
          "import sys,json,zipfile; z=zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED); [z.writestr(k,v) for k,v in json.load(sys.stdin).items()]; z.close()",
          join(dir, "candidate.zip")
        ],
        { input: JSON.stringify(data), stdio: ["pipe", "pipe", "pipe"] }
      );
    makeZip(withProvenance(payload));
    const archive = join(dir, "candidate.zip");
    freeze.candidate_artifact_sha256 = digest(await readFile(archive));
    const out = join(dir, "good");
    await mkdir(out);
    await extractArtifact(archive, out, freeze);
    const devT = join(dir, "dev-t");
    await mkdir(devT);
    await extractArtifact(archive, devT, freeze, "dev");
    const wrongDevU = join(dir, "wrong-dev-u");
    await mkdir(wrongDevU);
    await assert.rejects(
      extractArtifact(archive, wrongDevU, { ...freeze, candidate_model_file: "U.lpk" }, "dev")
    );
    assert.equal(digest(await readFile(join(out, "T.lpk"))), h);
    await assert.rejects(
      extractArtifact(archive, out, { ...freeze, candidate_artifact_sha256: "c".repeat(64) })
    );
    const invalid = [
      withProvenance({
        ...payload,
        "U.receipt.json": JSON.stringify({ ...JSON.parse(completed), state: "FAILED", code: 7 })
      }),
      withProvenance({
        ...payload,
        "T.receipt.json": JSON.stringify({ ...JSON.parse(completed), state: "FAILED", code: 7 })
      }),
      withProvenance({
        ...payload,
        "U.receipt.json": JSON.stringify({ ...JSON.parse(completed), bytes: model.length + 1 })
      }),
      withProvenance({
        ...payload,
        "T.receipt.json": JSON.stringify({ ...JSON.parse(completed), child_reaped: false })
      }),
      withProvenance({
        ...payload,
        "T.receipt.json": JSON.stringify({ ...JSON.parse(completed), model_sha256: "c".repeat(64) })
      }),
      withProvenance(payload, { schema: "legacy" }),
      withProvenance(payload, { redistribution_approved: true }),
      withProvenance(payload, { source_manifest_sha256: "c".repeat(64) }),
      withProvenance(payload, {
        exclusions_sha256: undefined,
        exclusion_sha256: freeze.exclusions_sha256
      })
    ];
    for (const [i, files] of invalid.entries()) {
      makeZip(files);
      freeze.candidate_artifact_sha256 = digest(await readFile(archive));
      const target = join(dir, `invalid-${i}`);
      await mkdir(target);
      await assert.rejects(extractArtifact(archive, target, freeze));
    }
    const uOnly = {
      ...payload,
      "T.receipt.json": JSON.stringify({ state: "FAILED", child_reaped: true, code: 7 })
    };
    delete uOnly["T.lpk"];
    delete uOnly["T.dev.json"];
    makeZip(withProvenance(uOnly));
    freeze.candidate_artifact_sha256 = digest(await readFile(archive));
    const uOut = join(dir, "u-only");
    await mkdir(uOut);
    await extractArtifact(archive, uOut, { ...freeze, candidate_model_file: "U.lpk" });
    const devU = join(dir, "dev-u");
    await mkdir(devU);
    await extractArtifact(archive, devU, { ...freeze, candidate_model_file: "U.lpk" }, "dev");
    makeZip(withProvenance({ ...payload, "../escape": "fixture" }));
    freeze.candidate_artifact_sha256 = digest(await readFile(archive));
    const bad = join(dir, "bad");
    await mkdir(bad);
    await assert.rejects(extractArtifact(archive, bad, freeze));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  "offline synthetic preflight→private fake transport→UI aggregate; bad freeze never starts transport",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "ui-final-integration-fixture-"));
    try {
      const source = join(dir, "source");
      await mkdir(source);
      const git = (args) =>
        execFileSync("git", args, {
          cwd: source,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"]
        }).trim();
      git(["init", "-q"]);
      await mkdir(join(source, "crates/predictor-cli/examples"), { recursive: true });
      await mkdir(join(source, "provenance"));
      const alphabet = Array.from("абвгдежзийклмнопрстуфхцчшщэюя");
      const rows = Array.from({ length: 500 }, (_, i) => ({
        group: `fixture-${i}`,
        intent: `fixture-${i}`,
        domain: "fixture",
        text: `проверка ${alphabet[Math.floor(i / alphabet.length)]}${alphabet[i % alphabet.length]}`,
        source: "FIRST_PARTY_PROJECT_AUTHORED_SYNTHETIC"
      }));
      const devRows = Array.from({ length: 30 }, (_, i) => ({
        ...rows[0],
        group: `dev-fixture-${i}`,
        intent: `dev-fixture-${i}`,
        text: `бумага ${alphabet[Math.floor(i / alphabet.length)]}${alphabet[i % alphabet.length]}`
      }));
      const encode = (items) =>
        Buffer.from(items.map((item) => JSON.stringify(item)).join("\n") + "\n");
      const finalBytes = encode(rows);
      const devBytes = encode(devRows);
      const bindings = Object.fromEntries(
        await Promise.all(
          bindingPaths.map(async (path) => [
            path,
            digest(await readFile(new URL(`../../${path}`, import.meta.url)))
          ])
        )
      );
      const manifest = {
        schema: "linka-evaluation-seal-v1",
        split: "FINAL",
        source: rows[0].source,
        license: "CC0-1.0",
        synthetic: true,
        clinicalAAC: false,
        proxy: false,
        canonicalMetric: "UI_KSR_V1",
        minGroups: 500,
        rows: 500,
        groups: 500,
        sha256: digest(finalBytes),
        statistics: validateDataset(finalBytes, 500),
        frozenAtUTC: "2026-01-01T00:00:00Z",
        bindings,
        dev: { groups: 30, sha256: digest(devBytes), statistics: validateDataset(devBytes, 30) }
      };
      const manifestJson = JSON.stringify(manifest) + "\n";
      const seal = digest(manifestJson);
      const index = {
        schema: "linka-eval-exclusions-v1",
        normalizer: "nfc-lower-v1",
        source_seal_sha256: seal,
        families: [...rows, ...devRows].map((row, i) => ({
          id: `row-${i}`,
          group_id: row.group,
          sha256: digest(`family-${i}`),
          token_count: 2,
          shingles: [digest(`shingle-${i}`)]
        }))
      };
      await writeFile(join(source, "provenance/exclusions.json"), JSON.stringify(index));
      for (const file of ["model_final_stream.rs", "make_eval_exclusions.rs"])
        await writeFile(
          join(source, "crates/predictor-cli/examples", file),
          "// fixture, not a Rust evaluator\n"
        );
      git(["add", "."]);
      git([
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "fixture"
      ]);
      const sourceSha = git(["rev-parse", "HEAD"]);
      const appSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).trim();
      await mkdir(join(source, "target/release/examples"), { recursive: true });
      const fake =
        "#!/usr/bin/env node\nrequire('fs').appendFileSync(process.env.RUNNER_TEMP+'/transport-started','start\\n');let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const x=JSON.parse(b.slice(0,i));b=b.slice(i+1);process.stdout.write(JSON.stringify({id:x.id,text:[],pos:0,endOfWord:false})+'\\n');}});\n";
      await writeFile(join(source, "target/release/examples/model_final_stream"), fake, {
        mode: 0o700
      });
      const model = "synthetic-fixture-not-a-model";
      const frequencies = "fixture-not-training-counts";
      const modelHash = digest(model);
      const frequenciesHash = digest(frequencies);
      const exclusionHash = digest(await readFile(join(source, "provenance/exclusions.json")));
      const sourceManifest = JSON.stringify({ fixture: "not a training source" });
      const sourceManifestHash = digest(sourceManifest);
      const completed = JSON.stringify({
        state: "COMPLETED",
        child_reaped: true,
        code: 0,
        model_sha256: modelHash,
        bytes: Buffer.byteLength(model)
      });
      const archivePayload = {
        "T.lpk": model,
        "U.lpk": model,
        "U.receipt.json": completed,
        "T.receipt.json": completed,
        "U.dev.json": "{}",
        "T.dev.json": "{}",
        "source-manifest.json": sourceManifest,
        "frequencies.tsv": frequencies
      };
      archivePayload["provenance.json"] = JSON.stringify({
        schema: "linka-model-candidates-v1",
        source_revision: sourceSha,
        source_manifest_sha256: sourceManifestHash,
        exclusions_sha256: exclusionHash,
        quality_approved: false,
        redistribution_approved: false,
        final_evaluated: false,
        files_sha256: Object.fromEntries(
          Object.entries(archivePayload).map(([file, value]) => [file, digest(value)])
        )
      });
      execFileSync(
        "python3",
        [
          "-c",
          "import sys,json,zipfile; z=zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED); [z.writestr(k,v) for k,v in json.load(sys.stdin).items()]; z.close()",
          join(dir, "eval-candidate.zip")
        ],
        { input: JSON.stringify(archivePayload), stdio: ["pipe", "pipe", "pipe"] }
      );
      const zipBytes = await readFile(join(dir, "eval-candidate.zip"));
      const zipHash = digest(zipBytes);
      const h = "a".repeat(64);
      const input = {
        source_sha: sourceSha,
        app_tooling_sha: appSha,
        candidate_run_id: "11",
        candidate_artifact_id: "12",
        candidate_model_sha256: modelHash,
        final_seal_sha256: seal,
        protocol_sha256: bindings["docs/model-400-evaluation.md"]
      };
      const freeze = {
        ...input,
        schema: "linka-ui-dev-plan-v1",
        state: "DEV_PARAMETERS_FIXED_FINAL_UNOPENED",
        metric: "UI_KSR_V1",
        frozen_at_utc: "2026-01-04T00:00:00Z",
        workflow_sha256: h,
        source_stream_sha256: digest("// fixture, not a Rust evaluator\n"),
        stream_binary_sha256: digest(fake),
        source_exclusion_helper_sha256: digest("// fixture, not a Rust evaluator\n"),
        source_manifest_sha256: sourceManifestHash,
        exclusions_file: "provenance/exclusions.json",
        exclusions_sha256: exclusionHash,
        candidate_artifact_sha256: zipHash,
        candidate_model_file: "T.lpk",
        frequency_model_file: "U.lpk",
        frequency_model_sha256: modelHash,
        frequencies_sha256: frequenciesHash,
        candidate_config: config,
        frequency_config: { ...config, frequency_only: true },
        dev_sha256: digest(devBytes),
        typescript_version: ts.version,
        node_version: process.version,
        comparison: "contextual",
        components: Object.fromEntries(devRows.map((row) => [row.group, row.group])),
        owner_approved: true,
        independence_approved: true,
        pretraining_chronology_attested: true,
        dev_only_selection: true,
        selection_cost: 1,
        resamples: 10000,
        seed: 40003
      };
      const freezeJson = JSON.stringify(freeze) + "\n";
      const bundle = {
        schema: "linka-ui-dev-bundle-v1",
        dev_jsonl: devBytes.toString(),
        manifest_json: manifestJson,
        run_freeze_json: freezeJson
      };
      input.run_freeze_sha256 = digest(freezeJson);
      input.sealed_bundle = gzipSync(Buffer.from(JSON.stringify(bundle))).toString("base64");
      input.mode = "dev";
      assert(
        !Object.hasOwn(bundle, "final_jsonl") && !JSON.stringify(bundle).includes(rows[0].text)
      );
      const metadata = {
        repository: "linkasu/linka.predictor-rust",
        executing_workflow_sha256: h,
        candidate_workflow: { path: ".github/workflows/model-candidates.yml" },
        run: {
          id: 11,
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
          event: "workflow_dispatch",
          head_sha: sourceSha,
          head_branch: "main",
          path: ".github/workflows/model-candidates.yml",
          head_repository: { full_name: "linkasu/linka.predictor-rust" },
          repository: { full_name: "linkasu/linka.predictor-rust" },
          created_at: "2026-01-02T00:00:00Z",
          updated_at: "2026-01-03T00:00:00Z"
        },
        artifact: {
          id: 12,
          expired: false,
          name: "model-candidates-11-1",
          size_in_bytes: zipBytes.length,
          digest: `sha256:${zipHash}`,
          workflow_run: { id: 11, head_sha: sourceSha }
        }
      };
      validateMetadata(input, metadata, zipBytes);
      await writeFile(join(dir, "eval-candidate-meta.json"), JSON.stringify(metadata));
      const eventPath = join(dir, "event.json");
      const event = (inputs) =>
        JSON.stringify({ inputs, repository: { default_branch: "fixture-main" } });
      const env = {
        ...process.env,
        RUNNER_TEMP: dir,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_REPOSITORY: "linkasu/linka.predictor-rust",
        GITHUB_REF: "refs/heads/fixture-main"
      };
      const run = (mode) =>
        execFileSync(
          process.execPath,
          [new URL("./predictor-evaluation-runner.mjs", import.meta.url).pathname, mode, source],
          { env, stdio: ["ignore", "pipe", "pipe"], timeout: 20000 }
        );
      await writeFile(eventPath, event({ ...input, candidate_model_sha256: "d".repeat(64) }));
      assert.throws(
        () => run("run"),
        (error) => error.status === 1
      );
      await assert.rejects(readFile(join(dir, "transport-started")));
      await writeFile(eventPath, event(input));
      run("preflight");
      await assert.rejects(readFile(join(dir, "transport-started")));
      run("run");
      const devReportText = await readFile(join(dir, "dev-aggregate.json"), "utf8");
      const devReport = JSON.parse(devReportText);
      assert.equal(devReport.mode, "dev");
      assert.equal(devReport.recommendedModel, "U");
      assert.equal(devReport.rows, 30);
      assert(!devReportText.includes(rows[0].text) && !devReportText.includes(devRows[0].text));
      const finalFreeze = {
        ...freeze,
        schema: "linka-final-run-freeze-v1",
        state: "DEV_FROZEN_FINAL_UNOPENED",
        frozen_at_utc: new Date().toISOString(),
        candidate_model_file: "U.lpk",
        candidate_config: freeze.frequency_config,
        comparison: "general",
        components: Object.fromEntries(rows.map((row) => [row.group, row.group])),
        ui_dev_report_sha256: digest(devReportText)
      };
      const finalFreezeJson = JSON.stringify(finalFreeze) + "\n";
      const finalBundle = {
        ...bundle,
        schema: "linka-final-bundle-v1",
        final_jsonl: finalBytes.toString(),
        run_freeze_json: finalFreezeJson,
        dev_report_json: devReportText
      };
      const finalInput = {
        ...input,
        mode: "final",
        run_freeze_sha256: digest(finalFreezeJson),
        sealed_bundle: gzipSync(Buffer.from(JSON.stringify(finalBundle))).toString("base64")
      };
      await writeFile(eventPath, event({ ...finalInput, app_tooling_sha: "d".repeat(40) }));
      assert.throws(
        () => run("run"),
        (error) => error.status === 1
      );
      assert.equal(
        (await readFile(join(dir, "transport-started"), "utf8")).trim().split("\n").length,
        2
      );
      await writeFile(eventPath, event(finalInput));
      run("preflight");
      assert.throws(
        () => run("run"),
        (error) => error.status === 2
      );
      assert.equal(
        (await readFile(join(dir, "transport-started"), "utf8")).trim().split("\n").length,
        3
      );
      const reportText = await readFile(join(dir, "final-aggregate.json"), "utf8");
      const report = JSON.parse(reportText);
      assert.equal(report.status, "NOT_QUALIFIED");
      assert.equal(report.metric, "UI_KSR_V1");
      assert.equal(report.ksr, 0);
      assert.equal(report.groups, 500);
      assert.equal(report.components, 500);
      assert(!reportText.includes(rows[0].text) && !reportText.includes("fixture-123"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);
