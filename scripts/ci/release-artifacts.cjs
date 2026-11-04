// One contract for accepted CI bytes and their later promotion; never rebuild here.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const nodeCrypto = require("node:crypto");
const childProcess = require("node:child_process");
const macCompatibility = require("./release-artifacts-mac-compat.cjs");

const VERSION = "4.0.0";
const digest = (bytes, algorithm = "sha256", encoding = "hex") =>
  nodeCrypto.createHash(algorithm).update(bytes).digest(encoding);
function assets(platform, version = VERSION) {
  assert.equal(platform, "windows", "4.0.0 releases Windows x64 only");
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), "stable version required");
  const installers = [`linka.looks-${version}-win-x64.exe`];
  return {
    installers,
    metadata: "latest.yml",
    files: [...installers.flatMap((name) => [name, `${name}.blockmap`]), "latest.yml"]
  };
}
function verifyMetadata(directory, platform, version = VERSION) {
  const yaml = require("yaml");
  const expected = assets(platform, version);
  for (const name of expected.files) {
    const stat = fs.lstatSync(path.join(directory, name));
    assert(stat.isFile() && stat.size > 0, "expected regular release asset");
  }
  const metadata = yaml.parse(fs.readFileSync(path.join(directory, expected.metadata), "utf8"));
  assert.equal(metadata.version, version, "updater version mismatch");
  assert(Array.isArray(metadata.files) && metadata.files.length > 0, "empty updater asset set");
  assert.deepEqual(
    metadata.files.map((file) => file.url).sort(),
    [...expected.installers].sort(),
    "updater must describe every accepted installer exactly once"
  );
  for (const file of metadata.files) {
    const bytes = fs.readFileSync(path.join(directory, file.url));
    assert.equal(file.sha512, digest(bytes, "sha512", "base64"), "updater sha512 mismatch");
    assert.equal(file.size, bytes.length, "updater size mismatch");
  }
  assert(expected.installers.includes(metadata.path), "updater path mismatch");
  const primary = metadata.files.find((file) => file.url === metadata.path);
  assert.equal(metadata.sha512, primary.sha512, "updater primary sha512 mismatch");
  if (metadata.size !== undefined) assert.equal(metadata.size, primary.size);
  return expected.files;
}
function record(directory, name) {
  const bytes = fs.readFileSync(path.join(directory, name));
  return { name, size: bytes.length, sha256: digest(bytes) };
}
function stage(platform) {
  const app = process.env.APP_SHA;
  const tooling = process.env.TOOLING_SHA;
  const run = process.env.GITHUB_RUN_ID;
  assert(/^[a-f0-9]{40}$/.test(app) && /^[a-f0-9]{40}$/.test(tooling));
  assert(/^\d+$/.test(run), "CI run provenance required");
  const inventory = JSON.parse(fs.readFileSync("release-evidence/inventory.json"));
  assert.equal(inventory.app, app);
  assert.equal(inventory.tooling, tooling);
  assert.equal(inventory.builder, "26.16.1");
  assert.equal(inventory.packaged.length, 1);
  for (const bundle of inventory.packaged) {
    assert.equal(
      bundle.packages.find((pkg) => pkg.path === "package.json").license,
      "GPL-3.0-or-later"
    );
    for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
      assert.equal(
        bundle.notices.find((notice) => notice.path === name)?.sha256,
        digest(fs.readFileSync(name)),
        "packaged release notice missing/mismatched"
      );
    }
  }
  const names = [...verifyMetadata("dist", platform), ...macCompatibility.verify("dist")];
  fs.mkdirSync("release-ready"); // Exclusive: never combine with an earlier attempt.
  for (const name of names)
    fs.copyFileSync(path.join("dist", name), path.join("release-ready", name));
  const source = `source-notices-${platform}-${VERSION}.tar.gz`;
  childProcess.execFileSync("tar", [
    "-czf",
    `release-ready/${source}`,
    "-C",
    "release-evidence",
    "."
  ]);
  names.push(source);
  fs.writeFileSync(
    `release-ready/provenance-${platform}.json`,
    JSON.stringify(
      {
        schema: 1,
        version: VERSION,
        platform,
        signing: "unsigned",
        app,
        tooling,
        run,
        files: names.map((name) => record("release-ready", name))
      },
      null,
      2
    ) + "\n"
  );
}
function verifyPromotion(directory, app, tooling, run) {
  const expectedAll = [];
  for (const platform of ["windows"]) {
    const provenanceName = `provenance-${platform}.json`;
    const provenance = JSON.parse(fs.readFileSync(path.join(directory, provenanceName)));
    assert.deepEqual(
      [
        provenance.schema,
        provenance.version,
        provenance.platform,
        provenance.app,
        provenance.tooling,
        provenance.run
      ],
      [1, VERSION, platform, app, tooling, run]
    );
    assert.equal(provenance.signing, "unsigned");
    const expected = [
      ...assets(platform).files,
      ...macCompatibility.names,
      `source-notices-${platform}-${VERSION}.tar.gz`
    ].sort();
    assert.deepEqual(provenance.files.map((file) => file.name).sort(), expected);
    for (const file of provenance.files)
      assert.deepEqual(record(directory, file.name), file, "accepted artifact bytes changed");
    verifyMetadata(directory, platform);
    macCompatibility.verify(directory);
    expectedAll.push(...expected, provenanceName);
  }
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    expectedAll.sort(),
    "unexpected promotion files"
  );
}
module.exports = { assets, digest, verifyMetadata, verifyPromotion, stage };
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "stage") stage(...args);
  else if (command === "verify") verifyPromotion(...args);
  else throw new Error("release artifact command required");
}
