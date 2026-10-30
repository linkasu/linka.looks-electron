const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "packaged-resources-smoke.js"), "utf8");

for (const failure of [null, "missing", "directory", "stale", "empty"]) {
  test(`packaged SDK is byte-exact without executing EyeLog: ${failure}`, async () => {
    let exitCode;
    let compared = 0;
    const root = path.resolve("fixture-app/node_modules/eyelog");
    const modules = {
      fs: {
        existsSync: () => failure !== "missing",
        statSync: () => ({ isFile: () => failure !== "directory" }),
        readFileSync: (file) => {
          compared++;
          return Buffer.from(
            failure === "empty"
              ? ""
              : failure === "stale" && !file.startsWith(root)
                ? "old SDK"
                : "pinned SDK"
          );
        }
      },
      path,
      "node:assert/strict": assert,
      "node:module": { createRequire: () => ({ resolve: () => path.join(root, "package.json") }) },
      [path.join(root, "download.js")]: { REQUIRED: ["EyeLog.exe", "Tobii.EyeX.Client.dll"] }
    };
    await vm.runInNewContext(source, {
      __dirname: path.resolve("fixture-app/scripts/ci"),
      process: {
        platform: "win32",
        exit: (code) => {
          exitCode = code;
        }
      },
      console: { log() {}, error() {} },
      require: (name) => {
        assert(Object.hasOwn(modules, name), name);
        return modules[name];
      }
    });
    assert.equal(exitCode, failure ? 1 : undefined);
    assert.equal(
      compared,
      failure === null
        ? 4
        : ["missing", "directory"].includes(failure)
          ? 0
          : failure === "empty"
            ? 1
            : 2
    );
  });
}
