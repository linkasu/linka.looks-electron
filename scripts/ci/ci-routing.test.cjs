const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");
const yaml = require("yaml");
const { route, changedPaths, assertRequired } = require("./ci-routing.cjs");

test("docs have a required check but no app/runtime build", () => {
  for (const paths of [
    [],
    ["README.md"],
    ["CHANGELOG.md"],
    ["docs/ci.md"],
    ["docs/release-400-notes.md"],
    ["docs/ci-pipeline.md", "agents/guide.md"]
  ]) {
    assert.deepEqual(route(paths).suites, ["format"]);
    assert.equal(route(paths).builds, 0);
    assert.deepEqual(route(paths).jobs, ["route", "fast"]);
  }
});

test("CI, upgrade harness and metadata changes stay static, without model/runtime", () => {
  for (const file of [
    ".github/workflows/ci.yml",
    ".github/actions/setup-app/action.yml",
    "scripts/ci/real-upgrade.ps1",
    "scripts/ci/qualification-runner.cjs",
    "scripts/ci/ci-routing.cjs",
    "scripts/ci/candidate-stage.cjs",
    "scripts/ci/model-import-origin.cjs",
    "scripts/mirror/update.cjs",
    "AGENTS.md",
    ".gitignore"
  ]) {
    const result = route([file]);
    assert.deepEqual(result.suites, ["format", "contracts", "static"]);
    assert.equal(result.builds, 0);
    assert.deepEqual(result.jobs, ["route", "fast", "windows-contracts"]);
    assert(result.reasons.length);
  }
});

test("app, unknown and E2E inputs use at most one Windows build", () => {
  for (const file of [
    "src/frontend/App.vue",
    "public/help.md",
    "src/frontend/content.md",
    "tests/e2e/fixture.md",
    "unknown-root.md",
    "unknown/input",
    "scripts/new-helper.cjs",
    "scripts/ci/unknown-script.cjs",
    "tests/e2e/app.spec.ts"
  ]) {
    const result = route([file]);
    assert(result.suites.includes("windows"));
    assert.equal(result.builds, 1);
    assert.equal(result.packaging, false);
    assert(!result.jobs.includes("windows-contracts"));
  }
  assert(route(["src/frontend/App.vue"]).suites.includes("unit"));
  assert(!route(["tests/e2e/app.spec.ts"]).suites.includes("unit"));
});

test("legal, approval, lock, installer and resources override docs classification", () => {
  for (const file of [
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "docs/security/release-400-audit.md",
    ".npmrc",
    ".nvmrc",
    "scripts/ci/provision-eyelog.cjs",
    "scripts/ci/build-bubble-backend.cjs",
    "scripts/ci/provision-bubble-runtime.cjs",
    "native/tobii-backend/TobiiSource.cs",
    "scripts/ci/stage-approved-predictor.cjs",
    "scripts/ci/candidate-eyelog-api.cjs",
    "scripts/ci/packaged-resources-smoke.js",
    "build/predictor-approval.json",
    "build/installer.nsh",
    "package-lock.json",
    "src/electron/updater.ts",
    "extraResources/defaultSets/layout.linka",
    "predictor-resources/MODEL_NOTICE.md"
  ]) {
    assert.equal(route([file]).packaging, true, file);
    assert.equal(route([file]).builds, 1, file);
  }
});

test("NUL git diff includes both rename sides and deleted paths", () => {
  const paths = changedPaths(
    "R100\0src/old.ts\0docs/new.md\0D\0build/installer.nsh\0M\0README.md\0"
  );
  assert.deepEqual(paths, ["src/old.ts", "docs/new.md", "build/installer.nsh", "README.md"]);
  assert.equal(route(paths).builds, 1);
  assert.equal(route(paths).packaging, true);
  assert.throws(() => changedPaths("R100\0old\0"), /malformed/);
  for (const file of ["/tmp/input", "../input", "a/../b", "a\\b", ""]) {
    assert.throws(() => route([file]), /repo-relative/);
  }
});

test("aggregate rejects skipped, missing, failed and cancelled required results", () => {
  const required = ["route", "fast", "unit"];
  const successful = Object.fromEntries(required.map((name) => [name, { result: "success" }]));
  assert.doesNotThrow(() => assertRequired(required, successful));
  for (const result of ["skipped", "failure", "cancelled", undefined]) {
    assert.throws(() => assertRequired(required, { ...successful, unit: { result } }), /unit/);
  }
  assert.throws(() => assertRequired(required, { route: { result: "success" } }), /fast/);
  const ciJobs = route(["scripts/ci/ci-routing.cjs"]).jobs;
  const ciResults = Object.fromEntries(ciJobs.map((name) => [name, { result: "success" }]));
  assert.doesNotThrow(() => assertRequired(ciJobs, ciResults));
  for (const result of [undefined, "skipped", "cancelled", "failure"])
    assert.throws(
      () => assertRequired(ciJobs, { ...ciResults, "windows-contracts": { result } }),
      /windows-contracts/
    );
});

test("actual aggregate step fails closed on missing output and non-success jobs", () => {
  const workflow = yaml.parse(fs.readFileSync(".github/workflows/ci.yml", "utf8"));
  const step = workflow.jobs["ci-required"].steps.at(-1);
  for (const [required, needs, expected] of [
    [["route", "fast"], { route: { result: "success" }, fast: { result: "success" } }, 0],
    [["route", "fast"], { route: { result: "success" }, fast: { result: "skipped" } }, 1],
    [["route", "fast", "unit"], { route: { result: "success" }, fast: { result: "success" } }, 1],
    [null, { route: { result: "failure" } }, 1]
  ]) {
    const child = spawnSync("bash", ["-e", "-c", step.run], {
      encoding: "utf8",
      env: {
        ...process.env,
        REQUIRED: required ? JSON.stringify(required) : "",
        NEEDS: JSON.stringify(needs)
      }
    });
    assert.equal(child.status, expected, child.stderr);
  }
});

test("push routing uses the entire before..head range, including a docs-only last commit", (t) => {
  const workflow = yaml.parse(fs.readFileSync(".github/workflows/ci.yml", "utf8"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-routing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts/ci"), { recursive: true });
  fs.copyFileSync("scripts/ci/ci-routing.cjs", path.join(root, "scripts/ci/ci-routing.cjs"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("add", ".");
  git("commit", "--quiet", "-m", "baseline");
  const before = git("rev-parse", "HEAD");
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src/app.ts"), "fixture");
  git("add", ".");
  git("commit", "--quiet", "-m", "app");
  fs.writeFileSync(path.join(root, "README.md"), "docs");
  git("add", ".");
  git("commit", "--quiet", "-m", "docs");
  const step = workflow.jobs.route.steps.find((item) => item.id === "route");
  const child = spawnSync("bash", ["-e", "-c", step.run], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVENT_NAME: "push",
      BASE_SHA: before,
      HEAD_SHA: git("rev-parse", "HEAD"),
      GITHUB_OUTPUT: "",
      GITHUB_STEP_SUMMARY: ""
    }
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).builds, 1);
  assert(JSON.parse(child.stdout).reasons.some((item) => item.path === "src/app.ts"));
  const initialPush = spawnSync("bash", ["-e", "-c", step.run], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVENT_NAME: "push",
      BASE_SHA: "0".repeat(40),
      HEAD_SHA: git("rev-parse", "HEAD"),
      GITHUB_OUTPUT: "",
      GITHUB_STEP_SUMMARY: ""
    }
  });
  assert.equal(initialPush.status, 0, initialPush.stderr);
  assert.equal(JSON.parse(initialPush.stdout).builds, 1);
  const manual = spawnSync("bash", ["-e", "-c", step.run], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVENT_NAME: "workflow_dispatch",
      BASE_SHA: "",
      HEAD_SHA: git("rev-parse", "HEAD"),
      GITHUB_OUTPUT: "",
      GITHUB_STEP_SUMMARY: ""
    }
  });
  assert.equal(manual.status, 0, manual.stderr);
  assert.deepEqual(JSON.parse(manual.stdout).jobs, ["route", "fast", "unit", "windows"]);
  assert.equal(JSON.parse(manual.stdout).builds, 1);
  assert(
    JSON.parse(manual.stdout).reasons.some((item) => item.path === "scripts/ci/ci-routing.cjs")
  );
});

test("YAML execution contract: stable aggregate, no path skip and one Windows producer", () => {
  const source = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  const workflow = yaml.parse(source);
  assert.deepEqual(workflow.on.workflow_dispatch, {});
  assert.deepEqual(workflow.on.pull_request.types, ["opened", "reopened", "synchronize"]);
  assert.equal(workflow.on.pull_request["paths-ignore"], undefined);
  assert.equal(workflow.on.push["paths-ignore"], undefined);
  assert.match(workflow.concurrency.group, /github.workflow.*pull_request.number.*github.ref/);
  assert.doesNotMatch(workflow.concurrency.group, /sha/i);
  assert.match(String(workflow.concurrency["cancel-in-progress"]), /pull_request/);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const aggregate = workflow.jobs["ci-required"];
  assert.equal(aggregate.if, "${{ always() }}");
  assert.deepEqual(aggregate.needs, ["route", "fast", "windows-contracts", "unit", "windows"]);
  assert.match(JSON.stringify(aggregate), /assertRequired/);
  assert.equal(workflow.jobs.windows["runs-on"], "windows-2022");
  const builds = Object.values(workflow.jobs)
    .flatMap((job) => job.steps || [])
    .filter((step) => step.run?.includes("npm run electron:build"));
  assert.equal(builds.length, 1);
  assert.match(builds[0].run, /--dir/);
  assert.match(builds[0].run, /-p never/);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.fast), /cargo|rustup|native: true/);
  assert.equal(
    workflow.jobs.fast.steps.filter((step) => step.uses === "./.github/actions/setup-app").length,
    1
  );
  const contracts = workflow.jobs.fast.steps.find((step) => step.run?.includes("node --test"));
  const sourceFixture = workflow.jobs.fast.steps.find(
    (step) => step.with?.repository === "linkasu/linka.predictor-rust"
  );
  assert.equal(sourceFixture.with.ref, "85135083c1d640ecaf24fa2418b88022d74564ae");
  assert.equal(sourceFixture.with.path, "predictor-resources/source");
  assert.equal(sourceFixture.with["fetch-depth"], 0);
  assert.equal(sourceFixture.with["persist-credentials"], false);
  assert.equal(sourceFixture.if, "needs.route.outputs.contracts == 'true'");
  assert(
    workflow.jobs.fast.steps.indexOf(sourceFixture) < workflow.jobs.fast.steps.indexOf(contracts)
  );
  const sourceRoot = "${{ github.workspace }}/predictor-resources/source";
  assert.equal(contracts.env.BOOK_SOURCE_ROOT, sourceRoot);
  assert.equal(contracts.env.BASE_MODEL_SOURCE_REPO, sourceRoot);
  assert.equal(
    contracts.env.BOOK_CANDIDATES_WORKFLOW,
    `${sourceRoot}/.github/workflows/model-candidates.yml`
  );
  assert.equal(
    contracts.env.BASE_MODEL_WORKFLOW,
    `${sourceRoot}/.github/workflows/promote-base-model.yml`
  );
  for (const seam of [
    "candidate-stage.test.cjs",
    "import-book-candidate.test.cjs",
    "public-verify.test.cjs",
    "model-import-origin.test.cjs",
    "promote-base-model.test.cjs",
    "windows-model-benchmark.test.cjs",
    "predictor-evaluation*.test.mjs",
    "book-model-evaluation.test.mjs"
  ])
    assert(contracts.run.includes(seam));
  assert.doesNotMatch(source, /ae1392|9980f4|matrix:|secrets\./);
  assert.match(source, /ec07b2cd49c1c2c684e6643f0dab75cf5895ebca/);
  const unit = JSON.stringify(workflow.jobs.unit);
  assert.match(unit, /actions\/cache@v4/);
  assert.match(unit, /1\.98\.1/);
  assert.match(unit, /cache-hit != 'true'/);
  assert.match(source, /git diff --name-status -z/);
  assert.match(source, /BASE_SHA/);
  const nativeContracts = workflow.jobs["windows-contracts"];
  assert.equal(nativeContracts["runs-on"], "windows-2022");
  assert.match(nativeContracts.if, /contracts == 'true'.*windows != 'true'/);
  assert.doesNotMatch(JSON.stringify(nativeContracts), /electron:build|native:.*true|secrets\./);
  const nativeStep = workflow.jobs.windows.steps.findIndex((step) =>
    step.run?.includes("real-upgrade-contract.test.cjs")
  );
  assert(
    nativeStep <
      workflow.jobs.windows.steps.findIndex((step) => step.run?.includes("npm run electron:build"))
  );
});

test("shared setup only rebuilds the approved lifecycle whitelist", () => {
  const action = yaml.parse(fs.readFileSync(".github/actions/setup-app/action.yml", "utf8"));
  assert.deepEqual(Object.keys(action.inputs), ["node-version", "native", "working-directory"]);
  assert.equal(action.inputs.native.default, "false");
  assert.equal(action.inputs["node-version"].default, "22.22.2");
  const steps = action.runs.steps;
  assert(!steps.some((step) => step.uses?.includes("checkout")));
  assert(steps.some((step) => step.run === "npm ci --ignore-scripts"));
  assert(steps.some((step) => step.run === "npm rebuild esbuild"));
  const native = steps.find((step) => step.run?.includes("pictures.bank-api"));
  assert.match(native.if, /inputs.native == 'true'/);
  assert.match(
    native.run,
    /^npm rebuild pictures.bank-api esbuild electron\nnode scripts\/ci\/provision-eyelog.cjs\n?$/
  );
});
