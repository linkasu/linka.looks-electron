const assert = require("node:assert/strict");

const REPOSITORY = "linkasu/linka.predictor-rust";
const sha = (value, length) =>
  assert(typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value), "SHA");
function repositoryPath(value) {
  assert(
    typeof value === "string" &&
      value.length <= 512 &&
      /^[A-Za-z0-9_-][A-Za-z0-9_./-]*\.json$/.test(value) &&
      value.split("/").every((part) => part && part !== "." && part !== ".."),
    "canonical repository-relative JSON path"
  );
  return value;
}
function exactKeys(value, keys) {
  assert(value && typeof value === "object" && !Array.isArray(value), "object required");
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), "exact fields required");
}
function positiveId(value) {
  assert(typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value));
  assert(Number.isSafeInteger(Number(value)), "ID overflow");
}
function validateImportManifest(m) {
  exactKeys(m, [
    "schema",
    "model_source_sha",
    "app_tooling_sha",
    "source_manifest",
    "source_review",
    "review_report",
    "exclusion_file",
    "book_release_id",
    "book_archive_sha256",
    "book_archive_bytes",
    "book_transport"
  ]);
  assert.equal(m.schema, "linka-book-candidate-import-v1");
  sha(m.model_source_sha, 40);
  sha(m.app_tooling_sha, 40);
  for (const key of ["source_manifest", "source_review", "review_report", "exclusion_file"])
    repositoryPath(m[key]);
  positiveId(m.book_release_id);
  sha(m.book_archive_sha256, 64);
  assert(
    Number.isSafeInteger(m.book_archive_bytes) &&
      m.book_archive_bytes >= 22 &&
      m.book_archive_bytes <= 300 * 1024 ** 2,
    "archive bytes bound"
  );
  assert.equal(m.book_transport, "repository-secret");
  return m;
}
function validateModelImportRun(run) {
  assert.equal(run.repository?.full_name, REPOSITORY);
  assert.equal(run.head_repository?.full_name, REPOSITORY);
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.head_branch, "main");
  assert.equal(run.path, ".github/workflows/model-candidates.yml");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert(Number.isSafeInteger(run.id) && run.id > 0);
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  sha(run.head_sha, 40);
}
function validateModelImportOrigin({ run, provenance, manifest, manifestSha256 }) {
  validateModelImportRun(run);
  sha(provenance.source_revision, 40);
  if (!Object.hasOwn(provenance, "ci_import")) {
    assert.equal(provenance.source_revision, run.head_sha, "legacy source origin");
    return provenance.source_revision;
  }
  validateImportManifest(manifest);
  sha(manifestSha256, 64);
  const origin = provenance.ci_import;
  exactKeys(origin, [
    "schema",
    "run_id",
    "run_attempt",
    "workflow_sha",
    "manifest_path",
    "manifest_sha256",
    "model_source_sha"
  ]);
  assert.equal(origin.schema, "linka-model-ci-import-v1");
  positiveId(origin.run_id);
  assert.equal(origin.run_id, String(run.id));
  assert.equal(origin.run_attempt, run.run_attempt);
  assert.equal(origin.workflow_sha, run.head_sha, "actual workflow revision");
  repositoryPath(origin.manifest_path);
  assert.equal(origin.manifest_sha256, manifestSha256, "tracked manifest bytes");
  assert.equal(origin.model_source_sha, manifest.model_source_sha);
  assert.equal(provenance.source_revision, manifest.model_source_sha, "actual Book source");
  assert.equal(
    provenance.execution?.source_sha,
    manifest.model_source_sha,
    "Book execution source"
  );
  return manifest.model_source_sha;
}
module.exports = {
  validateImportManifest,
  validateModelImportOrigin,
  validateModelImportRun,
  repositoryPath
};
