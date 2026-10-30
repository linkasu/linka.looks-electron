const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const nodeCrypto = require("node:crypto");

const source = readFileSync("node_modules/app-builder-lib/out/codeSign/macCodeSign.js", "utf8");

async function exercise(source, installer) {
  const calls = [];
  const moduleExports = {};
  const mocks = {
    "builder-util": {
      exec: async (file, args) => {
        assert.equal(file, "/usr/bin/security");
        calls.push(args);
        return "";
      }
    },
    "../util/dynamicImport": {},
    crypto: nodeCrypto,
    "fs/promises": {},
    "lazy-val": {
      Lazy: class {
        constructor() {}
      }
    },
    os: { tmpdir: () => "/synthetic" },
    path: require("node:path"),
    "temp-file": {},
    "../util/flags": {},
    "./codesign": { importCertificate: async (value) => value }
  };
  vm.runInNewContext(source, {
    exports: moduleExports,
    process: { env: { TRAVIS: "true" } },
    require: (name) => {
      assert(Object.hasOwn(mocks, name), `unexpected dependency: ${name}`);
      return mocks[name];
    }
  });
  await moduleExports.createKeychain({
    tmpDir: {},
    currentDir: "/synthetic/app",
    cscLink: "app.p12",
    cscKeyPassword: "fixture-certificate-password",
    ...(installer
      ? { cscILink: "installer.p12", cscIKeyPassword: "fixture-installer-password" }
      : {})
  });
  const argument = (args, flag) => args[args.indexOf(flag) + 1];
  const keychain = argument(
    calls.find((args) => args[0] === "create-keychain"),
    "-p"
  );
  const imports = calls.filter((args) => args[0] === "import");
  const partitions = calls.filter((args) => args[0] === "set-key-partition-list");
  assert.equal(partitions.length, installer ? 2 : 1);
  assert.deepEqual(
    imports.map((args) => argument(args, "-P")),
    installer
      ? ["fixture-certificate-password", "fixture-installer-password"]
      : ["fixture-certificate-password"]
  );
  for (const args of imports) assert.notEqual(argument(args, "-P"), keychain);
  for (const args of partitions) assert.equal(argument(args, "-k"), keychain);
}

for (const installer of [false, true]) {
  test(`official candidate separates certificate/keychain passwords, installer=${installer}`, () =>
    exercise(source, installer));
  test(`negative control detects certificate-password regression, installer=${installer}`, async () => {
    const broken = source.replace(
      '"-s", "-k", keychainPassword, keychainFile',
      '"-s", "-k", password, keychainFile'
    );
    assert.notEqual(broken, source);
    await assert.rejects(exercise(broken, installer), { code: "ERR_ASSERTION" });
  });
}
