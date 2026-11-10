// Exact-byte promotion only. The write job never checks out or executes candidate code.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const REPOSITORY = "linkasu/linka.looks-electron";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const positiveId = (value) =>
  typeof value === "string" && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
function fileRecord(directory, name) {
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(name), "unsafe publication filename");
  const file = path.join(directory, name);
  const stat = fs.lstatSync(file);
  assert(
    stat.isFile() && stat.size > 0 && stat.size <= 512 * 1024 ** 2,
    "publication file size/type mismatch"
  );
  return { name, bytes: stat.size, sha256: digest(fs.readFileSync(file)) };
}
function verifyNotes(notes, version) {
  assert(typeof notes === "string" && notes.length > 10 && Buffer.byteLength(notes) <= 128 * 1024);
  const heading = notes.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  const versions = heading?.match(/\b\d+\.\d+\.\d+\b/g);
  assert(
    versions?.length === 1 && versions[0] === version,
    "No reviewed release notes for selected candidate version; add version-matching notes at the selected app commit"
  );
  return notes;
}
function notesRequirePrerelease(notes) {
  return /^<!-- release-channel: prerelease -->$/m.test(notes);
}
function verifyPrepared(directory) {
  assert(fs.lstatSync(directory).isDirectory(), "regular publication directory required");
  const stat = fs.lstatSync(path.join(directory, "publication.json"));
  assert(
    stat.isFile() && stat.size > 0 && stat.size <= 65536,
    "small regular publication manifest required"
  );
  const m = JSON.parse(fs.readFileSync(path.join(directory, "publication.json")));
  assert.equal(m.schema, "linka-release-publication-v1");
  assert.equal(m.repository, REPOSITORY);
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(m.version));
  assert.equal(m.tag, `v${m.version}`);
  assert.equal(typeof m.prerelease, "boolean", "publication prerelease must be boolean");
  assert(/^[a-f0-9]{40}$/.test(m.appSha));
  for (const id of [m.candidateId, m.qualificationRunId, m.qualificationArtifactId])
    assert(positiveId(id), "bounded safe numeric ID required");
  for (const hash of [m.candidateSha256, m.qualificationSha256])
    assert(/^[a-f0-9]{64}$/.test(hash));
  assert(Number.isSafeInteger(m.qualificationRunAttempt) && m.qualificationRunAttempt > 0);
  assert(Array.isArray(m.files) && m.files.length > 0 && m.files.length <= 64);
  assert.equal(m.notes.name, "release-notes.md");
  assert(m.notes.bytes <= 128 * 1024, "release notes exceed bound");
  const names = ["publication.json", m.notes.name, ...m.files.map((f) => f.name)];
  assert.equal(new Set(names).size, names.length, "duplicate publication filename");
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    names.sort(),
    "unknown or missing publication files"
  );
  for (const file of [...m.files, m.notes])
    assert.deepEqual(fileRecord(directory, file.name), file, "prepared file digest mismatch");
  const notes = verifyNotes(fs.readFileSync(path.join(directory, m.notes.name), "utf8"), m.version);
  assert(
    m.prerelease || !notesRequirePrerelease(notes),
    "Candidate notes require prerelease publication; stable publication is forbidden"
  );
  return m;
}
function inspectState(state, m, notes) {
  if (state.tagSha)
    assert.equal(state.tagSha, m.appSha, "existing tag points at a different app commit");
  const r = state.release;
  if (!r) return { phase: "CREATE", missing: m.files };
  assert.equal(r.tag_name, m.tag);
  assert.equal(r.prerelease, m.prerelease, "existing release mode mismatch");
  assert.equal(r.body, notes, "existing release notes mismatch");
  if (r.draft) {
    assert.equal(r.target_commitish, m.appSha, "draft target mismatch");
  } else assert(state.tagSha, "published release has no resolvable tag");
  assert(Array.isArray(r.assets));
  const seen = new Set();
  for (const asset of r.assets) {
    assert(!seen.has(asset.name), "duplicate existing asset");
    seen.add(asset.name);
    const file = m.files.find((f) => f.name === asset.name);
    assert(file, "unknown existing release asset; never delete or overwrite");
    assert.equal(asset.size, file.bytes, "asset collision size mismatch");
    assert.equal(asset.digest, `sha256:${file.sha256}`, "asset collision digest mismatch");
  }
  const missing = m.files.filter((f) => !seen.has(f.name));
  if (!r.draft) {
    assert.equal(missing.length, 0, "published asset set differs; never mutate published releases");
    return { phase: "ALREADY_PUBLISHED", missing };
  }
  return { phase: "DRAFT", missing };
}
async function publish(directory, api) {
  const m = verifyPrepared(directory);
  const notes = fs.readFileSync(path.join(directory, m.notes.name), "utf8");
  let state = await api.read(m);
  let current = inspectState(state, m, notes);
  if (current.phase === "ALREADY_PUBLISHED")
    return { status: "ALREADY_PUBLISHED", version: m.version };
  async function mutate(action, completed) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await action();
      } catch (error) {
        if (!error.uncertain) throw error;
        state = await api.read(m);
        current = inspectState(state, m, notes);
        if (completed()) return;
        if (attempt === 1) throw error;
        continue;
      }
      const deadline = Date.now() + 30000;
      for (;;) {
        state = await api.read(m);
        current = inspectState(state, m, notes);
        if (completed()) return;
        assert(Date.now() < deadline, "GitHub write did not produce expected verified state");
        await new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now())));
      }
    }
  }
  if (current.phase === "CREATE")
    await mutate(
      () => api.createDraft(m, notes),
      () => current.phase !== "CREATE"
    );
  for (const file of [...current.missing]) {
    if (current.phase === "ALREADY_PUBLISHED") break;
    await mutate(
      () => api.upload(state.release.id, file, directory),
      () => !current.missing.some((f) => f.name === file.name)
    );
  }
  assert.equal(current.missing.length, 0, "cannot publish incomplete asset set");
  if (current.phase !== "ALREADY_PUBLISHED")
    await mutate(
      () => api.publish(state.release.id, m),
      () => current.phase === "ALREADY_PUBLISHED"
    );
  return { status: "PUBLISHED", version: m.version };
}
function extractQualification(bytes, directory) {
  assert(bytes.length > 0 && bytes.length <= 8 * 1024 ** 2, "qualification ZIP bound");
  const Zip = require("adm-zip");
  const zip = new Zip(bytes);
  const entries = zip.getEntries();
  assert.equal(entries.length, 5, "qualification ZIP file count");
  const names = new Set();
  let total = 0;
  for (const entry of entries) {
    assert(
      !entry.isDirectory && /^[A-Za-z0-9][A-Za-z0-9._-]{0,194}\.json$/.test(entry.entryName),
      "unexpected qualification ZIP entry"
    );
    assert(!names.has(entry.entryName), "duplicate qualification entry");
    names.add(entry.entryName);
    assert(
      [0, 0x8000].includes((entry.attr >>> 16) & 0xf000),
      "qualification entries must be regular files"
    );
    assert(
      !(entry.header.flags & 1) && [0, 8].includes(entry.header.method),
      "unsupported ZIP encoding"
    );
    assert(
      entry.header.size > 0 && entry.header.size <= 1024 ** 2,
      "qualification member size bound"
    );
    total += entry.header.size;
    assert(total <= 8 * 1024 ** 2, "expanded qualification bound");
  }
  assert.equal(names.size, 5);
  const descriptor = entries.find((entry) => entry.entryName === "qualification.json");
  assert(descriptor && descriptor.header.size <= 65536, "small qualification descriptor required");
  const descriptorBytes = descriptor.getData();
  const q = JSON.parse(descriptorBytes);
  require("./qualification-contract.cjs").validateQualification(q);
  const decoded = require("./candidate-io.cjs").decodeArchive(
    bytes,
    [
      {
        name: "qualification.json",
        bytes: descriptorBytes.length,
        sha256: digest(descriptorBytes)
      },
      ...q.reports
    ],
    8 * 1024 ** 2
  );
  fs.mkdirSync(directory);
  for (const entry of decoded)
    fs.writeFileSync(path.join(directory, entry.name), entry.bytes, { flag: "wx" });
  return q;
}
module.exports = {
  positiveId,
  publish,
  inspectState,
  verifyPrepared,
  verifyNotes,
  notesRequirePrerelease,
  extractQualification,
  fileRecord,
  digest,
  REPOSITORY
};
if (require.main === module) {
  const [command, reference, directory] = process.argv.slice(2);
  const io = require("./release-publication-io.cjs");
  const action =
    command === "prepare"
      ? Promise.resolve().then(() => {
          const value = process.env.PUBLICATION_PRERELEASE ?? "false";
          assert(["true", "false"].includes(value), "PUBLICATION_PRERELEASE must be true or false");
          return io.prepare(reference, directory, { prerelease: value === "true" });
        })
      : command === "publish"
        ? publish(reference, io.releaseApi())
        : Promise.reject(
            new Error("Usage: release-publication.cjs prepare RUN_ID DIRECTORY | publish DIRECTORY")
          );
  action.then(
    (result) => console.log(JSON.stringify(result)),
    (error) => {
      console.error(
        error instanceof SyntaxError ? "Invalid publication input JSON" : error.message
      );
      process.exitCode = 1;
    }
  );
}
