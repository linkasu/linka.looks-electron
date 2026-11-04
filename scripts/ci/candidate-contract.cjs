// Candidate claims are useful only after checking their GitHub origin and exact bytes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const REPOSITORY = "linkasu/linka.looks-electron";
const PARTS = ["windows", "sources", "security"];
const LIMITS = { windows: 512 * 1024 ** 2, sources: 512 * 1024 ** 2, security: 8 * 1024 ** 2 };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const positiveId = (id) =>
  typeof id === "string" && /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
const sha = (value, length = 64) =>
  typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const stable = (version) =>
  typeof version === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
function below(left, right) {
  assert(stable(left) && stable(right), "stable numeric version required");
  const a = left.split(".").map(BigInt);
  const b = right.split(".").map(BigInt);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] < b[index];
  return false;
}
function keys(value, names) {
  assert(value && typeof value === "object" && !Array.isArray(value), "object required");
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), "unexpected or missing fields");
}
function fileName(name) {
  assert(
    typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(name),
    "unsafe filename"
  );
}
function fileRecord(file) {
  fileName(file.name);
  assert(Number.isSafeInteger(file.bytes) && file.bytes > 0, "positive bounded file size required");
  assert(sha(file.sha256), "sha256 required");
}
function partName(kind, run, attempt) {
  return `${{ windows: "windows-candidate", sources: "candidate-sources", security: "candidate-security" }[kind]}-${run}-${attempt}`;
}
function expectedFiles(version, kind) {
  const installer = `linka.looks-${version}-win-x64.exe`;
  return {
    windows: [installer, `${installer}.blockmap`, "latest.yml", "provenance-windows.json"],
    sources: [`source-notices-windows-${version}.tar.gz`, "release-notes.md"],
    security: ["package-lock.json", "inventory.json", "audit.json", "security-signoff.json"]
  }[kind];
}
function validateCandidate(candidate) {
  keys(candidate, [
    "schema",
    "repository",
    "version",
    "appSha",
    "buildToolingSha",
    "buildRunId",
    "buildRunAttempt",
    "resources",
    "installer",
    "baseline",
    "artifacts"
  ]);
  const c = candidate;
  assert.equal(c.schema, "linka-windows-candidate-v1");
  assert.equal(c.repository, REPOSITORY);
  assert(stable(c.version), "stable numeric version required");
  assert(sha(c.appSha, 40) && sha(c.buildToolingSha, 40), "exact source SHAs required");
  assert(positiveId(c.buildRunId), "positive run ID required");
  assert(
    Number.isSafeInteger(c.buildRunAttempt) && c.buildRunAttempt > 0,
    "positive attempt required"
  );
  keys(c.resources, ["modelSha256", "runtimeSha256"]);
  assert(
    sha(c.resources.modelSha256) && sha(c.resources.runtimeSha256),
    "approved resource digests required"
  );
  keys(c.installer, ["name", "bytes", "sha256", "sha512"]);
  fileRecord(c.installer);
  assert.equal(c.installer.name, expectedFiles(c.version, "windows")[0]);
  assert(
    typeof c.installer.sha512 === "string" && /^[A-Za-z0-9+/]{86}==$/.test(c.installer.sha512),
    "base64 sha512 required"
  );
  const b = c.baseline;
  keys(b, ["version", "tag", "sourceSha", "releaseId", "assetId", "installer"]);
  assert(below(b.version, c.version), "baseline must be older stable version");
  assert.equal(b.tag, `v${b.version}`);
  assert(
    sha(b.sourceSha, 40) && positiveId(b.releaseId) && positiveId(b.assetId),
    "pinned baseline identity required"
  );
  keys(b.installer, ["name", "url", "bytes", "sha256"]);
  fileRecord(b.installer);
  assert(b.installer.bytes <= LIMITS.windows, "baseline installer exceeds bound");
  assert.equal(b.installer.name, expectedFiles(b.version, "windows")[0]);
  assert.equal(
    b.installer.url,
    `https://github.com/${REPOSITORY}/releases/download/${b.tag}/${b.installer.name}`
  );
  keys(c.artifacts, PARTS);
  const ids = new Set();
  for (const kind of PARTS) {
    const part = c.artifacts[kind];
    keys(part, ["id", "name", "bytes", "sha256", "files"]);
    assert(positiveId(part.id) && !ids.has(part.id), "distinct artifact IDs required");
    ids.add(part.id);
    fileRecord(part);
    assert(part.bytes <= 1024 ** 3, "artifact ZIP exceeds bound");
    assert.equal(part.name, partName(kind, c.buildRunId, c.buildRunAttempt));
    assert(Array.isArray(part.files), "file records required");
    assert.deepEqual(
      part.files.map((file) => file.name).sort(),
      expectedFiles(c.version, kind).sort(),
      "unexpected or missing artifact files"
    );
    let total = 0;
    for (const file of part.files) {
      keys(file, ["name", "bytes", "sha256"]);
      fileRecord(file);
      total += file.bytes;
    }
    assert(total <= LIMITS[kind], "expanded artifact exceeds bound");
  }
  const installer = c.artifacts.windows.files.find((file) => file.name === c.installer.name);
  assert.deepEqual(
    installer,
    { name: c.installer.name, bytes: c.installer.bytes, sha256: c.installer.sha256 },
    "installer/part mismatch"
  );
  return c;
}
function validateCandidateOrigin(c, { run, descriptorArtifact, artifacts }) {
  validateCandidate(c);
  assert.equal(String(run.id), c.buildRunId);
  assert.equal(run.run_attempt, c.buildRunAttempt, "different build attempt");
  assert.equal(run.repository?.full_name, REPOSITORY);
  assert.equal(run.head_repository?.full_name, REPOSITORY);
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.head_branch, "main");
  assert.equal(run.path, ".github/workflows/windows-candidate.yml");
  assert.equal(run.head_sha, c.buildToolingSha);
  assert.equal(run.status, "completed", "candidate producer must be terminal");
  assert.equal(run.conclusion, "success", "candidate producer must succeed");
  function membership(artifact, name) {
    assert(artifact && positiveId(String(artifact.id)), "artifact missing");
    assert.equal(artifact.name, name);
    assert.equal(artifact.expired, false);
    assert.equal(String(artifact.workflow_run?.id), c.buildRunId, "artifact not in build run");
    assert.equal(artifact.workflow_run?.head_sha, c.buildToolingSha);
    assert(
      Number.isSafeInteger(artifact.size_in_bytes) &&
        artifact.size_in_bytes > 0 &&
        artifact.size_in_bytes <= 1024 ** 3
    );
  }
  membership(descriptorArtifact, `candidate-${c.buildRunId}-${c.buildRunAttempt}`);
  keys(artifacts, PARTS);
  for (const kind of PARTS) {
    const part = c.artifacts[kind];
    const artifact = artifacts[kind];
    membership(artifact, part.name);
    assert.notEqual(String(descriptorArtifact.id), part.id);
    assert.equal(String(artifact.id), part.id);
    assert.equal(artifact.size_in_bytes, part.bytes);
    assert.equal(artifact.digest, `sha256:${part.sha256}`, "artifact ZIP digest mismatch");
  }
  return c;
}
function verifyCandidateFiles(c, kind, directory) {
  validateCandidate(c);
  assert(PARTS.includes(kind), "unknown candidate part");
  assert(fs.lstatSync(directory).isDirectory(), "regular directory required");
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    c.artifacts[kind].files.map((file) => file.name).sort(),
    "unexpected or missing files"
  );
  for (const file of c.artifacts[kind].files) {
    const location = path.join(directory, file.name);
    const stat = fs.lstatSync(location);
    assert(stat.isFile() && stat.size === file.bytes, "regular file/size mismatch");
    const bytes = fs.readFileSync(location);
    assert.equal(digest(bytes), file.sha256, "file digest mismatch");
    if (kind === "windows" && file.name === c.installer.name)
      assert.equal(createHash("sha512").update(bytes).digest("base64"), c.installer.sha512);
  }
  return c.artifacts[kind].files;
}
module.exports = {
  validateCandidate,
  validateCandidateOrigin,
  verifyCandidateFiles,
  digest,
  REPOSITORY,
  PARTS,
  LIMITS,
  expectedFiles,
  partName,
  below,
  stable
};
