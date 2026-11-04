// Read-only GitHub adapter. Downloaded code is never required or executed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateCandidate,
  validateCandidateOrigin,
  verifyCandidateFiles,
  digest,
  REPOSITORY,
  PARTS,
  LIMITS
} = require("./candidate-contract.cjs");

const API = "https://api.github.com";
const ZIP_LIMIT = 1024 ** 3;
const infraError = (message) => Object.assign(new Error(message), { code: "CI_INFRA_ERROR" });
function repository(options) {
  assert.equal(options.repository ?? REPOSITORY, REPOSITORY, "only own repository is trusted");
  return REPOSITORY;
}
function apiPath(suffix, options = {}) {
  return `/repos/${repository(options)}/${suffix}`;
}
function id(value) {
  assert(
    typeof value === "string" &&
      /^[1-9]\d{0,15}$/.test(value) &&
      Number.isSafeInteger(Number(value)),
    "positive numeric artifact ID required"
  );
  return value;
}
function trustedRedirect(url) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    (url.hostname === "api.github.com" ||
      /^[a-z0-9-]+\.actions\.githubusercontent\.com$/.test(url.hostname) ||
      /^productionresultssa[a-z0-9]+\.blob\.core\.windows\.net$/.test(url.hostname))
  );
}
async function request(endpoint, limit, options = {}) {
  repository(options);
  assert(
    typeof endpoint === "string" &&
      endpoint.startsWith(`/repos/${REPOSITORY}/`) &&
      !endpoint.includes("..") &&
      !endpoint.includes("%") &&
      !endpoint.includes("#") &&
      !endpoint.includes("\\"),
    "own GitHub API path required"
  );
  let url = new URL(API + endpoint);
  const signal = AbortSignal.timeout(120000);
  const token = options.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (url.origin === API && token) headers.Authorization = `Bearer ${token}`;
    let response;
    try {
      response = await fetch(url, { headers, redirect: "manual", signal });
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      throw infraError("GitHub request failed (network or timeout)");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      assert(location, "missing artifact redirect");
      let next;
      try {
        next = new URL(location, url);
      } catch {
        throw new Error("invalid artifact redirect");
      }
      assert(trustedRedirect(next), "untrusted artifact redirect");
      try {
        await response.body?.cancel();
      } catch (error) {
        if (error.code === "ERR_ASSERTION") throw error;
        throw infraError("GitHub redirect transport interrupted");
      }
      url = next;
      continue;
    }
    if (response.status === 429 || (response.status >= 500 && response.status < 600))
      throw infraError(`GitHub service unavailable: HTTP ${response.status}`);
    assert(response.ok, `GitHub request failed: HTTP ${response.status}`);
    const length = response.headers.get("content-length");
    if (length !== null)
      assert(/^\d+$/.test(length) && Number(length) <= limit, "HTTP response exceeds bound");
    const chunks = [];
    let size = 0;
    assert(response.body, "GitHub response body required");
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        assert(size <= limit, "HTTP response exceeds bound");
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      throw infraError("GitHub response interrupted (network or timeout)");
    }
    return Buffer.concat(chunks);
  }
  throw new Error("too many artifact redirects");
}
async function githubJson(endpoint, options = {}) {
  const bytes = await request(endpoint, 4 * 1024 ** 2, options);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("invalid GitHub JSON response");
  }
}
function decodeArchive(bytes, expected, limit) {
  assert(bytes.length >= 22 && bytes.length <= ZIP_LIMIT, "ZIP exceeds bound");
  // Same canonical small flat ZIP guard as the reviewed model-input importer.
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50, "canonical ZIP without comment required");
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  assert.equal(bytes.readUInt16LE(end + 4), 0, "multi-disk ZIP forbidden");
  assert.equal(bytes.readUInt16LE(end + 6), 0, "multi-disk ZIP forbidden");
  assert.equal(bytes.readUInt16LE(end + 8), expected.length);
  assert.equal(bytes.readUInt16LE(end + 10), expected.length, "non-ZIP64 member count required");
  const directory = bytes.readUInt32LE(end + 16);
  const directorySize = bytes.readUInt32LE(end + 12);
  assert(
    directorySize <= expected.length * 1024 && directory + directorySize === end,
    "bounded non-ZIP64 directory required"
  );
  const noZip64Extra = (start, finish) => {
    for (let offset = start; offset < finish;) {
      assert(offset + 4 <= finish && bytes.readUInt16LE(offset) !== 1, "ZIP64 extra forbidden");
      offset += 4 + bytes.readUInt16LE(offset + 2);
      assert(offset <= finish, "invalid ZIP extra");
    }
  };
  let offset = directory;
  for (let index = 0; index < expected.length; index++) {
    assert(
      offset + 46 <= end && bytes.readUInt32LE(offset) === 0x02014b50,
      "invalid central ZIP header"
    );
    assert(bytes.readUInt16LE(offset + 6) < 45, "ZIP64 member forbidden");
    assert.equal(bytes.readUInt16LE(offset + 34), 0, "multi-disk member forbidden");
    const name = bytes.readUInt16LE(offset + 28);
    const extraEnd = offset + 46 + name + bytes.readUInt16LE(offset + 30);
    assert(extraEnd <= end, "invalid central ZIP extra");
    noZip64Extra(offset + 46 + name, extraEnd);
    const local = bytes.readUInt32LE(offset + 42);
    assert(
      local + 30 <= directory && bytes.readUInt32LE(local) === 0x04034b50,
      "invalid local ZIP header"
    );
    assert(bytes.readUInt16LE(local + 4) < 45, "ZIP64 local member forbidden");
    const localName = bytes.readUInt16LE(local + 26);
    const localExtraEnd = local + 30 + localName + bytes.readUInt16LE(local + 28);
    assert(localExtraEnd <= directory, "invalid local ZIP extra");
    assert(
      bytes
        .subarray(local + 30, local + 30 + localName)
        .equals(bytes.subarray(offset + 46, offset + 46 + name)),
      "ZIP local/central name mismatch"
    );
    noZip64Extra(local + 30 + localName, localExtraEnd);
    offset = extraEnd + bytes.readUInt16LE(offset + 32);
  }
  assert.equal(offset, end, "unexpected central ZIP bytes");
  const zip = new (require("adm-zip"))(bytes);
  const entries = zip.getEntries();
  assert.equal(entries.length, expected.length, "unexpected ZIP members");
  const names = new Set();
  let total = 0;
  // Validate every central header before inflating even one member.
  for (const entry of entries) {
    const name = entry.entryName;
    assert(
      typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(name),
      "unsafe ZIP member"
    );
    assert(!names.has(name.toLowerCase()), "duplicate ZIP member");
    names.add(name.toLowerCase());
    assert(
      !entry.isDirectory && [0, 0x8000].includes((entry.attr >>> 16) & 0xf000),
      "ZIP must contain regular files only"
    );
    assert(
      (entry.header.flags & 1) === 0 && [0, 8].includes(entry.header.method),
      "unsupported ZIP member"
    );
    assert(
      entry.header.compressedSize > 0 && entry.header.compressedSize <= bytes.length,
      "compressed ZIP size bound"
    );
    if (entry.header.method === 0)
      assert.equal(entry.header.compressedSize, entry.header.size, "stored ZIP size mismatch");
    const file = expected.find((item) => item.name === name);
    assert(file, "unexpected ZIP member");
    assert(Number.isSafeInteger(entry.header.size) && entry.header.size > 0, "empty ZIP member");
    total += entry.header.size;
    assert(
      total <= limit && (file.bytes === undefined || entry.header.size === file.bytes),
      "expanded ZIP size mismatch/bound"
    );
  }
  return entries.map((entry) => {
    const file = expected.find((item) => item.name === entry.entryName);
    const data = entry.getData();
    assert.equal(data.length, entry.header.size, "ZIP actual size mismatch");
    if (file.sha256 !== undefined)
      assert.equal(digest(data), file.sha256, "ZIP member digest mismatch");
    return { name: entry.entryName, bytes: data };
  });
}
async function artifactZip(metadata, options) {
  assert(
    Number.isSafeInteger(metadata.size_in_bytes) &&
      metadata.size_in_bytes > 0 &&
      metadata.size_in_bytes <= ZIP_LIMIT,
    "artifact ZIP size bound"
  );
  assert(
    typeof metadata.digest === "string" && /^sha256:[a-f0-9]{64}$/.test(metadata.digest),
    "GitHub artifact digest required"
  );
  const bytes = await request(
    apiPath(`actions/artifacts/${id(String(metadata.id))}/zip`, options),
    metadata.size_in_bytes,
    options
  );
  assert.equal(bytes.length, metadata.size_in_bytes, "artifact ZIP size mismatch");
  assert.equal(`sha256:${digest(bytes)}`, metadata.digest, "artifact ZIP digest mismatch");
  return bytes;
}
async function resolveCandidate(candidateId, options = {}) {
  id(candidateId);
  const descriptorArtifact = await githubJson(
    apiPath(`actions/artifacts/${candidateId}`, options),
    options
  );
  assert.equal(String(descriptorArtifact.id), candidateId);
  assert.equal(descriptorArtifact.expired, false);
  assert(
    /^candidate-[1-9]\d*-[1-9]\d*$/.test(descriptorArtifact.name),
    "descriptor artifact name required"
  );
  // Small descriptor ZIPs cannot consume the 1 GiB allowance for payload parts.
  assert(descriptorArtifact.size_in_bytes <= 128 * 1024, "descriptor ZIP exceeds bound");
  const [descriptor] = decodeArchive(
    await artifactZip(descriptorArtifact, options),
    [{ name: "candidate.json" }],
    64 * 1024
  );
  let candidate;
  try {
    candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(descriptor.bytes));
  } catch {
    throw new Error("invalid candidate JSON");
  }
  validateCandidate(candidate);
  const run = await githubJson(apiPath(`actions/runs/${candidate.buildRunId}`, options), options);
  const listed = [];
  let complete = false;
  for (let page = 1; page <= 10; page++) {
    const result = await githubJson(
      apiPath(`actions/runs/${candidate.buildRunId}/artifacts?per_page=100&page=${page}`, options),
      options
    );
    assert(
      Array.isArray(result.artifacts) &&
        Number.isSafeInteger(result.total_count) &&
        result.total_count <= 1000,
      "bounded artifact listing required"
    );
    listed.push(...result.artifacts);
    if (listed.length >= result.total_count) {
      complete = true;
      break;
    }
  }
  assert(complete, "incomplete artifact membership listing");
  const member = (artifactId) => {
    const matches = listed.filter((item) => String(item.id) === artifactId);
    assert.equal(matches.length, 1, "missing/duplicate artifact membership");
    return matches[0];
  };
  assert.deepEqual(member(candidateId), descriptorArtifact, "descriptor membership mismatch");
  const artifacts = Object.fromEntries(
    PARTS.map((kind) => [kind, member(candidate.artifacts[kind].id)])
  );
  validateCandidateOrigin(candidate, { run, descriptorArtifact, artifacts });
  const resolved = {
    candidate,
    candidateId,
    candidateSha256: digest(descriptor.bytes),
    run,
    descriptorArtifact
  };
  Object.defineProperty(resolved, "descriptorBytes", { value: descriptor.bytes });
  return resolved;
}
async function downloadCandidatePart(resolved, kind, directory, options = {}) {
  const c = validateCandidate(resolved.candidate);
  assert(PARTS.includes(kind), "unknown candidate part");
  const part = c.artifacts[kind];
  const metadata = { id: part.id, size_in_bytes: part.bytes, digest: `sha256:${part.sha256}` };
  const entries = decodeArchive(await artifactZip(metadata, options), part.files, LIMITS[kind]);
  fs.mkdirSync(directory); // Exclusive: do not merge a prior attempt or follow a pre-existing symlink.
  for (const entry of entries)
    fs.writeFileSync(path.join(directory, entry.name), entry.bytes, { flag: "wx" });
  verifyCandidateFiles(c, kind, directory);
  return directory;
}
async function main() {
  const [candidateId, directory, partsCsv] = process.argv.slice(2);
  assert(
    directory && partsCsv,
    "usage: node candidate-io.cjs <candidate_id> <directory> <partsCsv>"
  );
  const parts = partsCsv.split(",");
  assert(
    parts.length > 0 &&
      new Set(parts).size === parts.length &&
      parts.every((kind) => PARTS.includes(kind)),
    "invalid parts"
  );
  const resolved = await resolveCandidate(candidateId);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "candidate.json"), resolved.descriptorBytes, {
    flag: "wx"
  });
  const { candidateSha256, run, descriptorArtifact } = resolved;
  const origin = {
    candidateId,
    candidateSha256,
    run: Object.fromEntries(
      [
        "id",
        "run_attempt",
        "head_sha",
        "head_branch",
        "event",
        "path",
        "status",
        "conclusion",
        "repository",
        "head_repository"
      ].map((key) => [
        key,
        ["repository", "head_repository"].includes(key)
          ? { full_name: run[key].full_name }
          : run[key]
      ])
    ),
    descriptorArtifact: {
      id: descriptorArtifact.id,
      name: descriptorArtifact.name,
      digest: descriptorArtifact.digest,
      size_in_bytes: descriptorArtifact.size_in_bytes,
      expired: descriptorArtifact.expired,
      workflow_run: {
        id: descriptorArtifact.workflow_run.id,
        head_sha: descriptorArtifact.workflow_run.head_sha
      }
    }
  };
  fs.writeFileSync(path.join(directory, "origin.json"), JSON.stringify(origin, null, 2) + "\n", {
    flag: "wx"
  });
  for (const kind of parts) await downloadCandidatePart(resolved, kind, path.join(directory, kind));
}
module.exports = { githubJson, resolveCandidate, downloadCandidatePart, decodeArchive };
if (require.main === module)
  main().catch(() => {
    console.error(
      "Candidate download rejected: check input, GitHub origin, network and file integrity."
    );
    process.exitCode = 1;
  });
