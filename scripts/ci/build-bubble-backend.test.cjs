const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { REQUIRED, validateRuntime, inspectPe } = require("./build-bubble-backend.cjs");

test("Windows and cross-build restores use the same explicitly locked runtime", () => {
  const project = fs.readFileSync(
    path.resolve(__dirname, "../../native/tobii-backend/TobiiBackend.csproj"),
    "utf8"
  );
  const lock = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../native/tobii-backend/packages.lock.json"),
      "utf8"
    )
  );
  assert.match(project, /<RuntimeIdentifier>win-x64<\/RuntimeIdentifier>/);
  assert(Object.hasOwn(lock.dependencies, ".NETFramework,Version=v4.8/win-x64"));
});

function pe(machine, managed) {
  const bytes = Buffer.alloc(512);
  bytes.write("MZ");
  bytes.writeUInt32LE(64, 60);
  bytes.writeUInt32LE(0x4550, 64);
  bytes.writeUInt16LE(machine, 68);
  bytes.writeUInt16LE(240, 84);
  bytes.writeUInt16LE(0x20b, 88);
  if (managed) bytes.writeUInt32LE(0x2000, 88 + 112 + 14 * 8);
  return bytes;
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bubble-runtime-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of REQUIRED) {
    fs.writeFileSync(
      path.join(directory, name),
      pe(name.includes("Interaction") ? 0x14c : 0x8664, name !== "Tobii.EyeX.Client.dll")
    );
  }
  return directory;
}

test("full runtime includes managed SDK and native x64, excludes build diagnostics", (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, "Linka.TobiiBackend.pdb"), "debug symbols");
  fs.writeFileSync(path.join(directory, "Tobii.Interaction.Net.xml"), "documentation");
  fs.writeFileSync(path.join(directory, "Linka.TobiiBackend.exe.config"), "<configuration />");
  assert.deepEqual(validateRuntime(directory), [...REQUIRED, "Linka.TobiiBackend.exe.config"]);
});

for (const failure of ["missing", "x86", "native-managed", "extra-dll", "empty", "directory"]) {
  test(`runtime fails closed: ${failure}`, (t) => {
    const directory = fixture(t);
    const native = path.join(directory, "Tobii.EyeX.Client.dll");
    if (failure === "missing") fs.unlinkSync(native);
    if (failure === "x86") fs.writeFileSync(native, pe(0x14c, false));
    if (failure === "native-managed") fs.writeFileSync(native, pe(0x8664, true));
    if (failure === "extra-dll")
      fs.writeFileSync(path.join(directory, "Unknown.dll"), pe(0x8664, false));
    if (failure === "empty") fs.writeFileSync(native, "");
    if (failure === "directory") {
      fs.unlinkSync(native);
      fs.mkdirSync(native);
    }
    assert.throws(() => validateRuntime(directory));
  });
}

test("malformed PE offsets are rejected without trusting the extension", () => {
  const bytes = pe(0x8664, false);
  bytes.writeUInt32LE(0xffffffff, 60);
  assert.throws(() => inspectPe(bytes, "invalid.dll"), /invalid PE header/);
  assert.throws(() => inspectPe(Buffer.from("MZ"), "invalid.dll"), /invalid DOS header/);
});

test(
  "non-Windows packaging does not invoke dotnet or execute the SDK",
  { skip: process.platform === "win32" },
  () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, "build-bubble-backend.cjs")], {
      env: { ...process.env, PATH: "" },
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Windows-only/);
  }
);

test("Windows extraResources are additive; other platforms exclude the staged backend", () => {
  const { build } = require("../../package.json");
  const builderRequire = createRequire(require.resolve("electron-builder"));
  const { getFileMatchers } = builderRequire("app-builder-lib/out/fileMatcher");
  const root = path.resolve(__dirname, "../..");
  const options = {
    defaultSrc: root,
    globalOutDir: path.join(root, "dist"),
    macroExpander: (value) => value,
    customBuildOptions: build.win
  };
  const windows = getFileMatchers(build, "extraResources", "/resources", options);
  assert.equal(windows.length, build.extraResources.length + build.win.extraResources.length);
  const other = getFileMatchers(build, "extraResources", "/resources", {
    ...options,
    customBuildOptions: {}
  });
  const shared = other.find((matcher) => matcher.from === path.join(root, "extraResources"));
  assert.equal(
    shared.createFilter()(path.join(root, "extraResources/bubble-backend/Linka.TobiiBackend.exe"), {
      isDirectory: () => false
    }),
    false
  );
});
