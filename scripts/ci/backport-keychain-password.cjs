// Upstream: electron-userland/electron-builder#10172 (v26 backport).
// Build-tool-only patch; never changes a credential, ACL, or application source.
const { readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { createHash } = require("node:crypto");
const PREIMAGE = "74a57bbc40326ffe65e8efe47db0ffc4e4fc6b689a52bb0be3413d5a148d5823";
const replacements = [
  [
    "return await importCerts(keychainFile, certPaths, cscPasswords);",
    "return await importCerts(keychainFile, certPaths, cscPasswords, keychainPassword);"
  ],
  [
    "async function importCerts(keychainFile, paths, keyPasswords) {",
    "async function importCerts(keychainFile, paths, keyPasswords, keychainPassword) {"
  ],
  [
    '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]',
    '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile]'
  ]
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function patchSource(source, version) {
  if (version !== "26.8.1") throw new Error("Unexpected app-builder-lib version");
  if (sha256(source) !== PREIMAGE)
    throw new Error("Unexpected macCodeSign.js preimage (including already patched)");
  let result = source;
  for (const [before, after] of replacements) {
    if (result.split(before).length !== 2) throw new Error("Non-unique upstream patch context");
    result = result.replace(before, after);
  }
  return result;
}
function patchRoot(root) {
  const dir = join(resolve(root), "node_modules/app-builder-lib");
  const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  const file = join(dir, "out/codeSign/macCodeSign.js");
  const source = readFileSync(file, "utf8");
  const result = patchSource(source, version);
  writeFileSync(file, result);
  return {
    version,
    preimage: PREIMAGE,
    patched: sha256(readFileSync(file)),
    upstream: "https://github.com/electron-userland/electron-builder/pull/10172"
  };
}
if (require.main === module) {
  if (process.argv.length !== 3) throw new Error("Usage: backport-keychain-password.cjs APP_ROOT");
  process.stdout.write(JSON.stringify(patchRoot(process.argv[2])) + "\n");
}
module.exports = { patchSource, patchRoot, PREIMAGE, sha256 };
