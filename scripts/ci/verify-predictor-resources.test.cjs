const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { architecture } = require("./verify-predictor-resources.cjs");

const script = path.join(__dirname, "verify-predictor-resources.cjs");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const hostWindows = process.platform === "win32";
const defaultPlatform = hostWindows ? "win32" : "darwin";
const defaultArch = hostWindows ? "x64" : "arm64";
const defaultExecutable = hostWindows ? "lp-electron.exe" : "lp-electron";

function binary(platform, arch) {
  const data = Buffer.alloc(512);
  if (platform === "win32") {
    data.write("MZ");
    data.writeUInt32LE(128, 60);
    data.write("PE\0\0", 128);
    data.writeUInt16LE(arch === "x64" ? 0x8664 : 0xaa64, 132);
    data.writeUInt16LE(240, 148);
    data.writeUInt16LE(2, 150);
    data.writeUInt16LE(0x20b, 152);
  } else {
    data.writeUInt32LE(0xfeedfacf, 0);
    data.writeUInt32LE(arch === "x64" ? 0x01000007 : 0x0100000c, 4);
    data.writeUInt32LE(2, 12);
  }
  return data;
}

function fixture(t, platform = defaultPlatform, arch = defaultArch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "predictor-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const resources = path.join(root, "Resources");
  const predictor = path.join(resources, "predictor-resources");
  fs.mkdirSync(predictor, { recursive: true });
  const executable = path.join(predictor, platform === "win32" ? "lp-electron.exe" : "lp-electron");
  const model = path.join(predictor, "model.lpk");
  fs.writeFileSync(executable, binary(platform, arch), { mode: 0o755 });
  fs.writeFileSync(model, "synthetic fixture only; not a production model");
  for (const name of ["LICENSE", "MODEL_NOTICE.md"])
    fs.writeFileSync(path.join(predictor, name), name);
  const approval = path.join(root, "predictor-approval.json");
  const approve = () => {
    const manifest = {
      modelSha256: hash(fs.readFileSync(model)),
      binaries: {
        "win32-x64": hash(binary("win32", "x64")),
        "darwin-arm64": hash(binary("darwin", "arm64")),
        "darwin-x64": hash(binary("darwin", "x64"))
      }
    };
    manifest.binaries[`${platform}-${arch}`] = hash(fs.readFileSync(executable));
    fs.writeFileSync(approval, JSON.stringify(manifest));
  };
  approve();
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  const check = () => run(resources, platform, arch, approval);
  return { resources, predictor, executable, model, approval, approve, check, run };
}

function fails(result, message) {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, message);
}

function approved(f, platform, arch) {
  architecture(f.executable, platform, arch);
  const result = f.check();
  if (hostWindows && platform === "darwin") fails(result, /missing macOS executable bit/i);
  else assert.equal(result.status, 0, result.stderr);
}

function invalidArchitecture(f, platform, arch, message) {
  assert.throws(() => architecture(f.executable, platform, arch), message);
  fails(f.check(), hostWindows && platform === "darwin" ? /executable bit/i : message);
}

for (const [platform, arch] of [
  ["win32", "x64"],
  ["darwin", "arm64"],
  ["darwin", "x64"]
]) {
  const capability =
    hostWindows && platform === "darwin"
      ? "has valid architecture but host cannot verify macOS executable permissions"
      : "passes static contract only";
  test(`approved synthetic ${platform}-${arch} fixture ${capability}`, (t) => {
    approved(fixture(t, platform, arch), platform, arch);
  });
}

test("default host fixture passes before negative-control mutations", (t) => {
  assert.equal(fixture(t).check().status, 0);
});

test("missing external approval fails closed", (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.approval);
  fails(f.check(), /approval/i);
});

test("oversized model fails before hashing even with stale approved hash", (t) => {
  const f = fixture(t, "win32", "x64");
  fs.truncateSync(f.model, 128 * 1024 * 1024 + 1);
  fails(f.check(), /model.*128 MiB/i);
});

test("Windows approval needs only its own binary and the model", (t) => {
  const f = fixture(t, "win32", "x64");
  const approval = JSON.parse(fs.readFileSync(f.approval));
  delete approval.binaries["darwin-arm64"];
  delete approval.binaries["darwin-x64"];
  fs.writeFileSync(f.approval, JSON.stringify(approval));
  assert.equal(f.check().status, 0);
  for (const mutate of [
    (value) => delete value.binaries["win32-x64"],
    (value) => delete value.modelSha256
  ]) {
    const invalid = structuredClone(approval);
    mutate(invalid);
    fs.writeFileSync(f.approval, JSON.stringify(invalid));
    fails(f.check(), /approval/i);
  }
});

for (const content of [
  "{}",
  "null",
  "not JSON",
  JSON.stringify({ modelSha256: "x", binaries: {} })
]) {
  test(`invalid approval fails: ${content}`, (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.approval, content);
    fails(f.check(), /approval/i);
  });
}

test("packaged approval is not a trusted external manifest", (t) => {
  const f = fixture(t);
  const packagedApproval = path.join(f.resources, "predictor-approval.json");
  fs.copyFileSync(f.approval, packagedApproval);
  fails(f.run(f.resources, defaultPlatform, defaultArch, packagedApproval), /outside/i);
});

for (const name of [defaultExecutable, "model.lpk", "LICENSE", "MODEL_NOTICE.md"]) {
  for (const problem of ["missing", "empty", "directory"]) {
    test(`${name}: ${problem} fails`, (t) => {
      const f = fixture(t);
      const file = path.join(f.predictor, name);
      fs.unlinkSync(file);
      if (problem === "empty") fs.writeFileSync(file, "");
      if (problem === "directory") fs.mkdirSync(file);
      fails(f.check(), new RegExp(name.replace(".", "\\.")));
    });
  }
}

test(
  "model symlink fails rather than following an external payload",
  { skip: process.platform === "win32" },
  (t) => {
    const f = fixture(t);
    fs.unlinkSync(f.model);
    fs.symlinkSync(f.approval, f.model);
    fails(f.check(), /regular.*model\.lpk/i);
  }
);

for (const name of ["model", "executable"]) {
  test(`${name} hash mismatch fails, including unapproved tiny fixtures`, (t) => {
    const f = fixture(t);
    fs.appendFileSync(f[name], "changed");
    fails(f.check(), /hash mismatch/i);
  });
}

for (const platform of ["darwin", "win32"]) {
  test(`${platform} wrong architecture fails even with matching approval hash`, (t) => {
    const f = fixture(t, platform, "x64");
    fs.writeFileSync(f.executable, binary(platform, "arm64"));
    f.approve();
    invalidArchitecture(f, platform, "x64", /architecture/i);
  });
  test(`${platform} invalid executable header fails even when approved`, (t) => {
    const f = fixture(t, platform, "x64");
    fs.writeFileSync(f.executable, "not an executable");
    f.approve();
    invalidArchitecture(f, platform, "x64", /header/i);
  });
}

test("macOS executable bit is required", { skip: process.platform === "win32" }, (t) => {
  const f = fixture(t);
  fs.chmodSync(f.executable, 0o644);
  fails(f.check(), /executable bit/i);
});

function universal(wide = false, little = false) {
  const data = Buffer.alloc(1536);
  const u32 = (value, at) =>
    little ? data.writeUInt32LE(value, at) : data.writeUInt32BE(value, at);
  const u64 = (value, at) =>
    little ? data.writeBigUInt64LE(BigInt(value), at) : data.writeBigUInt64BE(BigInt(value), at);
  u32(wide ? 0xcafebabf : 0xcafebabe, 0);
  u32(2, 4);
  for (const [index, arch] of ["x64", "arm64"].entries()) {
    const entry = 8 + index * (wide ? 32 : 20);
    u32(arch === "x64" ? 0x01000007 : 0x0100000c, entry);
    if (wide) {
      u64(512 * (index + 1), entry + 8);
      u64(512, entry + 16);
    } else {
      u32(512 * (index + 1), entry + 8);
      u32(512, entry + 12);
    }
    binary("darwin", arch).copy(data, 512 * (index + 1));
  }
  return data;
}

for (const arch of ["arm64", "x64"]) {
  for (const wide of [false, true]) {
    for (const little of [false, true]) {
      const capability = hostWindows ? "; host cannot verify macOS executable permissions" : "";
      test(`approved universal Mach-O includes ${arch}, fat64=${wide}, little=${little}${capability}`, (t) => {
        const f = fixture(t, "darwin", arch);
        fs.writeFileSync(f.executable, universal(wide, little));
        f.approve();
        approved(f, "darwin", arch);
      });
    }
  }
}

test("universal without requested architecture fails", (t) => {
  const f = fixture(t, "darwin", "arm64");
  const data = universal();
  data.writeUInt32BE(1, 4);
  fs.writeFileSync(f.executable, data);
  f.approve();
  invalidArchitecture(f, "darwin", "arm64", /architecture/i);
});

test("universal slice declaration cannot hide a different architecture", (t) => {
  const f = fixture(t, "darwin", "arm64");
  const data = universal();
  binary("darwin", "x64").copy(data, 1024);
  fs.writeFileSync(f.executable, data);
  f.approve();
  invalidArchitecture(f, "darwin", "arm64", /architecture/i);
});

test("universal slice outside file fails", (t) => {
  const f = fixture(t, "darwin", "arm64");
  const data = universal();
  data.writeUInt32BE(100000, 36);
  fs.writeFileSync(f.executable, data);
  f.approve();
  invalidArchitecture(f, "darwin", "arm64", /header/i);
});

test("target is mandatory and not inferred from host architecture", (t) => {
  const f = fixture(t);
  fails(f.run(), /usage/i);
  fails(f.run(f.resources, "linux", "x64", f.approval), /target/i);
  fails(f.run(f.resources, "darwin", "ia32", f.approval), /target/i);
});

test("release gate uses pinned tooling approval on final production packages only", () => {
  const yaml = require("yaml");
  const root = path.resolve(__dirname, "../..");
  const workflow = yaml.parse(
    fs.readFileSync(path.join(root, ".github/workflows/release-331-preflight.yml"), "utf8")
  );
  const calls = (job) => workflow.jobs[job].steps.map((step) => step.run || "").join("\n");
  assert.doesNotMatch(calls("unsigned"), /verify-predictor-resources\.cjs/);
  assert.equal(workflow.jobs["signed-macos"], undefined);
  assert.match(
    calls("release-windows"),
    /electron:build[\s\S]*node \.\.\/tooling\/scripts\/ci\/verify-predictor-resources\.cjs dist\/win-unpacked\/resources win32 x64 \.\.\/tooling\/build\/predictor-approval\.json[\s\S]*release-artifacts\.cjs stage/
  );
  const checks = yaml.parse(
    fs.readFileSync(path.join(root, ".github/workflows/checks.yml"), "utf8")
  );
  assert(
    checks.jobs.checks.steps.some(
      (step) =>
        step.run?.includes("node --test") &&
        step.run.includes("scripts/ci/verify-predictor-resources.test.cjs")
    )
  );
});
