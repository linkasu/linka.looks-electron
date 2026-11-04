const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const contract = require("./candidate-contract.cjs");

function fixture() {
  const payload = Buffer.from("accepted bytes");
  const record = (name) => ({ name, bytes: payload.length, sha256: contract.digest(payload) });
  const candidate = {
    schema: "linka-windows-candidate-v1",
    repository: contract.REPOSITORY,
    version: "4.1.0",
    appSha: "a".repeat(40),
    buildToolingSha: "b".repeat(40),
    buildRunId: "123",
    buildRunAttempt: 2,
    resources: { modelSha256: "e".repeat(64), runtimeSha256: "f".repeat(64) },
    installer: {
      ...record("linka.looks-4.1.0-win-x64.exe"),
      sha512: createHash("sha512").update(payload).digest("base64")
    },
    baseline: {
      version: "4.0.0",
      tag: "v4.0.0",
      sourceSha: "c".repeat(40),
      releaseId: "9",
      assetId: "10",
      installer: {
        ...record("linka.looks-4.0.0-win-x64.exe"),
        url: `https://github.com/${contract.REPOSITORY}/releases/download/v4.0.0/linka.looks-4.0.0-win-x64.exe`
      }
    },
    artifacts: Object.fromEntries(
      contract.PARTS.map((kind, index) => [
        kind,
        {
          id: String(index + 11),
          name: contract.partName(kind, "123", 2),
          bytes: 100,
          sha256: "d".repeat(64),
          files: contract.expectedFiles("4.1.0", kind).map(record)
        }
      ])
    )
  };
  const run = {
    id: 123,
    run_attempt: 2,
    repository: { full_name: contract.REPOSITORY },
    head_repository: { full_name: contract.REPOSITORY },
    event: "workflow_dispatch",
    head_branch: "main",
    path: ".github/workflows/windows-candidate.yml",
    head_sha: candidate.buildToolingSha,
    status: "completed",
    conclusion: "success"
  };
  const metadata = (id, name) => ({
    id: Number(id),
    name,
    size_in_bytes: 100,
    expired: false,
    digest: `sha256:${"d".repeat(64)}`,
    workflow_run: { id: 123, head_sha: run.head_sha }
  });
  const origin = {
    run,
    descriptorArtifact: metadata(99, "candidate-123-2"),
    artifacts: Object.fromEntries(
      contract.PARTS.map((kind) => [
        kind,
        metadata(candidate.artifacts[kind].id, candidate.artifacts[kind].name)
      ])
    )
  };
  return { candidate, origin, payload };
}
module.exports = { fixture };
if (require.main === module) {
  test("numeric ID upper bound remains a valid positive safe integer", () => {
    const { candidate } = fixture();
    candidate.baseline.assetId = String(Number.MAX_SAFE_INTEGER);
    contract.validateCandidate(candidate);
  });
  test("strict candidate and terminal own-main origin", () => {
    const { candidate, origin } = fixture();
    assert.equal(contract.validateCandidate(candidate), candidate);
    contract.validateCandidateOrigin(candidate, origin);
    for (const mutate of [
      (c) => {
        c.version = "4.1.0-beta";
      },
      (c) => {
        c.extra = true;
      },
      (c) => {
        c.buildRunId = "1".repeat(17);
      },
      (c) => {
        c.baseline.assetId = "9007199254740992";
      },
      (c) => {
        c.artifacts.windows.id = "9007199254740992";
      },
      (c) => {
        delete c.resources;
      },
      (c) => {
        c.resources.runtimeSha256 = "not-a-digest";
      },
      (c) => {
        c.resources.approvalSha256 = "e".repeat(64);
      },
      (c) => {
        c.baseline.version = c.version;
      },
      (c) => {
        c.artifacts.sources.files[0].name = "../escape";
      },
      (c) => {
        c.artifacts.security.files.push(c.artifacts.security.files[0]);
      },
      (c) => {
        c.artifacts.security.files[0].bytes = 9 * 1024 ** 2;
      },
      (c) => {
        c.artifacts.windows.bytes = 1024 ** 3 + 1;
      },
      (c) => {
        c.installer.sha256 = "e".repeat(64);
      }
    ]) {
      const c = structuredClone(candidate);
      mutate(c);
      assert.throws(() => contract.validateCandidate(c));
    }
    for (const [field, value] of [
      ["conclusion", "cancelled"],
      ["conclusion", null],
      ["status", "in_progress"],
      ["run_attempt", 1],
      ["head_branch", "other"],
      ["event", "pull_request"],
      ["head_sha", "f".repeat(40)],
      ["path", ".github/workflows/other.yml"],
      ["repository", { full_name: "fork/repo" }],
      ["head_repository", null]
    ]) {
      assert.throws(() =>
        contract.validateCandidateOrigin(candidate, {
          ...origin,
          run: { ...origin.run, [field]: value }
        })
      );
    }
    const wrong = structuredClone(origin);
    wrong.artifacts.windows.workflow_run.id = 124;
    assert.throws(() => contract.validateCandidateOrigin(candidate, wrong));
    delete wrong.artifacts.windows;
    assert.throws(() => contract.validateCandidateOrigin(candidate, wrong));
  });
  test("actual files reject tampering, extra files and symlinks", (t) => {
    const { candidate, payload } = fixture();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-contract-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    for (const file of candidate.artifacts.windows.files)
      fs.writeFileSync(path.join(directory, file.name), payload);
    contract.verifyCandidateFiles(candidate, "windows", directory);
    fs.writeFileSync(path.join(directory, "extra"), payload);
    assert.throws(() => contract.verifyCandidateFiles(candidate, "windows", directory));
    fs.unlinkSync(path.join(directory, "extra"));
    const installer = path.join(directory, candidate.installer.name);
    fs.writeFileSync(installer, "tampered");
    assert.throws(() => contract.verifyCandidateFiles(candidate, "windows", directory));
    fs.unlinkSync(installer);
    fs.symlinkSync(path.join(directory, "latest.yml"), installer);
    assert.throws(() => contract.verifyCandidateFiles(candidate, "windows", directory));
  });
}
