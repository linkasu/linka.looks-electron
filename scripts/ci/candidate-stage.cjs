// Assemble existing release evidence; never rebuild, train, publish or fetch Mac assets.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { createHash } = require("node:crypto");
const { githubJson } = require("./candidate-io.cjs");
const { verifyMetadata } = require("./release-artifacts.cjs");
const { verifyNotes } = require("./release-publication.cjs");
const {
  REPOSITORY,
  PARTS,
  expectedFiles,
  partName,
  digest,
  below,
  stable,
  validateCandidate,
  verifyCandidateFiles
} = require("./candidate-contract.cjs");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
function regular(file, limit) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && stat.size > 0 && stat.size <= limit, "regular bounded file required");
  return fs.readFileSync(file);
}
function releaseNotes(appRoot, version) {
  assert(stable(version), "stable version required");
  let file = path.join(appRoot, "docs", "releases", `${version}.md`);
  if (!fs.existsSync(file) && version === "4.0.0")
    file = path.join(appRoot, "docs", "release-400-notes.md");
  assert(
    fs.realpathSync(file).startsWith(fs.realpathSync(appRoot) + path.sep),
    "release notes must belong to selected app"
  );
  const bytes = regular(file, 128 * 1024);
  // Canonical metadata only: Windows checkout CRLF becomes GitHub body LF before hashing.
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    .decode(bytes)
    .replace(/\r\n/g, "\n");
  assert(
    !text.includes("\r") && !text.startsWith("\ufeff"),
    "release notes must have no lone CR or BOM"
  );
  verifyNotes(text, version);
  return Buffer.from(text, "utf8");
}
async function selectBaseline(version, requestedTag, options = {}) {
  assert(stable(version), "stable version required");
  const root = `/repos/${REPOSITORY}`;
  const releases = [];
  let complete = false;
  for (let page = 1; page <= 10; page++) {
    const result = await githubJson(`${root}/releases?per_page=100&page=${page}`, options);
    assert(Array.isArray(result) && result.length <= 100, "bounded release listing required");
    releases.push(...result);
    if (result.length < 100) {
      complete = true;
      break;
    }
  }
  assert(complete, "release pagination exceeds bound");
  const eligible = releases.filter(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      release.published_at &&
      typeof release.tag_name === "string" &&
      release.tag_name.startsWith("v") &&
      stable(release.tag_name.slice(1)) &&
      below(release.tag_name.slice(1), version)
  );
  eligible.sort((a, b) =>
    below(a.tag_name.slice(1), b.tag_name.slice(1))
      ? 1
      : below(b.tag_name.slice(1), a.tag_name.slice(1))
        ? -1
        : 0
  );
  assert(eligible.length > 0, "published older stable baseline required");
  const release = eligible[0];
  if (requestedTag)
    assert.equal(release.tag_name, requestedTag, "baseline must be highest published older stable");
  const baselineVersion = release.tag_name.slice(1);
  const name = expectedFiles(baselineVersion, "windows")[0];
  const matches = release.assets.filter((asset) => asset.name === name);
  assert.equal(matches.length, 1, "genuine published baseline installer required");
  const asset = matches[0];
  assert(
    /^sha256:[a-f0-9]{64}$/.test(asset.digest ?? ""),
    "baseline requires GitHub SHA256 digest"
  );
  assert.equal(
    asset.browser_download_url,
    `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${name}`
  );
  assert(
    Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= 512 * 1024 ** 2,
    "baseline size bound"
  );
  let object = (await githubJson(`${root}/git/ref/tags/${release.tag_name}`, options)).object;
  for (let depth = 0; object?.type === "tag" && depth < 5; depth++) {
    assert(/^[a-f0-9]{40}$/.test(object.sha), "exact annotated tag required");
    object = (await githubJson(`${root}/git/tags/${object.sha}`, options)).object;
  }
  assert(
    object?.type === "commit" && /^[a-f0-9]{40}$/.test(object.sha),
    "baseline tag must resolve to exact source commit"
  );
  for (const value of [release.id, asset.id])
    assert(/^[1-9]\d*$/.test(String(value)), "positive baseline identity required");
  return {
    version: baselineVersion,
    tag: release.tag_name,
    sourceSha: object.sha,
    releaseId: String(release.id),
    assetId: String(asset.id),
    installer: {
      name,
      url: asset.browser_download_url,
      bytes: asset.size,
      sha256: asset.digest.slice(7)
    }
  };
}
function contextFromEnv(appRoot) {
  const version = readJson(path.join(appRoot, "package.json")).version;
  assert(stable(version), "selected app must have stable version");
  const lock = readJson(path.join(appRoot, "package-lock.json"));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[""].version, version);
  const approval = JSON.parse(
    regular(path.join(appRoot, "build/predictor-approval.json"), 64 * 1024)
  );
  const resources = {
    modelSha256: approval.modelSha256,
    runtimeSha256: approval.binaries?.["win32-x64"]
  };
  assert(
    Object.values(resources).every(
      (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)
    ),
    "selected-app resource approval required"
  );
  const context = {
    version,
    appSha: process.env.APP_SHA,
    buildToolingSha: process.env.TOOLING_SHA,
    buildRunId: process.env.GITHUB_RUN_ID,
    buildRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    resources
  };
  assert(
    /^[a-f0-9]{40}$/.test(context.appSha ?? "") &&
      /^[a-f0-9]{40}$/.test(context.buildToolingSha ?? "")
  );
  assert(
    /^[1-9]\d*$/.test(context.buildRunId ?? "") &&
      Number.isSafeInteger(context.buildRunAttempt) &&
      context.buildRunAttempt > 0
  );
  assert.equal(
    childProcess
      .execFileSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" })
      .trim(),
    context.appSha
  );
  assert.equal(
    childProcess
      .execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: path.resolve(__dirname, "../.."),
        encoding: "utf8"
      })
      .trim(),
    context.buildToolingSha
  );
  return context;
}
function stage(stageRoot, appRoot = process.cwd()) {
  stageRoot = path.resolve(stageRoot);
  appRoot = path.resolve(appRoot);
  const context = contextFromEnv(appRoot);
  const notes = releaseNotes(appRoot, context.version);
  const evidence = path.join(appRoot, "release-evidence");
  const inventory = readJson(path.join(evidence, "inventory.json"));
  assert.equal(inventory.app, context.appSha);
  assert.equal(inventory.tooling, context.buildToolingSha);
  assert.equal(inventory.builder, "26.16.1");
  assert.equal(inventory.packaged.length, 1);
  const bundle = inventory.packaged[0];
  assert.equal(
    bundle.packages.find((pkg) => pkg.path === "package.json")?.license,
    "GPL-3.0-or-later"
  );
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    assert.equal(
      bundle.notices.find((notice) => notice.path === name)?.sha256,
      digest(fs.readFileSync(path.join(appRoot, name))),
      "packaged notice missing/mismatched"
    );
  assert.equal(
    inventory.lockSha256,
    digest(fs.readFileSync(path.join(appRoot, "package-lock.json")))
  );
  for (const [name, hash] of [
    ["app-source.tar", inventory.sourceArchiveSha256],
    ["tooling-source.tar", inventory.toolingArchiveSha256]
  ])
    assert.equal(
      digest(regular(path.join(evidence, name), 128 * 1024 ** 2)),
      hash,
      "source archive mismatch"
    );
  assert(
    readJson(path.join(evidence, "upstream-source/manifest.json")).length >= 3,
    "existing pinned upstream source recipe required"
  );
  const dist = path.join(appRoot, "dist");
  const names = verifyMetadata(dist, "windows", context.version);
  fs.mkdirSync(stageRoot);
  for (const kind of PARTS) fs.mkdirSync(path.join(stageRoot, kind));
  for (const name of names)
    fs.copyFileSync(
      path.join(dist, name),
      path.join(stageRoot, "windows", name),
      fs.constants.COPYFILE_EXCL
    );
  const provenance = {
    schema: 1,
    version: context.version,
    platform: "windows",
    signing: "unsigned",
    app: context.appSha,
    tooling: context.buildToolingSha,
    run: context.buildRunId,
    files: names.map((name) => {
      const bytes = fs.readFileSync(path.join(stageRoot, "windows", name));
      return { name, size: bytes.length, sha256: digest(bytes) };
    })
  };
  writeJson(path.join(stageRoot, "windows/provenance-windows.json"), provenance);
  fs.writeFileSync(path.join(stageRoot, "sources/release-notes.md"), notes, { flag: "wx" });
  childProcess.execFileSync(
    "tar",
    ["-czf", `sources/source-notices-windows-${context.version}.tar.gz`, "-C", evidence, "."],
    { cwd: stageRoot }
  );
  for (const [source, target] of [
    [path.join(appRoot, "package-lock.json"), "package-lock.json"],
    [path.join(evidence, "inventory.json"), "inventory.json"],
    [path.join(evidence, "audit.json"), "audit.json"]
  ])
    fs.copyFileSync(source, path.join(stageRoot, "security", target), fs.constants.COPYFILE_EXCL);
  const security = childProcess.execFileSync(
    process.execPath,
    [
      path.join(__dirname, "release-security-audit.cjs"),
      path.join(stageRoot, "security/inventory.json"),
      path.join(stageRoot, "security/audit.json"),
      path.join(stageRoot, "windows/provenance-windows.json"),
      path.join(stageRoot, "security/package-lock.json")
    ],
    { cwd: appRoot, maxBuffer: 8 * 1024 ** 2 }
  );
  assert.equal(
    JSON.parse(security).status,
    "REVIEWED_SOURCE_ONLY",
    "bound reviewed security evidence required"
  );
  fs.writeFileSync(path.join(stageRoot, "security/security-signoff.json"), security, {
    flag: "wx"
  });
  writeJson(path.join(stageRoot, "context.json"), context);
  return context;
}
function createCandidate(stageRoot, metadata, baseline, context) {
  assert.deepEqual(Object.keys(metadata).sort(), [...PARTS].sort());
  const artifacts = Object.fromEntries(
    PARTS.map((kind) => {
      const item = metadata[kind];
      assert.equal(item.name, partName(kind, context.buildRunId, context.buildRunAttempt));
      assert.equal(item.expired, false);
      assert.equal(String(item.workflow_run?.id), context.buildRunId);
      assert.equal(item.workflow_run?.head_sha, context.buildToolingSha);
      assert(/^sha256:[a-f0-9]{64}$/.test(item.digest ?? ""), "upload digest required");
      const directory = path.join(stageRoot, kind);
      assert.deepEqual(
        fs.readdirSync(directory).sort(),
        expectedFiles(context.version, kind).sort(),
        "unexpected staged files"
      );
      const files = expectedFiles(context.version, kind).map((name) => {
        const bytes = regular(
          path.join(directory, name),
          kind === "security" ? 8 * 1024 ** 2 : 512 * 1024 ** 2
        );
        return { name, bytes: bytes.length, sha256: digest(bytes) };
      });
      return [
        kind,
        {
          id: String(item.id),
          name: item.name,
          bytes: item.size_in_bytes,
          sha256: item.digest.slice(7),
          files
        }
      ];
    })
  );
  const installer = artifacts.windows.files.find(
    (file) => file.name === expectedFiles(context.version, "windows")[0]
  );
  const c = validateCandidate({
    schema: "linka-windows-candidate-v1",
    repository: REPOSITORY,
    ...context,
    installer: {
      ...installer,
      sha512: createHash("sha512")
        .update(fs.readFileSync(path.join(stageRoot, "windows", installer.name)))
        .digest("base64")
    },
    baseline,
    artifacts
  });
  for (const kind of PARTS) verifyCandidateFiles(c, kind, path.join(stageRoot, kind));
  return c;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "preflight") {
    const [baselinePath] = args;
    assert(baselinePath, "usage: candidate-stage.cjs preflight <baseline.json>");
    const context = contextFromEnv(process.cwd());
    releaseNotes(process.cwd(), context.version); // Fail missing selected-app notes before heavy setup/build.
    writeJson(baselinePath, await selectBaseline(context.version, process.env.BASELINE_TAG));
  } else if (command === "stage") {
    assert(args.length === 1, "usage: candidate-stage.cjs stage <stageRoot>");
    stage(args[0]);
  } else if (command === "create") {
    const [root, metadataPath, baselinePath, output] = args;
    assert(
      args.length === 4,
      "usage: candidate-stage.cjs create <stageRoot> <metadata.json> <baseline.json> <candidate.json>"
    );
    writeJson(
      output,
      createCandidate(
        root,
        readJson(metadataPath),
        readJson(baselinePath),
        readJson(path.join(root, "context.json"))
      )
    );
  } else throw new Error("candidate-stage command required");
}
module.exports = { releaseNotes, selectBaseline, stage, createCandidate };
if (require.main === module)
  main().catch(() => {
    console.error(
      "Candidate staging rejected: check selected-app notes, baseline, provenance and evidence."
    );
    process.exitCode = 1;
  });
