// Tobii 0.2.16's copier assumes a nested dependency; npm 10 hoists the fixed override.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createRequire } = require("node:module");

async function provision() {
  const project = path.resolve(__dirname, "../..");
  const tobii = path.join(project, "node_modules/@linkasu/tobii-electron");
  const resolveTobii = createRequire(path.join(tobii, "package.json"));
  const eyelog = path.dirname(resolveTobii.resolve("eyelog/package.json"));
  const pin = "b1200c685fc11337e3eec1dda12045b2fdc99d3f";
  const lock = require(path.join(project, "package-lock.json"));
  const record = lock.packages[path.relative(project, eyelog).split(path.sep).join("/")];
  assert(record.resolved.endsWith(`#${pin}`), "unreviewed EyeLog resolution");
  const { install, SDK, REQUIRED } = require(path.join(eyelog, "download.js"));
  assert.equal(SDK.sha256, "7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d");
  assert.equal(SDK.size, 389225);
  await install(); // The reviewed installer verifies the archive BEFORE parsing or promotion.
  const target = path.join(tobii, "extraResources/bin");
  await fs.mkdir(target, { recursive: true });
  for (const name of REQUIRED) {
    const source = path.join(eyelog, "bin", name);
    const stat = await fs.lstat(source);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, "missing SDK binary");
    await fs.copyFile(source, path.join(target, name));
  }
  console.log(`EyeLog SDK 1.1.3.0 provisioned from reviewed ${pin}; no binaries executed`);
}

provision().catch(() => {
  console.error("Pinned EyeLog provisioning failed; installation/build must stop");
  process.exitCode = 1;
});
