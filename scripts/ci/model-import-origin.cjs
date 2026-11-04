const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const {
  validateImportManifest,
  validateModelImportOrigin,
  validateModelImportRun,
  repositoryPath
} = require("./model-import-contract.cjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (bytes) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);

async function resolveModelImportOrigin({ run, provenance, api }) {
  try {
    validateModelImportRun(run);
    if (!Object.hasOwn(provenance, "ci_import")) {
      validateModelImportOrigin({ run, provenance });
      return { manifest: null, manifestSha256: null, manifest_json: null };
    }
    const marker = provenance.ci_import;
    assert(marker && typeof marker === "object" && !Array.isArray(marker));
    repositoryPath(marker.manifest_path);
    assert(
      typeof marker.manifest_sha256 === "string" && /^[a-f0-9]{64}$/.test(marker.manifest_sha256)
    );
    const content = await api(`contents/${marker.manifest_path}?ref=${run.head_sha}`);
    assert.equal(content.type, "file");
    assert.equal(content.path, marker.manifest_path);
    assert.equal(content.encoding, "base64");
    assert(Number.isSafeInteger(content.size) && content.size > 0 && content.size <= 65536);
    assert(typeof content.content === "string" && content.content.length <= 90000);
    const encoded = content.content.replace(/\n/g, "");
    const bytes = Buffer.from(encoded, "base64");
    assert.equal(bytes.toString("base64"), encoded, "canonical base64 contents");
    assert.equal(bytes.length, content.size);
    const blobSha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(content.sha, blobSha, "Git blob binding");
    const manifestSha256 = hash(bytes);
    const manifest_json = text(bytes);
    const manifest = validateImportManifest(JSON.parse(manifest_json));
    validateModelImportOrigin({ run, provenance, manifest, manifestSha256 });
    return { manifest, manifestSha256, manifest_json };
  } catch {
    throw new Error("MODEL_IMPORT_ORIGIN_INVALID");
  }
}

function archiveProvenance(archiveBytes, artifact) {
  assert(Buffer.isBuffer(archiveBytes) && archiveBytes.length <= 300 * 1024 ** 2);
  assert.equal(archiveBytes.length, artifact.size_in_bytes, "API artifact size binding");
  assert.equal(`sha256:${hash(archiveBytes)}`, artifact.digest, "API artifact digest binding");
  assert.equal(require("adm-zip/package.json").version, "0.6.1");
  const zip = new (require("adm-zip"))(archiveBytes);
  require("./windows-model-benchmark.cjs").validateEntries(zip.getEntries(), "model");
  const entry = zip.getEntry("provenance.json");
  assert(entry && entry.header.size > 0 && entry.header.size <= 1024 ** 2, "bounded provenance");
  const bytes = entry.getData();
  assert.equal(bytes.length, entry.header.size);
  return text(bytes);
}

function validateModelArchiveOrigin(input, metadata, archiveBytes) {
  const provenance_json = archiveProvenance(archiveBytes, metadata.artifact);
  const provenance = JSON.parse(provenance_json);
  let manifest, manifestSha256;
  if (Object.hasOwn(metadata, "model_import")) {
    const envelope = metadata.model_import;
    assert(envelope && typeof envelope === "object" && !Array.isArray(envelope));
    assert.deepEqual(Object.keys(envelope).sort(), ["manifest_json", "provenance_json"]);
    assert.equal(envelope.provenance_json, provenance_json, "raw ZIP provenance binding");
    if (Object.hasOwn(provenance, "ci_import")) {
      assert(
        typeof envelope.manifest_json === "string" &&
          Buffer.byteLength(envelope.manifest_json) <= 65536
      );
      manifestSha256 = hash(Buffer.from(envelope.manifest_json));
      manifest = validateImportManifest(JSON.parse(envelope.manifest_json));
    } else assert.equal(envelope.manifest_json, null);
  } else
    assert(!Object.hasOwn(provenance, "ci_import"), "new origin requires raw manifest metadata");
  const sourceSha = validateModelImportOrigin({
    run: metadata.run,
    provenance,
    manifest,
    manifestSha256
  });
  assert.equal(sourceSha, input.source_sha, "requested model source identity");
  return sourceSha;
}

async function main() {
  assert.equal(process.argv.length, 4);
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(process.env.GITHUB_REPOSITORY, "linkasu/linka.predictor-rust");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  const [metaPath, zipPath] = process.argv.slice(2);
  const readBounded = (file, limit) => {
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && stat.size > 0 && stat.size <= limit);
    return fs.readFileSync(file);
  };
  const metadata = JSON.parse(readBounded(metaPath, 4 * 1024 ** 2));
  const bytes = readBounded(zipPath, 300 * 1024 ** 2);
  const provenance_json = archiveProvenance(bytes, metadata.artifact);
  const api = async (relative) => {
    const response = await fetch(
      `https://api.github.com/repos/linkasu/linka.predictor-rust/${relative}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json"
        },
        redirect: "error",
        signal: AbortSignal.timeout(60000)
      }
    );
    assert(response.ok);
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      assert(size <= 256 * 1024);
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
  const origin = await resolveModelImportOrigin({
    run: metadata.run,
    provenance: JSON.parse(provenance_json),
    api
  });
  metadata.model_import = { provenance_json, manifest_json: origin.manifest_json };
  const input = JSON.parse(readBounded(process.env.GITHUB_EVENT_PATH, 1024 ** 2)).inputs;
  const { validateMetadata } = await import("./predictor-evaluation-runner.mjs");
  validateMetadata(input, metadata, bytes);
  fs.writeFileSync(metaPath, JSON.stringify(metadata), { mode: 0o600 });
}
module.exports = { resolveModelImportOrigin, validateModelArchiveOrigin, archiveProvenance };
if (require.main === module)
  main().catch(() => {
    console.error("Model import metadata validation blocked; no private context logged.");
    process.exitCode = 1;
  });
