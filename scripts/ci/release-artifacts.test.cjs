const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("yaml");
const childProcess = require("node:child_process");
const {
  assets,
  digest,
  verifyMetadata,
  verifyPromotion,
  stage
} = require("./release-artifacts.cjs");

test("staging gives tar a local relative archive path, never a Windows drive/remote path", (t) => {
  const cwd = process.cwd();
  const env = { ...process.env };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-stage-"));
  t.after(() => {
    process.chdir(cwd);
    for (const key of ["APP_SHA", "TOOLING_SHA", "GITHUB_RUN_ID"]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    fs.rmSync(root, { recursive: true });
  });
  fs.symlinkSync(path.join(cwd, "node_modules"), path.join(root, "node_modules"), "junction");
  process.chdir(root);
  process.env.APP_SHA = "a".repeat(40);
  process.env.TOOLING_SHA = "b".repeat(40);
  process.env.GITHUB_RUN_ID = "123";
  fs.mkdirSync("dist");
  fs.mkdirSync("release-evidence");
  fs.writeFileSync("package.json", "{}");
  const notices = ["LICENSE", "THIRD_PARTY_NOTICES.md"].map((name) => {
    fs.writeFileSync(name, name);
    return { path: name, sha256: digest(Buffer.from(name)) };
  });
  fs.writeFileSync(
    "release-evidence/inventory.json",
    JSON.stringify({
      app: process.env.APP_SHA,
      tooling: process.env.TOOLING_SHA,
      builder: "26.16.1",
      packaged: [{ packages: [{ path: "package.json", license: "GPL-3.0-or-later" }], notices }]
    })
  );
  const expected = assets("windows");
  for (const name of expected.files) fs.writeFileSync(path.join("dist", name), name);
  const bytes = fs.readFileSync(path.join("dist", expected.installers[0]));
  const file = {
    url: expected.installers[0],
    size: bytes.length,
    sha512: digest(bytes, "sha512", "base64")
  };
  fs.writeFileSync(
    path.join("dist", expected.metadata),
    yaml.stringify({
      version: "3.3.1",
      files: [file],
      path: file.url,
      sha512: file.sha512
    })
  );
  const exec = childProcess.execFileSync;
  t.mock.method(childProcess, "execFileSync", (command, args) => {
    assert.equal(command, "tar");
    assert.equal(args[0], "-czf");
    assert(
      !path.isAbsolute(args[1]) && !args[1].includes(":"),
      "tar must not interpret an archive as remote"
    );
    return exec(command, args);
  });
  stage("windows");
  const provenance = JSON.parse(fs.readFileSync("release-ready/provenance-windows.json"));
  assert.equal(provenance.files.length, expected.files.length + 1);
  assert(fs.statSync("release-ready/source-notices-windows-3.3.1.tar.gz").size > 0);
});

test("promotion requires exact bytes, provenance and complete semantic updater metadata", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const app = "a".repeat(40),
    tooling = "b".repeat(40),
    run = "123";
  for (const platform of ["windows", "macos"]) {
    const expected = assets(platform);
    for (const name of expected.files) fs.writeFileSync(path.join(root, name), name);
    const files = expected.installers.map((url) => {
      const bytes = fs.readFileSync(path.join(root, url));
      return { url, size: bytes.length, sha512: digest(bytes, "sha512", "base64") };
    });
    const metadata = { version: "3.3.1", files, path: files[0].url, sha512: files[0].sha512 };
    const filename = path.join(root, expected.metadata);
    const valid = yaml.stringify(metadata);
    fs.writeFileSync(filename, valid);
    verifyMetadata(root, platform);
    for (const mutate of [
      (m) => {
        m.version = "3.3.0";
      },
      (m) => {
        m.files = [];
      },
      (m) => {
        m.files[0].url = "../outside.exe";
      },
      (m) => {
        m.files[0].size++;
      },
      (m) => {
        m.files[0].sha512 = "wrong";
      },
      (m) => {
        m.files.push(m.files[0]);
      },
      (m) => {
        m.path = "wrong";
      }
    ]) {
      const changed = structuredClone(metadata);
      mutate(changed);
      fs.writeFileSync(filename, yaml.stringify(changed));
      assert.throws(() => verifyMetadata(root, platform));
    }
    fs.writeFileSync(filename, valid);
    const source = `source-notices-${platform}-3.3.1.tar.gz`;
    fs.writeFileSync(path.join(root, source), "fixture sources/notices");
    fs.writeFileSync(
      path.join(root, `provenance-${platform}.json`),
      JSON.stringify({
        schema: 1,
        version: "3.3.1",
        platform,
        app,
        tooling,
        run,
        files: [...expected.files, source].map((name) => {
          const bytes = fs.readFileSync(path.join(root, name));
          return { name, size: bytes.length, sha256: digest(bytes) };
        })
      })
    );
  }
  verifyPromotion(root, app, tooling, run);
  assert.throws(() => verifyPromotion(root, app, tooling, "124"));
  const target = path.join(root, assets("macos").installers[0]);
  const original = fs.readFileSync(target);
  fs.writeFileSync(target, "changed accepted bytes");
  assert.throws(() => verifyPromotion(root, app, tooling, run));
  fs.writeFileSync(target, original);
  fs.writeFileSync(path.join(root, "unaccepted.exe"), "extra");
  assert.throws(() => verifyPromotion(root, app, tooling, run));
});
