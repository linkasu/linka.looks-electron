const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const path = require("node:path");
const { patchSource, PREIMAGE, sha256 } = require("./backport-keychain-password.cjs");
// CI obtains this exact npm package using package-lock integrity. No actual security
// process, certificate, keychain, network, or filesystem call runs in the VM.
const original = readFileSync(process.env.SIGNING_FIXTURE, "utf8");
const fixed = patchSource(original, "26.8.1");
async function exercise(source, installer) {
  const calls = [];
  const context = {
    process: { env: { TRAVIS: "true" } },
    path,
    crypto_1: crypto,
    os_1: { tmpdir: () => "/synthetic" },
    removeKeychain: async () => {},
    listUserKeychains: async () => [],
    codesign_1: { importCertificate: async (value) => value },
    builder_util_1: {
      exec: async (file, args) => {
        calls.push({ file, args });
        return "";
      }
    }
  };
  vm.createContext(context);
  const start = source.indexOf("async function createKeychain(");
  const end = source.indexOf("async function sign(opts)", start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end) + "\nglobalThis.run = createKeychain;", context);
  await context.run({
    tmpDir: {},
    currentDir: "/synthetic/app",
    cscLink: "app.p12",
    cscKeyPassword: "app-import-only",
    ...(installer ? { cscILink: "installer.p12", cscIKeyPassword: "installer-import-only" } : {})
  });
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  const keychainPassword = value(calls.find((c) => c.args[0] === "create-keychain").args, "-p");
  const partitions = calls.filter((c) => c.args[0] === "set-key-partition-list");
  const imports = calls.filter((c) => c.args[0] === "import");
  return {
    keychainPassword,
    partitions: partitions.map((c) => value(c.args, "-k")),
    imports: imports.map((c) => value(c.args, "-P"))
  };
}
test("exact npm preimage and only three upstream replacements", () => {
  assert.equal(sha256(original), PREIMAGE);
  const a = original.split("\n"),
    b = fixed.split("\n");
  assert.equal(a.length, b.length);
  assert.equal(a.filter((line, i) => line !== b[i]).length, 3);
});
for (const installer of [false, true])
  test(`password separation, installer=${installer}`, async () => {
    const bad = await exercise(original, installer);
    assert.notEqual(bad.partitions[0], bad.keychainPassword); // red control
    const good = await exercise(fixed, installer);
    assert.equal(good.partitions.length, installer ? 2 : 1);
    for (const password of good.partitions) assert.equal(password, good.keychainPassword);
    assert.deepEqual(
      good.imports,
      installer ? ["app-import-only", "installer-import-only"] : ["app-import-only"]
    );
  });
test("reject wrong version, drift and second application", () => {
  assert.throws(() => patchSource(original, "26.16.1"));
  assert.throws(() => patchSource(original + "\n", "26.8.1"));
  assert.throws(() => patchSource(fixed, "26.8.1"));
});
