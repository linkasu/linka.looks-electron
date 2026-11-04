const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  publish,
  verifyPrepared,
  extractQualification,
  verifyNotes
} = require("./release-publication.cjs");
const { prepare, releaseApi, request } = require("./release-publication-io.cjs");
const hash = (b) => createHash("sha256").update(b).digest("hex");
test("IDs are canonical bounded safe integer strings", async () => {
  const { positiveId } = require("./release-publication.cjs");
  for (const id of ["1", "1234567890123456", "9007199254740991"]) assert(positiveId(id));
  for (const id of [
    1,
    "0",
    "01",
    "-1",
    "1e3",
    "9007199254740992",
    "9999999999999999",
    "10000000000000000"
  ]) {
    assert(!positiveId(id));
    await assert.rejects(
      prepare(id, "unused", {
        request: () => {
          assert.fail("invalid ID reached API");
        }
      })
    );
  }
});
test("write job gets tooling from exact trusted git SHA, never a prepared code artifact", () => {
  const workflow = require("yaml").parse(
    fs.readFileSync(path.join(__dirname, "../../.github/workflows/release.yml"), "utf8")
  );
  for (const name of ["prepare", "publish"]) {
    const steps = workflow.jobs[name].steps;
    const checkout = steps.find((step) => step.uses === "actions/checkout@v4");
    assert.equal(checkout.with.ref, "${{ github.sha }}");
    assert.equal(checkout.with["persist-credentials"], false);
    assert(
      steps.some((step) => step.run?.includes('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"'))
    );
    assert(!steps.some((step) => step.with?.name?.startsWith("publisher-")));
  }
  const steps = workflow.jobs.publish.steps;
  const checkout = steps.find((step) => step.uses === "actions/checkout@v4");
  assert.equal(checkout.with["sparse-checkout-cone-mode"], false);
  assert.deepEqual(checkout.with["sparse-checkout"].trim().split("\n"), [
    "/scripts/ci/release-publication.cjs",
    "/scripts/ci/release-publication-io.cjs"
  ]);
  assert(!steps.some((step) => /npm|build|candidate-io/.test(step.run || "")));
});
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "publication-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from("candidate exact bytes");
  fs.writeFileSync(path.join(directory, "installer.exe"), bytes);
  fs.writeFileSync(path.join(directory, "release-notes.md"), "# 4.1.0\nReviewed notes\n");
  const manifest = {
    schema: "linka-release-publication-v1",
    repository: "linkasu/linka.looks-electron",
    version: "4.1.0",
    tag: "v4.1.0",
    appSha: "a".repeat(40),
    candidateId: "12",
    candidateSha256: "b".repeat(64),
    qualificationRunId: "34",
    qualificationRunAttempt: 1,
    qualificationArtifactId: "56",
    qualificationSha256: "c".repeat(64),
    notes: {
      name: "release-notes.md",
      bytes: fs.statSync(path.join(directory, "release-notes.md")).size,
      sha256: hash(fs.readFileSync(path.join(directory, "release-notes.md")))
    },
    files: [{ name: "installer.exe", bytes: bytes.length, sha256: hash(bytes) }]
  };
  fs.writeFileSync(path.join(directory, "publication.json"), JSON.stringify(manifest));
  return { directory, manifest };
}
function fakeApi(manifest, initial = null) {
  let release = initial;
  let tag = initial && !initial.draft ? manifest.appSha : null;
  const writes = [];
  const api = {
    async read() {
      return { release: release && structuredClone(release), tagSha: tag };
    },
    async createDraft() {
      writes.push("create");
      release = {
        id: 1,
        tag_name: manifest.tag,
        target_commitish: manifest.appSha,
        body: "# 4.1.0\nReviewed notes\n",
        draft: true,
        prerelease: false,
        assets: []
      };
    },
    async upload(id, file) {
      writes.push(`upload:${file.name}`);
      release.assets.push({ name: file.name, size: file.bytes, digest: `sha256:${file.sha256}` });
    },
    async publish() {
      writes.push("publish");
      release.draft = false;
      tag = manifest.appSha;
    }
  };
  return {
    api,
    writes,
    get release() {
      return release;
    }
  };
}
test("publisher tooling loads from two exact source files without dependencies or side effects", (t) => {
  const f = fixture(t),
    directory = path.join(f.directory, "tooling");
  fs.mkdirSync(directory);
  for (const name of ["release-publication.cjs", "release-publication-io.cjs"])
    fs.copyFileSync(path.join(__dirname, name), path.join(directory, name));
  require("node:child_process").execFileSync(
    process.execPath,
    [
      "-e",
      'require("./release-publication.cjs").verifyNotes("# Release 4.1.0\\nReviewed", "4.1.0");require("./release-publication-io.cjs")'
    ],
    { cwd: directory, env: { ...process.env, NODE_PATH: "" }, timeout: 10000 }
  );
});
test("prepared subject IDs cannot lose precision or change type", (t) => {
  const f = fixture(t);
  for (const id of [12, "9007199254740992", "10000000000000000"]) {
    fs.writeFileSync(
      path.join(f.directory, "publication.json"),
      JSON.stringify({ ...f.manifest, candidateId: id })
    );
    assert.throws(() => verifyPrepared(f.directory));
  }
});
test("first publication creates draft, uploads exact bytes and only then publishes", async (t) => {
  const f = fixture(t),
    remote = fakeApi(f.manifest);
  assert.equal((await publish(f.directory, remote.api)).status, "PUBLISHED");
  assert.deepEqual(remote.writes, ["create", "upload:installer.exe", "publish"]);
  assert.equal((await publish(f.directory, remote.api)).status, "ALREADY_PUBLISHED");
  assert.equal(remote.writes.length, 3);
});
test("matching draft resumes only missing assets without overwrites", async (t) => {
  const f = fixture(t),
    remote = fakeApi(f.manifest);
  await remote.api.createDraft();
  await remote.api.upload(1, f.manifest.files[0]);
  remote.writes.length = 0;
  await publish(f.directory, remote.api);
  assert.deepEqual(remote.writes, ["publish"]);
});
for (const [name, mutate] of [
  [
    "unknown draft asset",
    (r) => r.assets.push({ name: "unknown", size: 1, digest: `sha256:${"d".repeat(64)}` })
  ],
  [
    "asset collision",
    (r) => r.assets.push({ name: "installer.exe", size: 1, digest: `sha256:${"d".repeat(64)}` })
  ],
  [
    "wrong app",
    (r) => {
      r.target_commitish = "d".repeat(40);
    }
  ],
  [
    "wrong notes",
    (r) => {
      r.body = "invented notes";
    }
  ],
  [
    "published incomplete",
    (r) => {
      r.draft = false;
    }
  ]
])
  test(name + " stops before mutation", async (t) => {
    const f = fixture(t),
      remote = fakeApi(f.manifest);
    await remote.api.createDraft();
    mutate(remote.release);
    remote.writes.length = 0;
    await assert.rejects(publish(f.directory, remote.api));
    assert.deepEqual(remote.writes, []);
  });
test("uncertain upload reconciles before retry, no duplicate upload", async (t) => {
  const f = fixture(t),
    remote = fakeApi(f.manifest);
  const upload = remote.api.upload;
  remote.api.upload = async (...args) => {
    await upload(...args);
    throw Object.assign(new Error("timeout"), { uncertain: true });
  };
  await publish(f.directory, remote.api);
  assert.deepEqual(remote.writes, ["create", "upload:installer.exe", "publish"]);
});
test("uncertain unchanged state retries only once; auth never retries", async (t) => {
  const f = fixture(t),
    remote = fakeApi(f.manifest);
  let calls = 0;
  remote.api.createDraft = async () => {
    calls++;
    throw Object.assign(new Error("timeout"), { uncertain: true });
  };
  await assert.rejects(publish(f.directory, remote.api));
  assert.equal(calls, 2);
  calls = 0;
  remote.api.createDraft = async () => {
    calls++;
    throw new Error("401");
  };
  await assert.rejects(publish(f.directory, remote.api));
  assert.equal(calls, 1);
});
test("altered prepared files cannot reach writer", async (t) => {
  const f = fixture(t),
    remote = fakeApi(f.manifest);
  fs.writeFileSync(path.join(f.directory, "installer.exe"), "changed");
  await assert.rejects(publish(f.directory, remote.api));
  assert.deepEqual(remote.writes, []);
  assert.throws(() => verifyPrepared(f.directory));
});
for (const kind of ["extra", "symlink"])
  test(`${kind} prepared file cannot reach writer`, async (t) => {
    const f = fixture(t),
      remote = fakeApi(f.manifest);
    if (kind === "extra") fs.writeFileSync(path.join(f.directory, "unexpected"), "unknown");
    else {
      fs.unlinkSync(path.join(f.directory, "installer.exe"));
      fs.symlinkSync(
        path.join(f.directory, "release-notes.md"),
        path.join(f.directory, "installer.exe")
      );
    }
    await assert.rejects(publish(f.directory, remote.api));
    assert.deepEqual(remote.writes, []);
  });
test("existing different tag stops before draft creation", async (t) => {
  const f = fixture(t),
    remote = fakeApi(f.manifest);
  remote.api.read = async () => ({ tagSha: "f".repeat(40), release: null });
  await assert.rejects(publish(f.directory, remote.api));
  assert.deepEqual(remote.writes, []);
});
test("notes must explicitly describe the selected version", () => {
  assert.throws(() => verifyNotes("# 4.0.0 notes", "4.1.0"));
  assert.equal(verifyNotes("# Release 4.1.0\nChanges", "4.1.0"), "# Release 4.1.0\nChanges");
});
test("qualification ZIP rejects corrupt, duplicate, nested and unexpected entries on real FS", (t) => {
  const Zip = require("adm-zip"),
    f = fixture(t);
  assert.throws(() => extractQualification(Buffer.from("corrupt"), path.join(f.directory, "bad")));
  for (const name of ["nested/qualification.json", "evil.txt"]) {
    const zip = new Zip();
    zip.addFile(name, Buffer.from("{}"));
    assert.throws(() =>
      extractQualification(zip.toBuffer(), path.join(f.directory, name.replaceAll("/", "-")))
    );
  }
});

function qualificationFixture(t, change = {}) {
  const f = fixture(t);
  const q = {
    schema: "linka-windows-qualification-v1",
    repository: f.manifest.repository,
    candidateId: "12",
    candidateSha256: "b".repeat(64),
    version: "4.1.0",
    appSha: "a".repeat(40),
    buildToolingSha: "a".repeat(40),
    installerSha256: hash(fs.readFileSync(path.join(f.directory, "installer.exe"))),
    harnessSha: "a".repeat(40),
    runId: "34",
    runAttempt: 1,
    mode: "release",
    status: "PASS",
    gates: {},
    reports: []
  };
  const reports = {};
  for (const suite of ["software", "packaged", "security", "upgrade"]) {
    const report = {
      schema: "linka-ci-gate-v1",
      suite,
      mode: q.mode,
      status: "PASS",
      candidateId: q.candidateId,
      candidateSha256: q.candidateSha256,
      installerSha256: q.installerSha256,
      harnessSha: q.harnessSha,
      runId: q.runId,
      runAttempt: 1,
      job: { software: "software", packaged: "windows", security: "security", upgrade: "windows" }[
        suite
      ],
      data: { claimed: true }
    };
    change.data?.(report, q);
    const bytes = Buffer.from(JSON.stringify(report));
    reports[`${suite}.json`] = bytes;
    q.gates[suite] = { status: "PASS", report: `${suite}.json` };
    q.reports.push({ name: `${suite}.json`, bytes: bytes.length, sha256: hash(bytes) });
  }
  change.q?.(q);
  change.reports?.(reports);
  const Zip = require("adm-zip"),
    zip = new Zip();
  zip.addFile("qualification.json", Buffer.from(JSON.stringify(q)));
  for (const [name, bytes] of Object.entries(reports)) zip.addFile(name, bytes);
  const archive = zip.toBuffer();
  const run = {
    id: 34,
    run_attempt: 1,
    repository: { full_name: q.repository },
    head_repository: { full_name: q.repository },
    head_branch: "main",
    path: ".github/workflows/windows-qualification.yml",
    head_sha: q.harnessSha,
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    ...change.run
  };
  const artifact = {
    id: 56,
    name: "qualification-34-1",
    expired: false,
    size_in_bytes: archive.length,
    digest: `sha256:${hash(archive)}`,
    workflow_run: { id: 34, head_sha: q.harnessSha },
    ...change.artifact
  };
  const jobs = ["software", "windows", "security", "ready"].map((name) => ({
    name,
    run_id: 34,
    run_attempt: 1,
    head_sha: q.harnessSha,
    status: "completed",
    conclusion: "success"
  }));
  const candidate = {
    repository: q.repository,
    version: q.version,
    appSha: q.appSha,
    buildToolingSha: q.buildToolingSha,
    installer: { sha256: q.installerSha256 }
  };
  const calls = [];
  const options = {
    request: async (endpoint) => {
      calls.push(endpoint);
      if (endpoint.endsWith("/actions/runs/34")) return run;
      if (endpoint.includes("/artifacts?")) return { artifacts: [artifact] };
      if (endpoint.endsWith("/zip")) return archive;
      if (endpoint.includes("/jobs?")) return { jobs };
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    },
    candidateIo: {
      resolveCandidate: async () => {
        calls.push("resolveCandidate");
        return { candidate, candidateId: "12", candidateSha256: q.candidateSha256 };
      },
      downloadCandidatePart: async () => {
        calls.push("download");
        throw new Error("test cannot publish");
      }
    }
  };
  return { ...f, q, archive, options, calls, candidate, jobs, run, artifact };
}
for (const [name, change] of [
  ["cancelled actual producer", { run: { conclusion: "cancelled" } }],
  ["false workflow origin", { run: { path: ".github/workflows/evil.yml" } }],
  ["foreign origin", { run: { head_repository: { full_name: "foreign/repo" } } }],
  [
    "diagnostic JSON PASS",
    {
      q: (q) => {
        q.mode = "diagnostic";
      }
    }
  ],
  [
    "missing upgrade",
    {
      q: (q) => {
        delete q.gates.upgrade;
      }
    }
  ],
  [
    "report mismatch",
    {
      reports: (r) => {
        r["security.json"] = Buffer.from("{}");
      }
    }
  ],
  ["wrong artifact ZIP hash", { artifact: { digest: `sha256:${"f".repeat(64)}` } }]
])
  test(`prepare rejects ${name} before payload download or writer`, async (t) => {
    const f = qualificationFixture(t, change);
    await assert.rejects(prepare("34", path.join(f.directory, "out"), f.options));
    assert(!f.calls.includes("download"));
    assert(!fs.existsSync(path.join(f.directory, "out")));
  });
test("API-confirmed missing successful job cannot be replaced by JSON PASS", async (t) => {
  const f = qualificationFixture(t);
  f.jobs.pop();
  await assert.rejects(prepare("34", path.join(f.directory, "out"), f.options));
  assert(!f.calls.includes("download"));
});
test("qualification extraction checks full raw report map", (t) => {
  const f = qualificationFixture(t);
  const location = path.join(f.directory, "receipt");
  assert.equal(extractQualification(f.archive, location).runId, "34");
  assert.equal(fs.readdirSync(location).length, 5);
});
test("qualification ZIP rejects CRC corruption, symlinks, duplicates and oversized headers", (t) => {
  const f = qualificationFixture(t),
    Zip = require("adm-zip");
  for (const [name, mutate] of [
    [
      "symlink",
      (zip) => {
        zip.getEntry("software.json").attr = (0xa1ff << 16) >>> 0;
      }
    ],
    [
      "duplicate",
      (zip) => {
        zip.getEntry("packaged.json").entryName = "software.json";
      }
    ],
    [
      "oversized",
      (zip) => {
        zip.getEntry("software.json").header.size = 9 * 1024 ** 2;
      }
    ]
  ]) {
    const zip = new Zip(f.archive);
    mutate(zip);
    assert.throws(() => extractQualification(zip.toBuffer(), path.join(f.directory, name)));
  }
  const corrupt = Buffer.from(f.archive),
    zip = new Zip(corrupt);
  const entry = zip.getEntry("software.json");
  const offset = entry.header.offset;
  const start = offset + 30 + corrupt.readUInt16LE(offset + 26) + corrupt.readUInt16LE(offset + 28);
  corrupt[start] ^= 0xff;
  assert.throws(() => extractQualification(corrupt, path.join(f.directory, "crc")));
});
test("release API resolves annotated tag and independently lists assets", async () => {
  const calls = [];
  const api = releaseApi(async (endpoint) => {
    calls.push(endpoint);
    if (endpoint.includes("/git/ref/")) return { object: { type: "tag", sha: "b".repeat(40) } };
    if (endpoint.includes("/git/tags/")) return { object: { type: "commit", sha: "a".repeat(40) } };
    if (endpoint.includes("/assets?")) return [{ name: "actual" }];
    return [{ id: 45, tag_name: "v4.1.0", assets: [{ name: "stale embedded list" }] }];
  });
  const state = await api.read({ tag: "v4.1.0" });
  assert.equal(state.tagSha, "a".repeat(40));
  assert.equal(state.release.assets[0].name, "actual");
  assert.equal(calls.length, 4);
});
test("GitHub artifact ZIP requests negotiate JSON media type but return exact bytes", async () => {
  const endpoint = "/repos/linkasu/linka.looks-electron/actions/artifacts/13344045411/zip";
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
  const result = await request(endpoint, {
    binary: true,
    fetchImpl: async (url, { headers }) => {
      assert.equal(String(url), `https://api.github.com${endpoint}`);
      if (headers.Accept === "application/octet-stream") return new Response(null, { status: 415 });
      assert.equal(headers.Accept, "application/vnd.github+json");
      return new Response(bytes);
    }
  });
  assert(Buffer.isBuffer(result));
  assert.deepEqual(result, bytes);
});
test("GitHub adapter never follows writes or leaks token on redirected artifact requests", async (t) => {
  const original = process.env.GH_TOKEN;
  process.env.GH_TOKEN = "test-only-token";
  t.after(() => {
    if (original === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = original;
  });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1)
      return new Response(null, {
        status: 302,
        headers: { location: "https://release-assets.githubusercontent.com/asset" }
      });
    return new Response(Buffer.from("zip"));
  };
  await request("/repos/linkasu/linka.looks-electron/actions/artifacts/1/zip", {
    binary: true,
    fetchImpl
  });
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-only-token");
  assert(!calls[1].options.headers.Authorization);
  calls.length = 0;
  await assert.rejects(
    request("/repos/linkasu/linka.looks-electron/releases", { method: "POST", body: {}, fetchImpl })
  );
  assert.equal(calls.length, 1);
});
function completeFixture(t, change = {}) {
  const name = "linka.looks-4.1.0-win-x64.exe";
  const base = require("./candidate-contract.test.cjs").fixture().candidate;
  const material = (q) => {
    const packages = {
      "": { version: q.version },
      "node_modules/vue": { version: "3.5.44" },
      "node_modules/@vue/server-renderer": { version: "3.5.44" },
      "node_modules/@linkasu/tobii-electron": {
        version: "0.2.17",
        resolved:
          "https://github.com/linkasu/linka-tobii-electron/releases/download/v0.2.17/linkasu-tobii-electron-0.2.17.tgz",
        integrity:
          "sha512-LqhUCB90euN/QR/aGY9A+mP7j7Wq8no2qrxN682JvrxV7oP8IQx/9/VxU6u3cAe6DFHbi39J3R+N0swgLrjmgQ=="
      }
    };
    const lock = Buffer.from(JSON.stringify({ packages }));
    const inventory = {
      schema: 1,
      builder: "26.16.1",
      app: q.appSha,
      tooling: q.buildToolingSha,
      lockSha256: hash(lock),
      installers: [{ name, sha256: q.installerSha256 }],
      pins: Object.entries(packages).map(([path, pkg]) => ({ path, ...pkg })),
      packaged: [
        {
          target: "dist/win-unpacked/resources",
          asarSha256: "d".repeat(64),
          packages: [{ path: "package.json", version: q.version }]
        }
      ]
    };
    const provenance = {
      schema: 1,
      version: q.version,
      platform: "windows",
      signing: "unsigned",
      app: q.appSha,
      tooling: q.buildToolingSha,
      run: "78",
      files: [{ name, size: Buffer.byteLength("candidate exact bytes"), sha256: q.installerSha256 }]
    };
    const audit = {
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: { vulnerabilities: { total: 0 } }
    };
    const reviewed = require("./release-security-audit.cjs").verify({
      inventory,
      provenance,
      audit,
      lock
    });
    const bindings = {
      inventorySha256: hash(Buffer.from(JSON.stringify(inventory))),
      auditSha256: hash(Buffer.from(JSON.stringify(audit)))
    };
    return { lock, inventory, provenance, audit, reviewed, bindings };
  };
  const f = qualificationFixture(t, {
    ...change,
    data(report, q) {
      if (report.suite === "software")
        report.data = {
          workflowRunId: "91",
          checkRunId: "92",
          appSha: q.appSha,
          conclusion: "success"
        };
      if (report.suite === "packaged")
        report.data = {
          installedExecutable: "d".repeat(64),
          model: {
            "model.lpk": { sha256: "e".repeat(64), size: 2 },
            "lp-electron.exe": { sha256: "f".repeat(64), size: 2 }
          },
          resources: { modelSha256: "e".repeat(64), runtimeSha256: "f".repeat(64) },
          hardware: "NOT_TESTED",
          assertions: ["version", "reader", "editor", "model", "draft"]
        };
      if (report.suite === "security")
        report.data = {
          ...material(q).reviewed,
          ...material(q).bindings,
          candidateInstallerSha256: q.installerSha256
        };
      if (report.suite === "upgrade")
        report.data = {
          status: "PASS",
          oldVersion: "4.0.0",
          newVersion: "4.1.0",
          oldProcessExited: true,
          settingsPreserved: true,
          archivePreserved: true,
          mediaPreserved: true,
          unknownFieldsPreserved: true,
          draftPreserved: true,
          nsisRestartResponsive: true,
          stages: require("./real-upgrade-contract.cjs").UPGRADE_STAGES,
          oldProcessExit: { exitCode: 0, signalCode: null },
          restart: { automaticNSISRestart: true, responding: true },
          baseline: {
            version: base.baseline.version,
            source: base.baseline.sourceSha,
            url: base.baseline.installer.url,
            size: base.baseline.installer.bytes,
            sha256: base.baseline.installer.sha256
          }
        };
      change.data?.(report, q);
    }
  });
  const payload = fs.readFileSync(path.join(f.directory, "installer.exe"));
  const record = (name, bytes) => ({ name, bytes: bytes.length, sha256: hash(bytes) });
  const c = f.candidate;
  Object.assign(c, {
    ...base,
    appSha: f.q.appSha,
    buildToolingSha: f.q.buildToolingSha,
    buildRunId: "78",
    buildRunAttempt: 1,
    resources: { modelSha256: "e".repeat(64), runtimeSha256: "f".repeat(64) },
    installer: {
      ...record(name, payload),
      sha512: createHash("sha512").update(payload).digest("base64")
    },
    artifacts: {}
  });
  const inputs = {
    windows: {
      [name]: payload,
      [`${name}.blockmap`]: Buffer.from("blockmap"),
      "latest.yml": Buffer.from(
        JSON.stringify({
          version: c.version,
          path: name,
          sha512: c.installer.sha512,
          files: [{ url: name, sha512: c.installer.sha512, size: payload.length }]
        })
      ),
      "provenance-windows.json": Buffer.from(JSON.stringify(material(f.q).provenance))
    },
    sources: {
      "source-notices-windows-4.1.0.tar.gz": Buffer.from("source archive exact bytes"),
      "release-notes.md": Buffer.from("# Release 4.1.0\nReviewed selected app notes\n")
    },
    security: {
      "package-lock.json": material(f.q).lock,
      "inventory.json": Buffer.from(JSON.stringify(material(f.q).inventory)),
      "audit.json": Buffer.from(JSON.stringify(material(f.q).audit)),
      "security-signoff.json": Buffer.from(
        JSON.stringify({
          ...material(f.q).reviewed,
          ...material(f.q).bindings,
          provenanceSha256: hash(Buffer.from(JSON.stringify(material(f.q).provenance)))
        })
      )
    }
  };
  for (const [kind, files] of Object.entries(inputs))
    c.artifacts[kind] = {
      id: String(Object.keys(c.artifacts).length + 100),
      name: require("./candidate-contract.cjs").partName(kind, c.buildRunId, c.buildRunAttempt),
      bytes: 1,
      sha256: "d".repeat(64),
      files: Object.entries(files).map(([n, b]) => record(n, b))
    };
  f.options.candidateIo.resolveCandidate = async () => ({
    candidate: c,
    candidateId: "12",
    candidateSha256: f.q.candidateSha256,
    run: { id: 78, head_sha: c.buildToolingSha }
  });
  f.options.candidateIo.downloadCandidatePart = async (_, kind, directory) => {
    f.calls.push(`download:${kind}`);
    fs.mkdirSync(directory);
    for (const [name, bytes] of Object.entries(inputs[kind]))
      fs.writeFileSync(path.join(directory, name), bytes);
    require("./candidate-contract.cjs").verifyCandidateFiles(c, kind, directory);
  };
  f.options.macCompatibility = {
    download: async (directory) => {
      f.calls.push("mac-download");
      fs.writeFileSync(path.join(directory, "pinned-mac-compatibility.bin"), "unchanged fixture");
    }
  };
  const output = path.join(f.directory, "prepared");
  return { ...f, c, inputs, output };
}
test("valid qualification seals candidate source, notes and sanitized provenance without builds", async (t) => {
  const f = completeFixture(t),
    { output } = f;
  assert.equal((await prepare("34", output, f.options)).status, "PREPARED");
  const manifest = verifyPrepared(output);
  assert(manifest.files.some((file) => file.name === "release-provenance.json"));
  assert(
    !manifest.files.some((file) =>
      ["security.json", "upgrade.json", "audit.json"].includes(file.name)
    )
  );
  const provenance = JSON.parse(fs.readFileSync(path.join(output, "release-provenance.json")));
  assert.deepEqual(provenance.resources, f.c.resources);
  assert.equal(provenance.scope.hardware, "NOT_TESTED");
  assert(!provenance.files.some((file) => file.name === "release-provenance.json"));
});
function reusedFixture(t, reused = ["security"]) {
  const f = completeFixture(t, {
    q: (q) => {
      q.runAttempt = 2;
    },
    run: { run_attempt: 2 },
    artifact: { name: "qualification-34-2" },
    data: (report) => {
      report.runAttempt = reused.includes(report.job) ? 1 : 2;
    }
  });
  for (const [index, job] of f.jobs.entries())
    Object.assign(job, {
      id: 126672617680 + index,
      run_attempt: 2,
      started_at: "2026-11-04T15:14:17Z",
      completed_at: "2026-11-04T15:14:55Z"
    });
  const originalJobs = f.jobs
    .filter((job) => reused.includes(job.name))
    .map((job) => ({
      ...job,
      id: job.name === "security" ? 126663304113 : 126663304114,
      run_attempt: 1
    }));
  const read = f.options.request;
  f.options.request = async (endpoint, options) => {
    if (endpoint.includes("/attempts/1/jobs?")) {
      f.calls.push(endpoint);
      return { jobs: originalJobs };
    }
    return read(endpoint, options);
  };
  return { ...f, originalJobs };
}
test("successful original security remains eligible when latest API projects it onto attempt two", async (t) => {
  const f = reusedFixture(t);
  assert.notEqual(f.jobs.find((job) => job.name === "security").id, f.originalJobs[0].id);
  assert.equal((await prepare("34", f.output, f.options)).status, "PREPARED");
  assert.equal(f.calls.filter((call) => call.includes("/attempts/1/jobs?")).length, 1);
});
test("older producing-job API is cached across reused security and two Windows gate reports", async (t) => {
  const f = reusedFixture(t, ["security", "windows"]);
  assert.equal((await prepare("34", f.output, f.options)).status, "PREPARED");
  assert.equal(f.calls.filter((call) => call.includes("/attempts/1/jobs?")).length, 1);
});
for (const [name, mutate] of [
  [
    "missing original",
    (f) => {
      f.originalJobs.length = 0;
    }
  ],
  [
    "wrong original head",
    (f) => {
      f.originalJobs[0].head_sha = "0".repeat(40);
    }
  ],
  [
    "wrong original run",
    (f) => {
      f.originalJobs[0].run_id = 35;
    }
  ],
  [
    "wrong original attempt",
    (f) => {
      f.originalJobs[0].run_attempt = 2;
    }
  ],
  [
    "wrong original name",
    (f) => {
      f.originalJobs[0].name = "other";
    }
  ],
  [
    "cancelled original",
    (f) => {
      f.originalJobs[0].conclusion = "cancelled";
    }
  ],
  [
    "failed original",
    (f) => {
      f.originalJobs[0].conclusion = "failure";
    }
  ],
  [
    "different start time",
    (f) => {
      f.originalJobs[0].started_at = "2026-11-04T15:13:17Z";
    }
  ],
  [
    "different finish time",
    (f) => {
      f.originalJobs[0].completed_at = "2026-11-04T15:15:55Z";
    }
  ],
  [
    "missing timestamp proof",
    (f) => {
      delete f.originalJobs[0].started_at;
    }
  ],
  [
    "failed root qualification",
    (f) => {
      f.run.conclusion = "failure";
    }
  ]
])
  test(`reused gate rejects ${name} before any payload download`, async (t) => {
    const f = reusedFixture(t);
    mutate(f);
    await assert.rejects(prepare("34", f.output, f.options));
    assert(!f.calls.some((call) => call.startsWith("download:")));
    assert(!fs.existsSync(f.output));
  });
test("a newer software PASS cannot authorize a report from the original failed software execution", async (t) => {
  const f = reusedFixture(t, ["software"]);
  Object.assign(f.originalJobs[0], {
    conclusion: "failure",
    started_at: "2026-11-04T15:10:17Z",
    completed_at: "2026-11-04T15:10:55Z"
  });
  await assert.rejects(prepare("34", f.output, f.options));
  assert(!f.calls.some((call) => call.startsWith("download:")));
});
for (const [name, change] of [
  [
    "missing corresponding source",
    (f) => {
      delete f.inputs.sources["source-notices-windows-4.1.0.tar.gz"];
    }
  ],
  [
    "source substitution",
    (f) => {
      f.inputs.sources["source-notices-windows-4.1.0.tar.gz"] = Buffer.from("different source");
    }
  ],
  [
    "missing reviewed notes",
    (f) => {
      delete f.inputs.sources["release-notes.md"];
    }
  ],
  [
    "changed baseline source",
    (f) => {
      f.c.baseline.sourceSha = "0".repeat(40);
    }
  ],
  [
    "changed resource approval",
    (f) => {
      f.c.resources.modelSha256 = "0".repeat(64);
    }
  ],
  [
    "changed runtime approval",
    (f) => {
      f.c.resources.runtimeSha256 = "0".repeat(64);
    }
  ],
  [
    "changed security inventory",
    (f) => {
      f.inputs.security["inventory.json"] = Buffer.from("{}");
    }
  ]
])
  test(`prepare blocks ${name} before output or Mac fetch`, async (t) => {
    const f = completeFixture(t);
    change(f);
    await assert.rejects(prepare("34", f.output, f.options));
    assert(!f.calls.includes("mac-download"));
    if (name.includes("approval") || name === "changed baseline source")
      assert(
        !f.calls.some((call) => call.startsWith("download:")),
        "candidate context mismatch must fail before payload downloads"
      );
    assert(!fs.existsSync(f.output));
  });
