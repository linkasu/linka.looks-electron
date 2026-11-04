const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createHash } = require("node:crypto");
const Zip = require("adm-zip");
const {
  resolveModelImportOrigin,
  validateModelArchiveOrigin
} = require("./model-import-origin.cjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const sourceSha = "a".repeat(40),
    workflowSha = "b".repeat(40);
  const manifest = {
    schema: "linka-book-candidate-import-v1",
    model_source_sha: sourceSha,
    app_tooling_sha: "c".repeat(40),
    source_manifest: "source.json",
    source_review: "review.json",
    review_report: "report.json",
    exclusion_file: "exclusions.json",
    book_release_id: "123",
    book_archive_sha256: "d".repeat(64),
    book_archive_bytes: 200,
    book_transport: "repository-secret"
  };
  const manifest_json = JSON.stringify(manifest) + "\n";
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
    source_revision: sourceSha,
    execution: { source_sha: sourceSha },
    ci_import: {
      schema: "linka-model-ci-import-v1",
      run_id: "12",
      run_attempt: 2,
      workflow_sha: workflowSha,
      manifest_path: "provenance/import.json",
      manifest_sha256: hash(manifest_json),
      model_source_sha: sourceSha
    }
  };
  const bytes = Buffer.from(manifest_json);
  const content = {
    type: "file",
    path: provenance.ci_import.manifest_path,
    encoding: "base64",
    content: bytes.toString("base64") + "\n",
    size: bytes.length,
    sha: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
  };
  const provenance_json = JSON.stringify(provenance) + "\n";
  const zip = new Zip();
  zip.addFile("provenance.json", Buffer.from(provenance_json));
  const archive = zip.toBuffer();
  const metadata = {
    repository: "linkasu/linka.predictor-rust",
    run,
    candidate_workflow: { path: run.path },
    artifact: {
      id: 13,
      expired: false,
      name: "model-candidates-12-2",
      workflow_run: { id: 12, head_sha: workflowSha },
      size_in_bytes: archive.length,
      digest: `sha256:${hash(archive)}`
    },
    model_import: { provenance_json, manifest_json }
  };
  return {
    sourceSha,
    manifest,
    manifest_json,
    run,
    provenance,
    content,
    archive,
    metadata,
    input: { source_sha: sourceSha, candidate_run_id: "12", candidate_artifact_id: "13" }
  };
}
test("v2 adapter fetches only exact fixed-repository path at actual workflow SHA and binds raw ZIP metadata", async () => {
  const f = fixture();
  const context = await resolveModelImportOrigin({
    ...f,
    api: async (route) => {
      assert.equal(route, `contents/provenance/import.json?ref=${f.run.head_sha}`);
      return f.content;
    }
  });
  assert.equal(context.manifest.model_source_sha, f.sourceSha);
  assert.equal(context.manifest_json, f.manifest_json);
  assert.equal(validateModelArchiveOrigin(f.input, f.metadata, f.archive), f.sourceSha);
  const { validateMetadata } = await import("./predictor-evaluation-runner.mjs");
  validateMetadata(f.input, f.metadata, f.archive);
  assert.throws(() => validateMetadata(f.input, f.metadata));
  const noEnvelope = { ...f.metadata };
  delete noEnvelope.model_import;
  assert.throws(() => validateMetadata(f.input, noEnvelope));
  assert.throws(() => validateMetadata(f.input, noEnvelope, f.archive));
});
test("adapter rejects wrong path/blob/size/base64/manifest pins and untrusted producer metadata", async () => {
  const f = fixture();
  await assert.rejects(
    resolveModelImportOrigin({
      ...f,
      api: async () => {
        throw new Error("https://invalid.example/?SYNTHETIC_TOKEN");
      }
    }),
    /^Error: MODEL_IMPORT_ORIGIN_INVALID$/
  );
  for (const patch of [
    { type: "symlink" },
    { path: "other.json" },
    { encoding: "none" },
    { sha: "0".repeat(40) },
    { size: f.content.size + 1 },
    { size: 65537 },
    { content: f.content.content + "!" }
  ])
    await assert.rejects(
      resolveModelImportOrigin({ ...f, api: async () => ({ ...f.content, ...patch }) })
    );
  for (const patch of [
    { conclusion: "cancelled" },
    { head_branch: "other" },
    { run_attempt: 3 },
    { repository: { full_name: "fork/repo" } },
    { head_repository: null },
    { head_sha: f.sourceSha },
    { path: ".github/workflows/other.yml" }
  ])
    await assert.rejects(
      resolveModelImportOrigin({ ...f, run: { ...f.run, ...patch }, api: async () => f.content })
    );
  for (const patch of [
    { manifest_path: "../import.json" },
    { manifest_sha256: "f".repeat(64) },
    { workflow_sha: f.sourceSha },
    { run_id: "13" },
    { schema: "unknown" }
  ])
    await assert.rejects(
      resolveModelImportOrigin({
        ...f,
        provenance: { ...f.provenance, ci_import: { ...f.provenance.ci_import, ...patch } },
        api: async () => f.content
      })
    );
  for (const marker of [null, false, {}, "legacy"])
    await assert.rejects(
      resolveModelImportOrigin({
        ...f,
        provenance: { ...f.provenance, ci_import: marker },
        api: async () => f.content
      })
    );
});
test("archive proof rejects forged envelope, incomplete new context, digest/size, unknown entries and oversized provenance", () => {
  const f = fixture();
  for (const patch of [
    { manifest_json: null },
    { manifest_json: "{}" },
    { manifest_json: f.manifest_json + "\n" },
    { provenance_json: f.metadata.model_import.provenance_json + "\n" },
    { extra: "PASS" }
  ])
    assert.throws(() =>
      validateModelArchiveOrigin(
        f.input,
        {
          ...f.metadata,
          model_import: { ...f.metadata.model_import, ...patch }
        },
        f.archive
      )
    );
  assert.throws(() =>
    validateModelArchiveOrigin({ source_sha: f.run.head_sha }, f.metadata, f.archive)
  );
  for (const patch of [
    { size_in_bytes: f.archive.length + 1 },
    { digest: `sha256:${"0".repeat(64)}` }
  ])
    assert.throws(() =>
      validateModelArchiveOrigin(
        f.input,
        { ...f.metadata, artifact: { ...f.metadata.artifact, ...patch } },
        f.archive
      )
    );
  for (const [name, bytes] of [
    ["../escape", Buffer.from("synthetic")],
    ["provenance.json", Buffer.alloc(1024 ** 2 + 1)]
  ]) {
    const zip = new Zip(f.archive);
    zip.addFile(name, bytes);
    const archive = zip.toBuffer();
    assert.throws(() =>
      validateModelArchiveOrigin(
        f.input,
        {
          ...f.metadata,
          artifact: {
            ...f.metadata.artifact,
            size_in_bytes: archive.length,
            digest: `sha256:${hash(archive)}`
          }
        },
        archive
      )
    );
  }
});
test("legacy remains exact-source only and does not call manifest API or mutate published metadata", async () => {
  const f = fixture();
  const provenance = { source_revision: f.run.head_sha };
  const before = JSON.stringify(provenance);
  const result = await resolveModelImportOrigin({
    run: f.run,
    provenance,
    api: () => assert.fail("legacy API request")
  });
  assert.equal(result.manifest_json, null);
  assert.equal(JSON.stringify(provenance), before);
  await assert.rejects(
    resolveModelImportOrigin({ run: f.run, provenance: { source_revision: f.sourceSha } })
  );
});
test("metadata CLI binds mocked Contents API and ZIP without decoding opaque target transport; errors stay generic", (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  const f = fixture();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "model-origin-cli-synthetic-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const meta = path.join(root, "meta.json"),
    archive = path.join(root, "candidate.zip");
  const event = path.join(root, "event.json"),
    preload = path.join(root, "mock-api.cjs");
  const original = structuredClone(f.metadata);
  delete original.model_import;
  fs.writeFileSync(meta, JSON.stringify(original));
  fs.writeFileSync(archive, f.archive);
  fs.writeFileSync(
    event,
    JSON.stringify({
      inputs: { ...f.input, sealed_bundle: "SYNTHETIC_OPAQUE_NOT_A_TARGET_BUNDLE" }
    })
  );
  const mock = (content) =>
    fs.writeFileSync(
      preload,
      `globalThis.fetch = async (url, init) => {
      require('node:assert/strict').equal(url, ${JSON.stringify(`https://api.github.com/repos/linkasu/linka.predictor-rust/contents/provenance/import.json?ref=${f.run.head_sha}`)});
      require('node:assert/strict').equal(init.redirect, 'error');
      require('node:assert/strict').equal(init.headers.Authorization, 'Bearer SYNTHETIC_TOKEN');
      return {ok:true,body:[Buffer.from(${JSON.stringify(JSON.stringify(content))})]};
    };`
    );
  const runCli = () =>
    spawnSync(
      process.execPath,
      ["--require", preload, require.resolve("./model-import-origin.cjs"), meta, archive],
      {
        encoding: "utf8",
        timeout: 15000,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_REPOSITORY: "linkasu/linka.predictor-rust",
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_PATH: event,
          GH_TOKEN: "SYNTHETIC_TOKEN"
        }
      }
    );
  mock(f.content);
  const success = runCli();
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(meta)).model_import, f.metadata.model_import);
  fs.writeFileSync(meta, JSON.stringify(original));
  mock({ ...f.content, sha: "0".repeat(40) });
  const failure = runCli();
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /metadata validation blocked/);
  assert.doesNotMatch(failure.stderr + failure.stdout, /SYNTHETIC_TOKEN|SYNTHETIC_OPAQUE|https:/);
  assert.deepEqual(JSON.parse(fs.readFileSync(meta)), original);
});
