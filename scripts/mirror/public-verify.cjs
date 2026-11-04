// Hosted CI probe; caller must first resolve and validate the actual published GitHub asset.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHash } = require("node:crypto");

const PUBLIC_ROOT = "https://linka.su/dist/linka.looks/";
function installerPath(value, version, sha256) {
  assert.equal(
    value,
    `releases/${version}-${sha256}/linka.looks.setup.exe`,
    "unsafe immutable installer path"
  );
  return value;
}
async function publicVerify({
  version,
  sha256,
  size,
  fetchImpl = fetch,
  root = PUBLIC_ROOT,
  timeout = 300000
}) {
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version));
  assert(/^[a-f0-9]{64}$/.test(sha256));
  assert(Number.isSafeInteger(size) && size > 0 && size <= 512 * 1024 ** 2);
  const result = {
    publication: "PUBLISHED",
    status: "PUBLISHED_DISTRIBUTION_UNVERIFIED",
    version,
    sha256,
    size,
    stage: "version",
    attempts: 0
  };
  async function read(relative, limit, hashOnly = false) {
    const url = new URL(relative, root);
    assert.equal(url.origin, new URL(root).origin);
    assert(url.pathname.startsWith(new URL(root).pathname));
    for (let attempt = 1; attempt <= 2; attempt++) {
      result.attempts++;
      let response;
      try {
        response = await fetchImpl(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(hashOnly ? timeout : Math.min(timeout, 30000)),
          headers: { "Cache-Control": "no-cache" }
        });
        if (!response.ok) {
          await response.body?.cancel();
          const error = new Error(`HTTP_${response.status}`);
          error.protocol = `HTTP_${response.status}`;
          error.infra = response.status === 429 || response.status >= 500;
          throw error;
        }
        assert(response.body, "EMPTY_BODY");
        let bytes = 0;
        const chunks = [];
        const hash = createHash("sha256");
        for await (const chunk of response.body) {
          bytes += chunk.length;
          assert(bytes <= limit, "BODY_TOO_LARGE");
          hash.update(chunk);
          if (!hashOnly) chunks.push(Buffer.from(chunk));
        }
        return hashOnly ? { size: bytes, sha256: hash.digest("hex") } : Buffer.concat(chunks);
      } catch (error) {
        const infra =
          error.infra || ["TypeError", "TimeoutError", "AbortError"].includes(error.name);
        if (infra && attempt < 2) continue;
        error.infra = infra;
        throw error;
      }
    }
  }
  try {
    const latest = JSON.parse((await read("version.json", 16384)).toString("utf8"));
    assert.equal(latest.version, version, "VERSION_MISMATCH");
    result.stage = "manifest";
    const manifest = JSON.parse((await read("manifest.json", 65536)).toString("utf8"));
    assert.equal(manifest.version, version, "MANIFEST_VERSION_MISMATCH");
    assert.equal(manifest.sha256, sha256, "MANIFEST_DIGEST_MISMATCH");
    assert.equal(manifest.size, size, "MANIFEST_SIZE_MISMATCH");
    const immutable = installerPath(manifest.installer, version, sha256);
    for (const [stage, relative] of [
      ["immutable-installer", immutable],
      ["legacy-installer", "linka.looks.setup.exe"]
    ]) {
      result.stage = stage;
      assert.deepEqual(
        await read(relative, size, true),
        { size, sha256 },
        "INSTALLER_BYTES_MISMATCH"
      );
    }
    result.status = "PUBLISHED_DISTRIBUTION_VERIFIED";
    result.stage = "complete";
  } catch (error) {
    result.status = error.infra ? "INFRA_ERROR" : "PUBLISHED_DISTRIBUTION_UNVERIFIED";
    // Never persist fetch errors: they can contain proxy URLs or credentials.
    result.error =
      error.protocol ||
      (error.infra ? "NETWORK_OR_STREAM_FAILURE" : "PUBLIC_CONTENT_OR_PROTOCOL_MISMATCH");
  }
  return result;
}
module.exports = { publicVerify, installerPath, PUBLIC_ROOT };
if (require.main === module) {
  const [version, sha256, bytes, summary] = process.argv.slice(2);
  const write = (result) => {
    fs.writeFileSync(summary, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result));
    if (result.status !== "PUBLISHED_DISTRIBUTION_VERIFIED") process.exitCode = 1;
  };
  publicVerify({ version, sha256, size: Number(bytes) }).then(write, () =>
    write({
      publication: "PUBLICATION_STATE_UNVERIFIED",
      status: "DISTRIBUTION_NOT_VERIFIED",
      stage: "arguments",
      error: "INVALID_EXPECTED_RELEASE"
    })
  );
}
