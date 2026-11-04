const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const AdmZip = require("adm-zip");
const { fixture } = require("./candidate-contract.test.cjs");
const { digest, PARTS, REPOSITORY } = require("./candidate-contract.cjs");
const io = require("./candidate-io.cjs");

function archive(files) {
  const zip = new AdmZip();
  for (const [name, bytes] of Object.entries(files)) zip.addFile(name, bytes);
  return zip.toBuffer();
}
function setup(t) {
  const { candidate, origin, payload } = fixture();
  const routes = new Map();
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  for (const kind of PARTS) {
    const bytes = archive(
      Object.fromEntries(candidate.artifacts[kind].files.map((file) => [file.name, payload]))
    );
    Object.assign(candidate.artifacts[kind], { bytes: bytes.length, sha256: digest(bytes) });
    Object.assign(origin.artifacts[kind], {
      size_in_bytes: bytes.length,
      digest: `sha256:${digest(bytes)}`
    });
    routes.set(`${base}/actions/artifacts/${candidate.artifacts[kind].id}/zip`, bytes);
  }
  const raw = Buffer.from(JSON.stringify(candidate, null, 3) + "\n");
  const descriptor = archive({ "candidate.json": raw });
  Object.assign(origin.descriptorArtifact, {
    size_in_bytes: descriptor.length,
    digest: `sha256:${digest(descriptor)}`
  });
  routes.set(`${base}/actions/artifacts/99`, origin.descriptorArtifact);
  routes.set(`${base}/actions/artifacts/99/zip`, descriptor);
  routes.set(`${base}/actions/runs/123`, origin.run);
  routes.set(`${base}/actions/runs/123/attempts/2`, structuredClone(origin.run));
  routes.set(`${base}/actions/runs/123/artifacts?per_page=100&page=1`, {
    total_count: 4,
    artifacts: [origin.descriptorArtifact, ...Object.values(origin.artifacts)]
  });
  t.mock.method(global, "fetch", async (url) => {
    const value = routes.get(String(url));
    assert.notEqual(value, undefined, `unexpected request ${url}`);
    return new Response(Buffer.isBuffer(value) ? value : JSON.stringify(value));
  });
  return { candidate, origin, routes, base, raw };
}
test("resolve metadata without downloading parts, pin original descriptor bytes, then verify Windows", async (t) => {
  const { candidate, raw } = setup(t);
  const resolved = await io.resolveCandidate("99");
  assert.equal(
    global.fetch.mock.calls.length,
    4,
    "resolve must inspect metadata without fetching payload parts"
  );
  assert.deepEqual(resolved.candidate, candidate);
  assert.equal(resolved.candidateSha256, digest(raw));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-io-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await io.downloadCandidatePart(resolved, "windows", path.join(directory, "windows"));
  assert.deepEqual(
    fs.readdirSync(path.join(directory, "windows")).sort(),
    candidate.artifacts.windows.files.map((file) => file.name).sort()
  );
  await assert.rejects(
    io.downloadCandidatePart(resolved, "windows", path.join(directory, "windows"))
  );
});
test("reject cancelled origins and archive digest mismatch before decoding", async (t) => {
  const { origin, routes, base } = setup(t);
  origin.run.conclusion = "cancelled";
  await assert.rejects(io.resolveCandidate("99"));
  origin.run.conclusion = "success";
  routes.set(`${base}/actions/artifacts/99/zip`, Buffer.from("not a zip"));
  await assert.rejects(io.resolveCandidate("99"), /size|digest/);
});
test("current producer failure or later attempt cannot hide behind historical success", async (t) => {
  const { origin, routes, base } = setup(t);
  assert.equal(routes.get(`${base}/actions/runs/123/attempts/2`).conclusion, "success");
  for (const patch of [
    { conclusion: "cancelled" },
    { conclusion: "failure" },
    { run_attempt: 3, conclusion: "success" },
    { run_attempt: 3, conclusion: null, status: "in_progress" }
  ]) {
    routes.set(`${base}/actions/runs/123`, { ...origin.run, ...patch });
    await assert.rejects(io.resolveCandidate("99"));
  }
  assert(
    !global.fetch.mock.calls.some((call) => String(call.arguments[0]).includes("/attempts/")),
    "historical success must not be a fallback"
  );
});
test("artifact selectors reject oversized and unsafe numeric IDs before HTTP", async (t) => {
  t.mock.method(global, "fetch", () => {
    throw new Error("HTTP must not be called");
  });
  for (const value of ["1".repeat(17), "9007199254740992", "0", "01", "-1"])
    await assert.rejects(io.resolveCandidate(value), /ID required/);
  assert.equal(global.fetch.mock.calls.length, 0);
});
test("strict ZIP rejects extra, traversal, duplicate, symlink and expanded-size claims", () => {
  const files = [{ name: "candidate.json", bytes: 2, sha256: digest(Buffer.from("{}")) }];
  assert.equal(
    io
      .decodeArchive(archive({ "candidate.json": Buffer.from("{}") }), files, 65536)[0]
      .bytes.toString(),
    "{}"
  );
  for (const entries of [{ "candidate.json": Buffer.from("{}"), extra: Buffer.from("x") }])
    assert.throws(() => io.decodeArchive(archive(entries), files, 65536));
  const normal = archive({ "candidate.json": Buffer.from("{}") });
  const symlink = Buffer.from(normal);
  symlink.writeUInt32LE(0xa1ff0000, symlink.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 38);
  assert.throws(() => io.decodeArchive(symlink, files, 65536));
  for (const mode of [0x1000, 0x2000, 0x4000, 0x6000, 0xc000]) {
    const special = Buffer.from(normal);
    special.writeUInt32LE(
      (mode * 65536) >>> 0,
      special.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 38
    );
    assert.throws(() => io.decodeArchive(special, files, 65536));
  }
  const traversal = Buffer.from(normal);
  traversal.write("../", 30);
  traversal.write("../", traversal.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 46);
  assert.throws(() => io.decodeArchive(traversal, files, 65536));
  const bomb = Buffer.from(normal);
  const central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bomb.writeUInt32LE(65537, central + 24);
  assert.throws(() => io.decodeArchive(bomb, files, 65536));
  // A duplicated central entry must not be hidden by the ZIP library's name map.
  const eocd = normal.length - 22;
  for (const [offset, value] of [
    [eocd + 4, 1],
    [eocd + 6, 1],
    [central + 34, 1],
    [central + 6, 45],
    [4, 45]
  ]) {
    const unsupported = Buffer.from(normal);
    unsupported.writeUInt16LE(value, offset);
    assert.throws(() => io.decodeArchive(unsupported, files, 65536));
  }
  const zip64Header = Buffer.from(normal.subarray(0, eocd));
  zip64Header.writeUInt16LE(4, central + 30);
  const zip64End = Buffer.from(normal.subarray(eocd));
  zip64End.writeUInt32LE(zip64End.readUInt32LE(12) + 4, 12);
  const zip64Extra = Buffer.concat([zip64Header, Buffer.from([1, 0, 0, 0]), zip64End]);
  assert.throws(() => io.decodeArchive(zip64Extra, files, 65536), /ZIP64/);
  const centralBytes = normal.subarray(central, eocd);
  const end = Buffer.from(normal.subarray(eocd));
  end.writeUInt16LE(2, 8);
  end.writeUInt16LE(2, 10);
  end.writeUInt32LE(centralBytes.length * 2, 12);
  const duplicate = Buffer.concat([normal.subarray(0, eocd), centralBytes, end]);
  assert.throws(() => io.decodeArchive(duplicate, files, 65536));
});
test("HTTP validates own API path, bounds responses and strips auth on allowed signed redirect", async (t) => {
  await assert.rejects(io.githubJson("https://evil.example/"));
  await assert.rejects(io.githubJson("/repos/foreign/repo/actions/runs/1"));
  let calls = 0;
  t.mock.method(global, "fetch", async (url, options) => {
    calls++;
    if (calls === 1) {
      assert.equal(options.headers.Authorization, "Bearer secret");
      return new Response(null, {
        status: 302,
        headers: {
          location: "https://productionresultssa1.blob.core.windows.net/container/file?sig=secret"
        }
      });
    }
    assert.equal(options.headers.Authorization, undefined);
    return new Response("{}");
  });
  assert.deepEqual(
    await io.githubJson(`/repos/${REPOSITORY}/actions/runs/1`, { token: "secret" }),
    {}
  );
  t.mock.method(
    global,
    "fetch",
    async () =>
      new Response(null, { status: 302, headers: { location: "https://evil.example/?secret" } })
  );
  await assert.rejects(io.githubJson(`/repos/${REPOSITORY}/actions/runs/1`), /redirect/);
  t.mock.method(global, "fetch", async () => new Response("x".repeat(4 * 1024 ** 2 + 1)));
  await assert.rejects(io.githubJson(`/repos/${REPOSITORY}/actions/runs/1`), /bound/);
});
test("HTTP classifies only transport and transient service errors as safe infrastructure errors", async (t) => {
  const endpoint = `/repos/${REPOSITORY}/actions/runs/123`;
  const infra = (error) =>
    error.code === "CI_INFRA_ERROR" && !error.cause && !/secret|https:|Bearer/.test(error.message);
  for (const status of [429, 500, 503]) {
    t.mock.method(
      global,
      "fetch",
      async () => new Response("secret upstream response", { status })
    );
    await assert.rejects(io.githubJson(endpoint), infra);
  }
  t.mock.method(global, "fetch", async () => {
    throw new Error("https://signed.invalid?secret Bearer secret");
  });
  await assert.rejects(io.githubJson(endpoint), infra);
  t.mock.method(
    global,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("secret interrupted transport"));
          }
        })
      )
  );
  await assert.rejects(io.githubJson(endpoint), infra);
  for (const status of [401, 403, 404]) {
    t.mock.method(global, "fetch", async () => new Response("authorization rejected", { status }));
    await assert.rejects(io.githubJson(endpoint), (error) => error.code === "ERR_ASSERTION");
  }
  t.mock.method(global, "fetch", async () => new Response("x".repeat(4 * 1024 ** 2 + 1)));
  await assert.rejects(
    io.githubJson(endpoint),
    (error) => error.code === "ERR_ASSERTION" && /bound/.test(error.message)
  );
  t.mock.method(global, "fetch", async () => new Response("not JSON"));
  await assert.rejects(io.githubJson(endpoint), (error) => error.code !== "CI_INFRA_ERROR");
  const assertion = new assert.AssertionError({ message: "validation identity" });
  t.mock.method(
    global,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(assertion);
          }
        })
      )
  );
  await assert.rejects(io.githubJson(endpoint), (error) => error === assertion);
});
test("artifact hash failures remain validation errors rather than infrastructure", async (t) => {
  const { routes, base, origin } = setup(t);
  routes.set(
    `${base}/actions/artifacts/99/zip`,
    Buffer.alloc(origin.descriptorArtifact.size_in_bytes)
  );
  await assert.rejects(
    io.resolveCandidate("99"),
    (error) => error.code === "ERR_ASSERTION" && /digest mismatch/.test(error.message)
  );
});
