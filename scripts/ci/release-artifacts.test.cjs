const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const {
  assets,
  digest,
  verifyMetadata,
  verifyPromotion,
  stage
} = require("./release-artifacts.cjs");
const macCompatibility = require("./release-artifacts-mac-compat.cjs");

test("legacy macOS whitelist accepts only the exact published version, hashes and set", () => {
  const records = structuredClone(macCompatibility.pins);
  macCompatibility.checkRecords(records);
  const bytes = fs.readFileSync(
    path.join(__dirname, "release-artifacts-fixtures/latest-mac-3.3.1.txt")
  );
  assert.equal(bytes.length, records[0].size);
  assert.equal(digest(bytes), records[0].sha256);
  const metadata = require("yaml").parse(bytes.toString());
  assert.equal(metadata.version, "3.3.1");
  assert.deepEqual(
    metadata.files.map((file) => file.url).sort(),
    records
      .filter((file) => /\.(zip|dmg)$/.test(file.name))
      .map((file) => file.name)
      .sort()
  );
  for (const mutate of [
    (files) => files.pop(),
    (files) => files.push({ name: "unknown.exe", size: 1, sha256: "a".repeat(64) }),
    (files) => {
      files[1].sha256 = "a".repeat(64);
    },
    (files) => {
      files[1].name = files[1].name.replace("3.3.1", "4.0.0");
    },
    (files) => {
      files[0].size++;
    }
  ]) {
    const invalid = structuredClone(records);
    mutate(invalid);
    assert.throws(() => macCompatibility.checkRecords(invalid));
  }
});

test("compatibility download rejects HTTP downgrade, corrupt bytes and overwrite", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://example.invalid/asset" }
      })
  );
  await assert.rejects(macCompatibility.download(root), /HTTPS/);
  t.mock.method(globalThis, "fetch", async () => new Response(Buffer.alloc(839)));
  await assert.rejects(macCompatibility.download(root), /hash mismatch/);
  await assert.rejects(macCompatibility.download(root), /EEXIST/);
  assert.throws(() => macCompatibility.verify(root));
});

test("real GitHubProvider uses common latest tag but unchanged macOS metadata, never Windows", async () => {
  const updaterRequire = require("node:module").createRequire(require.resolve("electron-updater"));
  const { GitHubProvider } = require("electron-updater/out/providers/GitHubProvider");
  const metadata = fs.readFileSync(
    path.join(__dirname, "release-artifacts-fixtures/latest-mac-3.3.1.txt"),
    "utf8"
  );
  const requests = [];
  const provider = new GitHubProvider(
    { provider: "github", owner: "linkasu", repo: "linka.looks-electron" },
    {
      allowPrerelease: false,
      currentVersion: new (updaterRequire("semver").SemVer)("3.3.1"),
      fullChangelog: false
    },
    {
      platform: "darwin",
      executor: {
        request: async (options) => {
          const url = options.path;
          requests.push(url);
          if (url.endsWith(".atom"))
            return '<feed><entry><title>4.0.0</title><link href="https://github.com/linkasu/linka.looks-electron/releases/tag/v4.0.0"/><content>Windows only</content></entry></feed>';
          if (url.endsWith("/latest")) return JSON.stringify({ tag_name: "v4.0.0" });
          assert(url.endsWith("/download/v4.0.0/latest-mac.yml"), url);
          return metadata;
        }
      }
    }
  );
  const update = await provider.getLatestVersion();
  assert.equal(update.version, "3.3.1", "Mac 3.3.1 must not see a new app version");
  assert.equal(update.tag, "v4.0.0");
  assert(requests.some((url) => url.endsWith("/latest")));
  for (const file of provider.resolveFiles(update)) {
    assert.match(
      file.url.href,
      /\/download\/v4\.0\.0\/linka\.looks-3\.3\.1-mac-(x64|arm64)\.(zip|dmg)$/
    );
    assert(macCompatibility.names.includes(path.basename(file.url.pathname)));
    assert.doesNotMatch(file.url.href, /win-|\.exe/);
  }
  const absolute = structuredClone(update);
  absolute.files[0].url = `${macCompatibility.release}/${absolute.files[0].url}`;
  assert.notEqual(
    provider.resolveFiles(absolute)[0].url.href,
    absolute.files[0].url,
    "an absolute old-release URL is transformed by GitHubProvider, not an escape hatch"
  );
});

test("release version, lock roots and workflow artifacts agree on 4.0.0", () => {
  const pkg = require("../../package.json");
  const lock = require("../../package-lock.json");
  assert.equal(pkg.version, "4.0.0");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.deepEqual(assets("windows").installers, ["linka.looks-4.0.0-win-x64.exe"]);
  assert.throws(() => assets("macos"), /Windows x64 only/);
  const preflight = fs.readFileSync(".github/workflows/release-331-preflight.yml", "utf8");
  const promotion = fs.readFileSync(".github/workflows/electron.yml", "utf8");
  assert.doesNotMatch(
    preflight + promotion,
    /accepted-331-|accepted-400-macos-|signed-macos|secrets\./
  );
  assert(preflight.includes("= 4.0.0"), "candidate must reject old application versions");
  for (const platform of ["windows"]) {
    assert(preflight.includes(`accepted-400-${platform}-`));
    assert(promotion.includes(`accepted-400-${platform}-`));
  }
  assert(promotion.includes("refs/tags/v4.0.0 refs/tags/4.0.0"));
  assert(promotion.includes('["v4.0.0","4.0.0"]'));
  assert(promotion.includes("gh release create v4.0.0"));
  assert(promotion.includes("'4.0.0 build-only preflight'"));
});

test("inventory version gate accepts 4.0.0 and rejects the previous release", () => {
  const source = fs.readFileSync("scripts/ci/release-inventory.cjs", "utf8");
  const gate = source.match(
    /assert\.equal\(require\(path\.resolve\("package\.json"\)\)\.version, "[^"]+"\);/
  );
  assert(gate, "inventory application version gate missing");
  const check = (version) =>
    require("node:vm").runInNewContext(gate[0], {
      assert,
      path,
      require: () => ({ version })
    });
  check("4.0.0");
  assert.throws(() => check("3.3.1"), { code: "ERR_ASSERTION" });
});

test("4.0.0 promotion selects its own release notes, never historical 3.3.1 notes", () => {
  const promotion = fs.readFileSync(".github/workflows/electron.yml", "utf8");
  const selectors = [...promotion.matchAll(/--notes-file\s+(\S+)/g)].map((match) => match[1]);
  assert.deepEqual(selectors, ["docs/release-400-notes.md"]);
  assert.doesNotMatch(promotion, /--notes-file\s+\S*release-331-notes\.md/);
  assert.match(fs.readFileSync(selectors[0], "utf8"), /^# LINKa\.смотри 4\.0\.0\n/);
});

test("staging gives tar a local relative archive path, never a Windows drive/remote path", (t) => {
  // Compatibility downloads have their own pinned-byte tests; do not download 641 MB in unit tests.
  t.mock.method(macCompatibility, "verify", () => []);
  const yaml = require("yaml");
  const cwd = process.cwd();
  const env = { ...process.env };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-stage-"));
  t.after(() => {
    process.chdir(cwd);
    for (const key of ["APP_SHA", "TOOLING_SHA", "GITHUB_RUN_ID"]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    fs.rmSync(root, { recursive: true });
  });
  fs.symlinkSync(path.join(cwd, "node_modules"), path.join(root, "node_modules"), "junction");
  process.chdir(root);
  process.env.APP_SHA = "a".repeat(40);
  process.env.TOOLING_SHA = "b".repeat(40);
  process.env.GITHUB_RUN_ID = "123";
  fs.mkdirSync("dist");
  fs.mkdirSync("release-evidence");
  fs.writeFileSync("package.json", "{}");
  const notices = ["LICENSE", "THIRD_PARTY_NOTICES.md"].map((name) => {
    fs.writeFileSync(name, name);
    return { path: name, sha256: digest(Buffer.from(name)) };
  });
  fs.writeFileSync(
    "release-evidence/inventory.json",
    JSON.stringify({
      app: process.env.APP_SHA,
      tooling: process.env.TOOLING_SHA,
      builder: "26.16.1",
      packaged: [{ packages: [{ path: "package.json", license: "GPL-3.0-or-later" }], notices }]
    })
  );
  const expected = assets("windows");
  for (const name of expected.files) fs.writeFileSync(path.join("dist", name), name);
  const bytes = fs.readFileSync(path.join("dist", expected.installers[0]));
  const file = {
    url: expected.installers[0],
    size: bytes.length,
    sha512: digest(bytes, "sha512", "base64")
  };
  fs.writeFileSync(
    path.join("dist", expected.metadata),
    yaml.stringify({
      version: "4.0.0",
      files: [file],
      path: file.url,
      sha512: file.sha512
    })
  );
  const exec = childProcess.execFileSync;
  t.mock.method(childProcess, "execFileSync", (command, args) => {
    assert.equal(command, "tar");
    assert.equal(args[0], "-czf");
    assert(
      !path.isAbsolute(args[1]) && !args[1].includes(":"),
      "tar must not interpret an archive as remote"
    );
    return exec(command, args);
  });
  stage("windows");
  const provenance = JSON.parse(fs.readFileSync("release-ready/provenance-windows.json"));
  assert.equal(provenance.files.length, expected.files.length + 1);
  assert(fs.statSync("release-ready/source-notices-windows-4.0.0.tar.gz").size > 0);
});

test("promotion requires exact bytes, provenance and complete semantic updater metadata", (t) => {
  t.mock.method(macCompatibility, "verify", () => macCompatibility.names);
  const yaml = require("yaml");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const app = "a".repeat(40),
    tooling = "b".repeat(40),
    run = "123";
  for (const pin of macCompatibility.pins) fs.writeFileSync(path.join(root, pin.name), pin.name);
  fs.writeFileSync(
    path.join(root, "macos-compatibility.json"),
    JSON.stringify(macCompatibility.manifest)
  );
  for (const platform of ["windows"]) {
    const expected = assets(platform);
    for (const name of expected.files) fs.writeFileSync(path.join(root, name), name);
    const files = expected.installers.map((url) => {
      const bytes = fs.readFileSync(path.join(root, url));
      return { url, size: bytes.length, sha512: digest(bytes, "sha512", "base64") };
    });
    const metadata = { version: "4.0.0", files, path: files[0].url, sha512: files[0].sha512 };
    const filename = path.join(root, expected.metadata);
    const valid = yaml.stringify(metadata);
    fs.writeFileSync(filename, valid);
    verifyMetadata(root, platform);
    for (const mutate of [
      (m) => {
        m.version = "3.3.1";
      },
      (m) => {
        m.files = [];
      },
      (m) => {
        m.files[0].url = "../outside.exe";
      },
      (m) => {
        m.files[0].url = m.files[0].url.replace("x64", "ia32");
      },
      (m) => {
        m.files[0].size++;
      },
      (m) => {
        m.files[0].sha512 = "wrong";
      },
      (m) => {
        m.files.push(m.files[0]);
      },
      (m) => {
        m.path = "wrong";
      }
    ]) {
      const changed = structuredClone(metadata);
      mutate(changed);
      fs.writeFileSync(filename, yaml.stringify(changed));
      assert.throws(() => verifyMetadata(root, platform));
    }
    fs.writeFileSync(filename, valid);
    const source = `source-notices-${platform}-4.0.0.tar.gz`;
    fs.writeFileSync(path.join(root, source), "fixture sources/notices");
    fs.writeFileSync(
      path.join(root, `provenance-${platform}.json`),
      JSON.stringify({
        schema: 1,
        version: "4.0.0",
        platform,
        signing: "unsigned",
        app,
        tooling,
        run,
        files: [...expected.files, ...macCompatibility.names, source].map((name) => {
          const bytes = fs.readFileSync(path.join(root, name));
          return { name, size: bytes.length, sha256: digest(bytes) };
        })
      })
    );
  }
  verifyPromotion(root, app, tooling, run);
  assert.throws(() => verifyPromotion(root, app, tooling, "124"));
  assert.throws(() => verifyPromotion(root, "c".repeat(40), tooling, run));
  assert.throws(() => verifyPromotion(root, app, "c".repeat(40), run));
  const provenancePath = path.join(root, "provenance-windows.json");
  const provenanceBytes = fs.readFileSync(provenancePath);
  const oldProvenance = JSON.parse(provenanceBytes);
  oldProvenance.version = "3.3.1";
  fs.writeFileSync(provenancePath, JSON.stringify(oldProvenance));
  assert.throws(() => verifyPromotion(root, app, tooling, run));
  fs.writeFileSync(provenancePath, provenanceBytes);
  const target = path.join(root, assets("windows").installers[0]);
  const original = fs.readFileSync(target);
  fs.unlinkSync(target);
  assert.throws(() => verifyPromotion(root, app, tooling, run), /ENOENT/);
  fs.writeFileSync(target, "changed accepted bytes");
  assert.throws(() => verifyPromotion(root, app, tooling, run));
  fs.writeFileSync(target, original);
  const source = path.join(root, "source-notices-windows-4.0.0.tar.gz");
  fs.appendFileSync(source, "changed source");
  assert.throws(() => verifyPromotion(root, app, tooling, run));
  fs.writeFileSync(source, "fixture sources/notices");
  fs.writeFileSync(path.join(root, "unaccepted.exe"), "extra");
  assert.throws(() => verifyPromotion(root, app, tooling, run));
});
