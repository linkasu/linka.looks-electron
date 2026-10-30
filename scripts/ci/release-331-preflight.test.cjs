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

test("USB runtime resources retain bindings and notices, not compiler intermediates", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json"));
  const resource = pkg.build.extraResources.find((item) => item.from === "./node_modules/usb/");
  const { FileMatcher } = builderRequire("app-builder-lib/out/fileMatcher");
  const root = path.resolve("node_modules/usb");
  const filter = new FileMatcher(
    root,
    path.resolve("fixture-output"),
    (value) => value,
    resource.filter
  ).createFilter();
  const included = (name) => filter(path.join(root, name), { isDirectory: () => false });
  for (const name of [
    "package.json",
    "LICENSE",
    "dist/index.js",
    "build/Release/usb_bindings.node",
    "prebuilds/darwin-x64+arm64/node.napi.node"
  ])
    assert(included(name), `runtime/notice omitted: ${name}`);
  for (const name of [
    "build/Release/obj.target/usb_bindings/src/device.o",
    "build/Release/obj.target/libusb/libusb/core.o",
    "build/Release/obj.target/usb_bindings/src/device.obj"
  ])
    assert.equal(included(name), false, "compiler intermediates must not ship as runtime payload");
});

test("3.3.1 builds once, main-gates accepted artifact retention and never publishes", () => {
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
      if (step.uses === "actions/upload-artifact@v4") {
        if (jobName === "unsigned") assert.equal(step.with.path, "release-evidence/inventory.json");
        else {
          assert.match(
            job.if,
            /workflow_dispatch.*refs\/heads\/main.*linkasu\/linka\.looks-electron/
          );
          assert.equal(step.with.path, "app/release-ready/");
        }
      }
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
    "hdiutil attach -quiet -readonly",
    "verify-macos-payload.py bundle-equal",
    "release-artifacts.cjs stage macos",
    "release-artifacts.cjs stage windows",
    "release-source-bundle.cjs"
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
  assert.equal(workflow.jobs["release-windows"]["runs-on"], "windows-2022");
  assert.match(source, /test "\$GITHUB_SHA" = "\$EXPECTED_TOOLING_SHA"/);
  const promotion = yaml.parse(fs.readFileSync(".github/workflows/electron.yml", "utf8"));
  assert.deepEqual(Object.keys(promotion.on), ["workflow_dispatch"]);
  const promotionSource = JSON.stringify(promotion);
  assert.doesNotMatch(
    promotionSource,
    /-p always|electron:build|secrets\.|--admin|--force|--clobber/
  );
  for (const gate of [
    "release-artifacts.cjs verify",
    "signed-macos",
    "release-windows",
    "--draft",
    "Release collision"
  ])
    assert(promotionSource.includes(gate));
  const pkg = JSON.parse(fs.readFileSync("package.json"));
  for (const notice of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    assert(pkg.build.files.includes(notice));
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
  const dependency = path.join(input, "node_modules/@fixture/nested");
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(
    path.join(dependency, "package.json"),
    JSON.stringify({ name: "nested", version: "1.0.0" })
  );
  fs.writeFileSync(path.join(dependency, "NOTICE"), "nested notice");
  fs.writeFileSync(path.join(resources, "vendor.dll"), "fixture DLL");
  const archive = path.join(resources, "app.asar");
  await asar.createPackage(input, archive);
  const listPackage = asar.listPackage;
  t.mock.method(asar, "listPackage", (...args) =>
    listPackage(...args).map((name) => name.replaceAll("/", "\\"))
  );
  const notices = path.join(root, "notices");
  const result = inspect(archive, resources, notices);
  assert.equal(result.packages.find((pkg) => pkg.path === "package.json").license, null);
  assert.equal(
    result.packages.find((pkg) => pkg.name === "nested").path,
    "node_modules/@fixture/nested/package.json"
  );
  assert(result.notices.some((item) => item.path === "node_modules/@fixture/nested/NOTICE"));
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
