const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const { createHash } = require("node:crypto");
const { stage } = require("./stage-approved-predictor.cjs");
const sha = (data) => createHash("sha256").update(data).digest("hex");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "approved-stage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exe = Buffer.alloc(512);
  exe.write("MZ");
  exe.writeUInt32LE(128, 60);
  exe.write("PE\0\0", 128);
  exe.writeUInt16LE(0x8664, 132);
  exe.writeUInt16LE(240, 148);
  exe.writeUInt16LE(2, 150);
  exe.writeUInt16LE(0x20b, 152);
  const files = {
    "model.lpk": Buffer.from("synthetic, never approval"),
    "lp-electron.exe": exe,
    LICENSE: Buffer.from("fixture license"),
    "MODEL_NOTICE.md": Buffer.from("fixture notice")
  };
  const manifest = {
    releaseTag: "base-ru-v1",
    modelSha256: sha(files["model.lpk"]),
    binaries: { "win32-x64": sha(exe) },
    downloads: Object.fromEntries(
      Object.entries(files).map(([name, data]) => [
        name,
        {
          url: `https://github.com/linkasu/linka.predictor-rust/releases/download/base-ru-v1/${name}`,
          sha256: sha(data),
          bytes: data.length
        }
      ])
    )
  };
  const approvalPath = path.join(root, "approval.json");
  const save = () => fs.writeFileSync(approvalPath, JSON.stringify(manifest));
  save();
  let requests = 0;
  t.mock.method(https, "get", (url, options, callback) => {
    requests++;
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.destroy = (error) => req.emit("error", error);
    process.nextTick(() => {
      const response = Readable.from([files[path.basename(new URL(url).pathname)]]);
      response.statusCode = 200;
      response.headers = {};
      callback(response);
    });
    return req;
  });
  return {
    root,
    files,
    manifest,
    save,
    approvalPath,
    requests: () => requests,
    run: () => stage(root, approvalPath)
  };
}

test("stages four approved resources; repeated build validates without fetching", async (t) => {
  const f = fixture(t);
  await f.run();
  assert.equal(f.requests(), 4);
  const dest = path.join(f.root, "predictor-resources");
  assert.deepEqual(fs.readdirSync(dest).sort(), Object.keys(f.files).sort());
  for (const [name, data] of Object.entries(f.files))
    assert.deepEqual(fs.readFileSync(path.join(dest, name)), data);
  await f.run();
  assert.equal(f.requests(), 4);
});

for (const mutation of [
  (f) => fs.unlinkSync(f.approvalPath),
  (f) => {
    delete f.manifest.downloads;
    f.save();
  },
  (f) => {
    f.manifest.downloads["model.lpk"].sha256 = "a".repeat(64);
    f.save();
  },
  (f) => {
    f.manifest.downloads["lp-electron.exe"].sha256 = "a".repeat(64);
    f.save();
  },
  (f) => {
    f.manifest.downloads["model.lpk"].bytes = 128 * 1024 * 1024 + 1;
    f.save();
  },
  (f) => {
    f.manifest.downloads["lp-electron.exe"].bytes = 16 * 1024 * 1024 + 1;
    f.save();
  },
  (f) => {
    f.manifest.downloads.LICENSE.bytes = 1024 * 1024 + 1;
    f.save();
  },
  (f) => {
    f.manifest.downloads.extra = f.manifest.downloads.LICENSE;
    f.save();
  }
])
  test("invalid approval blocks all network", async (t) => {
    const f = fixture(t);
    mutation(f);
    await assert.rejects(f.run());
    assert.equal(f.requests(), 0);
  });

for (const url of [
  "http://github.com/linkasu/linka.predictor-rust/releases/download/base-ru-v1/model.lpk",
  "https://user@github.com/linkasu/linka.predictor-rust/releases/download/base-ru-v1/model.lpk",
  "https://github.com/linkasu/linka.predictor-rust/releases/download/base-ru-v1/model.lpk?token=x",
  "https://github.com/other/repo/releases/download/base-ru-v1/model.lpk",
  "https://github.com/linkasu/linka.predictor-rust/releases/download/latest/model.lpk"
])
  test(`reject initial URL: ${url}`, async (t) => {
    const f = fixture(t);
    f.manifest.downloads["model.lpk"].url = url;
    f.save();
    await assert.rejects(f.run());
    assert.equal(f.requests(), 0);
  });

for (const failure of ["hash", "size", "short", "notice", "architecture", "truncated"])
  test(`failed ${failure} cleans owned partials`, async (t) => {
    const f = fixture(t);
    if (failure === "size") f.files["model.lpk"] = Buffer.alloc(1000);
    if (failure === "hash") f.files["model.lpk"] = Buffer.alloc(f.files["model.lpk"].length);
    if (failure === "short") f.files["model.lpk"] = Buffer.from("short");
    if (failure === "notice")
      f.files["MODEL_NOTICE.md"] = Buffer.alloc(f.files["MODEL_NOTICE.md"].length);
    if (failure === "architecture" || failure === "truncated") {
      if (failure === "architecture") f.files["lp-electron.exe"].writeUInt16LE(0xaa64, 132);
      else f.files["lp-electron.exe"] = Buffer.from("MZ");
      const entry = f.manifest.downloads["lp-electron.exe"];
      entry.sha256 = sha(f.files["lp-electron.exe"]);
      entry.bytes = f.files["lp-electron.exe"].length;
      f.manifest.binaries["win32-x64"] = entry.sha256;
      f.save();
    }
    await assert.rejects(f.run());
    assert.deepEqual(fs.readdirSync(f.root), ["approval.json"]);
  });

test("empty existing directory is not replaced", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "predictor-resources"));
  await assert.rejects(f.run());
  assert.equal(f.requests(), 0);
  assert.deepEqual(fs.readdirSync(path.join(f.root, "predictor-resources")), []);
});

test("official HTTPS asset redirect preserves approved bytes", async (t) => {
  const f = fixture(t);
  const mocked = https.get;
  t.mock.method(https, "get", (url, options, callback) => {
    if (new URL(url).hostname !== "github.com") return mocked(url, options, callback);
    const req = new EventEmitter();
    req.setTimeout = () => req;
    process.nextTick(() => {
      const res = Readable.from([]);
      res.statusCode = 302;
      res.headers = {
        location: `https://release-assets.githubusercontent.com/${path.basename(new URL(url).pathname)}?signed=fixture`
      };
      callback(res);
    });
    return req;
  });
  await f.run();
  assert.equal(f.requests(), 4);
});

test(
  "resource file symlink is rejected without fetching",
  { skip: process.platform === "win32" },
  async (t) => {
    const f = fixture(t);
    await f.run();
    const model = path.join(f.root, "predictor-resources/model.lpk");
    fs.unlinkSync(model);
    fs.symlinkSync(f.approvalPath, model);
    await assert.rejects(f.run());
    assert.equal(f.requests(), 4);
  }
);

test("single central prebuild hook and Windows-only unsigned PR profile", () => {
  const root = path.resolve(__dirname, "../..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
  assert.equal(
    pkg.scripts["preelectron:build"],
    "node scripts/ci/stage-approved-predictor.cjs && node scripts/ci/provision-eyelog.cjs"
  );
  const yaml = require("yaml");
  const workflow = yaml.parse(fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  assert.equal(workflow.jobs.windows["runs-on"], "windows-2022");
  assert.equal(workflow.jobs.windows.env.CSC_IDENTITY_AUTO_DISCOVERY, "false");
  const runs = workflow.jobs.windows.steps.map((s) => s.run || "").join("\n");
  assert.match(runs, /args=\(--win --x64 -p never\)/);
  assert.match(runs, /args\+=\(--dir\)/);
  assert.match(runs, /verify-predictor-resources\.cjs/);
  assert.doesNotMatch(runs, /stage-approved-predictor\.cjs/);
});

test("existing local test resources preserved without fetching", async (t) => {
  const f = fixture(t);
  const dest = path.join(f.root, "predictor-resources");
  fs.mkdirSync(dest);
  fs.writeFileSync(path.join(dest, "model.lpk"), "local test model");
  await assert.rejects(f.run());
  assert.equal(f.requests(), 0);
  assert.equal(fs.readFileSync(path.join(dest, "model.lpk"), "utf8"), "local test model");
});

test(
  "symlinked resource directory not followed",
  { skip: process.platform === "win32" },
  async (t) => {
    const f = fixture(t);
    fs.symlinkSync(f.root, path.join(f.root, "predictor-resources"));
    await assert.rejects(f.run());
    assert.equal(f.requests(), 0);
  }
);

for (const location of [
  "http://release-assets.githubusercontent.com/file",
  "https://evil.example/file",
  "https://github.com.evil.example/file",
  "https://user@github.com/file"
])
  test("unsafe redirect rejected", async (t) => {
    const f = fixture(t);
    let count = 0;
    t.mock.method(https, "get", (url, options, callback) => {
      count++;
      const req = new EventEmitter();
      req.setTimeout = () => req;
      process.nextTick(() => {
        const res = Readable.from([]);
        res.statusCode = 302;
        res.headers = { location };
        callback(res);
      });
      return req;
    });
    await assert.rejects(f.run());
    assert.equal(count, 1);
  });
