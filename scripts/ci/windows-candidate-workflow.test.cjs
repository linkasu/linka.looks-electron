const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { finished } = require("node:stream/promises");
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

test("candidate builds once, main-gates immutable uploads and never publishes", () => {
  const source = fs.readFileSync(".github/workflows/windows-candidate.yml", "utf8");
  const workflow = yaml.parse(source);
  assert.deepEqual(workflow.permissions, { contents: "read", actions: "read" });
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(Object.keys(workflow.jobs), ["build"]);
  const job = workflow.jobs.build;
  assert.match(job.if, /linkasu\/linka\.looks-electron.*refs\/heads\/main/);
  assert.equal(job["runs-on"], "windows-2022");
  const builds = job.steps.filter((step) => step.run?.includes("npm run electron:build"));
  assert.equal(builds.length, 1);
  assert.match(builds[0].run, /--win --x64 -p never/);
  assert.doesNotMatch(builds[0].run, /--dir|prepackaged/);
  for (const step of job.steps) {
    if (step.uses === "actions/checkout@v4") assert.equal(step.with["persist-credentials"], false);
    assert.doesNotMatch(JSON.stringify(step), /secrets\./);
    if (step.uses === "actions/upload-artifact@v4" && step.id)
      assert.equal(step.if, undefined, "eligible artifacts cannot upload after a failed gate");
  }
  assert.match(source, /git merge-base --is-ancestor "\$app_sha" "\$GITHUB_SHA"/);
  assert.doesNotMatch(source, /-p always|gh release|git tag|--mac|notarization|CSC_LINK|APPLE_ID/);
  const descriptor = job.steps.findIndex((step) => step.id === "candidate");
  for (const kind of ["windows", "sources", "security"]) {
    const index = job.steps.findIndex((step) => step.id === kind);
    assert(index > 0 && descriptor > index);
    assert.equal(job.steps[index].with["if-no-files-found"], "error");
    assert(source.includes(`steps.${kind}.outputs.artifact-id`));
    assert(source.includes(`steps.${kind}.outputs.artifact-digest`));
  }
  assert.equal(job.steps[descriptor].with.path, "descriptor/candidate.json");
  assert.equal(job.steps[descriptor].with["if-no-files-found"], "error");
  assert.equal(builderRequire("app-builder-lib/package.json").version, "26.16.1");
  const pkg = JSON.parse(fs.readFileSync("package.json"));
  for (const notice of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    assert(pkg.build.files.includes(notice));
});

test("fresh audit and bound signoff precede payload uploads; network failures fail closed", async (t) => {
  const workflow = yaml.parse(fs.readFileSync(".github/workflows/windows-candidate.yml", "utf8"));
  const steps = workflow.jobs.build.steps;
  const auditIndex = steps.findIndex((step) => step.run?.includes("npm audit"));
  const stageIndex = steps.findIndex((step) => step.run?.includes("candidate-stage.cjs stage"));
  const audit = steps[auditIndex];
  const stage = steps[stageIndex];
  const uploadIndex = steps.findIndex((step) => step.id === "windows");
  assert(auditIndex > steps.findIndex((step) => step.run?.includes("release-inventory.cjs")));
  assert(stageIndex > auditIndex && uploadIndex > stageIndex);
  for (const step of [audit, stage]) {
    assert.equal(step.if, undefined);
    assert.equal(step["continue-on-error"], undefined);
    assert.equal(step["working-directory"], "app");
  }
  const evidence = steps.find((step) => step.with?.name?.startsWith("candidate-diagnostics-"));
  assert.equal(evidence.if, "always()");
  for (const file of ["inventory.json", "audit.json"]) assert(evidence.with.path.includes(file));
  const stageSource = fs.readFileSync("scripts/ci/candidate-stage.cjs", "utf8");
  assert.match(stageSource, /release-security-audit/);
  assert.match(stageSource, /package-lock\.json/);
  for (const [auditStatus, helperStatus] of [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1]
  ]) {
    await t.test(`audit exit ${auditStatus}, staging exit ${helperStatus}`, (t) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-audit-"));
      t.after(() => fs.rmSync(root, { recursive: true }));
      fs.mkdirSync(path.join(root, "release-evidence"));
      const result = spawnSync(
        "bash",
        [
          "-e",
          "-c",
          `
        npm() {
          test "$*" = 'audit --omit=dev --json' || return 99
          printf '{"fixture":"audit diagnostics"}\\n'
          return ${auditStatus}
        }
        node() {
          printf '%s\\n' "$@" > helper-arguments.txt
          return ${helperStatus}
        }
        ${audit.run}
        ${stage.run}
      `
        ],
        { cwd: root, encoding: "utf8" }
      );
      assert.equal(result.status === 0, auditStatus <= 1 && helperStatus === 0, result.stderr);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(root, "release-evidence/audit.json"))),
        { fixture: "audit diagnostics" }
      );
      assert.equal(fs.existsSync(path.join(root, "helper-arguments.txt")), auditStatus <= 1);
      if (auditStatus <= 1)
        assert.deepEqual(
          fs.readFileSync(path.join(root, "helper-arguments.txt"), "utf8").trim().split("\n"),
          ["../tooling/scripts/ci/candidate-stage.cjs", "stage", "../candidate-stage"]
        );
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
  await finished(await asar.createPackage(input, archive));
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
  await finished(await asar.createPackage(input, missingMetadataArchive));
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
