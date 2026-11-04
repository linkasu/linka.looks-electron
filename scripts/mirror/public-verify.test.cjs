const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { publicVerify, installerPath } = require("./public-verify.cjs");
const body = Buffer.from("exact installer");
const sha256 = createHash("sha256").update(body).digest("hex");
const version = "4.1.0";
async function fixture(t, change = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (change.infra) {
      res.writeHead(503);
      res.end();
      return;
    }
    if (change.redirect) {
      res.writeHead(302, { Location: "https://evil.invalid/" });
      res.end();
      return;
    }
    if (req.url.endsWith("version.json"))
      res.end(JSON.stringify({ version: change.version || version }));
    else if (req.url.endsWith("manifest.json"))
      res.end(
        JSON.stringify({
          version,
          sha256,
          size: body.length,
          installer: change.path || `releases/${version}-${sha256}/linka.looks.setup.exe`
        })
      );
    else if (change.truncate) {
      res.writeHead(200, { "Content-Length": body.length + 1 });
      res.write(body);
      res.destroy();
    } else
      res.end(
        (change.badLegacy && req.url === "/dist/linka.looks/linka.looks.setup.exe") ||
          (change.badImmutable && req.url.includes("/releases/"))
          ? Buffer.from("wrong installer")
          : body
      );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      })
  );
  return { root: `http://127.0.0.1:${server.address().port}/dist/linka.looks/`, requests };
}
test("external probe hashes immutable and actual legacy installer", async (t) => {
  const f = await fixture(t);
  const result = await publicVerify({ version, sha256, size: body.length, root: f.root });
  assert.equal(result.status, "PUBLISHED_DISTRIBUTION_VERIFIED");
  assert.equal(result.publication, "PUBLISHED");
  assert.equal(f.requests.length, 4);
});
for (const [name, change, status, stage] of [
  ["latest wrong", { version: "3.3.1" }, "PUBLISHED_DISTRIBUTION_UNVERIFIED", "version"],
  [
    "immutable wrong bytes",
    { badImmutable: true },
    "PUBLISHED_DISTRIBUTION_UNVERIFIED",
    "immutable-installer"
  ],
  [
    "legacy wrong bytes",
    { badLegacy: true },
    "PUBLISHED_DISTRIBUTION_UNVERIFIED",
    "legacy-installer"
  ],
  ["traversal", { path: "../evil.exe" }, "PUBLISHED_DISTRIBUTION_UNVERIFIED", "manifest"],
  [
    "external URL",
    { path: "https://evil.invalid/app.exe" },
    "PUBLISHED_DISTRIBUTION_UNVERIFIED",
    "manifest"
  ],
  ["redirect refused", { redirect: true }, "PUBLISHED_DISTRIBUTION_UNVERIFIED", "version"],
  ["503 not proof origin down", { infra: true }, "INFRA_ERROR", "version"],
  ["truncated stream", { truncate: true }, "INFRA_ERROR", "immutable-installer"]
])
  test(name, async (t) => {
    const f = await fixture(t, change);
    const result = await publicVerify({
      version,
      sha256,
      size: body.length,
      root: f.root,
      timeout: 1000
    });
    assert.equal(result.status, status);
    assert.equal(
      result.publication,
      "PUBLISHED",
      "delivery failure must not imply publication rollback"
    );
    assert.equal(result.stage, stage);
    assert(result.attempts <= 4);
  });
test("immutable path is exact, not merely same origin", () => {
  for (const value of ["../app.exe", "/dist/app.exe", "releases/x/%2e%2e/app.exe"])
    assert.throws(() => installerPath(value, version, sha256));
});
const workflow = () =>
  require("yaml").parse(
    fs.readFileSync(
      path.join(__dirname, "../../.github/workflows/publish-linka-looks-updater.yml"),
      "utf8"
    )
  );
test("mirror pins workflow tooling and manual verify-only skips both SSH writes, never the probe", () => {
  const w = workflow(),
    steps = w.jobs["publish-updater"].steps;
  const checkout = steps.find((step) => step.uses === "actions/checkout@v4");
  assert.equal(checkout.with.ref, "${{ github.workflow_sha }}");
  assert.equal(checkout.with["persist-credentials"], false);
  const verify = steps.find((step) => step.name === "Verify exact mirror workflow implementation");
  assert.equal(verify.env.EXPECTED_WORKFLOW_SHA, "${{ github.workflow_sha }}");
  assert(verify.run.includes('test "$(git rev-parse HEAD)" = "$EXPECTED_WORKFLOW_SHA"'));
  assert.equal(w.on.workflow_dispatch.inputs.verify_only.type, "boolean");
  assert.equal(w.on.workflow_dispatch.inputs.verify_only.default, true);
  assert.equal(w.on.workflow_call.inputs.verify_only.type, "boolean");
  assert.equal(w.on.workflow_call.inputs.verify_only.default, false);
  assert.deepEqual(w.on.release.types, ["published"]);
  for (const name of ["Configure SSH", "Update public installer mirror"])
    assert.equal(steps.find((step) => step.name === name).if, "inputs.verify_only != true");
  const probe = steps.find((step) => step.name === "Verify actual public downloads from hosted CI");
  assert.equal(probe.if, "always() && env.MIRROR_VERSION != ''");
  assert.equal(probe.env, undefined);
  assert.equal(w.concurrency["cancel-in-progress"], false);
});
test("unresolved publication and published infra failure have independent sanitized summaries", (t) => {
  const steps = workflow().jobs["publish-updater"].steps;
  const initial = JSON.parse(
    steps
      .find((step) => step.name === "Initialize sanitized distribution result")
      .run.match(/echo '([^']+)'/)[1]
  );
  assert.equal(initial.publication, "PUBLICATION_STATE_UNVERIFIED");
  assert.equal(initial.status, "DISTRIBUTION_NOT_VERIFIED");
  const resolution = steps.find(
    (step) => step.name === "Resolve exact published installer digest"
  ).run;
  assert(
    resolution.indexOf("publication: 'PUBLISHED'") >
      resolution.indexOf("throw new Error('Installer size out of bounds')")
  );
  const summary = steps.find(
    (step) => step.name === "Summarize independent publication and distribution states"
  );
  assert.equal(summary.if, "always()");
  const script = summary.run.match(/node <<'NODE'\n([\s\S]+)\nNODE/)[1];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-summary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, result] of [
    ["unresolved", initial],
    ["infra", { publication: "PUBLISHED", status: "INFRA_ERROR", error: "HTTP_503" }]
  ]) {
    fs.writeFileSync(path.join(root, "public-distribution-summary.json"), JSON.stringify(result));
    const output = path.join(root, `${name}.md`);
    require("node:child_process").execFileSync(process.execPath, ["-e", script], {
      cwd: root,
      env: { ...process.env, GITHUB_STEP_SUMMARY: output },
      timeout: 10000
    });
    const text = fs.readFileSync(output, "utf8");
    assert(text.includes(`GitHub publication: **${result.publication}**`));
    assert(text.includes(`Public distribution: **${result.status}**`));
    assert.equal(text.includes("was not rolled back"), name === "infra");
  }
});
