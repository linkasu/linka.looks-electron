const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Zip = require("adm-zip");
const {
  hash,
  codePath,
  validateApproval,
  validateEvidence,
  inspectArchive,
  qualify,
  sourceArchive,
  prepare,
  verifyModelBuildInputs,
  verifyPublicSource
} = require("./promote-base-model.cjs");
const REPO = "linkasu/linka.predictor-rust";
const SOURCE = "1".repeat(40),
  APP = "2".repeat(40);
const RUNTIME = "ec07b2cd49c1c2c684e6643f0dab75cf5895ebca";
const h = hash(Buffer.from("synthetic fixture only"));
const metadata = (data) => ({ sha256: hash(data), bytes: data.length });
const json = (value) => Buffer.from(JSON.stringify(value));

test("corresponding source includes only explicit Book/build recipes, never broad Python or private/evaluation data", () => {
  for (const name of [
    "scripts/model_recipe.py",
    "scripts/book_model.py",
    ".github/workflows/model-candidates.yml",
    ".github/workflows/windows-runtime.yml",
    "crates/predictor-cli/examples/prepare_source.rs",
    "Cargo.lock",
    "crates/predictor-core/Cargo.toml"
  ])
    assert.equal(codePath(name), true, name);
  for (const name of [
    "scripts/other.py",
    ".github/workflows/model-final.yml",
    "provenance/reviews/approval.json",
    "private/main.rs",
    "crates/FINAL/example.rs",
    "corpus/data.rs",
    "profiles/main.rs",
    "sealed/Cargo.toml",
    "train.txt",
    "model.lpk",
    "../scripts/book_model.py"
  ])
    assert.equal(codePath(name), false, name);
});

function fixture(variant = "U") {
  const model = Buffer.from("SYNTHETIC MODEL, NOT PRODUCTION"),
    exe = Buffer.alloc(512);
  exe.write("MZ");
  exe.writeUInt32LE(128, 60);
  exe.write("PE\0\0", 128);
  exe.writeUInt16LE(0x8664, 132);
  exe.writeUInt16LE(240, 148);
  exe.writeUInt16LE(2, 150);
  exe.writeUInt16LE(0x20b, 152);
  const license = Buffer.from("synthetic original code license"),
    notices = Buffer.from("synthetic original model notices"),
    kenlm = Buffer.from("synthetic estimator notice");
  const approval = {
    schema: "linka-base-model-release-approval-v1",
    repository: REPO,
    tag: "base-ru-v1",
    source_sha: SOURCE,
    app_tooling_sha: APP,
    review: {
      status: "APPROVED",
      quality: "APPROVED",
      redistribution: "APPROVED",
      runtime: "APPROVED",
      content: "APPROVED",
      scope: ["model", "notices", "source-code", "aggregate-evidence"]
    },
    licenses: { code: "GPL-3.0-or-later", data: "CC0-1.0" },
    model: { variant, ...metadata(model) },
    runtime: { source_sha: RUNTIME, ...metadata(exe) },
    source_manifest_sha256: h,
    source_review_sha256: h,
    exclusions_sha256: h,
    final: {
      app_tooling_sha: APP,
      seal_sha256: h,
      protocol_sha256: h,
      freeze_sha256: h,
      report_sha256: h
    },
    windows: { app_tooling_sha: APP, source_sha256: h, memory_sha256: h, ui_sha256: h },
    publication: {
      notice: { path: "provenance/releases/MODEL_NOTICE.md", ...metadata(notices) },
      model_notices_sha256: hash(notices),
      kenlm_license_sha256: hash(kenlm),
      code_license_sha256: hash(license)
    },
    sources: Object.fromEntries(
      ["model", "runtime"].map((kind) => [
        kind,
        {
          sha: kind === "model" ? SOURCE : RUNTIME,
          files: {
            "Cargo.toml": metadata(Buffer.from("fixture")),
            LICENSE: metadata(license),
            "src/lib.rs": metadata(Buffer.from("fixture")),
            [kind === "model"
              ? "scripts/model_recipe.py"
              : ".github/workflows/windows-runtime.yml"]: metadata(Buffer.from("fixture"))
          }
        }
      ])
    ),
    raw_source: { published: false, reproduction_input: "REQUIRED_SEPARATELY" },
    runs: {}
  };
  const modelFiles = {
    [`${variant}.lpk`]: model,
    [`${variant}.dev.json`]: json({ fixture: true }),
    "U.receipt.json": json({ state: "COMPLETED", code: 0, child_reaped: true }),
    "T.receipt.json": json({
      state: variant === "T" ? "COMPLETED" : "FAILED",
      code: variant === "T" ? 0 : 9,
      child_reaped: true
    }),
    "NOTICES.txt": notices,
    "KenLM-LICENSE": kenlm,
    "source-manifest.json": Buffer.from("synthetic fixture only"),
    "source-review.json": Buffer.from("synthetic fixture only")
  };
  if (variant === "T") {
    modelFiles["U.lpk"] = model;
    modelFiles["U.dev.json"] = json({ fixture: true });
  }
  modelFiles["provenance.json"] = json({
    schema: "linka-model-candidates-v1",
    source_revision: SOURCE,
    source_manifest_sha256: h,
    exclusions_sha256: h,
    quality_approved: false,
    redistribution_approved: false,
    final_evaluated: false,
    files_sha256: Object.fromEntries(
      Object.entries(modelFiles).map(([name, data]) => [name, hash(data)])
    )
  });
  const final = {
    schema: "linka-final-aggregate-v1",
    metric: "UI_KSR_V1",
    status: "QUALIFIED_SIMULATION_ONLY",
    productionApproved: false,
    sourceSha: SOURCE,
    appToolingSha: APP,
    candidateRunId: "11",
    artifactId: "21",
    candidateModelSha256: hash(model),
    manifestSha256: h,
    protocolSha256: h,
    runFreezeSha256: h,
    components: 500,
    rows: 1000,
    ksr: 0.5,
    frequencyKsr: 0.3,
    delta: 0.2
  };
  const source = {
    schema: "windows-model-candidate-v1",
    production_approved: false,
    hardware: "NOT_TESTED",
    app_tooling_sha: APP,
    model_variant: variant,
    model_sha256: hash(model),
    exe_sha256: hash(exe),
    model: { run_id: 11, artifact_id: 21, source_sha: SOURCE },
    runtime: { run_id: 12, artifact_id: 22, source_sha: RUNTIME }
  };
  const memory = {
    schema: "windows-model-memory-v1",
    status: "PASS",
    limit_bytes: 536870912,
    cases: Array.from({ length: 5 }, (_, i) => ({
      case_index: i,
      peak_private_commit_bytes: 1024,
      active_owned_processes_after_exit: 0
    })),
    hardware: "NOT_TESTED",
    production_approved: false
  };
  const ui = {
    schema: "windows-model-ui-v1",
    status: "PASS",
    within_budget: true,
    completed: 1000,
    p95_ms: 5,
    p99_ms: 10,
    manual_input: { duringPrediction: true, textChanged: true, ms: 5 },
    children: { spawned: 1001, closed: 1001, failed: 0, live: 0 },
    hardware: "NOT_TESTED",
    production_approved: false
  };
  approval.final.report_sha256 = hash(json(final));
  for (const [key, value] of Object.entries({ source, memory, ui }))
    approval.windows[`${key}_sha256`] = hash(json(value));
  const maps = {
    model: modelFiles,
    runtime: {
      "lp-electron.exe": exe,
      LICENSE: license,
      "source.txt": Buffer.from(RUNTIME),
      "toolchain.txt": Buffer.from("rustc 1.98.1 crt-static=true"),
      "smoke.txt": Buffer.from("PASS: native RU JSON"),
      "dll-imports.txt": Buffer.from("KERNEL32.dll")
    },
    final: { "final-aggregate.json": json(final) },
    windows: { "source.json": json(source), "memory.json": json(memory), "ui.json": json(ui) }
  };
  const evidence = {},
    archives = {};
  const workflows = {
    model: "model-candidates",
    runtime: "windows-runtime",
    final: "model-final",
    windows: "windows-model-qualification"
  };
  const refresh = () => {
    for (const [index, kind] of Object.keys(maps).entries()) {
      const zip = new Zip();
      for (const [name, bytes] of Object.entries(maps[kind])) zip.addFile(name, bytes);
      archives[kind] = zip.toBuffer();
      const run = {
        id: 11 + index,
        run_attempt: 1,
        head_sha: kind === "runtime" ? RUNTIME : SOURCE,
        path: `.github/workflows/${workflows[kind]}.yml`,
        event: "workflow_dispatch",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
        repository: { full_name: REPO },
        head_repository: { full_name: REPO }
      };
      const name =
        kind === "model"
          ? "model-candidates-11-1"
          : kind === "runtime"
            ? `windows-runtime-manual-reviewed-${RUNTIME}`
            : kind === "final"
              ? "ui-final-aggregate-13-1"
              : "windows-model-candidate-14-1";
      const artifact = {
        id: 21 + index,
        name,
        expired: false,
        digest: `sha256:${hash(archives[kind])}`,
        size_in_bytes: archives[kind].length,
        workflow_run: { id: run.id, head_sha: run.head_sha }
      };
      evidence[kind] = { run, artifact, member: structuredClone(artifact) };
      approval.runs[kind] = {
        run_id: run.id,
        run_attempt: 1,
        head_sha: run.head_sha,
        artifact_id: artifact.id,
        artifact_name: name,
        archive_sha256: hash(archives[kind]),
        archive_bytes: archives[kind].length
      };
    }
  };
  refresh();
  return { approval, evidence, archives, maps, refresh, final, source, memory, ui };
}

function bookFixture(large = false) {
  const f = fixture();
  f.maps.model["source-manifest.json"] = json({ source: { synthetic: true } });
  f.approval.source_manifest_sha256 = hash(f.maps.model["source-manifest.json"]);
  f.maps.model["U.dev.json"] = json({ state: "NOT_RUN", reason: "book_defer_core_dev" });
  const receipt = {
    schema: "linka-book-execution-v1",
    host: "book.local",
    colima_profile: "linka-model-400",
    book_job_id: "a".repeat(32),
    attempt: 1,
    source_sha: SOURCE,
    image_digest: `sha256:${"e".repeat(64)}`,
    limits: { memory_bytes: 6442450944, cpus: 2, tasks: 128 }
  };
  const sorted = (value) =>
    value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])])
        )
      : value;
  const execution = {
    ...receipt,
    kind: "book-local-linux-container",
    receipt_sha256: hash(Buffer.from(JSON.stringify(sorted(receipt)) + "\n"))
  };
  const provenance = JSON.parse(f.maps.model["provenance.json"]);
  provenance.source_manifest_sha256 = f.approval.source_manifest_sha256;
  for (const name of ["source-manifest.json", "U.dev.json"])
    provenance.files_sha256[name] = hash(f.maps.model[name]);
  provenance.execution = execution;
  provenance.book_completion = {
    schema: "linka-book-completion-v1",
    recipe: { state: "COMPLETED", mode: "train", run_id: `book:${receipt.book_job_id}:1` }
  };
  const arpa = large
    ? require("node:crypto").randomBytes(1024 ** 2 + 1024)
    : Buffer.from("SYNTHETIC MODEL WEIGHTS ONLY\n");
  const frequencies = Buffer.from("synthetic\t1\n");
  f.maps.model["frequencies.tsv"] = frequencies;
  provenance.frequencies_sha256 = provenance.files_sha256["frequencies.tsv"] = hash(frequencies);
  provenance.arpa_sha256 = { U: hash(arpa) };
  const reproduction = {
    schema: "linka-model-build-inputs-v1",
    variant: "U",
    source_sha: SOURCE,
    model_sha256: f.approval.model.sha256,
    model_bytes: f.approval.model.bytes,
    arpa_sha256: hash(arpa),
    frequencies_sha256: hash(frequencies),
    model_reproduction: "EXACT_BYTE_REPRODUCED_ON_BOOK",
    licenses: f.approval.licenses,
    original_corpus_included: false,
    evaluation_data_included: false,
    scope:
      "Exact production LPK generation from model weights and sufficient statistics; not an archive of original source records."
  };
  const capsuleFiles = {
    "model.arpa": arpa,
    "frequencies.tsv": frequencies,
    "BUILD.md": Buffer.from("SYNTHETIC REVIEWED BUILD METADATA ONLY; NEVER EXECUTED"),
    "reproduction.json": json(reproduction)
  };
  const zip = new Zip();
  for (const [name, bytes] of Object.entries(capsuleFiles)) zip.addFile(name, bytes);
  const capsule = zip.toBuffer();
  f.approval.publication.model_build_inputs = {
    path: "provenance/releases/SYNTHETIC-build-inputs.zip",
    ...metadata(capsule)
  };
  f.approval.review.model_reproduction = "APPROVED";
  f.approval.review.scope.push("model-build-inputs");
  f.maps.model["provenance.json"] = json(provenance);
  const original = {
    ...f.final,
    kind: "book-local-linux-container",
    inferenceLocation: "book.local",
    execution,
    evaluationRunId: null,
    evaluationRunAttempt: null
  };
  const wrapped = {
    ...original,
    evaluationRunId: "13",
    evaluationRunAttempt: "1",
    originalBookReportSha256: hash(json(original)),
    ciImport: {
      kind: "book-result-import",
      runId: "13",
      runAttempt: "1",
      bookJobId: receipt.book_job_id,
      inferencePerformed: false,
      inferenceLocation: "book.local"
    }
  };
  f.maps.final["final-aggregate.json"] = json(wrapped);
  f.maps.final["final-book-original-aggregate.json"] = json(original);
  f.approval.final.report_sha256 = hash(json(wrapped));
  f.refresh();
  return { ...f, original, wrapped, provenance, reproduction, capsuleFiles, capsule };
}

test("Book release requires a separately reviewed capsule; legacy approval is unchanged", async () => {
  const { assertImportedSemantics } = await import("./book-model-evaluation.mjs");
  for (const mutate of [
    (f) => {
      delete f.approval.publication.model_build_inputs;
      f.approval.review.scope = f.approval.review.scope.filter((s) => s !== "model-build-inputs");
    },
    (f) => (f.approval.review.model_reproduction = "PENDING"),
    (f) => f.approval.review.scope.pop(),
    (f) => (f.approval.publication.model_build_inputs.path = "../private.zip"),
    (f) => (f.approval.publication.model_build_inputs.bytes = 32 * 1024 ** 2 + 1)
  ]) {
    const f = bookFixture();
    mutate(f);
    assert.throws(() => qualify(f.approval, f.evidence, f.archives, assertImportedSemantics));
  }
  const legacy = fixture();
  assert.doesNotThrow(() => qualify(legacy.approval, legacy.evidence, legacy.archives));
});

test("tracked model-input capsule is byte-exact and rejects unreviewed bytes, wrong model/source/stats and raw extras", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-build-inputs-synthetic-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q");
  git("config", "user.name", "Synthetic Test");
  git("config", "user.email", "fixture@example.invalid");
  function track(f, bytes = f.capsule) {
    const file = path.join(root, f.approval.publication.model_build_inputs.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    git("add", ".");
    git("commit", "--allow-empty", "-qm", "synthetic capsule fixture");
  }
  const f = bookFixture();
  track(f);
  const verified = verifyModelBuildInputs(root, f.approval, f.provenance);
  assert.deepEqual(verified.bytes, f.capsule);
  assert.equal(verified.reproduction.status, "ARCHIVED_EXACT_MODEL_INPUTS");
  assert.equal(verified.reproduction.source_sha, SOURCE);
  assert.equal(verified.reproduction.model_sha256, f.approval.model.sha256);
  assert.equal(verified.reproduction.original_corpus_included, false);
  assert.equal(verified.reproduction.evaluation_data_included, false);
  assert.equal(verified.reproduction.all_inputs_reproducible, undefined);
  for (const change of [
    (v) => (v.source_sha = "f".repeat(40)),
    (v) => (v.model_sha256 = "0".repeat(64)),
    (v) => v.model_bytes++,
    (v) => (v.variant = "T"),
    (v) => (v.arpa_sha256 = "0".repeat(64)),
    (v) => (v.frequencies_sha256 = "0".repeat(64)),
    (v) => (v.original_corpus_included = true),
    (v) => (v.evaluation_data_included = true),
    (v) => (v.model_reproduction = "NOT_REPRODUCED")
  ]) {
    const bad = bookFixture();
    change(bad.reproduction);
    bad.capsuleFiles["reproduction.json"] = json(bad.reproduction);
    const zip = new Zip();
    for (const [name, bytes] of Object.entries(bad.capsuleFiles)) zip.addFile(name, bytes);
    const bytes = zip.toBuffer();
    Object.assign(bad.approval.publication.model_build_inputs, metadata(bytes));
    track(bad, bytes);
    assert.throws(() => verifyModelBuildInputs(root, bad.approval, bad.provenance));
  }
  for (const name of ["source.tsv.bz2", "FINAL.jsonl", "../raw", "train.txt"]) {
    const bad = bookFixture(),
      zip = new Zip();
    for (const [name, bytes] of Object.entries(bad.capsuleFiles)) zip.addFile(name, bytes);
    zip.addFile(name, Buffer.from("SYNTHETIC FORBIDDEN EXTRA"));
    const bytes = zip.toBuffer();
    Object.assign(bad.approval.publication.model_build_inputs, metadata(bytes));
    track(bad, bytes);
    assert.throws(() => verifyModelBuildInputs(root, bad.approval, bad.provenance));
  }
  for (const name of ["model.arpa", "frequencies.tsv"]) {
    const bad = bookFixture(),
      zip = new Zip();
    bad.capsuleFiles[name] = Buffer.from("SYNTHETIC MISMATCHED INPUT BYTES");
    for (const [name, bytes] of Object.entries(bad.capsuleFiles)) zip.addFile(name, bytes);
    const bytes = zip.toBuffer();
    Object.assign(bad.approval.publication.model_build_inputs, metadata(bytes));
    track(bad, bytes);
    assert.throws(() => verifyModelBuildInputs(root, bad.approval, bad.provenance));
  }
  track(f);
  const edited = Buffer.concat([f.capsule, Buffer.from("UNCOMMITTED SYNTHETIC EDIT")]);
  fs.writeFileSync(path.join(root, f.approval.publication.model_build_inputs.path), edited);
  Object.assign(f.approval.publication.model_build_inputs, metadata(edited));
  assert.throws(() => verifyModelBuildInputs(root, f.approval, f.provenance));
  Object.assign(f.approval.publication.model_build_inputs, metadata(f.capsule));
  track(f);
  f.approval.publication.model_build_inputs.sha256 = "0".repeat(64);
  assert.throws(() => verifyModelBuildInputs(root, f.approval, f.provenance));
});

test("model-input ZIP rejects duplicate names, symlinks, directories, ZIP64, multi-disk and expansion abuse", () => {
  const f = bookFixture();
  const inspect = (bytes) =>
    inspectArchive(bytes, "buildInputs", {
      archive_bytes: bytes.length,
      archive_sha256: hash(bytes)
    });
  for (const mutate of [
    (bytes) => bytes.writeUInt16LE(1, bytes.length - 18),
    (bytes) => bytes.writeUInt16LE(1, bytes.length - 2),
    (bytes) => bytes.writeUInt16LE(0xffff, bytes.length - 12),
    (bytes) => bytes.writeUInt16LE(45, bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 6),
    (bytes) => bytes.writeUInt16LE(45, 4),
    (bytes) =>
      bytes.writeUInt32LE(
        64 * 1024 ** 2 + 1,
        bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24
      )
  ]) {
    const bytes = Buffer.from(f.capsule);
    mutate(bytes);
    assert.throws(() => inspect(bytes));
  }
  const symlink = new Zip(f.capsule);
  symlink.getEntry("BUILD.md").header.attr = 0xa1ff0000;
  assert.throws(() => inspect(symlink.toBuffer()));
  const directory = new Zip(f.capsule);
  directory.deleteFile("BUILD.md");
  directory.addFile("BUILD.md/", Buffer.alloc(0));
  assert.throws(() => inspect(directory.toBuffer()));
  const duplicated = spawnSync("python3", [
    "-c",
    "import io,sys,warnings,zipfile; warnings.simplefilter('ignore'); b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); [z.writestr(n,b'SYNTHETIC') for n in ['model.arpa','model.arpa','frequencies.tsv','reproduction.json']]; z.close(); sys.stdout.buffer.write(b.getvalue())"
  ]);
  assert.equal(duplicated.status, 0);
  assert.throws(() => inspect(duplicated.stdout));
  assert.throws(() => inspect(Buffer.alloc(32 * 1024 ** 2 + 1)));
});

test("Book FINAL accepts the pinned original through the shared immutable-semantics validator", async () => {
  const { assertImportedSemantics } = await import("./book-model-evaluation.mjs");
  const f = bookFixture();
  const files = qualify(f.approval, f.evidence, f.archives, assertImportedSemantics);
  assert.deepEqual(files["model.lpk"], f.maps.model["U.lpk"]);
  assert.equal(files["final-book-original-aggregate.json"], undefined);
  assert.throws(() => qualify(f.approval, f.evidence, f.archives));
});

test("legacy FINAL cannot smuggle the new original filename", () => {
  const f = fixture();
  f.maps.final["final-book-original-aggregate.json"] = json(f.final);
  f.refresh();
  assert.throws(() => qualify(f.approval, f.evidence, f.archives));
});

test("async preparation loads the shared Book validator before source/output preparation", async () => {
  const f = bookFixture();
  let prepared = 0;
  const options = {
    approval: f.approval,
    sourceSha: SOURCE,
    roots: {
      get approval() {
        prepared++;
        throw new Error("BOOK_PREPARATION_VERIFIED");
      }
    },
    api: async (route) => {
      for (const value of Object.values(f.evidence)) {
        if (route === `actions/runs/${value.run.id}`) return value.run;
        if (route === `actions/artifacts/${value.artifact.id}`) return value.artifact;
        if (route === `actions/runs/${value.run.id}/artifacts?per_page=100&page=1`)
          return { artifacts: [value.member] };
      }
      throw new Error("unexpected synthetic API request");
    },
    download: async (spec) =>
      f.archives[
        Object.keys(f.approval.runs).find(
          (kind) => f.approval.runs[kind].artifact_id === spec.artifact_id
        )
      ]
  };
  await assert.rejects(prepare(options), /BOOK_PREPARATION_VERIFIED/);
  assert.equal(prepared, 1);
  f.wrapped.delta += 0.1;
  f.maps.final["final-aggregate.json"] = json(f.wrapped);
  f.approval.final.report_sha256 = hash(json(f.wrapped));
  f.refresh();
  await assert.rejects(prepare(options), /import must not alter Book semantics/);
  assert.equal(prepared, 1);
});

test("Book original digest, immutable semantics, CI identity and completed training context are required", async () => {
  const { assertImportedSemantics } = await import("./book-model-evaluation.mjs");
  for (const mutate of [
    (f) => delete f.maps.final["final-book-original-aggregate.json"],
    (f) => (f.wrapped.originalBookReportSha256 = "0".repeat(64)),
    (f) => (f.wrapped.delta += 0.1),
    (f) => (f.wrapped.ciImport.runId = f.wrapped.evaluationRunId = "999"),
    (f) => (f.wrapped.ciImport.runAttempt = f.wrapped.evaluationRunAttempt = "2"),
    (f) => (f.wrapped.ciImport.bookJobId = "b".repeat(32)),
    (f) => (f.wrapped.inferenceLocation = "ci"),
    (f) => (f.provenance.execution.kind = "github-linux"),
    (f) => delete f.provenance.execution,
    (f) => (f.provenance.book_completion.recipe.state = "CANCELLED"),
    (f) => (f.provenance.book_completion.recipe.mode = "review"),
    (f) => (f.provenance.book_completion.recipe.run_id = "book:wrong:1"),
    (f) => delete f.provenance.book_completion
  ]) {
    const f = bookFixture();
    mutate(f);
    f.maps.final["final-aggregate.json"] = json(f.wrapped);
    f.maps.model["provenance.json"] = json(f.provenance);
    f.approval.final.report_sha256 = hash(json(f.wrapped));
    f.refresh();
    assert.throws(() => qualify(f.approval, f.evidence, f.archives, assertImportedSemantics));
  }
});

test("synthetic U and T qualify without mistaking candidate false flags for release approval", () => {
  for (const variant of ["U", "T"]) {
    const f = fixture(variant);
    validateApproval(f.approval, SOURCE);
    validateEvidence(f.approval, f.evidence);
    const files = qualify(f.approval, f.evidence, f.archives);
    assert.deepEqual(files["model.lpk"], f.maps.model[`${variant}.lpk`]);
    assert.deepEqual(files.LICENSE, f.maps.runtime.LICENSE);
    assert.equal(files["U.lpk"], undefined);
    assert.equal(files["source-review.json"], undefined);
    assert.equal(files["requests.json"], undefined);
  }
});

test("FINAL uses the producer's ui-final-aggregate name, never the former alias", () => {
  const f = fixture();
  assert.equal(f.approval.runs.final.artifact_name, "ui-final-aggregate-13-1");
  validateEvidence(f.approval, f.evidence);
  f.approval.runs.final.artifact_name = "final-ui-aggregate-13-1";
  f.evidence.final.artifact.name = f.evidence.final.member.name = "final-ui-aggregate-13-1";
  assert.throws(() => validateEvidence(f.approval, f.evidence));
});

for (const mutation of [
  (a) => (a.schema = "unknown"),
  (a) => (a.review.quality = "PENDING"),
  (a) => (a.review.redistribution = "PENDING"),
  (a) => (a.review.runtime = "PENDING"),
  (a) => (a.review.content = "PENDING"),
  (a) => (a.tag = "latest"),
  (a) => (a.model.bytes = 128 * 1024 ** 2 + 1),
  (a) => (a.runtime.bytes = 16 * 1024 ** 2 + 1),
  (a) => (a.raw_source.published = true),
  (a) => (a.publication.notice.path = "../secret"),
  (a) => (a.sources.model.files["raw-corpus.tsv"] = { sha256: h, bytes: 1 })
])
  test("rejects incomplete/unreviewed approval before artifact download", () => {
    const f = fixture();
    mutation(f.approval);
    assert.throws(() => validateApproval(f.approval, SOURCE));
  });

for (const mutation of [
  (e) => (e.model.run.conclusion = "failure"),
  (e) => (e.final.run.conclusion = "failure"),
  (e) => (e.windows.run.status = "in_progress"),
  (e) => (e.runtime.run.head_repository.full_name = "fork/repo"),
  (e) => (e.model.run.path = ".github/workflows/evil.yml"),
  (e) => (e.final.artifact.workflow_run.id = 999),
  (e) => (e.windows.member.id = 999),
  (e) => (e.model.artifact.digest = `sha256:${"0".repeat(64)}`),
  (e) => (e.model.artifact.expired = true),
  (e) => (e.runtime.run.head_sha = SOURCE)
])
  test("requires successful exact runs and independent artifact membership before bytes", () => {
    const f = fixture();
    mutation(f.evidence);
    assert.throws(() => validateEvidence(f.approval, f.evidence));
  });

for (const kind of ["final", "windows"])
  test(`failed ${kind} report cannot be approved by flags`, () => {
    const f = fixture();
    const name = kind === "final" ? "final-aggregate.json" : "ui.json";
    const report = JSON.parse(f.maps[kind][name]);
    report.status = "FAIL";
    f.maps[kind][name] = json(report);
    if (kind === "final") f.approval.final.report_sha256 = hash(json(report));
    else f.approval.windows.ui_sha256 = hash(json(report));
    f.refresh();
    assert.throws(() => qualify(f.approval, f.evidence, f.archives));
  });

for (const mutation of [
  (f) => delete f.maps.model["T.lpk"],
  (f) => (f.maps.model["T.receipt.json"] = json({ state: "FAILED", code: 9, child_reaped: true })),
  (f) => (f.maps.model["U.receipt.json"] = json({ state: "FAILED", code: 9, child_reaped: true })),
  (f) => {
    const p = JSON.parse(f.maps.model["provenance.json"]);
    p.schema = "unknown";
    f.maps.model["provenance.json"] = json(p);
  }
])
  test("selected T must exist and be completed; U remains required", () => {
    const f = fixture("T");
    mutation(f);
    f.refresh();
    assert.throws(() => qualify(f.approval, f.evidence, f.archives));
  });

test("rejects archive corruption, unknown paths, traversal, oversized members and symlinks", () => {
  const f = fixture();
  assert.throws(() => inspectArchive(Buffer.from("broken"), "model", f.approval.runs.model));
  for (const name of ["unknown.txt", "../private", "/absolute"]) {
    const zip = new Zip();
    zip.addFile(name, Buffer.from("x"));
    const data = zip.toBuffer();
    assert.throws(() =>
      inspectArchive(data, "model", { archive_bytes: data.length, archive_sha256: hash(data) })
    );
  }
  const zip = new Zip();
  zip.addFile("U.lpk", Buffer.from("x"));
  zip.getEntry("U.lpk").header.attr = 0xa1ff0000;
  const symlink = zip.toBuffer();
  assert.throws(() =>
    inspectArchive(symlink, "model", {
      archive_bytes: symlink.length,
      archive_sha256: hash(symlink)
    })
  );
  const large = new Zip();
  large.addFile("U.lpk", Buffer.from("x"));
  const bytes = large.toBuffer();
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(128 * 1024 ** 2 + 1, central + 24);
  assert.throws(() =>
    inspectArchive(bytes, "model", { archive_bytes: bytes.length, archive_sha256: hash(bytes) })
  );
});

test("source archive contains exact reviewed tracked code/recipes; rejects edited files and omitted source", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-source-fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init");
  git("config", "user.name", "Synthetic Test");
  git("config", "user.email", "fixture@example.invalid");
  const files = {
    "Cargo.toml": Buffer.from("[workspace]"),
    LICENSE: Buffer.from("fixture GPL"),
    "src/lib.rs": Buffer.from("pub fn fixture() {}"),
    "scripts/model_recipe.py": Buffer.from("# fixture"),
    "scripts/book_model.py": Buffer.from("# synthetic Book entry point"),
    ".github/workflows/model-candidates.yml": Buffer.from("name: synthetic build recipe")
  };
  for (const [name, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), data);
  }
  for (const name of [
    "scripts/other.py",
    "private/data.rs",
    "corpus/raw.txt",
    "profiles/example.json"
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), "SYNTHETIC EXCLUDED FIXTURE");
  }
  git("add", ".");
  git("commit", "-m", "synthetic fixture");
  const spec = {
    sha: git("rev-parse", "HEAD"),
    files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, metadata(data)]))
  };
  const archive = sourceArchive(root, spec, "model");
  assert.ok(archive.length > 0);
  const listing = spawnSync("tar", ["-tf", "-"], { input: archive, encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  assert.deepEqual(
    listing.stdout
      .trim()
      .split("\n")
      .filter((name) => !name.endsWith("/"))
      .sort(),
    Object.keys(files).sort()
  );
  fs.writeFileSync(path.join(root, "src/lib.rs"), "changed");
  assert.throws(() => sourceArchive(root, spec, "model"));
  fs.writeFileSync(path.join(root, "src/lib.rs"), files["src/lib.rs"]);
  delete spec.files["src/lib.rs"];
  assert.throws(() => sourceArchive(root, spec, "model"));
});

test("invalid approval cannot reach injected Actions API or filesystem output", async () => {
  const f = fixture();
  f.approval.review.status = "PENDING";
  let called = false;
  await assert.rejects(
    prepare({
      approval: f.approval,
      sourceSha: SOURCE,
      api: async () => {
        called = true;
      }
    })
  );
  assert.equal(called, false);
});

test("failed FINAL run blocks every archive download, even with an approved release record", async () => {
  const f = fixture();
  f.evidence.final.run.conclusion = "failure";
  let downloads = 0;
  const api = async (route) => {
    assert.notEqual(
      route,
      "immutable-releases",
      "never request repository administration settings"
    );
    for (const value of Object.values(f.evidence)) {
      if (route === `actions/runs/${value.run.id}`) return value.run;
      if (route === `actions/artifacts/${value.artifact.id}`) return value.artifact;
      if (route === `actions/runs/${value.run.id}/artifacts?per_page=100&page=1`)
        return { artifacts: [value.member] };
    }
    throw new Error("unexpected synthetic API request");
  };
  await assert.rejects(
    prepare({
      approval: f.approval,
      sourceSha: SOURCE,
      api,
      download: async () => {
        downloads++;
      }
    })
  );
  assert.equal(downloads, 0);
});

test("unknown/singular candidate provenance and forged approval flags fail", () => {
  for (const mutation of [
    (p) => (p.redistribution_approved = true),
    (p) => {
      p.exclusion_sha256 = p.exclusions_sha256;
      delete p.exclusions_sha256;
    },
    (p) => (p.source_manifest_sha256 = "0".repeat(64)),
    (p) => (p.files_sha256["U.lpk"] = "0".repeat(64))
  ]) {
    const f = fixture(),
      p = JSON.parse(f.maps.model["provenance.json"]);
    mutation(p);
    f.maps.model["provenance.json"] = json(p);
    f.refresh();
    assert.throws(() => qualify(f.approval, f.evidence, f.archives));
  }
});

test("private extra aggregate fields are never copied into public evidence", () => {
  const f = fixture();
  const report = { ...f.final, private_queries: ["DO NOT PUBLISH"] };
  f.maps.final["final-aggregate.json"] = json(report);
  f.approval.final.report_sha256 = hash(json(report));
  f.refresh();
  const files = qualify(f.approval, f.evidence, f.archives);
  assert.doesNotMatch(files["quality.json"].toString(), /DO NOT PUBLISH|private_queries/);
  assert.doesNotMatch(files["performance.json"].toString(), /requests|profile/);
});

function sourceSnapshot() {
  const f = fixture(),
    bytes = Buffer.from("SYNTHETIC ORIGINAL SOURCE FIXTURE, NOT PUBLIC APPROVAL");
  const snapshot = {
    url: "https://github.com/linkasu/linka.predictor-rust/releases/download/synthetic-source-fixture/source.tsv.bz2",
    ...metadata(bytes),
    kind: "ORIGINAL_SOURCE",
    license: "CC0-1.0",
    content_review: "APPROVED",
    privacy_review: "APPROVED",
    redistribution_review: "APPROVED",
    review_report_sha256: h
  };
  const manifest = { source: { ...metadata(bytes), license: "CC0-1.0" } };
  f.approval.source_manifest_sha256 = hash(json(manifest));
  f.approval.raw_source = {
    published: false,
    reproduction_input: "PUBLIC_SNAPSHOT",
    require_public_snapshot: true,
    snapshot
  };
  return { ...f, bytes, snapshot, manifest, provenance: { source_sha256: snapshot.sha256 } };
}

test("default raw source remains missing separately; required snapshot cannot be silently omitted", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("default mode must not download raw source");
  });
  const f = fixture();
  const receipt = await verifyPublicSource(f.approval);
  assert.equal(receipt.reproduction_input, "REQUIRED_SEPARATELY");
  assert.equal(receipt.all_inputs_reproducible, false);
  f.approval.raw_source.require_public_snapshot = true;
  assert.throws(() => validateApproval(f.approval, SOURCE));
});

test("explicit original-source snapshot is fetched anonymously and pinned, never uploaded or called full reproduction", async (t) => {
  const f = sourceSnapshot();
  validateApproval(f.approval, SOURCE);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, f.snapshot.url);
    assert.equal(options.headers, undefined);
    assert.equal(options.redirect, "manual");
    return { ok: true, status: 200, body: [f.bytes] };
  });
  const receipt = await verifyPublicSource(f.approval, f.manifest, f.provenance);
  assert.equal(receipt.reproduction_input, "VERIFIED_PUBLIC_SNAPSHOT");
  assert.equal(receipt.snapshot.sha256, hash(f.bytes));
  assert.equal(receipt.published, false);
  assert.equal(receipt.all_inputs_reproducible, false);
});

for (const mutation of [
  (f) => delete f.snapshot.privacy_review,
  (f) => (f.snapshot.content_review = "PENDING"),
  (f) => (f.snapshot.redistribution_review = "PENDING"),
  (f) => (f.snapshot.kind = "DERIVED_CORPUS"),
  (f) => (f.snapshot.license = "GPL-3.0-or-later"),
  (f) =>
    (f.snapshot.url =
      "https://downloads.tatoeba.org/exports/per_language/rus/rus_sentences_CC0.tsv.bz2"),
  (f) =>
    (f.snapshot.url =
      "https://github.com/linkasu/linka.predictor-rust/releases/download/latest/source.tsv.bz2"),
  (f) => (f.snapshot.bytes = 1024 ** 2 + 1)
])
  test("unreviewed, derived or mutable source snapshot rejected before fetch", async (t) => {
    const f = sourceSnapshot();
    mutation(f);
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      throw new Error("no fetch expected");
    });
    await assert.rejects(verifyPublicSource(f.approval, f.manifest, f.provenance));
    assert.equal(calls, 0);
  });

for (const failure of [
  "different-original",
  "different-provenance",
  "short",
  "oversized",
  "wrong-hash",
  "unsafe-redirect"
])
  test(`source snapshot ${failure} fails closed`, async (t) => {
    const f = sourceSnapshot();
    if (failure === "different-original") {
      f.manifest.source.sha256 = "0".repeat(64);
      f.approval.source_manifest_sha256 = hash(json(f.manifest));
    }
    if (failure === "different-provenance") f.provenance.source_sha256 = "0".repeat(64);
    t.mock.method(globalThis, "fetch", async () => ({
      ok: true,
      status: failure === "unsafe-redirect" ? 302 : 200,
      headers: { get: () => "https://evil.example/raw" },
      body:
        failure === "short"
          ? [Buffer.from("short")]
          : failure === "oversized"
            ? [f.bytes, Buffer.from("extra")]
            : failure === "wrong-hash"
              ? [Buffer.alloc(f.bytes.length)]
              : [f.bytes]
    }));
    await assert.rejects(verifyPublicSource(f.approval, f.manifest, f.provenance));
  });

test(
  "workflow privilege boundary and publisher use only mocked GitHub, never external publication",
  { skip: !process.env.BASE_MODEL_WORKFLOW },
  async (t) => {
    const workflow = require("yaml").parse(
      fs.readFileSync(process.env.BASE_MODEL_WORKFLOW, "utf8")
    );
    assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs).sort(), [
      "approval_path",
      "source_sha"
    ]);
    assert.deepEqual(workflow.permissions, { contents: "read", actions: "read" });
    assert.deepEqual(workflow.jobs.publish.permissions, { contents: "write", actions: "read" });
    assert.equal(workflow.jobs.publish.needs, "prepare");
    assert(!workflow.jobs.publish.steps.some((s) => /checkout/.test(s.uses || "") || s.run));
    const script = workflow.jobs.publish.steps.find((s) => s.with?.script)?.with.script;
    assert.doesNotMatch(script, /immutable-releases|deleteRelease|deleteRef|force:|clobber/);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const publish = new AsyncFunction("github", "core", "context", "require", script);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "publication-fixture-")),
      cwd = process.cwd();
    const oldEnv = {
      INVENTORY_SHA256: process.env.INVENTORY_SHA256,
      SOURCE_SHA: process.env.SOURCE_SHA
    };
    t.after(() => {
      process.chdir(cwd);
      for (const [key, value] of Object.entries(oldEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    });
    process.chdir(root);
    fs.mkdirSync("publication");
    const { assertImportedSemantics } = await import("./book-model-evaluation.mjs");
    for (const f of [fixture(), bookFixture(true)]) {
      if (f.capsule) assert(f.capsule.length > 1024 ** 2);
      const files = qualify(f.approval, f.evidence, f.archives, assertImportedSemantics);
      if (f.capsule) files["MODEL_BUILD_INPUTS.zip"] = f.capsule;
      for (const name of [
        "MODEL_NOTICE.md",
        "model-source.tar",
        "runtime-source.tar",
        "provenance.json",
        "REPRODUCTION.json"
      ])
        files[name] = Buffer.from("synthetic publication fixture only");
      for (const [name, data] of Object.entries(files))
        fs.writeFileSync(path.join("publication", name), data);
      const inventory = {
        schema: "linka-base-model-publication-v1",
        repository: REPO,
        tag: "base-ru-v1",
        source_sha: SOURCE,
        ...(f.capsule ? { model_build_inputs: f.approval.publication.model_build_inputs } : {}),
        files: Object.fromEntries(
          Object.entries(files).map(([name, data]) => [name, metadata(data)])
        )
      };
      const inventoryBytes = json(inventory);
      fs.writeFileSync("publication/publication.json", inventoryBytes);
      process.env.INVENTORY_SHA256 = hash(inventoryBytes);
      process.env.SOURCE_SHA = SOURCE;
      const context = {
        eventName: "workflow_dispatch",
        ref: "refs/heads/main",
        repo: { owner: "linkasu", repo: "linka.predictor-rust" }
      };
      for (const { failure, serverImmutable } of [
        ...[
          "changed-file",
          "extra-file",
          "tag-collision",
          "tag-race",
          "release-collision",
          "asset-digest",
          ...(f.capsule
            ? [
                "capsule-no-approval",
                "capsule-reviewed-hash",
                "capsule-reviewed-size",
                "capsule-limit"
              ]
            : []),
          null
        ].map((failure) => ({ failure, serverImmutable: true })),
        { failure: null, serverImmutable: false },
        { failure: null, serverImmutable: undefined }
      ]) {
        let writes = 0,
          published = false,
          refCreated = false;
        const assets = [];
        const missing = () => {
          const error = new Error("synthetic missing");
          error.status = 404;
          throw error;
        };
        const github = {
          request: async () => {
            throw new Error("repository settings API must never be called");
          },
          paginate: async () => assets,
          rest: {
            git: {
              getRef: async () =>
                refCreated
                  ? { data: { object: { type: "commit", sha: SOURCE } } }
                  : failure === "tag-collision"
                    ? { data: {} }
                    : missing(),
              createRef: async () => {
                if (failure === "tag-race") throw new Error("synthetic exclusive create collision");
                writes++;
                refCreated = true;
              }
            },
            repos: {
              getReleaseByTag: async () =>
                failure === "release-collision" ? { data: {} } : missing(),
              get: async () => ({ data: { private: false } }),
              compareCommitsWithBasehead: async () => ({ data: { status: "ahead" } }),
              createRelease: async (args) => {
                assert.equal(args.draft, true);
                assert.equal(args.make_latest, "false");
                writes++;
                return { data: { id: 123 } };
              },
              uploadReleaseAsset: async ({ name, data }) => {
                if (name === "MODEL_BUILD_INPUTS.zip") assert.deepEqual(data, f.capsule);
                writes++;
                assets.push({
                  name,
                  size: data.length,
                  digest: `sha256:${failure === "asset-digest" ? "0".repeat(64) : hash(data)}`
                });
              },
              listReleaseAssets: () => {},
              updateRelease: async (args) => {
                assert.equal(args.make_latest, "false");
                assert.equal(args.draft, false);
                writes++;
                published = true;
                return {
                  data: {
                    immutable: serverImmutable,
                    draft: false,
                    html_url: "https://example.invalid/synthetic"
                  }
                };
              }
            }
          }
        };
        const summaryText = [];
        const summary = {
          addHeading: () => summary,
          addRaw: (value) => {
            summaryText.push(value);
            return summary;
          },
          write: async () => {}
        };
        if (failure === "changed-file") fs.writeFileSync("publication/model.lpk", "changed");
        if (failure === "extra-file")
          fs.writeFileSync("publication/raw-final.txt", "DO NOT PUBLISH");
        const sealedInventory = structuredClone(inventory);
        if (failure === "capsule-no-approval") delete sealedInventory.model_build_inputs;
        if (failure === "capsule-reviewed-hash")
          sealedInventory.model_build_inputs.sha256 = "0".repeat(64);
        if (failure === "capsule-reviewed-size") sealedInventory.model_build_inputs.bytes++;
        if (failure === "capsule-limit")
          sealedInventory.model_build_inputs.bytes = 32 * 1024 ** 2 + 1;
        const sealedBytes = json(sealedInventory);
        fs.writeFileSync("publication/publication.json", sealedBytes);
        process.env.INVENTORY_SHA256 = hash(sealedBytes);
        if (failure) await assert.rejects(publish(github, { summary }, context, require));
        else await publish(github, { summary }, context, require);
        assert.equal(published, !failure);
        if (!failure)
          assert.match(
            summaryText.join("\n"),
            new RegExp(
              `"server_enforced_immutable": ${serverImmutable === undefined ? "null" : serverImmutable}`
            )
          );
        if (failure && failure !== "asset-digest") assert.equal(writes, 0);
        fs.writeFileSync("publication/model.lpk", files["model.lpk"]);
        if (failure === "extra-file") fs.unlinkSync("publication/raw-final.txt");
      }
    }
  }
);
