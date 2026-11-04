// Import filtered book outputs only; never execute code from the candidate archive.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { validateExecution } = require("./book-execution-receipt.cjs");
const { validateImportManifest, repositoryPath } = require("./model-import-contract.cjs");

function parseUniqueJson(bytes) {
  // Both manifest and capability pins must have one unambiguous value per field.
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        String.raw`
import json, sys
def unique(pairs):
    result = {}
    for k, v in pairs:
        if k in result: raise ValueError('duplicate JSON key')
        result[k] = v
    return result
print(json.dumps(json.load(sys.stdin, object_pairs_hook=unique)))
`
      ],
      { input: bytes, encoding: "utf8", maxBuffer: 512 * 1024, stdio: ["pipe", "pipe", "pipe"] }
    )
  );
}

function readImportManifest(root, name, workflowSha) {
  repositoryPath(name);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    workflowSha
  );
  const entry = execFileSync("git", ["ls-tree", "HEAD", "--", name], {
    cwd: root,
    encoding: "utf8"
  });
  assert(/^100644 blob [a-f0-9]{40}\t/.test(entry), "tracked regular manifest required");
  let current = root;
  for (const part of name.split("/")) {
    current = path.join(current, part);
    assert(!fs.lstatSync(current).isSymbolicLink(), "manifest symlink forbidden");
  }
  const bytes = execFileSync("git", ["show", `HEAD:${name}`], { cwd: root, maxBuffer: 65536 });
  assert(bytes.length > 0 && bytes.length <= 16384, "bounded manifest");
  assert.deepEqual(fs.readFileSync(current), bytes, "manifest must match trusted tree");
  const manifest = validateImportManifest(parseUniqueJson(bytes));
  return { manifest, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const ARCHIVE_LIMIT = 300 * 1024 ** 2;
function validateInputs(i) {
  assert(
    /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(i.repository),
    "repository"
  );
  assert(/^[0-9a-f]{40}$/.test(i.sourceSha), "source SHA");
  assert(/^[0-9a-f]{40}$/.test(i.appToolingSha), "app tooling SHA");
  assert(/^[1-9][0-9]*$/.test(i.releaseId), "release ID");
  assert(Number.isSafeInteger(Number(i.releaseId)), "release ID overflow");
  assert(/^[0-9a-f]{64}$/.test(i.archiveSha256), "archive SHA256");
  assert(/^[1-9][0-9]*$/.test(i.archiveBytes), "archive size");
  assert(Number(i.archiveBytes) <= ARCHIVE_LIMIT, "archive size limit");
}
function validateRelease(r, i) {
  validateInputs(i);
  const base = `https://api.github.com/repos/${i.repository}/releases`;
  assert(Number.isSafeInteger(r.id) && r.id > 0, "release ID");
  assert.equal(String(r.id), i.releaseId);
  assert.equal(r.url, `${base}/${i.releaseId}`);
  assert.equal(r.draft, true, "candidate release must remain unpublished");
  assert.equal(r.target_commitish, i.sourceSha, "draft source SHA");
  assert(/^book-candidate-[0-9a-f]{32}$/.test(r.tag_name), "candidate job tag");
  assert(Array.isArray(r.assets) && r.assets.length === 1, "exactly one candidate asset");
  const a = r.assets[0];
  assert.equal(a.name, "book-candidates.zip");
  assert.equal(a.state, "uploaded");
  assert(Number.isSafeInteger(a.id) && a.id > 0, "asset ID");
  assert.equal(a.size, Number(i.archiveBytes), "asset size binding");
  assert.equal(a.url, `${base}/assets/${a.id}`, "own-repository asset API only");
  return a;
}
function validateTransport(t, i, repositoryId, now = Date.now()) {
  try {
    const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), expected.sort());
    keys(t, ["schema", "release", "download_url"]);
    assert.equal(t.schema, "linka-book-candidate-read-capability-v1");
    keys(t.release, [
      "id",
      "url",
      "tag_name",
      "target_commitish",
      "draft",
      "assets",
      ...("prerelease" in t.release ? ["prerelease"] : [])
    ]);
    if ("prerelease" in t.release) assert.equal(typeof t.release.prerelease, "boolean");
    const asset = validateRelease(t.release, i);
    keys(asset, ["id", "name", "size", "state", "url"]);
    assert(typeof repositoryId === "string" && /^[1-9][0-9]*$/.test(repositoryId));
    assert(typeof t.download_url === "string" && t.download_url.length <= 16000);
    assert(t.download_url.startsWith("https://release-assets.githubusercontent.com/"));
    const url = new URL(t.download_url);
    assert.equal(url.hostname, "release-assets.githubusercontent.com");
    assert(!url.username && !url.password && !url.port && !t.download_url.includes("#"));
    assert.equal(url.href, t.download_url);
    assert(
      new RegExp(`^/github-production-release-asset/${repositoryId}/[A-Za-z0-9-]{1,128}$`).test(
        url.pathname
      )
    );
    const query = url.searchParams;
    const names = [...query.keys()];
    assert.equal(names.length, new Set(names).size);
    assert.equal(query.get("sp"), "r");
    assert.equal(query.get("sr"), "b");
    assert.equal(query.get("spr"), "https");
    assert(query.get("sig"));
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(query.get("se")));
    const expiry = Date.parse(query.get("se"));
    assert(Number.isFinite(expiry) && expiry > now && expiry <= now + 3600000);
    return { release: t.release, asset, downloadUrl: t.download_url };
  } catch {
    throw new Error("BOOK_TRANSPORT_INVALID");
  }
}
function readTransport(file, runnerTemp) {
  try {
    assert(
      runnerTemp &&
        path.resolve(file) === path.join(path.resolve(runnerTemp), "book-candidate-transport.json")
    );
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    let bytes;
    try {
      const stat = fs.fstatSync(fd);
      assert(stat.isFile() && stat.size > 0 && stat.size <= 65000 && (stat.mode & 0o777) === 0o600);
      const buffer = Buffer.alloc(65001);
      const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
      assert(count === stat.size);
      bytes = buffer.subarray(0, count);
    } finally {
      fs.closeSync(fd);
    }
    return parseUniqueJson(bytes);
  } catch {
    throw new Error("BOOK_TRANSPORT_INVALID");
  }
}
// Python's ZIP reader supplies decompression/CRC checks without npm installation.
const verifier = String.raw`
import importlib.util, json, os, pathlib, re, shutil, stat, struct, subprocess, sys, zipfile
archive, destination, root, manifest_path, approval_path, review_path, exclusions_path = sys.argv[1:]
root = pathlib.Path(root).resolve()
os.chdir(root)
def tracked(name):
    p = pathlib.PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or str(p) != name or '\\' in name:
        raise ValueError('noncanonical tracked path')
    subprocess.run(['git', 'ls-files', '--error-unmatch', '--', name], check=True, stdout=subprocess.DEVNULL)
    target = root / p
    if target.is_symlink() or not target.is_file() or not target.resolve().is_relative_to(root):
        raise ValueError('tracked regular file required')
    return target
spec = importlib.util.spec_from_file_location('trusted_recipe', root / 'scripts/model_recipe.py')
recipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe)
required = {'provenance.json', 'U.lpk', 'U.dev.json', 'U.receipt.json', 'T.receipt.json',
    'report.json', 'frequencies.tsv', 'train.groups.tsv', 'dev.groups.tsv',
    'attribution.jsonl.bz2', 'NOTICES.txt', 'source-manifest.json', 'source-review.json',
    'review-report.json', 'KenLM-LICENSE'}
allowed = required | {'T.lpk', 'T.dev.json'}
out = pathlib.Path(destination).resolve()
out.mkdir(parents=True, exist_ok=False)
try:
    # Canonical small flat ZIP: forbid ZIP64/multi-disk/comments before central-directory allocation.
    with open(archive, 'rb') as stream:
        stream.seek(0, 2)
        size = stream.tell()
        if not 22 <= size <= 300 * 1024**2: raise ValueError('archive size')
        stream.seek(-22, 2)
        sig, disk, cd_disk, count_disk, count, cd_size, cd_offset, comment = struct.unpack('<4s4H2LH', stream.read(22))
        if (sig != b'PK\x05\x06' or disk or cd_disk or comment or count != count_disk
                or not len(required) <= count <= len(allowed) or cd_size > len(allowed) * 512
                or cd_offset + cd_size != size - 22):
            raise ValueError('bounded canonical ZIP directory required')
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        names = [m.filename for m in entries]
        if len(names) != len(set(names)) or not required <= set(names) <= allowed:
            raise ValueError('noncanonical, missing or duplicate ZIP members')
        total = 0
        for m in entries:
            mode = m.external_attr >> 16
            limit = (128 if m.filename.endswith('.lpk') else 64) * 1024**2
            if (m.is_dir() or (stat.S_IFMT(mode) not in (0, stat.S_IFREG))
                    or m.flag_bits & 1 or not 0 < m.file_size <= limit):
                raise ValueError('ZIP member type/encryption/size')
            total += m.file_size
            if total > 300 * 1024**2:
                raise ValueError('uncompressed aggregate limit')
        for m in entries:
            count = 0
            with z.open(m) as src, (out / m.filename).open('xb') as dst:
                while True:
                    block = src.read(65536)
                    if not block: break
                    count += len(block)
                    if count > m.file_size: raise ValueError('expanded size mismatch')
                    dst.write(block)
            if count != m.file_size: raise ValueError('member size mismatch')
    for source, name in ((manifest_path, 'source-manifest.json'),
                         (approval_path, 'source-review.json'), (review_path, 'review-report.json'),
                         ('provenance/licenses/KenLM-LICENSE', 'KenLM-LICENSE')):
        if recipe.digest(tracked(source)) != recipe.digest(out / name):
            raise ValueError('tracked evidence byte mismatch')
    p = recipe.read_json(out / 'provenance.json')
    if recipe.candidate_provenance(out, p) != p:
        raise ValueError('canonical candidate file-map mismatch')
    manifest = recipe.read_json(out / 'source-manifest.json')
    approval = recipe.read_json(out / 'source-review.json')
    review = recipe.read_json(out / 'review-report.json')
    exclusions_sha = recipe.digest(tracked(exclusions_path))
    code_sha = recipe.preparation_code_hash()
    recipe.require_approval(manifest, approval, review, recipe.digest(out / 'review-report.json'),
                            exclusions_sha, code_sha, 'book-local-linux-container')
    tracked(approval['reference'])
    expected = {'source_revision': os.environ['BOOK_SOURCE_SHA'],
                'source_sha256': manifest['source']['sha256'],
                'preparation_code_sha256': code_sha, 'exclusions_sha256': exclusions_sha,
                'review_run_id': review['review_run_id'],
                'frequencies_sha256': recipe.digest(out / 'frequencies.tsv')}
    if any(p.get(k) != v for k, v in expected.items()):
        raise ValueError('candidate metadata does not bind tracked approvals/source')
    execution = p.get('execution')
    expected_execution = json.loads(os.environ['BOOK_EXECUTION'])
    if not isinstance(execution, dict) or (expected_execution is not None and execution != expected_execution):
        raise ValueError('candidate execution context')
    completion = p.get('book_completion')
    if (not isinstance(completion, dict) or set(completion) != {'schema', 'recipe', 'commands'}
            or completion.get('schema') != 'linka-book-completion-v1'):
        raise ValueError('global book completion proof required')
    status = completion['recipe']
    run_id = f"book:{execution['book_job_id']}:{execution['attempt']}"
    if (not isinstance(status, dict) or status.get('state') != 'COMPLETED'
            or status.get('mode') != 'train' or status.get('run_id') != run_id):
        raise ValueError('book recipe must complete this exact training execution')
    commands = completion['commands']
    required_commands = {'build-preparer', 'prepare', 'build-cli', 'compile-U'}
    optional_t = {'kenlm-pin', 'kenlm-clean', 'kenlm-configure', 'kenlm-build', 'mkn3', 'compile-T'}
    if not isinstance(commands, dict) or not required_commands <= set(commands):
        raise ValueError('missing mandatory book command receipts')
    t = recipe.read_json(out / 'T.receipt.json')
    failed = []
    for name, receipt in commands.items():
        if (re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*', name) is None
                or not isinstance(receipt, dict) or receipt.get('child_reaped') is not True
                or type(receipt.get('code')) is not int
                or receipt.get('state') not in {'COMPLETED', 'FAILED'}
                or (receipt['code'] == 0) != (receipt['state'] == 'COMPLETED')):
            raise ValueError('book command must be terminal and child reaped with matching code')
        if receipt['state'] == 'FAILED':
            if name not in optional_t or t['state'] != 'FAILED' or receipt['code'] != t['code']:
                raise ValueError('only the canonical optional T failure may fail a book command')
            failed.append(name)
    if t['state'] == 'FAILED' and not failed:
        raise ValueError('failed T requires its matching failed command receipt')
except BaseException:
    shutil.rmtree(out)
    raise
`;

function verifyArchive(archive, output, root, inputs, execution, sourceSha) {
  execFileSync(
    "python3",
    [
      "-c",
      verifier,
      path.resolve(archive),
      path.resolve(output),
      root,
      inputs.sourceManifest,
      inputs.sourceReview,
      inputs.reviewReport,
      inputs.exclusionFile
    ],
    {
      stdio: "inherit",
      env: { ...process.env, BOOK_EXECUTION: JSON.stringify(execution), BOOK_SOURCE_SHA: sourceSha }
    }
  );
}
async function api(url, token, accept = "application/vnd.github+json") {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    redirect: "manual",
    signal: AbortSignal.timeout(120000)
  });
}
async function downloadCandidate(i, options, archive) {
  validateInputs(i);
  let release, asset, bytesResponse, transport;
  if (options.transportFile) {
    const capability = validateTransport(
      readTransport(options.transportFile, options.runnerTemp),
      i,
      options.repositoryId
    );
    ({ release, asset } = capability);
    bytesResponse = await fetch(capability.downloadUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(120000)
    });
    transport = {
      kind: "operator-granted-one-asset-read-capability",
      draft_metadata_source: "operator-owner-api-snapshot",
      independent_draft_api_read: false,
      repository_id: options.repositoryId
    };
  } else {
    assert(options.token, "read-only GitHub token required");
    const response = await api(
      `https://api.github.com/repos/${i.repository}/releases/${i.releaseId}`,
      options.token
    );
    assert(response.ok, "draft release API failed");
    release = await response.json();
    asset = validateRelease(release, i);
    bytesResponse = await api(asset.url, options.token, "application/octet-stream");
    if (bytesResponse.status === 302) {
      const location = new URL(bytesResponse.headers.get("location"));
      assert.equal(location.protocol, "https:");
      assert.equal(location.hostname, "release-assets.githubusercontent.com");
      assert(!location.username && !location.password && !location.port);
      bytesResponse = await fetch(location, {
        redirect: "error",
        signal: AbortSignal.timeout(120000)
      });
    }
    transport = { kind: "github-draft-api-read", independent_draft_api_read: true };
  }
  assert(bytesResponse.ok, "asset download failed");
  const fd = fs.openSync(archive, "wx");
  let count = 0;
  const hash = createHash("sha256");
  try {
    for await (const chunk of bytesResponse.body) {
      count += chunk.length;
      assert(count <= Number(i.archiveBytes), "download size exceeded");
      hash.update(chunk);
      fs.writeFileSync(fd, chunk);
    }
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(count, Number(i.archiveBytes));
  assert.equal(hash.digest("hex"), i.archiveSha256, "archive SHA256 mismatch");
  return { release, transport: { ...transport, release_id: release.id, asset_id: asset.id } };
}
async function main() {
  const e = process.env;
  assert.equal(e.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(e.GITHUB_REF, "refs/heads/main", "main-only import");
  assert.equal(e.GITHUB_REPOSITORY, "linkasu/linka.predictor-rust", "owned repository only");
  assert.equal(e.GITHUB_SHA, e.GITHUB_WORKFLOW_SHA, "workflow must execute selected main tree");
  const trustedRoot = path.resolve(e.GITHUB_WORKSPACE);
  const { manifest: m, sha256: manifestSha256 } = readImportManifest(
    trustedRoot,
    e.IMPORT_MANIFEST,
    e.GITHUB_WORKFLOW_SHA
  );
  process.chdir(trustedRoot);
  assert(/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ID) && Number.isSafeInteger(Number(e.GITHUB_RUN_ID)));
  assert(
    /^[1-9][0-9]*$/.test(e.GITHUB_RUN_ATTEMPT) && Number.isSafeInteger(Number(e.GITHUB_RUN_ATTEMPT))
  );
  const i = {
    repository: e.GITHUB_REPOSITORY,
    sourceSha: m.model_source_sha,
    releaseId: m.book_release_id,
    archiveSha256: m.book_archive_sha256,
    archiveBytes: String(m.book_archive_bytes),
    appToolingSha: m.app_tooling_sha
  };
  validateInputs(i);
  const root = path.join(trustedRoot, ".local/model-source");
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    i.sourceSha
  );
  execFileSync("git", ["merge-base", "--is-ancestor", i.sourceSha, "origin/main"], { cwd: root });
  const app = path.resolve(__dirname, "../..");
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: app, encoding: "utf8" }).trim(),
    i.appToolingSha
  );
  execFileSync("git", ["merge-base", "--is-ancestor", i.appToolingSha, "origin/main"], {
    cwd: app
  });
  assert(e.BOOK_TRANSPORT_FILE, "repository-secret capability required");
  fs.mkdirSync(".local", { recursive: true });
  const archive = path.resolve(".local/book-candidates.zip");
  const { release, transport } = await downloadCandidate(
    i,
    {
      transportFile: e.BOOK_TRANSPORT_FILE,
      repositoryId: e.GITHUB_REPOSITORY_ID,
      runnerTemp: e.RUNNER_TEMP
    },
    archive
  );
  verifyArchive(
    archive,
    ".local/model-400/bundle",
    root,
    {
      sourceManifest: m.source_manifest,
      sourceReview: m.source_review,
      reviewReport: m.review_report,
      exclusionFile: m.exclusion_file
    },
    null,
    i.sourceSha
  );
  const provenanceFile = ".local/model-400/bundle/provenance.json";
  const provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
  validateExecution(provenance.execution, i.sourceSha, release.tag_name);
  provenance.transport = transport;
  assert(!Object.hasOwn(provenance, "ci_import"), "Book archive cannot assert CI import origin");
  provenance.ci_import = {
    schema: "linka-model-ci-import-v1",
    run_id: e.GITHUB_RUN_ID,
    run_attempt: Number(e.GITHUB_RUN_ATTEMPT),
    workflow_sha: e.GITHUB_WORKFLOW_SHA,
    manifest_path: e.IMPORT_MANIFEST,
    manifest_sha256: manifestSha256,
    model_source_sha: i.sourceSha
  };
  fs.writeFileSync(provenanceFile, JSON.stringify(provenance, null, 2) + "\n");
  console.log("Verified book-local candidate import; no CI training or publication performed.");
}
module.exports = {
  readImportManifest,
  validateInputs,
  validateRelease,
  validateExecution,
  validateTransport,
  readTransport,
  downloadCandidate,
  verifyArchive,
  verifier
};
if (require.main === module)
  main().catch(() => {
    console.error("Book candidate import blocked; no transport details logged.");
    process.exitCode = 1;
  });
