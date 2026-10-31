const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { createRequire } = require("node:module");

test("pinned SDK raw/invariant-culture protocol fits the unchanged Tobii adapter without hardware", () => {
  const tobiiRoot = path.resolve("node_modules/@linkasu/tobii-electron");
  const tobiiRequire = createRequire(path.join(tobiiRoot, "package.json"));
  const eyelogRoot = path.dirname(tobiiRequire.resolve("eyelog/package.json"));
  function load(file, mocks) {
    const moduleExports = {};
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      exports: moduleExports,
      __dirname: path.dirname(file),
      console,
      require: (name) => {
        assert(Object.hasOwn(mocks, name), `unexpected dependency ${name}`);
        return mocks[name];
      }
    });
    return moduleExports;
  }
  const children = [];
  const processModule = load(path.join(eyelogRoot, "dist/TobiiProcess.js"), {
    child_process: {
      spawn: (exe, args) => {
        assert.equal(exe, "/synthetic/EyeLog.exe");
        assert.deepEqual(Array.from(args), ["--raw"]);
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = new PassThrough();
        child.kill = () => {
          child.killed = true;
        };
        children.push(child);
        return child;
      }
    },
    tsee: { EventEmitter },
    path,
    os: { platform: () => "win32" }
  });
  const bound = load(path.join(eyelogRoot, "dist/bound.js"), {});
  const adapter = load(path.join(tobiiRoot, "dist/main/EyeLogTrackerProcess.js"), {
    events: { EventEmitter },
    "eyelog/dist/TobiiProcess": processModule,
    "eyelog/dist/bound": bound,
    "./resolvePackageExtraResource": {}
  });
  const tracker = new adapter.EyeLogTrackerProcess(() => "/synthetic/EyeLog.exe");
  tracker.setScaleFactor(2);
  tracker.setScreenRect(0, 0, 1920, 1080);
  const events = [];
  tracker.on("gaze", (point) => events.push([point.x, point.y, point.valid]));
  const child = children[0];
  child.stdout.emit("data", Buffer.from("gaze:200.5,100.25,"));
  assert.equal(events.length, 0);
  child.stdout.emit("data", Buffer.from("1234.5\r\ngaze:200,5,100,25,1234,5\ngaze:NaN,0,1\n"));
  assert.deepEqual(events, [
    [100.25, 50.125, true],
    [100.25, 50.125, true]
  ]);
  const writes = [];
  child.stdin.on("data", (data) => writes.push(data.toString()));
  tracker.setBounds([{ x: 1, y: 2, width: 3, height: 4 }]);
  tracker.setTimeout(500);
  assert.deepEqual(writes, ["1,2,3,4\n", "timeout:500\n"]);
  const legacy = [];
  tracker.on("enter", (index) => legacy.push(["enter", index]));
  tracker.on("click", (...args) => legacy.push(["click", ...args]));
  tracker.on("exit", () => legacy.push(["exit"]));
  child.stdout.emit("data", Buffer.from("enter:2\nclick:2,1\nexit\n"));
  assert.deepEqual(legacy, [["enter", 2], ["click", 2, 1], ["exit"]]);
  tracker.destroy();
  assert.equal(child.killed, true);
});
