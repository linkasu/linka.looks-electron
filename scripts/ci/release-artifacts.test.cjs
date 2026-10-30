const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("yaml");
const { assets, digest, verifyMetadata, verifyPromotion } = require("./release-artifacts.cjs");

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
