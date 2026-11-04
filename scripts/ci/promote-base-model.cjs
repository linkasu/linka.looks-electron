// Read-only preparation of one explicitly reviewed release. This helper never publishes or trains.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const Zip = require("adm-zip");
const { architecture } = require("./verify-predictor-resources.cjs");
const REPO = "linkasu/linka.predictor-rust";
const RUNTIME = "ec07b2cd49c1c2c684e6643f0dab75cf5895ebca";
const MiB = 1024 ** 2;
const hash = (data) => createHash("sha256").update(data).digest("hex");
const sha = (value, length = 64) =>
  assert(
    typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value),
    "exact reviewed hash required"
  );
const safePath = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9_./-]+$/.test(value) &&
  !value.startsWith("/") &&
  value.split("/").every((s) => s && s !== "." && s !== "..");
const codePath = (name) =>
  safePath(name) &&
  !/(^|\/)(private|FINAL|sealed|profiles?|corpus)(\/|$)/i.test(name) &&
  (name.endsWith(".rs") ||
    /(^|\/)(Cargo\.toml|Cargo\.lock)$/.test(name) ||
    [
      "LICENSE",
      "rust-toolchain.toml",
      ".cargo/config.toml",
      "scripts/model_recipe.py",
      ".github/workflows/windows-runtime.yml"
    ].includes(name));
const workflows = {
  model: "model-candidates",
  runtime: "windows-runtime",
  final: "model-final",
  windows: "windows-model-qualification"
};
const allowed = {
  model: [
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
  ],
  runtime: [
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
  ],
  final: ["final-aggregate.json", "final-book-original-aggregate.json"],
  buildInputs: ["model.arpa", "frequencies.tsv", "BUILD.md", "reproduction.json"],
  windows: ["source.json", "memory.json", "ui.json", "requests.json"]
};
function fileSpec(spec, maximum) {
  assert(
    spec && Number.isSafeInteger(spec.bytes) && spec.bytes > 0 && spec.bytes <= maximum,
    "invalid approved size"
  );
  sha(spec.sha256);
}
function validateRawSource(raw) {
  assert(raw && raw.published === false, "raw source is never bundled by this publisher");
  assert(
    raw.require_public_snapshot === undefined || typeof raw.require_public_snapshot === "boolean"
  );
  assert(!raw.require_public_snapshot || raw.snapshot, "required public source snapshot missing");
  assert.equal(raw.reproduction_input, raw.snapshot ? "PUBLIC_SNAPSHOT" : "REQUIRED_SEPARATELY");
  if (!raw.snapshot) return;
  const s = raw.snapshot;
  fileSpec(s, MiB);
  sha(s.review_report_sha256);
  assert.equal(s.kind, "ORIGINAL_SOURCE");
  assert.equal(s.license, "CC0-1.0");
  for (const field of ["content_review", "privacy_review", "redistribution_review"])
    assert.equal(s[field], "APPROVED", `source snapshot lacks ${field}`);
  const match =
    typeof s.url === "string" &&
    /^https:\/\/github\.com\/linkasu\/linka\.predictor-rust\/releases\/download\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})\/source\.tsv\.bz2$/.exec(
      s.url
    );
  assert(
    match && !["latest", "main", "master", "base-ru-v1"].includes(match[1].toLowerCase()),
    "separate versioned public source snapshot required; weekly URLs are not snapshots"
  );
}
function validateApproval(a, sourceSha) {
  assert.equal(a?.schema, "linka-base-model-release-approval-v1");
  assert.equal(a.repository, REPO);
  assert.equal(a.tag, "base-ru-v1");
  sha(sourceSha, 40);
  assert.equal(a.source_sha, sourceSha);
  sha(a.app_tooling_sha, 40);
  for (const field of ["status", "quality", "redistribution", "runtime", "content"])
    assert.equal(a.review?.[field], "APPROVED", `missing release review: ${field}`);
  assert.deepEqual(
    [...(a.review.scope || [])].sort(),
    [
      "model",
      "notices",
      "source-code",
      "aggregate-evidence",
      ...(a.publication?.model_build_inputs ? ["model-build-inputs"] : [])
    ].sort()
  );
  assert.deepEqual(a.licenses, { code: "GPL-3.0-or-later", data: "CC0-1.0" });
  assert(["U", "T"].includes(a.model?.variant));
  fileSpec(a.model, 128 * MiB);
  fileSpec(a.runtime, 16 * MiB);
  assert.equal(a.runtime.source_sha, RUNTIME);
  for (const field of ["source_manifest_sha256", "source_review_sha256", "exclusions_sha256"])
    sha(a[field]);
  for (const field of ["seal_sha256", "protocol_sha256", "freeze_sha256", "report_sha256"])
    sha(a.final?.[field]);
  for (const field of ["source_sha256", "memory_sha256", "ui_sha256"]) sha(a.windows?.[field]);
  sha(a.final.app_tooling_sha, 40);
  sha(a.windows.app_tooling_sha, 40);
  for (const field of ["model_notices_sha256", "kenlm_license_sha256", "code_license_sha256"])
    sha(a.publication?.[field]);
  assert(
    safePath(a.publication.notice.path) &&
      a.publication.notice.path.startsWith("provenance/releases/")
  );
  fileSpec(a.publication.notice, MiB);
  if (a.publication.model_build_inputs !== undefined) {
    const spec = a.publication.model_build_inputs;
    assert.deepEqual(Object.keys(spec || {}).sort(), ["bytes", "path", "sha256"]);
    assert.equal(
      a.review.model_reproduction,
      "APPROVED",
      "model-input reproduction review required"
    );
    assert(
      safePath(spec?.path) &&
        spec.path.startsWith("provenance/releases/") &&
        spec.path.endsWith(".zip")
    );
    fileSpec(spec, 32 * MiB);
  }
  validateRawSource(a.raw_source);
  assert.deepEqual(Object.keys(a.runs || {}).sort(), Object.keys(workflows).sort());
  for (const [kind, spec] of Object.entries(a.runs)) {
    for (const field of ["run_id", "run_attempt", "artifact_id"])
      assert(
        Number.isSafeInteger(spec[field]) && spec[field] > 0,
        "exact numeric Actions identifiers required"
      );
    sha(spec.head_sha, 40);
    sha(spec.archive_sha256);
    assert(
      Number.isSafeInteger(spec.archive_bytes) &&
        spec.archive_bytes > 0 &&
        spec.archive_bytes <= 300 * MiB
    );
    assert(typeof spec.artifact_name === "string" && /^[a-z0-9-]+$/.test(spec.artifact_name));
    if (kind === "model") assert.equal(spec.head_sha, sourceSha);
    if (kind === "runtime") assert.equal(spec.head_sha, RUNTIME);
  }
  for (const kind of ["model", "runtime"]) {
    const spec = a.sources?.[kind];
    assert.equal(spec?.sha, kind === "model" ? sourceSha : RUNTIME);
    const names = Object.keys(spec.files || {});
    assert(
      names.includes("LICENSE") &&
        names.includes("Cargo.toml") &&
        names.some((n) => n.endsWith(".rs"))
    );
    assert(
      names.includes(
        kind === "model" ? "scripts/model_recipe.py" : ".github/workflows/windows-runtime.yml"
      ),
      "corresponding build recipe required"
    );
    for (const name of names) {
      assert(codePath(name), "only reviewed code and recipes may enter source archives");
      fileSpec(spec.files[name], 8 * MiB);
    }
  }
}
function expectedName(kind, run) {
  return kind === "model"
    ? `model-candidates-${run.id}-${run.run_attempt}`
    : kind === "runtime"
      ? `windows-runtime-${run.event === "pull_request" ? "pr-unreviewed" : "manual-reviewed"}-${run.head_sha}`
      : kind === "final"
        ? `ui-final-aggregate-${run.id}-${run.run_attempt}`
        : `windows-model-candidate-${run.id}-${run.run_attempt}`;
}
function validateEvidence(a, evidence) {
  for (const kind of Object.keys(workflows)) {
    const spec = a.runs[kind],
      { run, artifact, member } = evidence[kind];
    assert.equal(run.id, spec.run_id);
    assert.equal(run.run_attempt, spec.run_attempt);
    assert.equal(run.repository?.full_name, REPO);
    assert.equal(run.head_repository?.full_name, REPO);
    assert.equal(run.path, `.github/workflows/${workflows[kind]}.yml`);
    assert.equal(run.status, "completed");
    assert.equal(run.conclusion, "success");
    assert.equal(run.head_sha, spec.head_sha);
    assert(
      (kind === "runtime" ? ["pull_request", "workflow_dispatch"] : ["workflow_dispatch"]).includes(
        run.event
      )
    );
    if (["final", "windows"].includes(kind)) assert.equal(run.head_branch, "main");
    for (const item of [artifact, member]) {
      assert.equal(item.id, spec.artifact_id);
      assert.equal(item.expired, false);
      assert.equal(item.workflow_run?.id, spec.run_id);
      assert.equal(item.workflow_run?.head_sha, spec.head_sha);
      assert.equal(item.name, expectedName(kind, run));
      assert.equal(item.name, spec.artifact_name);
      assert.equal(item.digest, `sha256:${spec.archive_sha256}`);
      assert.equal(item.size_in_bytes, spec.archive_bytes);
    }
  }
}
function inspectArchive(bytes, kind, spec) {
  assert.equal(
    require("adm-zip/package.json").version,
    "0.6.1",
    "bounded inflate decoder pin required"
  );
  assert.equal(bytes.length, spec.archive_bytes);
  assert(bytes.length <= 300 * MiB);
  assert.equal(hash(bytes), spec.archive_sha256, "archive digest mismatch before decoding");
  if (kind === "buildInputs") {
    assert(bytes.length >= 22 && bytes.length <= 32 * MiB, "model-input ZIP budget");
    const end = bytes.length - 22;
    assert.equal(bytes.readUInt32LE(end), 0x06054b50, "canonical ZIP without comment required");
    assert.equal(bytes.readUInt16LE(end + 20), 0);
    assert.equal(bytes.readUInt16LE(end + 4), 0, "multi-disk ZIP forbidden");
    assert.equal(bytes.readUInt16LE(end + 6), 0);
    assert.equal(bytes.readUInt16LE(end + 8), 4);
    assert.equal(bytes.readUInt16LE(end + 10), 4, "four non-ZIP64 members required");
    const directory = bytes.readUInt32LE(end + 16),
      size = bytes.readUInt32LE(end + 12);
    assert(size <= 2048 && directory + size === end, "bounded non-ZIP64 directory required");
    const noZip64Extra = (start, finish) => {
      for (let p = start; p < finish;) {
        assert(p + 4 <= finish && bytes.readUInt16LE(p) !== 1, "ZIP64 extra forbidden");
        p += 4 + bytes.readUInt16LE(p + 2);
        assert(p <= finish);
      }
    };
    let offset = directory;
    for (let i = 0; i < 4; i++) {
      assert(offset + 46 <= end && bytes.readUInt32LE(offset) === 0x02014b50);
      assert(bytes.readUInt16LE(offset + 6) < 45, "ZIP64 members forbidden");
      assert.equal(bytes.readUInt16LE(offset + 34), 0, "multi-disk member forbidden");
      const name = bytes.readUInt16LE(offset + 28),
        extra = bytes.readUInt16LE(offset + 30);
      const extraEnd = offset + 46 + name + extra;
      assert(extraEnd <= end);
      noZip64Extra(offset + 46 + name, extraEnd);
      const local = bytes.readUInt32LE(offset + 42);
      assert(local + 30 <= directory && bytes.readUInt32LE(local) === 0x04034b50);
      assert(bytes.readUInt16LE(local + 4) < 45, "ZIP64 local member forbidden");
      const localName = bytes.readUInt16LE(local + 26),
        localExtra = bytes.readUInt16LE(local + 28);
      assert(local + 30 + localName + localExtra <= directory);
      assert(
        bytes
          .subarray(local + 30, local + 30 + localName)
          .equals(bytes.subarray(offset + 46, offset + 46 + name))
      );
      noZip64Extra(local + 30 + localName, local + 30 + localName + localExtra);
      offset = extraEnd + bytes.readUInt16LE(offset + 32);
    }
    assert.equal(offset, end);
  }
  const zip = new Zip(bytes),
    seen = new Set();
  let total = 0;
  for (const e of zip.getEntries()) {
    assert(
      allowed[kind].includes(e.entryName) && !seen.has(e.entryName),
      "unknown or duplicate ZIP path"
    );
    seen.add(e.entryName);
    const mode = (e.header.attr >>> 16) & 0xf000;
    assert(
      !e.isDirectory && [0, 0x8000].includes(mode) && !(e.header.flags & 1),
      "ZIP must contain unencrypted regular files only"
    );
    const maximum = e.entryName.endsWith(".lpk")
      ? 128 * MiB
      : e.entryName.endsWith(".exe")
        ? 16 * MiB
        : kind === "buildInputs"
          ? ["model.arpa", "frequencies.tsv"].includes(e.entryName)
            ? 64 * MiB
            : MiB
          : kind === "model"
            ? 64 * MiB
            : 8 * MiB;
    assert(
      Number.isSafeInteger(e.header.size) && e.header.size >= 0 && e.header.size <= maximum,
      "ZIP member budget exceeded"
    );
    total += e.header.size;
    assert(total <= (kind === "buildInputs" ? 128 : 512) * MiB, "ZIP expansion budget exceeded");
  }
  if (kind === "buildInputs") assert.deepEqual([...seen].sort(), [...allowed.buildInputs].sort());
  const member = (name, expectedHash) => {
    const entry = zip.getEntry(name);
    assert(entry && entry.header.size > 0, `missing resource: ${name}`);
    const data = entry.getData();
    assert.equal(data.length, entry.header.size);
    if (expectedHash) assert.equal(hash(data), expectedHash, `resource hash mismatch: ${name}`);
    return data;
  };
  if (kind === "final" && seen.has("final-book-original-aggregate.json")) {
    const report = parse(member("final-aggregate.json"));
    assert.equal(report.kind, "book-local-linux-container", "original aggregate is Book-only");
    assert.equal(report.inferenceLocation, "book.local");
  }
  return member;
}
function parse(bytes) {
  return JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
}
function json(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n");
}
function qualify(a, evidence, archives, assertImportedSemantics) {
  validateApproval(a, a.source_sha);
  validateEvidence(a, evidence);
  // Check all run/artifact metadata before decoding even the first model byte.
  const get = Object.fromEntries(
    Object.keys(workflows).map((kind) => [kind, inspectArchive(archives[kind], kind, a.runs[kind])])
  );
  const provenance = parse(get.model("provenance.json"));
  assert.equal(provenance.schema, "linka-model-candidates-v1");
  assert.equal(provenance.source_revision, a.source_sha);
  assert.equal(provenance.source_manifest_sha256, a.source_manifest_sha256);
  assert.equal(provenance.exclusions_sha256, a.exclusions_sha256);
  assert.equal(provenance.exclusion_sha256, undefined);
  for (const field of ["quality_approved", "redistribution_approved", "final_evaluated"])
    assert.equal(provenance[field], false);
  if (provenance.execution?.kind === "book-local-linux-container")
    assert(a.publication.model_build_inputs, "Book release requires reviewed model build inputs");
  const member = (name) => {
    sha(provenance.files_sha256?.[name]);
    return get.model(name, provenance.files_sha256[name]);
  };
  for (const variant of new Set(["U", a.model.variant])) {
    const receipt = parse(member(`${variant}.receipt.json`));
    assert.equal(receipt.state, "COMPLETED");
    assert.equal(receipt.code, 0);
    assert.equal(receipt.child_reaped, true);
    member(`${variant}.dev.json`);
    member(`${variant}.lpk`);
  }
  const model = member(`${a.model.variant}.lpk`);
  assert.equal(hash(model), a.model.sha256);
  assert.equal(model.length, a.model.bytes);
  assert.equal(hash(member("source-manifest.json")), a.source_manifest_sha256);
  assert.equal(hash(member("source-review.json")), a.source_review_sha256);
  const notices = member("NOTICES.txt"),
    kenlm = member("KenLM-LICENSE");
  assert.equal(hash(notices), a.publication.model_notices_sha256);
  assert.equal(hash(kenlm), a.publication.kenlm_license_sha256);
  assert(notices.length <= MiB && kenlm.length <= MiB);
  const exe = get.runtime("lp-electron.exe", a.runtime.sha256);
  assert.equal(exe.length, a.runtime.bytes);
  const license = get.runtime("LICENSE", a.publication.code_license_sha256);
  assert(license.length <= MiB);
  assert.equal(
    get
      .runtime("source.txt")
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)[0]
      .trim(),
    RUNTIME
  );
  const toolchain = get.runtime("toolchain.txt").toString("utf8");
  assert.match(toolchain, /rustc 1\.98\.1/);
  assert.match(toolchain, /crt-static=true/);
  assert.match(get.runtime("smoke.txt").toString("utf8"), /^\uFEFF?PASS: native RU JSON/);
  assert.doesNotMatch(
    get.runtime("dll-imports.txt").toString("utf8"),
    /(VCRUNTIME|MSVCP|ucrtbase|api-ms-win-crt).*\.dll/i
  );
  const final = parse(get.final("final-aggregate.json", a.final.report_sha256));
  assert.equal(final.schema, "linka-final-aggregate-v1");
  assert.equal(final.metric, "UI_KSR_V1");
  assert.equal(final.status, "QUALIFIED_SIMULATION_ONLY");
  assert.equal(final.productionApproved, false);
  assert.equal(final.sourceSha, a.source_sha);
  assert.equal(final.appToolingSha, a.final.app_tooling_sha);
  assert.equal(String(final.candidateRunId), String(a.runs.model.run_id));
  assert.equal(String(final.artifactId), String(a.runs.model.artifact_id));
  assert.equal(final.candidateModelSha256, a.model.sha256);
  assert.equal(final.manifestSha256, a.final.seal_sha256);
  assert.equal(final.protocolSha256, a.final.protocol_sha256);
  assert.equal(final.runFreezeSha256, a.final.freeze_sha256);
  if (final.kind === "book-local-linux-container") {
    assert.equal(final.inferenceLocation, "book.local");
    assert.equal(typeof assertImportedSemantics, "function", "Book semantics validator required");
    sha(final.originalBookReportSha256);
    const original = parse(
      get.final("final-book-original-aggregate.json", final.originalBookReportSha256)
    );
    assertImportedSemantics(original, final);
    assert.equal(final.ciImport.runId, String(a.runs.final.run_id));
    assert.equal(final.ciImport.runAttempt, String(a.runs.final.run_attempt));
    assert.equal(final.execution?.kind, "book-local-linux-container");
    assert.equal(final.execution.source_sha, a.source_sha);
    const { validateExecution } = require("./book-execution-receipt.cjs");
    validateExecution(final.execution, a.source_sha, `book-candidate-${final.ciImport.bookJobId}`);
    const execution = provenance.execution;
    assert.equal(execution?.kind, "book-local-linux-container", "Book-trained candidate required");
    validateExecution(execution, a.source_sha, `book-candidate-${execution.book_job_id}`);
    assert.equal(provenance.book_completion?.schema, "linka-book-completion-v1");
    const completed = provenance.book_completion.recipe;
    assert.equal(completed?.state, "COMPLETED", "completed Book training receipt required");
    assert.equal(completed.mode, "train");
    assert.equal(completed.run_id, `book:${execution.book_job_id}:${execution.attempt}`);
  }
  const source = parse(get.windows("source.json", a.windows.source_sha256));
  assert.equal(source.schema, "windows-model-candidate-v1");
  assert.equal(source.production_approved, false);
  assert.equal(source.app_tooling_sha, a.windows.app_tooling_sha);
  assert.equal(source.model_variant, a.model.variant);
  assert.equal(source.model_sha256, a.model.sha256);
  assert.equal(source.exe_sha256, a.runtime.sha256);
  for (const kind of ["model", "runtime"]) {
    assert.equal(source[kind]?.run_id, a.runs[kind].run_id);
    assert.equal(source[kind]?.artifact_id, a.runs[kind].artifact_id);
    assert.equal(source[kind]?.source_sha, a.runs[kind].head_sha);
  }
  const memory = parse(get.windows("memory.json", a.windows.memory_sha256)),
    ui = parse(get.windows("ui.json", a.windows.ui_sha256));
  assert.equal(memory.schema, "windows-model-memory-v1");
  assert.equal(ui.schema, "windows-model-ui-v1");
  for (const report of [memory, ui]) {
    assert.equal(report.status, "PASS");
    assert.equal(report.hardware, "NOT_TESTED");
    assert.equal(report.production_approved, false);
  }
  assert.equal(memory.limit_bytes, 536870912);
  assert.equal(memory.cases?.length, 5);
  for (const sample of memory.cases) {
    assert(
      Number.isSafeInteger(sample.peak_private_commit_bytes) &&
        sample.peak_private_commit_bytes > 0 &&
        sample.peak_private_commit_bytes <= memory.limit_bytes
    );
    assert.equal(sample.active_owned_processes_after_exit, 0);
  }
  assert.equal(ui.within_budget, true);
  assert(Number.isSafeInteger(ui.completed) && ui.completed >= 1000);
  assert(
    Number.isFinite(ui.p95_ms) &&
      ui.p95_ms >= 0 &&
      ui.p95_ms <= 300 &&
      Number.isFinite(ui.p99_ms) &&
      ui.p99_ms >= ui.p95_ms &&
      ui.p99_ms <= 750
  );
  assert.equal(ui.children?.live, 0);
  assert.equal(ui.children?.failed, 0);
  assert.equal(ui.children?.closed, ui.children?.spawned);
  assert(ui.children.spawned >= 1001);
  assert.equal(ui.manual_input?.duringPrediction, true);
  assert.equal(ui.manual_input?.textChanged, true);
  assert(
    Number.isFinite(ui.manual_input?.ms) && ui.manual_input.ms >= 0 && ui.manual_input.ms <= 300
  );
  const quality = {
    schema: final.schema,
    metric: final.metric,
    status: final.status,
    original_report_sha256: a.final.report_sha256
  };
  for (const key of ["components", "rows", "ksr", "frequencyKsr", "delta"]) {
    assert(Number.isFinite(final[key]));
    quality[key] = final[key];
  }
  assert(quality.components >= 500);
  return {
    "model.lpk": model,
    "lp-electron.exe": exe,
    LICENSE: license,
    "MODEL_SOURCE_NOTICES.txt": notices,
    "KenLM-LICENSE": kenlm,
    "quality.json": json(quality),
    "performance.json": json({
      schema: "linka-base-model-performance-v1",
      hardware: "NOT_TESTED",
      client_os: "NOT_TESTED",
      packaged: false,
      memory_limit_bytes: memory.limit_bytes,
      sidecar_peak_private_commit_bytes: memory.cases.map((v) => v.peak_private_commit_bytes),
      completed: ui.completed,
      p95_ms: ui.p95_ms,
      p99_ms: ui.p99_ms,
      manual_input_ms: ui.manual_input.ms
    })
  };
}
function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { maxBuffer: 64 * MiB });
  assert.equal(result.status, 0, "tracked source validation failed");
  return result.stdout;
}
function sourceArchive(root, spec, kind) {
  assert.equal(git(root, ["rev-parse", "HEAD"]).toString().trim(), spec.sha);
  const entries = git(root, ["ls-tree", "-rz", spec.sha])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, name] = line.split("\t");
      return { mode: meta.split(" ")[0], name };
    })
    .filter((e) => codePath(e.name));
  assert.deepEqual(
    Object.keys(spec.files).sort(),
    entries.map((e) => e.name).sort(),
    "source approval must cover all corresponding Rust code/recipes"
  );
  assert(
    spec.files[
      kind === "model" ? "scripts/model_recipe.py" : ".github/workflows/windows-runtime.yml"
    ]
  );
  for (const { name, mode } of entries) {
    assert(["100644", "100755"].includes(mode), "source archive symlink forbidden");
    trackedFile(root, name, spec.files[name]);
  }
  return git(root, ["archive", "--format=tar", spec.sha, "--", ...Object.keys(spec.files).sort()]);
}
function trackedFile(root, name, spec, maximum = 8 * MiB) {
  assert(safePath(name));
  git(root, ["ls-files", "--error-unmatch", "--", name]);
  let current = root;
  for (const part of name.split("/")) {
    current = path.join(current, part);
    assert(!fs.lstatSync(current).isSymbolicLink(), "tracked file symlink forbidden");
  }
  const stat = fs.lstatSync(current);
  assert(stat.isFile() && stat.size === spec.bytes && stat.size <= maximum);
  const bytes = fs.readFileSync(current);
  assert.equal(hash(bytes), spec.sha256, "tracked file hash mismatch");
  assert.equal(
    hash(git(root, ["show", `HEAD:${name}`])),
    hash(bytes),
    "working tree differs from tracked approval/source"
  );
  return bytes;
}
function verifyModelBuildInputs(root, a, provenance) {
  const spec = a.publication.model_build_inputs;
  const bytes = trackedFile(root, spec.path, spec, 32 * MiB);
  const member = inspectArchive(bytes, "buildInputs", {
    archive_sha256: spec.sha256,
    archive_bytes: spec.bytes
  });
  const arpa = provenance.arpa_sha256?.[a.model.variant];
  const frequencies = provenance.frequencies_sha256;
  sha(arpa);
  sha(frequencies);
  assert.equal(provenance.files_sha256?.["frequencies.tsv"], frequencies);
  member("model.arpa", arpa);
  member("frequencies.tsv", frequencies);
  member("BUILD.md");
  const scope =
    "Exact production LPK generation from model weights and sufficient statistics; not an archive of original source records.";
  assert.deepEqual(parse(member("reproduction.json")), {
    schema: "linka-model-build-inputs-v1",
    variant: a.model.variant,
    source_sha: a.source_sha,
    model_sha256: a.model.sha256,
    model_bytes: a.model.bytes,
    arpa_sha256: arpa,
    frequencies_sha256: frequencies,
    model_reproduction: "EXACT_BYTE_REPRODUCED_ON_BOOK",
    licenses: a.licenses,
    original_corpus_included: false,
    evaluation_data_included: false,
    scope
  });
  return {
    bytes,
    reproduction: {
      status: "ARCHIVED_EXACT_MODEL_INPUTS",
      archive: "MODEL_BUILD_INPUTS.zip",
      sha256: spec.sha256,
      bytes: spec.bytes,
      source_sha: a.source_sha,
      model_sha256: a.model.sha256,
      model_bytes: a.model.bytes,
      arpa_sha256: arpa,
      frequencies_sha256: frequencies,
      original_corpus_included: false,
      evaluation_data_included: false,
      scope
    }
  };
}
async function bounded(res, maximum) {
  assert(res.ok, "GitHub request failed");
  let size = 0;
  const chunks = [];
  for await (const chunk of res.body) {
    size += chunk.length;
    assert(size <= maximum, "download budget exceeded");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function api(route) {
  assert(/^actions\//.test(route));
  return parse(
    await bounded(
      await fetch(`https://api.github.com/repos/${REPO}/${route}`, {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10"
        },
        redirect: "error",
        signal: AbortSignal.timeout(60000)
      }),
      8 * MiB
    )
  );
}
async function downloadArtifact(spec) {
  let url = `https://api.github.com/repos/${REPO}/actions/artifacts/${spec.artifact_id}/zip`;
  for (let redirect = 0; redirect <= 5; redirect++) {
    const parsed = new URL(url);
    assert(parsed.protocol === "https:" && !parsed.port && !parsed.username && !parsed.password);
    assert(
      [
        "api.github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com"
      ].includes(parsed.hostname) ||
        /^productionresultssa[0-9]+\.blob\.core\.windows\.net$/.test(parsed.hostname),
      "untrusted artifact redirect"
    );
    const res = await fetch(url, {
      headers:
        parsed.hostname === "api.github.com"
          ? {
              Authorization: `Bearer ${process.env.GH_TOKEN}`,
              Accept: "application/vnd.github+json"
            }
          : {},
      redirect: "manual",
      signal: AbortSignal.timeout(120000)
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      assert(res.headers.get("location"));
      url = new URL(res.headers.get("location"), parsed).href;
      continue;
    }
    const bytes = await bounded(res, spec.archive_bytes);
    assert.equal(bytes.length, spec.archive_bytes);
    assert.equal(hash(bytes), spec.archive_sha256);
    return bytes;
  }
  throw new Error("artifact redirect budget exceeded");
}
async function verifyPublicSource(a, manifest, provenance) {
  validateRawSource(a.raw_source);
  const receipt = {
    published: false,
    reproduction_input: "REQUIRED_SEPARATELY",
    all_inputs_reproducible: false
  };
  const snapshot = a.raw_source.snapshot;
  if (!snapshot) return receipt;
  // Bind to the exact original recipe input, never a filtered/derived corpus relabelled as source.
  assert.equal(manifest?.source?.sha256, snapshot.sha256);
  assert.equal(manifest.source.bytes, snapshot.bytes);
  assert.equal(manifest.source.license, snapshot.license);
  assert.equal(provenance?.source_sha256, snapshot.sha256);
  let url = snapshot.url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new URL(url);
    assert(parsed.protocol === "https:" && !parsed.port && !parsed.username && !parsed.password);
    assert(
      [
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
        "github-releases.githubusercontent.com"
      ].includes(parsed.hostname),
      "untrusted source snapshot redirect"
    );
    // Anonymous availability is part of this contract. Never attach the Actions token.
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(120000) });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel?.();
      assert(res.headers.get("location"));
      url = new URL(res.headers.get("location"), parsed).href;
      continue;
    }
    assert(res.ok && res.status === 200, "public source snapshot unavailable");
    let bytes = 0;
    const digest = createHash("sha256");
    for await (const chunk of res.body) {
      bytes += chunk.length;
      assert(bytes <= snapshot.bytes, "source snapshot exceeds approved size");
      digest.update(chunk);
    }
    assert.equal(bytes, snapshot.bytes);
    assert.equal(digest.digest("hex"), snapshot.sha256);
    return {
      ...receipt,
      reproduction_input: "VERIFIED_PUBLIC_SNAPSHOT",
      snapshot: {
        url: snapshot.url,
        sha256: snapshot.sha256,
        bytes: snapshot.bytes,
        license: snapshot.license,
        kind: "ORIGINAL_SOURCE",
        review_report_sha256: snapshot.review_report_sha256
      }
    };
  }
  throw new Error("source snapshot redirect budget exceeded");
}
async function prepare(options) {
  const { approval: a, sourceSha, roots, output } = options,
    request = options.api || api;
  validateApproval(a, sourceSha);
  const evidence = {};
  for (const [kind, spec] of Object.entries(a.runs)) {
    const run = await request(`actions/runs/${spec.run_id}`),
      artifact = await request(`actions/artifacts/${spec.artifact_id}`);
    let member;
    for (let page = 1; page <= 10; page++) {
      const list = await request(`actions/runs/${spec.run_id}/artifacts?per_page=100&page=${page}`);
      member = list.artifacts.find((item) => item.id === spec.artifact_id);
      if (member || list.artifacts.length < 100) break;
    }
    evidence[kind] = { run, artifact, member };
  }
  validateEvidence(a, evidence); // All four successful runs and memberships before any archive request.
  const archives = {};
  for (const [kind, spec] of Object.entries(a.runs))
    archives[kind] = await (options.download || downloadArtifact)(spec);
  const final = parse(
    inspectArchive(
      archives.final,
      "final",
      a.runs.final
    )("final-aggregate.json", a.final.report_sha256)
  );
  // Keep legacy synchronous qualification; load the shared ESM validator only for Book imports.
  const bookSemantics =
    final.kind === "book-local-linux-container"
      ? (await import("./book-model-evaluation.mjs")).assertImportedSemantics
      : undefined;
  const files = qualify(a, evidence, archives, bookSemantics);
  const modelMember = inspectArchive(archives.model, "model", a.runs.model);
  const candidateProvenance = parse(modelMember("provenance.json"));
  let modelBuild;
  if (a.publication.model_build_inputs) {
    assert.equal(
      hash(modelMember("frequencies.tsv", candidateProvenance.files_sha256?.["frequencies.tsv"])),
      candidateProvenance.frequencies_sha256
    );
    modelBuild = verifyModelBuildInputs(roots.approval, a, candidateProvenance);
    files["MODEL_BUILD_INPUTS.zip"] = modelBuild.bytes;
  }
  const rawSource = await verifyPublicSource(
    a,
    parse(modelMember("source-manifest.json", a.source_manifest_sha256)),
    candidateProvenance
  );
  files["MODEL_NOTICE.md"] = trackedFile(
    roots.approval,
    a.publication.notice.path,
    a.publication.notice
  );
  files["model-source.tar"] = sourceArchive(roots.model, a.sources.model, "model");
  files["runtime-source.tar"] = sourceArchive(roots.runtime, a.sources.runtime, "runtime");
  assert.equal(a.sources.runtime.files.LICENSE.sha256, a.publication.code_license_sha256);
  files["provenance.json"] = json({
    schema: "linka-base-model-release-v1",
    repository: REPO,
    tag: a.tag,
    source_sha: a.source_sha,
    runtime_source_sha: RUNTIME,
    app_tooling_sha: a.app_tooling_sha,
    model: a.model,
    runtime: a.runtime,
    runs: a.runs,
    source_manifest_sha256: a.source_manifest_sha256,
    source_review_sha256: a.source_review_sha256,
    exclusions_sha256: a.exclusions_sha256,
    final: a.final,
    windows: a.windows,
    licenses: a.licenses,
    release_review: a.review,
    candidate_approval_flags_remain_false: true,
    hardware: "NOT_TESTED",
    client_os: "NOT_TESTED",
    raw_source: rawSource,
    ...(modelBuild ? { model_build_reproduction: modelBuild.reproduction } : {})
  });
  files["REPRODUCTION.json"] = json({
    schema: "linka-base-model-reproduction-v1",
    code_license: a.licenses.code,
    model_data_license: a.licenses.data,
    model_source_sha: a.source_sha,
    runtime_source_sha: RUNTIME,
    model_recipe: "model-source.tar:scripts/model_recipe.py",
    runtime_recipe: "runtime-source.tar:.github/workflows/windows-runtime.yml",
    source_inputs: rawSource,
    limitations:
      "No raw source, profiles or FINAL bundled; original-source snapshot availability does not establish completeness of all reproduction inputs",
    source_manifest_sha256: a.source_manifest_sha256,
    exclusions_sha256: a.exclusions_sha256,
    retrained: false,
    rebuilt: false
  });
  assert(!fs.existsSync(output), "fresh owned output required");
  fs.mkdirSync(output);
  try {
    for (const [name, bytes] of Object.entries(files))
      fs.writeFileSync(path.join(output, name), bytes, { flag: "wx" });
    architecture(path.join(output, "lp-electron.exe"), "win32", "x64");
    const inventory = {
      schema: "linka-base-model-publication-v1",
      repository: REPO,
      tag: a.tag,
      source_sha: a.source_sha,
      approval_sha256: hash(json(a)),
      ...(modelBuild ? { model_build_inputs: a.publication.model_build_inputs } : {}),
      files: Object.fromEntries(
        Object.entries(files).map(([name, bytes]) => [
          name,
          { sha256: hash(bytes), bytes: bytes.length }
        ])
      )
    };
    fs.writeFileSync(path.join(output, "publication.json"), json(inventory), { flag: "wx" });
    return inventory;
  } catch (error) {
    fs.rmSync(output, { recursive: true, force: true });
    throw error;
  }
}
if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      assert.equal(process.env.GITHUB_ACTIONS, "true");
      assert.equal(process.env.GITHUB_REPOSITORY, REPO);
      assert.equal(process.env.GITHUB_REF, "refs/heads/main");
      const [approvalRoot, approvalPath, sourceSha, modelRoot, runtimeRoot, output] =
        process.argv.slice(2);
      assert.equal(process.argv.length, 8);
      assert(
        safePath(approvalPath) &&
          approvalPath.startsWith("provenance/releases/") &&
          approvalPath.endsWith(".json")
      );
      const file = path.join(approvalRoot, approvalPath),
        stat = fs.lstatSync(file);
      assert(stat.isFile() && stat.size > 0 && stat.size <= MiB);
      const bytes = trackedFile(approvalRoot, approvalPath, {
        sha256: hash(fs.readFileSync(file)),
        bytes: stat.size
      });
      assert.equal(
        git(approvalRoot, ["rev-parse", "HEAD"]).toString().trim(),
        process.env.GITHUB_SHA
      );
      git(approvalRoot, ["merge-base", "--is-ancestor", sourceSha, "HEAD"]);
      const a = parse(bytes);
      validateApproval(a, sourceSha);
      assert.equal(
        git(path.resolve(__dirname, "../.."), ["rev-parse", "HEAD"]).toString().trim(),
        a.app_tooling_sha
      );
      git(path.resolve(__dirname, "../.."), [
        "merge-base",
        "--is-ancestor",
        a.app_tooling_sha,
        "origin/main"
      ]);
      await prepare({
        approval: a,
        sourceSha,
        roots: { approval: approvalRoot, model: modelRoot, runtime: runtimeRoot },
        output
      });
    })
    .catch(() => {
      console.error("Base-model promotion preparation BLOCKED; no private content logged");
      process.exitCode = 1;
    });
}
module.exports = {
  hash,
  validateApproval,
  validateEvidence,
  inspectArchive,
  qualify,
  sourceArchive,
  prepare,
  verifyPublicSource,
  verifyModelBuildInputs
};
