// Evidence only: metadata is not a license grant or a corresponding-source certification.
const fs = require("node:fs");
const path = require("node:path");
const nodeCrypto = require("node:crypto");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const appRequire = createRequire(path.resolve("package.json"));
const builderRequire = createRequire(appRequire.resolve("electron-builder"));
const asar = builderRequire("@electron/asar");

const hash = (bytes) => nodeCrypto.createHash("sha256").update(bytes).digest("hex");
const notice = (name) =>
  /(^|\/)(licen[cs]e[^/]*|copying[^/]*|notice[^/]*|third.party[^/]*)$/i.test(name);

function inspect(archive, resources, noticeDirectory, bundle = resources) {
  const packages = [];
  const notices = [];
  function saveNotice(name, bytes) {
    const item = { path: name, sha256: hash(bytes) };
    if (noticeDirectory) {
      fs.mkdirSync(noticeDirectory, { recursive: true });
      item.copy = `${notices.length}.txt`;
      fs.writeFileSync(path.join(noticeDirectory, item.copy), bytes, { flag: "wx" });
    }
    notices.push(item);
  }
  for (const entry of asar.listPackage(archive)) {
    const name = entry.replace(/^\//, "");
    const stat = asar.statFile(archive, name);
    if (stat.files || stat.link) continue;
    if (/(^|\/)package\.json$/.test(name)) {
      const pkg = JSON.parse(asar.extractFile(archive, name).toString("utf8"));
      packages.push({
        path: name,
        name: pkg.name ?? null,
        version: pkg.version ?? null,
        license: pkg.license ?? null
      });
    }
    if (notice(name)) saveNotice(name, asar.extractFile(archive, name));
  }
  assert(
    packages.some((pkg) => pkg.path === "package.json"),
    "packaged application metadata missing"
  );
  const files = [];
  function walk(directory, prefix = "") {
    for (const item of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix + item.name;
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) walk(absolute, name + "/");
      else if (item.isSymbolicLink())
        files.push({ path: name, kind: "symlink", target: fs.readlinkSync(absolute) });
      else {
        assert(item.isFile(), "unsupported resource kind");
        const bytes = fs.readFileSync(absolute);
        files.push({ path: name, kind: "file", size: bytes.length, sha256: hash(bytes) });
        if (notice(name)) saveNotice("bundle/" + name, bytes);
        if (/(^|\/)package\.json$/.test(name)) {
          const pkg = JSON.parse(bytes.toString("utf8"));
          packages.push({
            path: "bundle/" + name,
            name: pkg.name ?? null,
            version: pkg.version ?? null,
            license: pkg.license ?? null
          });
        }
      }
    }
  }
  walk(bundle);
  return { asarSha256: hash(fs.readFileSync(archive)), packages, notices, resources: files };
}

function main() {
  const app = process.env.APP_SHA;
  const tooling = process.env.TOOLING_SHA;
  for (const sha of [app, tooling])
    assert(/^[a-f0-9]{40}$/.test(sha ?? ""), "exact source SHA required");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), app);
  const toolingRoot = path.resolve(__dirname, "../..");
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: toolingRoot, encoding: "utf8" }).trim(),
    tooling
  );
  assert.equal(require(path.resolve("package.json")).version, "3.3.1");
  const bundles =
    process.platform === "win32"
      ? ["dist/win-unpacked/resources"]
      : [
          "dist/mac/LINKa. смотри.app/Contents/Resources",
          "dist/mac-arm64/LINKa. смотри.app/Contents/Resources"
        ];
  const lock = JSON.parse(fs.readFileSync("package-lock.json"));
  const pins = Object.entries(lock.packages).map(([name, pkg]) => ({
    path: name,
    version: pkg.version ?? null,
    resolved: pkg.resolved ?? null,
    integrity: pkg.integrity ?? null,
    license: pkg.license ?? null,
    dev: pkg.dev === true
  }));
  fs.mkdirSync("release-evidence", { recursive: true });
  const packaged = bundles.map((root, index) => ({
    target: root,
    ...inspect(
      path.join(root, "app.asar"),
      root,
      `release-evidence/notices/${index}`,
      process.platform === "win32" ? path.dirname(root) : path.resolve(root, "../..")
    )
  }));
  const source = execFileSync("git", ["archive", "--format=tar", app], {
    maxBuffer: 128 * 1024 * 1024
  });
  fs.writeFileSync("release-evidence/app-source.tar", source);
  const toolingSource = execFileSync("git", ["archive", "--format=tar", tooling], {
    cwd: toolingRoot,
    maxBuffer: 128 * 1024 * 1024
  });
  fs.writeFileSync("release-evidence/tooling-source.tar", toolingSource);
  const installers = fs
    .readdirSync("dist")
    .filter((name) => /\.(exe|dmg|zip|blockmap|yml)$/.test(name))
    .map((name) => ({ name, sha256: hash(fs.readFileSync(path.join("dist", name))) }));
  fs.writeFileSync(
    "release-evidence/inventory.json",
    JSON.stringify(
      {
        schema: 1,
        app,
        tooling,
        builder: builderRequire("app-builder-lib/package.json").version,
        electron: appRequire("electron/package.json").version,
        lockSha256: hash(fs.readFileSync("package-lock.json")),
        sourceArchiveSha256: hash(source),
        toolingArchiveSha256: hash(toolingSource),
        sourceStatus:
          "app archive includes tracked build/install scripts; third-party corresponding source and rights NOT certified",
        sdk: {
          tag: "1.1.3.0",
          asset: 467473707,
          size: 389225,
          sha256: "7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d"
        },
        pins,
        packaged,
        installers
      },
      null,
      2
    ) + "\n"
  );
}

module.exports = { inspect };
if (require.main === module) main();
