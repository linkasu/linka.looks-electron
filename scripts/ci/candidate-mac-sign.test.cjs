const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const source = readFileSync("node_modules/app-builder-lib/out/macPackager.js", "utf8");
const start = source.indexOf("    async sign(appPath,");
const end = source.indexOf("    //noinspection JSMethodCanBeStatic", start);
assert(start > 0 && end > start);
const { sign } = vm.runInNewContext(`({${source.slice(start, end)}})`, {
  macCodeSign_1: { isSignAllowed: () => true },
  macosVersion_1: { isMacOsHighSierra: () => true }
});

for (const isMas of [false, true]) {
  test(`real candidate sign method awaits signing before notarization, MAS=${isMas}`, async () => {
    const events = [];
    const config = { type: "distribution", identity: "fixture" };
    const identity = { name: "fixture" };
    const options = { app: "/synthetic/app", arch: 3 };
    const receiver = {
      codeSigningInfo: { value: Promise.resolve({ keychainFile: "/synthetic/keychain" }) },
      helper: {
        findSigningIdentity: async (mas, development, qualifier, keychain, actualConfig) => {
          assert.deepEqual(
            [mas, development, qualifier, keychain, actualConfig],
            [isMas, false, "fixture", "/synthetic/keychain", config]
          );
          return identity;
        },
        buildSignOptions: async (...args) => {
          assert.deepEqual(args, [
            options.app,
            identity,
            "distribution",
            isMas,
            config,
            "/synthetic/keychain",
            3
          ]);
          return options;
        },
        notarizeIfProvided: async (app) => {
          assert.equal(app, options.app);
          assert.deepEqual(events, ["signed"]);
          events.push("notarized");
        }
      },
      doSign: async (...args) => {
        assert.deepEqual(args, [options, config, identity]);
        await Promise.resolve();
        events.push("signed");
      }
    };
    assert.equal(await sign.call(receiver, options.app, config, 3, isMas), true);
    assert.deepEqual(events, isMas ? ["signed"] : ["signed", "notarized"]);
    receiver.doSign = async () => {
      throw new Error("synthetic signing failure");
    };
    events.length = 0;
    await assert.rejects(
      sign.call(receiver, options.app, config, 3, isMas),
      /synthetic signing failure/
    );
    assert.deepEqual(events, []);
    receiver.helper.findSigningIdentity = async () => null;
    assert.equal(await sign.call(receiver, options.app, config, 3, isMas), false);
    assert.deepEqual(events, []);
  });
}
