// Narrow GitHub I/O adapter; no builds, candidate-code execution, credentials in receipts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  REPOSITORY,
  positiveId,
  digest,
  fileRecord,
  verifyPrepared,
  verifyNotes,
  extractQualification
} = require("./release-publication.cjs");
const prefix = `/repos/${REPOSITORY}`;
function apiId(value) {
  const id = String(value);
  assert(positiveId(id), "bounded safe numeric GitHub ID required");
  return id;
}
async function request(
  endpoint,
  {
    method = "GET",
    body,
    binary = false,
    limit = 4 * 1024 ** 2,
    missing = false,
    fetchImpl = fetch
  } = {}
) {
  assert(
    endpoint.startsWith(`${prefix}/`) && !endpoint.includes("..") && !endpoint.includes("#"),
    "own repository API required"
  );
  const upload = endpoint.includes("/assets?name=");
  let url = new URL(`https://${upload ? "uploads" : "api"}.github.com${endpoint}`);
  const signal = AbortSignal.timeout(300000);
  for (let redirect = 0; redirect <= 5; redirect++) {
    const headers = {
      Accept: binary ? "application/octet-stream" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (["api.github.com", "uploads.github.com"].includes(url.hostname)) {
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (body) headers["Content-Type"] = upload ? "application/octet-stream" : "application/json";
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        body: body && (upload ? body : JSON.stringify(body)),
        headers,
        signal,
        redirect: "manual"
      });
    } catch {
      throw Object.assign(new Error("GitHub network/timeout failure; reconcile before retry"), {
        uncertain: method !== "GET"
      });
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      assert.equal(method, "GET", "write redirects forbidden");
      const next = new URL(response.headers.get("location"), url);
      assert(
        next.protocol === "https:" &&
          !next.username &&
          !next.password &&
          !next.port &&
          (next.hostname === "api.github.com" ||
            next.hostname === "release-assets.githubusercontent.com" ||
            /^[a-z0-9-]+\.actions\.githubusercontent\.com$/.test(next.hostname) ||
            /^productionresultssa[a-z0-9]+\.blob\.core\.windows\.net$/.test(next.hostname)),
        "untrusted GitHub redirect"
      );
      await response.body?.cancel();
      url = next;
      continue;
    }
    if (missing && response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error(`GitHub HTTP ${response.status}`), {
        uncertain: method !== "GET" && [502, 503, 504].includes(response.status)
      });
    }
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        assert(size <= limit, "GitHub response exceeds bound");
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      throw Object.assign(new Error("GitHub response interrupted"), {
        uncertain: method !== "GET"
      });
    }
    const bytes = Buffer.concat(chunks);
    if (binary) return bytes;
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("Invalid GitHub JSON response");
    }
  }
  throw new Error("GitHub redirect bound exceeded");
}
async function list(endpoint, key, read = request) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const response = await read(
      `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`
    );
    const items = key ? response[key] : response;
    assert(Array.isArray(items), "invalid GitHub listing");
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw new Error("GitHub listing exceeds bounded pagination");
}
function releaseApi(read = request) {
  return {
    async read(m) {
      let tag = await read(`${prefix}/git/ref/tags/${m.tag}`, { missing: true });
      for (let depth = 0; tag?.object.type === "tag" && depth < 3; depth++)
        tag = await read(`${prefix}/git/tags/${tag.object.sha}`);
      if (tag) assert.equal(tag.object.type, "commit", "tag must resolve to app commit");
      // The by-tag endpoint alone can miss an unfinished draft with no tag yet.
      const matching = (await list(`${prefix}/releases`, null, read)).filter(
        (r) => r.tag_name === m.tag
      );
      assert(matching.length <= 1, "ambiguous existing drafts/releases for target tag");
      const release = matching[0] || null;
      if (release)
        release.assets = await list(`${prefix}/releases/${apiId(release.id)}/assets`, null, read);
      return { tagSha: tag?.object.sha || null, release };
    },
    createDraft: (m, notes) =>
      read(`${prefix}/releases`, {
        method: "POST",
        body: {
          tag_name: m.tag,
          target_commitish: m.appSha,
          name: `LINKa ${m.version}`,
          body: notes,
          draft: true,
          prerelease: false,
          make_latest: "false"
        }
      }),
    upload: (id, file, directory) =>
      read(`${prefix}/releases/${apiId(id)}/assets?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        body: fs.readFileSync(path.join(directory, file.name))
      }),
    publish: (id) =>
      read(`${prefix}/releases/${apiId(id)}`, {
        method: "PATCH",
        body: { draft: false, make_latest: "true" }
      })
  };
}
function sanitizedRun(run) {
  return Object.fromEntries(
    ["id", "run_attempt", "head_sha", "head_branch", "path", "event", "status", "conclusion"].map(
      (k) => [k, run[k]]
    )
  );
}
async function prepare(runId, directory, options = {}) {
  assert(positiveId(runId), "one positive qualification run ID required");
  assert(directory, "output directory required");
  const read = options.request || request;
  const candidateIo = options.candidateIo || require("./candidate-io.cjs");
  const qualification = require("./qualification-contract.cjs");
  const run = await read(`${prefix}/actions/runs/${runId}`);
  assert.equal(apiId(run.id), runId);
  assert.equal(run.repository?.full_name, REPOSITORY);
  assert.equal(run.head_repository?.full_name, REPOSITORY);
  assert.equal(run.head_branch, "main");
  assert.equal(run.path, ".github/workflows/windows-qualification.yml");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  const artifacts = await list(`${prefix}/actions/runs/${runId}/artifacts`, "artifacts", read);
  const eligible = artifacts.filter((a) => a.name === `qualification-${runId}-${run.run_attempt}`);
  assert.equal(
    eligible.length,
    1,
    "one non-diagnostic current-attempt qualification artifact required"
  );
  const artifact = eligible[0];
  assert.equal(artifact.expired, false);
  assert(
    Number.isSafeInteger(artifact.size_in_bytes) &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= 8 * 1024 ** 2
  );
  assert(/^sha256:[a-f0-9]{64}$/.test(artifact.digest), "qualification ZIP digest required");
  const archive = await read(`${prefix}/actions/artifacts/${apiId(artifact.id)}/zip`, {
    binary: true,
    limit: artifact.size_in_bytes
  });
  assert.equal(archive.length, artifact.size_in_bytes);
  assert.equal(`sha256:${digest(archive)}`, artifact.digest);
  // Staging is outside the sealed publication directory and is never an executable input.
  const stage = `${directory}.inputs`;
  fs.mkdirSync(stage);
  const receiptDirectory = path.join(stage, "qualification");
  const q = extractQualification(archive, receiptDirectory);
  qualification.validateQualification(q);
  const jobs = await list(`${prefix}/actions/runs/${runId}/jobs?filter=latest`, "jobs", read);
  qualification.validateQualificationOrigin(q, { run, artifact, jobs });
  const resolved = await candidateIo.resolveCandidate(q.candidateId);
  const c = resolved.candidate;
  qualification.requireReleaseQualification(q, resolved);
  qualification.verifyQualificationFiles(q, receiptDirectory, resolved);
  const producingAttempts = new Map();
  for (const record of q.reports) {
    const report = JSON.parse(fs.readFileSync(path.join(receiptDirectory, record.name)));
    if (report.runAttempt < q.runAttempt && !producingAttempts.has(report.runAttempt))
      producingAttempts.set(
        report.runAttempt,
        await list(
          `${prefix}/actions/runs/${runId}/attempts/${report.runAttempt}/jobs`,
          "jobs",
          read
        )
      );
    const producer = qualification.validateProducingJob(
      q,
      { job: report.job, runAttempt: report.runAttempt },
      { jobs, producingJobs: producingAttempts.get(report.runAttempt) || [] }
    );
    assert.equal(
      producer.conclusion,
      "success",
      "passed report must come from a successful original producing job"
    );
  }
  for (const kind of ["windows", "sources", "security"])
    await candidateIo.downloadCandidatePart(resolved, kind, path.join(stage, kind));
  // The qualification validator owns semantic reports; independently bind the shipped inventory here.
  verifySecurityInputs(
    c,
    path.join(stage, "security"),
    receiptDirectory,
    q,
    path.join(stage, "windows")
  );
  const source = path.join(stage, "sources");
  verifyNotes(fs.readFileSync(path.join(source, "release-notes.md"), "utf8"), c.version);
  const windows = path.join(stage, "windows");
  const { verifyCandidate } = require("./real-upgrade-contract.cjs");
  verifyCandidate(windows, {
    version: c.version,
    app: c.appSha,
    tooling: c.buildToolingSha,
    run: c.buildRunId,
    sha256: c.installer.sha256
  });
  require("./release-artifacts.cjs").verifyMetadata(windows, "windows", c.version);
  fs.mkdirSync(directory);
  for (const kind of ["windows", "sources"])
    for (const file of c.artifacts[kind].files) {
      if (file.name === "release-notes.md") continue;
      fs.copyFileSync(
        path.join(stage, kind, file.name),
        path.join(directory, file.name),
        fs.constants.COPYFILE_EXCL
      );
    }
  fs.copyFileSync(
    path.join(source, "release-notes.md"),
    path.join(directory, "release-notes.md"),
    fs.constants.COPYFILE_EXCL
  );
  await (options.macCompatibility || require("./release-artifacts-mac-compat.cjs")).download(
    directory
  );
  const files = fs
    .readdirSync(directory)
    .filter((name) => name !== "release-notes.md")
    .sort()
    .map((name) => fileRecord(directory, name));
  const provenance = {
    schema: "linka-release-provenance-v1",
    repository: REPOSITORY,
    version: c.version,
    tag: `v${c.version}`,
    appSha: c.appSha,
    resources: c.resources,
    candidate: {
      id: resolved.candidateId,
      sha256: resolved.candidateSha256,
      origin: sanitizedRun(resolved.run),
      artifacts: c.artifacts
    },
    qualification: {
      artifactId: String(artifact.id),
      artifactSha256: artifact.digest.slice(7),
      sha256: digest(fs.readFileSync(path.join(receiptDirectory, "qualification.json"))),
      origin: sanitizedRun(run),
      gates: q.gates,
      reports: q.reports.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }))
    },
    scope: {
      platform: "windows-x64",
      signing: "unsigned",
      hardware: "NOT_TESTED",
      macOS: "unchanged 3.3.1 compatibility bytes"
    },
    notes: fileRecord(directory, "release-notes.md"),
    files
  };
  fs.writeFileSync(
    path.join(directory, "release-provenance.json"),
    JSON.stringify(provenance, null, 2) + "\n",
    { flag: "wx" }
  );
  files.push(fileRecord(directory, "release-provenance.json"));
  const manifest = {
    schema: "linka-release-publication-v1",
    repository: REPOSITORY,
    version: c.version,
    tag: `v${c.version}`,
    appSha: c.appSha,
    candidateId: resolved.candidateId,
    candidateSha256: resolved.candidateSha256,
    qualificationRunId: runId,
    qualificationRunAttempt: q.runAttempt,
    qualificationArtifactId: String(artifact.id),
    qualificationSha256: provenance.qualification.sha256,
    notes: provenance.notes,
    files
  };
  fs.writeFileSync(
    path.join(directory, "publication.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" }
  );
  verifyPrepared(directory);
  const finalRun = await read(`${prefix}/actions/runs/${runId}`);
  assert.equal(finalRun.run_attempt, run.run_attempt, "qualification rerun raced preparation");
  assert.equal(finalRun.head_sha, run.head_sha);
  assert.equal(finalRun.status, "completed");
  assert.equal(finalRun.conclusion, "success");
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${c.version}\nmanifest_sha256=${digest(fs.readFileSync(path.join(directory, "publication.json")))}\n`
    );
  return {
    status: "PREPARED",
    version: c.version,
    candidateId: resolved.candidateId,
    qualificationRunId: runId
  };
}
function verifySecurityInputs(c, directory, reports, q, windows) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name)));
  const inventory = read("inventory.json");
  assert.equal(inventory.app, c.appSha);
  assert.equal(inventory.tooling, c.buildToolingSha);
  assert.equal(
    inventory.lockSha256,
    digest(fs.readFileSync(path.join(directory, "package-lock.json")))
  );
  const installers = inventory.installers.filter((i) => i.name === c.installer.name);
  assert.equal(installers.length, 1);
  assert.equal(installers[0].sha256, c.installer.sha256);
  const audit = read("audit.json");
  assert.equal(audit.auditReportVersion, 2);
  assert(
    !audit.error && audit.vulnerabilities && audit.metadata?.vulnerabilities,
    "actual complete audit required"
  );
  // Security policy and native upgrade assertions belong to the shared qualification contract.
  // A nonempty JSON object alone is deliberately insufficient at this promotion boundary.
  const security = JSON.parse(fs.readFileSync(path.join(reports, q.gates.security.report))).data;
  const provenanceBytes = fs.readFileSync(path.join(windows, "provenance-windows.json"));
  const reviewed = require("./release-security-audit.cjs").verify({
    inventory,
    audit,
    provenance: JSON.parse(provenanceBytes),
    lock: fs.readFileSync(path.join(directory, "package-lock.json"))
  });
  const signoff = read("security-signoff.json");
  for (const [key, value] of Object.entries(reviewed)) {
    assert.deepEqual(signoff[key], value, `candidate security policy result mismatch: ${key}`);
    assert.deepEqual(security[key], value, `qualification security policy result mismatch: ${key}`);
  }
  for (const [key, bytes] of [
    ["inventorySha256", fs.readFileSync(path.join(directory, "inventory.json"))],
    ["auditSha256", fs.readFileSync(path.join(directory, "audit.json"))]
  ]) {
    assert.equal(
      signoff[key],
      digest(bytes),
      `candidate security signoff binding mismatch: ${key}`
    );
    assert.equal(security[key], digest(bytes), `qualification security binding mismatch: ${key}`);
  }
  assert.equal(signoff.provenanceSha256, digest(provenanceBytes));
  assert.equal(security.candidateInstallerSha256, c.installer.sha256);
}
module.exports = { request, list, releaseApi, prepare, verifySecurityInputs };
