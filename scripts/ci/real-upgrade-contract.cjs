// The updater receives metadata for the exact accepted bytes, never a latest artifact lookup.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");

const OLD = Object.freeze({
  version: "3.3.1",
  source: "321e92fd43b552cb3b5eb973e65f4e64434a71fd",
  url: "https://github.com/linkasu/linka.looks-electron/releases/download/v3.3.1/linka.looks-3.3.1-win-x64.exe",
  size: 148213565,
  sha256: "6104675c084f502e1fdbc6f6c68487d8ccff47f3e39529e4358964452f027735"
});
const INSTALLER = "linka.looks-4.0.0-win-x64.exe";
const digest = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);

function metadata(bytes, version = "4.0.0") {
  const sha512 = digest(bytes, "sha512", "base64");
  return {
    version,
    files: [{ url: INSTALLER, sha512, size: bytes.length }],
    path: INSTALLER,
    sha512,
    size: bytes.length
  };
}

function verifyCandidate(directory, expected) {
  assert(/^[a-f0-9]{40}$/.test(expected.app));
  assert(/^[a-f0-9]{40}$/.test(expected.tooling));
  assert(/^[1-9]\d*$/.test(expected.run));
  assert(/^[a-f0-9]{64}$/.test(expected.sha256));
  const provenance = JSON.parse(
    fs.readFileSync(path.join(directory, "provenance-windows.json"), "utf8")
  );
  for (const [key, value] of Object.entries({
    schema: 1,
    version: "4.0.0",
    platform: "windows",
    signing: "unsigned",
    app: expected.app,
    tooling: expected.tooling,
    run: expected.run
  })) {
    assert.equal(provenance[key], value, `candidate provenance: ${key}`);
  }
  const records = provenance.files.filter((file) => file.name === INSTALLER);
  assert.equal(records.length, 1, "exactly one installer record required");
  const installer = path.join(directory, INSTALLER);
  assert(fs.lstatSync(installer).isFile(), "installer must be a regular file");
  const bytes = fs.readFileSync(installer);
  assert.equal(records[0].size, bytes.length, "candidate size mismatch");
  assert.equal(records[0].sha256, expected.sha256, "trusted digest mismatch");
  assert.equal(digest(bytes), expected.sha256, "candidate bytes mismatch");
  return { installer, metadata: metadata(bytes), provenance };
}

async function waitForProcessExit(child, timeout) {
  if (child.exitCode === null && child.signalCode === null)
    await once(child, "exit", { signal: AbortSignal.timeout(timeout) });
  return { pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode };
}

module.exports = { OLD, INSTALLER, digest, metadata, verifyCandidate, waitForProcessExit };

if (require.main === module) {
  verifyCandidate(process.argv[2], {
    app: process.env.UPGRADE_APP_SHA,
    tooling: process.env.UPGRADE_TOOLING_SHA,
    run: process.env.UPGRADE_RUN_ID,
    sha256: process.env.UPGRADE_INSTALLER_SHA256
  });
  console.log("Exact candidate provenance and installer bytes verified.");
}
