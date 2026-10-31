const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "provision-eyelog.cjs"), "utf8");

for (const failure of [null, "resolution", "digest", "install", "missing"]) {
  test(`app provisioning fails closed before copying unsafe SDK: ${failure}`, async () => {
    const root = path.resolve("fixture-app");
    const eyelog = path.join(root, "node_modules/eyelog");
    const copies = [];
    const logs = [];
    const process = {};
    let installs = 0;
    const modules = {
      "node:assert/strict": assert,
      "node:path": path,
      "node:fs/promises": {
        mkdir: async () => {},
        lstat: async () => ({
          isFile: () => failure !== "missing",
          isSymbolicLink: () => false,
          size: 1
        }),
        copyFile: async (...args) => copies.push(args)
      },
      "node:module": {
        createRequire: () => ({ resolve: () => path.join(eyelog, "package.json") })
      },
      [path.join(root, "package-lock.json")]: {
        packages: {
          "node_modules/eyelog": {
            resolved: `git+https://fixture#${failure === "resolution" ? "bad" : "b1200c685fc11337e3eec1dda12045b2fdc99d3f"}`
          }
        }
      },
      [path.join(eyelog, "download.js")]: {
        SDK: {
          size: 389225,
          sha256:
            failure === "digest"
              ? "bad"
              : "7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d"
        },
        REQUIRED: ["EyeLog.exe", "EyeLog.exe.config"],
        install: async () => {
          installs++;
          if (failure === "install") throw new Error("sensitive transport detail");
        }
      }
    };
    await vm.runInNewContext(source, {
      __dirname: path.join(root, "scripts/ci"),
      process,
      console: { log: (message) => logs.push(message), error: (message) => logs.push(message) },
      require: (name) => {
        assert(Object.hasOwn(modules, name), name);
        return modules[name];
      }
    });
    assert.equal(process.exitCode, failure ? 1 : undefined);
    assert.equal(installs, ["resolution", "digest"].includes(failure) ? 0 : 1);
    assert.equal(copies.length, failure ? 0 : 2);
    if (failure)
      assert.deepEqual(logs, ["Pinned EyeLog provisioning failed; installation/build must stop"]);
    else
      assert(
        copies.every(
          ([from, to]) =>
            from.startsWith(eyelog) &&
            to.startsWith(
              path.join(root, "node_modules/@linkasu/tobii-electron/extraResources/bin")
            )
        )
      );
  });
}
