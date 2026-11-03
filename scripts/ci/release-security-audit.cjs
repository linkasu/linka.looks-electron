// A02 source review only; existing release-artifacts verification still owns accepted bytes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");

const nodes = {
  archiver: { "node_modules/archiver": "5.3.2" },
  "archiver-utils": {
    "node_modules/archiver-utils": "2.1.0",
    "node_modules/zip-stream/node_modules/archiver-utils": "3.0.4"
  },
  "readdir-glob": { "node_modules/readdir-glob": "1.1.3" },
  "zip-stream": { "node_modules/zip-stream": "4.1.1" },
  minimatch: {
    "node_modules/minimatch": "3.1.5",
    "node_modules/readdir-glob/node_modules/minimatch": "5.1.9"
  },
  glob: { "node_modules/glob": "7.2.3" }
};
const tobiiArchive = {
  resolved:
    "https://github.com/linkasu/linka-tobii-electron/releases/download/v0.2.17/linkasu-tobii-electron-0.2.17.tgz",
  integrity:
    "sha512-LqhUCB90euN/QR/aGY9A+mP7j7Wq8no2qrxN682JvrxV7oP8IQx/9/VxU6u3cAe6DFHbi39J3R+N0swgLrjmgQ==",
  size: 1157232,
  sha256: "10a66998baa78e273a5d33ce183f2a18d22bd660561dcd07e5662d5cfc292fb2"
};
const nativeSourcePath =
  "node_modules/@linkasu/tobii-electron/native/tobiifree-native/package.json";
const excludedProduction = ["node-gyp", "make-fetch-happen", "cacache", "@linka/tobiifree-native"];
const versions = Object.fromEntries(
  Object.entries(nodes).map(([name, entries]) => [name, Object.values(entries)])
);
for (const name of [
  "vue",
  "@vue/compiler-core",
  "@vue/compiler-dom",
  "@vue/compiler-sfc",
  "@vue/compiler-ssr",
  "@vue/reactivity",
  "@vue/runtime-core",
  "@vue/runtime-dom",
  "@vue/server-renderer",
  "@vue/shared"
])
  versions[name] = ["3.5.44"];
versions["@linkasu/tobii-electron"] = ["0.2.17"];
versions["node-gyp-build"] = ["4.8.4"];
versions.usb = ["2.17.0"];
const advisories = {
  "https://github.com/advisories/GHSA-g3hv-75wg-m249": ["minimatch", "<11.0.1"]
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function verify({ inventory, audit, provenance, lock }) {
  const packages = JSON.parse(lock).packages;
  assert.equal(inventory.schema, 1);
  assert.equal(inventory.builder, "26.16.1", "unreviewed builder");
  assert.equal(provenance.schema, 1);
  assert.equal(provenance.version, "4.0.0");
  assert.equal(provenance.platform, "windows");
  assert(/^\d+$/.test(provenance.run), "missing candidate run");
  for (const field of ["app", "tooling"]) {
    assert(/^[a-f0-9]{40}$/.test(inventory[field]), "exact source SHA required");
    assert.equal(inventory[field], provenance[field], "source provenance mismatch");
  }
  assert.equal(inventory.lockSha256, hash(lock), "inventory/lock mismatch");
  for (const name of ["vue", "@vue/server-renderer", "@linkasu/tobii-electron"])
    assert(
      versions[name].includes(packages[`node_modules/${name}`]?.version),
      "unreviewed runtime"
    );
  const tobii = packages["node_modules/@linkasu/tobii-electron"];
  for (const field of ["resolved", "integrity"])
    assert.equal(tobii[field], tobiiArchive[field], "unreviewed Tobii archive");
  for (const [path, pkg] of Object.entries(packages)) {
    const name = path.split("node_modules/").at(-1);
    assert.notEqual(
      name,
      "@linka/tobiifree-native",
      "optional native module is not installed in reviewed lock"
    );
    if (!pkg.dev)
      assert(!excludedProduction.includes(name), `returned production build chain: ${path}`);
    if (pkg.dev || !Object.hasOwn(versions, name)) continue;
    assert(versions[name].includes(pkg.version), `unreviewed production version: ${path}`);
    if (Object.hasOwn(nodes, name))
      assert.equal(nodes[name][path], pkg.version, `unreviewed production node: ${path}`);
    const matches = inventory.pins.filter((pin) => pin.path === path);
    assert.equal(matches.length, 1, `missing/duplicate pin: ${path}`);
    for (const field of ["version", "resolved", "integrity"])
      assert.equal(
        matches[0][field] ?? null,
        pkg[field] ?? null,
        `inventory pin mismatch: ${path}`
      );
  }
  assert.equal(audit.auditReportVersion, 2);
  assert(!audit.error, "failed audit is not evidence");
  assert(audit.vulnerabilities && typeof audit.vulnerabilities === "object");
  const findings = Object.entries(audit.vulnerabilities);
  assert.equal(audit.metadata.vulnerabilities.total, findings.length, "incomplete audit");
  for (const [name, finding] of findings) {
    assert(Object.hasOwn(nodes, name), `unreviewed finding: ${name}`);
    assert.equal(finding.name, name);
    assert.equal(finding.severity, "moderate", "unreviewed severity");
    assert(finding.nodes.length > 0 && finding.via.length > 0, "incomplete finding");
    for (const path of finding.nodes) {
      assert(Object.hasOwn(nodes[name], path), `unreviewed audit node: ${path}`);
      assert.equal(packages[path]?.version, nodes[name][path], "audit/lock mismatch");
    }
    for (const via of finding.via) {
      if (typeof via === "string") assert(Object.hasOwn(nodes, via), "unreviewed advisory chain");
      else {
        assert(Object.hasOwn(advisories, via.url), "unreviewed advisory");
        assert.deepEqual([via.dependency, via.range], advisories[via.url]);
        assert.equal(via.name, via.dependency);
        assert.equal(via.name, name, "advisory attached to different finding");
        assert.equal(via.severity, "moderate");
      }
    }
  }
  assert.equal(inventory.packaged.length, 1, "Windows candidate inventory required");
  const sourceSubpackages = [];
  for (const bundle of inventory.packaged) {
    assert.equal(bundle.target.replaceAll("\\", "/"), "dist/win-unpacked/resources");
    assert(/^[a-f0-9]{64}$/.test(bundle.asarSha256), "ASAR digest required");
    assert.equal(bundle.packages.find((pkg) => pkg.path === "package.json")?.version, "4.0.0");
    for (const pkg of bundle.packages) {
      const sourcePath = pkg.path
        .replaceAll("\\", "/")
        .replace(/^bundle\/resources\/app\.asar\.unpacked\//, "");
      if (sourcePath === nativeSourcePath) {
        assert.equal(pkg.name, "@linka/tobiifree-native");
        assert.equal(pkg.version, "0.0.1", "changed native source subpackage");
        assert(
          bundle.packages.some(
            (parent) =>
              parent.path === "node_modules/@linkasu/tobii-electron/package.json" &&
              parent.name === "@linkasu/tobii-electron" &&
              parent.version === "0.2.17"
          ),
          "source subpackage missing pinned packaged parent"
        );
        sourceSubpackages.push({
          ...pkg,
          classification: "SOURCE_SUBPACKAGE",
          parentArchiveSha256: tobiiArchive.sha256
        });
        continue;
      }
      assert(
        !excludedProduction.includes(pkg.name),
        `unreviewed shipped build/native dependency: ${pkg.path}`
      );
      if (Object.hasOwn(versions, pkg.name))
        assert(versions[pkg.name].includes(pkg.version), `unreviewed shipped version: ${pkg.path}`);
    }
  }
  const name = "linka.looks-4.0.0-win-x64.exe";
  const installers = inventory.installers.filter((item) => item.name === name);
  const accepted = provenance.files.filter((item) => item.name === name);
  assert.equal(installers.length, 1);
  assert.equal(accepted.length, 1);
  assert(/^[a-f0-9]{64}$/.test(installers[0].sha256));
  assert.equal(installers[0].sha256, accepted[0].sha256, "installer provenance mismatch");
  return {
    status: "REVIEWED_SOURCE_ONLY",
    remainingFindings: findings.length,
    lockSha256: hash(lock),
    tobiiArchive,
    sourceSubpackages
  };
}

module.exports = { verify };
if (require.main === module) {
  const [inventoryPath, auditPath, provenancePath, lockPath] = process.argv.slice(2);
  assert(
    inventoryPath && auditPath && provenancePath && lockPath,
    "usage: node release-security-audit.cjs inventory.json audit.json provenance-windows.json package-lock.json"
  );
  const read = (path) => fs.readFileSync(path);
  const auditBytes = read(auditPath);
  const inventoryBytes = read(inventoryPath);
  const provenanceBytes = read(provenancePath);
  console.log(
    JSON.stringify(
      {
        ...verify({
          inventory: JSON.parse(inventoryBytes),
          audit: JSON.parse(auditBytes),
          provenance: JSON.parse(provenanceBytes),
          lock: read(lockPath)
        }),
        auditSha256: hash(auditBytes),
        inventorySha256: hash(inventoryBytes),
        provenanceSha256: hash(provenanceBytes)
      },
      null,
      2
    )
  );
}
