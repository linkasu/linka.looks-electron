const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const { fixture } = require("./candidate-contract.test.cjs");
const { digest, REPOSITORY } = require("./candidate-contract.cjs");
const stage = require("./candidate-stage.cjs");

test("selected-app release notes use canonical future path and historical fallback only", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-stage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs/releases"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/release-400-notes.md"), "# Historical 4.0.0\nNotes\n");
  assert.equal(stage.releaseNotes(root, "4.0.0").toString(), "# Historical 4.0.0\nNotes\n");
  assert.throws(() => stage.releaseNotes(root, "4.1.0"));
  fs.writeFileSync(path.join(root, "docs/releases/4.1.0.md"), "# Selected app 4.1.0\nNotes\n");
  assert.equal(stage.releaseNotes(root, "4.1.0").toString(), "# Selected app 4.1.0\nNotes\n");
  fs.writeFileSync(path.join(root, "docs/releases/4.0.0.md"), "# Canonical 4.0.0\nNotes\n");
  assert.equal(stage.releaseNotes(root, "4.0.0").toString(), "# Canonical 4.0.0\nNotes\n");
});
test("notes canonicalize only metadata CRLF and reject wrong heading, malformed text or oversized body", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-notes-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs/releases"), { recursive: true });
  const file = path.join(root, "docs/releases/5.2.1.md");
  const crlf = "# LINKa 5.2.1\r\n\r\nReviewed changes.\r\n";
  fs.writeFileSync(file, crlf);
  assert.equal(stage.releaseNotes(root, "5.2.1").toString(), crlf.replace(/\r\n/g, "\n"));
  assert.equal(
    fs.readFileSync(file, "utf8"),
    crlf,
    "selected-app source bytes must stay unchanged"
  );
  const prefix = "# LINKa 5.2.1\n";
  fs.writeFileSync(file, prefix + "x".repeat(128 * 1024 - Buffer.byteLength(prefix)));
  assert.equal(stage.releaseNotes(root, "5.2.1").length, 128 * 1024);
  for (const invalid of [
    "# LINKa 5.2.0\nWrong version\n",
    "# LINKa 5.2.1 and 5.2.0\nAmbiguous version\n",
    "No version heading, 5.2.1 only in prose.\n",
    "# LINKa 5.2.1\rLone CR\n",
    "\ufeff# LINKa 5.2.1\nBOM\n",
    Buffer.from([0xc3, 0x28]),
    "# LINKa 5.2.1\n" + "x".repeat(128 * 1024)
  ]) {
    fs.writeFileSync(file, invalid);
    assert.throws(() => stage.releaseNotes(root, "5.2.1"));
  }
});
test("baseline pins highest published older stable release and dereferences exact tag", async (t) => {
  const { candidate } = fixture();
  const asset = {
    id: 10,
    name: "linka.looks-4.0.0-win-x64.exe",
    size: 123,
    digest: `sha256:${"a".repeat(64)}`,
    browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v4.0.0/linka.looks-4.0.0-win-x64.exe`
  };
  const release = {
    id: 9,
    tag_name: "v4.0.0",
    draft: false,
    prerelease: false,
    published_at: "2026-01-01T00:00:00Z",
    assets: [asset]
  };
  const list = [
    release,
    { ...release, id: 11, tag_name: "v3.9.0" },
    { ...release, tag_name: "v4.1.0" },
    { ...release, tag_name: "v4.0.1", draft: true },
    { ...release, tag_name: "v4.0.2", prerelease: true }
  ];
  t.mock.method(global, "fetch", async (url) => {
    const endpoint = new URL(url).pathname;
    const value = endpoint.endsWith("/releases")
      ? list
      : endpoint.endsWith("/git/ref/tags/v4.0.0")
        ? { object: { type: "tag", sha: "d".repeat(40) } }
        : { object: { type: "commit", sha: candidate.baseline.sourceSha } };
    return new Response(JSON.stringify(value));
  });
  const baseline = await stage.selectBaseline("4.1.0");
  assert.equal(baseline.version, "4.0.0");
  assert.equal(baseline.sourceSha, candidate.baseline.sourceSha);
  assert.equal(baseline.installer.sha256, "a".repeat(64));
  await assert.rejects(stage.selectBaseline("4.1.0", "v3.9.0"));
  delete asset.digest;
  await assert.rejects(stage.selectBaseline("4.1.0"));
});
test("create descriptor binds actual files and upload metadata, rejects tampering", (t) => {
  const { candidate, payload } = fixture();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-create-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const metadata = {};
  for (const [kind, part] of Object.entries(candidate.artifacts)) {
    fs.mkdirSync(path.join(root, kind));
    for (const file of part.files) fs.writeFileSync(path.join(root, kind, file.name), payload);
    metadata[kind] = {
      id: Number(part.id),
      name: part.name,
      size_in_bytes: part.bytes,
      digest: `sha256:${part.sha256}`,
      expired: false,
      workflow_run: { id: 123, head_sha: candidate.buildToolingSha }
    };
  }
  const context = {
    version: candidate.version,
    appSha: candidate.appSha,
    buildToolingSha: candidate.buildToolingSha,
    buildRunId: candidate.buildRunId,
    buildRunAttempt: candidate.buildRunAttempt,
    resources: candidate.resources
  };
  const actual = stage.createCandidate(root, metadata, candidate.baseline, context);
  assert.equal(actual.installer.sha256, digest(payload));
  assert.deepEqual(actual.resources, candidate.resources);
  assert.deepEqual(actual.artifacts.sources.files.map((file) => file.name).sort(), [
    "release-notes.md",
    "source-notices-windows-4.1.0.tar.gz"
  ]);
  metadata.windows.digest = "sha256:wrong";
  assert.throws(() => stage.createCandidate(root, metadata, candidate.baseline, context));
  metadata.windows.digest = `sha256:${candidate.artifacts.windows.sha256}`;
  fs.writeFileSync(path.join(root, "windows/extra"), payload);
  assert.throws(() => stage.createCandidate(root, metadata, candidate.baseline, context));
});

test("stage reuses legal source evidence, separate notes/security and relative Windows tar path", (t) => {
  const { candidate, origin } = fixture();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-stage-full-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const output = path.join(root, "staged");
  for (const name of [
    "docs/releases",
    "build",
    "dist",
    "release-evidence/upstream-source",
    "release-evidence/notices"
  ])
    fs.mkdirSync(path.join(app, name), { recursive: true });
  const write = (name, value) =>
    fs.writeFileSync(
      path.join(app, name),
      typeof value === "string" ? value : JSON.stringify(value)
    );
  write("package.json", { version: candidate.version });
  write("build/predictor-approval.json", {
    modelSha256: candidate.resources.modelSha256,
    binaries: { "win32-x64": candidate.resources.runtimeSha256 }
  });
  write("package-lock.json", {
    version: candidate.version,
    packages: { "": { version: candidate.version } }
  });
  const lockSha256 = digest(fs.readFileSync(path.join(app, "package-lock.json")));
  write("docs/releases/4.1.0.md", "# LINKa 4.1.0\r\nselected-app notes\r\n");
  write("LICENSE", "GPL");
  write("THIRD_PARTY_NOTICES.md", "source offers");
  write("release-evidence/app-source.tar", "app source");
  write("release-evidence/tooling-source.tar", "tooling source");
  write("release-evidence/notices/0.txt", "shipped notices");
  write("release-evidence/upstream-source/manifest.json", [{}, {}, {}]);
  write("release-evidence/audit.json", {});
  write("release-evidence/inventory.json", {
    app: candidate.appSha,
    tooling: candidate.buildToolingSha,
    builder: "26.16.1",
    lockSha256,
    sourceArchiveSha256: digest(Buffer.from("app source")),
    toolingArchiveSha256: digest(Buffer.from("tooling source")),
    packaged: [
      {
        packages: [{ path: "package.json", license: "GPL-3.0-or-later" }],
        notices: ["LICENSE", "THIRD_PARTY_NOTICES.md"].map((name) => ({
          path: name,
          sha256: digest(fs.readFileSync(path.join(app, name)))
        }))
      }
    ]
  });
  const installer = Buffer.from("installer");
  const sha512 = createHash("sha512").update(installer).digest("base64");
  write(`dist/${candidate.installer.name}`, "installer");
  write(`dist/${candidate.installer.name}.blockmap`, "blockmap");
  write(
    "dist/latest.yml",
    require("yaml").stringify({
      version: candidate.version,
      files: [{ url: candidate.installer.name, size: installer.length, sha512 }],
      path: candidate.installer.name,
      sha512
    })
  );
  const env = { ...process.env };
  Object.assign(process.env, {
    APP_SHA: candidate.appSha,
    TOOLING_SHA: candidate.buildToolingSha,
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2"
  });
  t.after(() => {
    for (const key of ["APP_SHA", "TOOLING_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });
  t.mock.method(childProcess, "execFileSync", (command, args, options) => {
    if (command === "git")
      return options.cwd === app ? candidate.appSha : candidate.buildToolingSha;
    if (command === "tar") {
      assert.deepEqual(args, [
        "-czf",
        "sources/source-notices-windows-4.1.0.tar.gz",
        "-C",
        path.join(app, "release-evidence"),
        "."
      ]);
      assert.equal(options.cwd, output);
      fs.writeFileSync(path.join(output, args[1]), "all source and notices");
      return Buffer.alloc(0);
    }
    assert.equal(command, process.execPath);
    assert.equal(path.basename(args[0]), "release-security-audit.cjs");
    return Buffer.from(JSON.stringify({ status: "REVIEWED_SOURCE_ONLY" }));
  });
  const context = stage.stage(output, app);
  assert.equal(
    fs.readFileSync(path.join(output, "sources/release-notes.md"), "utf8"),
    "# LINKa 4.1.0\nselected-app notes\n"
  );
  assert.deepEqual(
    fs.readdirSync(path.join(output, "windows")).sort(),
    candidate.artifacts.windows.files.map((file) => file.name).sort()
  );
  assert.deepEqual(
    fs.readdirSync(path.join(output, "security")).sort(),
    candidate.artifacts.security.files.map((file) => file.name).sort()
  );
  const descriptor = stage.createCandidate(output, origin.artifacts, candidate.baseline, context);
  const notes = Buffer.from("# LINKa 4.1.0\nselected-app notes\n");
  assert.deepEqual(
    descriptor.artifacts.sources.files.find((file) => file.name === "release-notes.md"),
    { name: "release-notes.md", bytes: notes.length, sha256: digest(notes) }
  );
  assert.throws(() => stage.stage(output, app), /EEXIST/);
});
