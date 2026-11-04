const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
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
    "build/Release/usb.a",
    "build/Release/usb.lib",
    "build/config.gypi",
    "build/Release/obj.target/usb_bindings/src/device.o",
    "build/Release/obj.target/libusb/libusb/core.o",
    "build/Release/obj.target/usb_bindings/src/device.obj"
  ])
    assert.equal(included(name), false, "compiler intermediates must not ship as runtime payload");
  for (const name of ["build", "build/Release"])
    assert(filter(path.join(root, name), { isDirectory: () => true }), "runtime parent omitted");
});

test("4.0.0 builds once, main-gates accepted artifact retention and never publishes", () => {
  const source = fs.readFileSync(".github/workflows/release-331-preflight.yml", "utf8");
  const workflow = yaml.parse(source);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.release, undefined);
  assert.match(
    workflow.jobs["release-windows"].if,
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
          if (step.with.name.startsWith("accepted-"))
            assert.equal(step.with.path, "app/release-ready/");
          else assert.equal(step.with.name, "security-evidence-400-${{ github.run_id }}");
        }
      }
      assert.doesNotMatch(JSON.stringify(step), /secrets\./);
      if (step.run?.includes("npm run electron:build")) {
        assert.match(step.run, /-p never/);
        assert.doesNotMatch(step.run, /--dir|prepackaged/);
      }
    }
  }
  assert.doesNotMatch(source, /-p always|GH_TOKEN|backport-keychain|gh release|git tag/);
  for (const gate of [
    "release-artifacts-mac-compat.cjs dist",
    "release-artifacts.cjs stage windows",
    "release-source-bundle.cjs"
  ]) {
    assert(source.includes(gate), `missing strict gate: ${gate}`);
  }
  assert.equal(builderRequire("app-builder-lib/package.json").version, "26.16.1");
  assert.equal(workflow.jobs.unsigned["runs-on"], "windows-2022");
  assert.equal(workflow.jobs["signed-macos"], undefined);
  assert.doesNotMatch(source, /--mac|notarization|CSC_LINK|APPLE_ID/);
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
    "release-windows",
    "--draft",
    "Release collision"
  ])
    assert(promotionSource.includes(gate));
  const pkg = JSON.parse(fs.readFileSync("package.json"));
  for (const notice of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    assert(pkg.build.files.includes(notice));
});

test("fresh production audit blocks accepted upload and preserves separate failure evidence", async (t) => {
  const workflow = yaml.parse(
    fs.readFileSync(".github/workflows/release-331-preflight.yml", "utf8")
  );
  const steps = workflow.jobs["release-windows"].steps;
  const gateIndex = steps.findIndex((step) => step.run?.includes("npm audit"));
  const gate = steps[gateIndex];
  const acceptedIndex = steps.findIndex((step) => step.with?.name?.startsWith("accepted-"));
  const evidence = steps.find((step) => step.with?.name?.startsWith("security-evidence-"));
  assert(gateIndex > steps.findIndex((step) => step.run?.includes("stage windows")));
  assert(acceptedIndex > gateIndex);
  assert.equal(gate["working-directory"], "app");
  assert.equal(gate.shell, "bash");
  assert.equal(gate.if, undefined);
  assert.equal(gate["continue-on-error"], undefined);
  assert.equal(steps[acceptedIndex].if, undefined);
  assert.equal(evidence.if, "always()");
  assert.equal(evidence.with["if-no-files-found"], "warn");
  assert.deepEqual(evidence.with.path.trim().split("\n"), [
    "app/release-evidence/inventory.json",
    "app/release-evidence/audit-production.json",
    "app/release-evidence/security-signoff.json",
    "app/release-evidence/package-lock.json"
  ]);
  for (const [auditStatus, helperStatus] of [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1]
  ]) {
    await t.test(`audit exit ${auditStatus}, helper exit ${helperStatus}`, (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-audit-gate-"));
      t.after(() => fs.rmSync(root, { recursive: true }));
      fs.mkdirSync(path.join(root, "release-evidence"));
      fs.writeFileSync(path.join(root, "package-lock.json"), "exact lock bytes\n");
      const result = spawnSync(
        "bash",
        [
          "-c",
          `
        npm() {
          test "$*" = 'audit --omit=dev --json' || return 99
          printf '{"fixture":"audit diagnostics"}\\n'
          return ${auditStatus}
        }
        node() {
          printf '%s\\n' "$@" > helper-arguments.txt
          if [ ${helperStatus} -ne 0 ]; then return ${helperStatus}; fi
          printf '{"status":"REVIEWED_SOURCE_ONLY"}\\n'
        }
        ${gate.run}
      `
        ],
        { cwd: root, encoding: "utf8" }
      );
      assert.equal(result.status, auditStatus > 1 ? auditStatus : helperStatus, result.stderr);
      assert.equal(
        fs.readFileSync(path.join(root, "release-evidence/package-lock.json"), "utf8"),
        "exact lock bytes\n"
      );
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(root, "release-evidence/audit-production.json"))),
        { fixture: "audit diagnostics" }
      );
      const helperCalled = fs.existsSync(path.join(root, "helper-arguments.txt"));
      assert.equal(helperCalled, auditStatus <= 1);
      if (helperCalled) {
        assert.deepEqual(
          fs.readFileSync(path.join(root, "helper-arguments.txt"), "utf8").trim().split("\n"),
          [
            "../tooling/scripts/ci/release-security-audit.cjs",
            "release-evidence/inventory.json",
            "release-evidence/audit-production.json",
            "release-ready/provenance-windows.json",
            "package-lock.json"
          ]
        );
        const signoff = fs.readFileSync(
          path.join(root, "release-evidence/security-signoff.json"),
          "utf8"
        );
        if (helperStatus) assert.equal(signoff, "");
        else assert.equal(JSON.parse(signoff).status, "REVIEWED_SOURCE_ONLY");
      } else assert(!fs.existsSync(path.join(root, "release-evidence/security-signoff.json")));
    });
  }
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
    JSON.stringify({ name: "fixture", version: "4.0.0" })
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
  const missingMetadataArchive = path.join(resources, "missing-app.asar");
  await asar.createPackage(input, missingMetadataArchive);
  assert.equal(
    JSON.parse(
      asar
        .extractFile(
          missingMetadataArchive,
          path.join("node_modules", "@fixture", "nested", "package.json")
        )
        .toString("utf8")
    ).name,
    "nested"
  );
  assert.throws(() => inspect(missingMetadataArchive, resources), /metadata missing/);
});
