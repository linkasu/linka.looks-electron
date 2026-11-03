const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  OLD,
  INSTALLER,
  digest,
  metadata,
  verifyCandidate
} = require("./real-upgrade-contract.cjs");

test("feed metadata binds filename, size and sha512 to actual installer bytes", () => {
  const bytes = Buffer.from("synthetic installer — not executable");
  const feed = metadata(bytes);
  assert.equal(feed.version, "4.0.0");
  assert.equal(feed.path, INSTALLER);
  assert.equal(feed.size, bytes.length);
  assert.deepEqual(feed.files, [
    { url: INSTALLER, size: bytes.length, sha512: digest(bytes, "sha512", "base64") }
  ]);
  assert.equal(feed.sha512, feed.files[0].sha512);
  const corrupted = Buffer.from(bytes);
  corrupted[0] ^= 1;
  assert.notEqual(metadata(corrupted).sha512, feed.sha512);
  assert.notEqual(metadata(bytes.subarray(0, 5)).size, feed.size);
  assert.equal(OLD.version, "3.3.1");
  assert.equal(OLD.size, 148213565);
});

test("execution guard rejects untrusted provenance, ambiguous records and corrupted bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-contract-"));
  try {
    const bytes = Buffer.from("synthetic installer");
    const expected = {
      app: "a".repeat(40),
      tooling: "b".repeat(40),
      run: "123",
      sha256: digest(bytes)
    };
    const provenance = {
      schema: 1,
      version: "4.0.0",
      platform: "windows",
      signing: "unsigned",
      app: expected.app,
      tooling: expected.tooling,
      run: expected.run,
      files: [{ name: INSTALLER, size: bytes.length, sha256: expected.sha256 }]
    };
    const write = (value) =>
      fs.writeFileSync(path.join(directory, "provenance-windows.json"), JSON.stringify(value));
    fs.writeFileSync(path.join(directory, INSTALLER), bytes);
    write(provenance);
    assert.equal(verifyCandidate(directory, expected).installer, path.join(directory, INSTALLER));
    for (const key of ["app", "tooling", "run", "version", "platform", "signing", "schema"]) {
      write({ ...provenance, [key]: "wrong" });
      assert.throws(() => verifyCandidate(directory, expected), /provenance/);
    }
    write({ ...provenance, files: [...provenance.files, ...provenance.files] });
    assert.throws(() => verifyCandidate(directory, expected), /exactly one/);
    write(provenance);
    assert.throws(() => verifyCandidate(directory, { ...expected, sha256: "0".repeat(64) }));
    fs.writeFileSync(path.join(directory, INSTALLER), Buffer.alloc(bytes.length));
    assert.throws(() => verifyCandidate(directory, expected), /bytes mismatch/);
    fs.writeFileSync(path.join(directory, INSTALLER), bytes.subarray(0, 2));
    assert.throws(() => verifyCandidate(directory, expected), /size mismatch/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
