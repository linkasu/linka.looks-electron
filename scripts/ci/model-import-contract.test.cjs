const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  validateImportManifest,
  validateModelImportOrigin
} = require("./model-import-contract.cjs");
const { readImportManifest } = require("./import-book-candidate.cjs");

const modelSha = "a".repeat(40);
const workflowSha = "b".repeat(40);
const manifest = {
  schema: "linka-book-candidate-import-v1",
  model_source_sha: modelSha,
  app_tooling_sha: "c".repeat(40),
  source_manifest: "provenance/source.json",
  source_review: "provenance/approval.json",
  review_report: "provenance/review.json",
  exclusion_file: "provenance/exclusions.json",
  book_release_id: "123",
  book_archive_sha256: "d".repeat(64),
  book_archive_bytes: 200,
  book_transport: "repository-secret"
};
const manifestSha256 = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
const run = {
  id: 12,
  run_attempt: 2,
  repository: { full_name: "linkasu/linka.predictor-rust" },
  head_repository: { full_name: "linkasu/linka.predictor-rust" },
  head_sha: workflowSha,
  head_branch: "main",
  event: "workflow_dispatch",
  path: ".github/workflows/model-candidates.yml",
  status: "completed",
  conclusion: "success"
};
const provenance = {
  source_revision: modelSha,
  execution: { source_sha: modelSha },
  ci_import: {
    schema: "linka-model-ci-import-v1",
    run_id: "12",
    run_attempt: 2,
    workflow_sha: workflowSha,
    manifest_path: "provenance/import.json",
    manifest_sha256: manifestSha256,
    model_source_sha: modelSha
  }
};
const importOrigin = { run, provenance, manifest, manifestSha256 };
test("manifest exact fields, strict types, canonical paths and bounded pins", () => {
  assert.equal(validateImportManifest(manifest), manifest);
  for (const patch of [
    { extra: true },
    { schema: "unknown" },
    { model_source_sha: "main" },
    { app_tooling_sha: [manifest.app_tooling_sha] },
    { book_release_id: 123 },
    { book_release_id: "9007199254740992" },
    { book_archive_sha256: "D".repeat(64) },
    { book_archive_bytes: "200" },
    { book_archive_bytes: 21 },
    { book_archive_bytes: 300 * 1024 ** 2 + 1 },
    { book_archive_bytes: 22.5 },
    { book_transport: "" },
    { book_transport: "PAT" }
  ])
    assert.throws(() => validateImportManifest({ ...manifest, ...patch }));
  for (const key of ["source_manifest", "source_review", "review_report", "exclusion_file"])
    for (const value of [
      "../x.json",
      "/x.json",
      "a/../x.json",
      "a//x.json",
      "./x.json",
      "a\\x.json",
      "a.json\n",
      ["a.json"],
      "a.json?token=x"
    ])
      assert.throws(() => validateImportManifest({ ...manifest, [key]: value }));
  for (const key of Object.keys(manifest)) {
    const invalid = { ...manifest };
    delete invalid[key];
    assert.throws(() => validateImportManifest(invalid));
  }
});
test("main movement changes import identity, never frozen Book model identity", () => {
  assert.equal(validateModelImportOrigin(importOrigin), modelSha);
  const moved = structuredClone(importOrigin);
  moved.run.head_sha = "e".repeat(40);
  moved.provenance.ci_import.workflow_sha = moved.run.head_sha;
  assert.equal(validateModelImportOrigin(moved), modelSha);
  assert.equal(moved.provenance.source_revision, modelSha);
  assert.equal(moved.provenance.execution.source_sha, modelSha);
});
test("new origin rejects wrong, missing, malformed identities without legacy fallback", () => {
  for (const key of Object.keys(provenance.ci_import)) {
    const invalid = structuredClone(importOrigin);
    delete invalid.provenance.ci_import[key];
    assert.throws(() => validateModelImportOrigin(invalid));
  }
  for (const patch of [
    { extra: true },
    { schema: "unknown" },
    { run_id: "13" },
    { run_id: 12 },
    { run_attempt: 1 },
    { workflow_sha: modelSha },
    { manifest_path: "../import.json" },
    { manifest_sha256: "f".repeat(64) },
    { model_source_sha: workflowSha }
  ])
    assert.throws(() =>
      validateModelImportOrigin({
        ...importOrigin,
        provenance: {
          ...provenance,
          ci_import: { ...provenance.ci_import, ...patch }
        }
      })
    );
  for (const marker of [null, false, "", [], {}])
    assert.throws(() =>
      validateModelImportOrigin({
        ...importOrigin,
        provenance: {
          source_revision: workflowSha,
          ci_import: marker
        }
      })
    );
  for (const patch of [
    { head_sha: modelSha },
    { head_branch: "other" },
    { event: "push" },
    { conclusion: "cancelled" },
    { status: "in_progress" },
    { run_attempt: 3 },
    { repository: { full_name: "fork/repo" } },
    { head_repository: null },
    { path: ".github/workflows/other.yml" }
  ])
    assert.throws(() => validateModelImportOrigin({ ...importOrigin, run: { ...run, ...patch } }));
  assert.throws(() => validateModelImportOrigin({ ...importOrigin, manifest: undefined }));
  assert.throws(() => validateModelImportOrigin({ ...importOrigin, manifestSha256: undefined }));
  assert.throws(() =>
    validateModelImportOrigin({
      ...importOrigin,
      provenance: { ...provenance, execution: { source_sha: workflowSha } }
    })
  );
  assert.throws(() =>
    validateModelImportOrigin({
      ...importOrigin,
      provenance: { ...provenance, source_revision: workflowSha }
    })
  );
  const missing = { ...provenance };
  delete missing.ci_import;
  assert.throws(() => validateModelImportOrigin({ ...importOrigin, provenance: missing }));
});
test("legacy same-source public origins stay readable, byte-for-byte unmodified", () => {
  const legacy = { source_revision: workflowSha, quality_approved: false };
  const before = JSON.stringify(legacy);
  assert.equal(validateModelImportOrigin({ run, provenance: legacy }), workflowSha);
  assert.equal(JSON.stringify(legacy), before);
});
test("manifest intake requires exact tracked workflow-tree bytes, no symlinks/untracked files", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-import-manifest-synthetic-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  git("init", "-q");
  fs.mkdirSync(path.join(root, "provenance"));
  const name = "provenance/import.json";
  const file = path.join(root, name);
  fs.writeFileSync(file, JSON.stringify(manifest));
  fs.symlinkSync("import.json", path.join(root, "provenance/link.json"));
  git("add", ".");
  git(
    "-c",
    "user.name=Synthetic",
    "-c",
    "user.email=synthetic@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "synthetic fixture only"
  );
  const head = git("rev-parse", "HEAD");
  assert.equal(readImportManifest(root, name, head).sha256, manifestSha256);
  assert.throws(() => readImportManifest(root, name, workflowSha));
  assert.throws(() => readImportManifest(root, "provenance/link.json", head));
  fs.copyFileSync(file, path.join(root, "provenance/untracked.json"));
  assert.throws(() => readImportManifest(root, "provenance/untracked.json", head));
  fs.appendFileSync(file, "\n");
  assert.throws(() => readImportManifest(root, name, head));
  fs.unlinkSync(file);
  fs.symlinkSync("untracked.json", file);
  assert.throws(() => readImportManifest(root, name, head));
  fs.unlinkSync(file);
  fs.writeFileSync(
    file,
    JSON.stringify(manifest).replace(
      '"book_release_id":"123"',
      '"book_release_id":"123","book_release_id":"456"'
    )
  );
  git("add", name);
  git(
    "-c",
    "user.name=Synthetic",
    "-c",
    "user.email=synthetic@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "synthetic duplicate fixture"
  );
  assert.throws(() => readImportManifest(root, name, git("rev-parse", "HEAD")));
});
