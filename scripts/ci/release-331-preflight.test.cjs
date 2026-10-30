const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("yaml");
const { createRequire } = require("node:module");
const builderRequire = createRequire(require.resolve("electron-builder"));
const asar = builderRequire("@electron/asar");
const { inspect } = require("./release-inventory.cjs");

test("3.3.1 workflow is build-only, main-gated signing, no binary disclosure", () => {
  const source = fs.readFileSync(".github/workflows/release-331-preflight.yml", "utf8");
  const workflow = yaml.parse(source);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.release, undefined);
  assert.match(
    workflow.jobs["signed-macos"].if,
    /workflow_dispatch.*refs\/heads\/main.*linkasu\/linka\.looks-electron/
  );
  assert.match(workflow.jobs.unsigned.if, /pull_request/);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps) {
      if (step.uses === "actions/checkout@v4")
        assert.equal(step.with["persist-credentials"], false);
      if (step.uses === "actions/upload-artifact@v4")
        assert.match(step.with.path, /^(app\/)?release-evidence\/inventory\.json$/);
      if (JSON.stringify(step).includes("secrets.")) {
        assert.equal(jobName, "signed-macos");
        assert.match(step.run, /-p never/);
      }
      if (step.run?.includes("npm run electron:build")) {
        assert.match(step.run, /-p never/);
        assert.doesNotMatch(step.run, /--dir|prepackaged/);
      }
    }
  }
  assert.doesNotMatch(source, /-p always|GH_TOKEN|backport-keychain|gh release|git tag/);
  for (const gate of [
    "shasum -a 256 -c",
    "asar-evidence.py diff",
    "verify-macos-payload.py evidence app",
    "codesign --verify --deep --strict",
    "xcrun stapler validate",
    "spctl --assess",
    "hdiutil attach -quiet -readonly"
  ]) {
    assert(source.includes(gate), `missing strict gate: ${gate}`);
  }
  assert.equal(builderRequire("app-builder-lib/package.json").version, "26.16.1");
  const integration = workflow.jobs.unsigned.steps.find((step) =>
    step.run?.includes("MACOS_BUILDER_INTEGRATION=")
  );
  assert.match(
    integration.run,
    /node node_modules\/electron\/install\.js[\s\S]+MACOS_BUILDER_INTEGRATION=/
  );
});

test("inventory uses actual ASAR metadata/notices and extra resources; missing app fails closed", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-inventory-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const input = path.join(root, "input");
  const resources = path.join(root, "resources");
  fs.mkdirSync(input);
  fs.mkdirSync(resources);
  fs.writeFileSync(
    path.join(input, "package.json"),
    JSON.stringify({ name: "fixture", version: "3.3.1" })
  );
  fs.writeFileSync(path.join(input, "LICENSE"), "existing notice, not a new grant");
  fs.writeFileSync(path.join(resources, "vendor.dll"), "fixture DLL");
  const archive = path.join(resources, "app.asar");
  await asar.createPackage(input, archive);
  const listPackage = asar.listPackage;
  t.mock.method(asar, "listPackage", (...args) =>
    listPackage(...args).map((name) => name.replaceAll("/", "\\"))
  );
  const notices = path.join(root, "notices");
  const result = inspect(archive, resources, notices);
  assert.equal(result.packages[0].license, null);
  assert.equal(result.notices[0].path, "LICENSE");
  assert.match(result.notices[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    fs.readFileSync(path.join(notices, result.notices[0].copy), "utf8"),
    "existing notice, not a new grant"
  );
  assert.throws(() => inspect(archive, resources, notices), /EEXIST/);
  assert(result.resources.some((item) => item.path === "vendor.dll"));
  fs.unlinkSync(path.join(input, "package.json"));
  await asar.createPackage(input, archive);
  asar.uncacheAll();
  assert.throws(() => inspect(archive, resources), /metadata missing/);
});
