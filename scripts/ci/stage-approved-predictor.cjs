// Production resources only. Synthetic unit-test resources are never a fallback.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { createHash } = require("node:crypto");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { architecture } = require("./verify-predictor-resources.cjs");

const limits = {
  "model.lpk": 128 * 1024 * 1024,
  "lp-electron.exe": 16 * 1024 * 1024,
  LICENSE: 1024 * 1024,
  "MODEL_NOTICE.md": 1024 * 1024
};
const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function regular(file, maximum) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && stat.size > 0 && stat.size <= maximum, `invalid regular file: ${file}`);
  return stat;
}

function approval(file) {
  regular(file, 1024 * 1024);
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  assert(
    value && /^base-ru-v[0-9]+(?:[.-][a-zA-Z0-9]+)*$/.test(value.releaseTag),
    "approved releaseTag required"
  );
  assert(
    hex(value.modelSha256) && hex(value.binaries?.["win32-x64"]),
    "approved model and Windows hashes required"
  );
  assert.deepEqual(
    Object.keys(value.downloads || {}).sort(),
    Object.keys(limits).sort(),
    "four approved downloads required"
  );
  for (const [name, maximum] of Object.entries(limits)) {
    const entry = value.downloads[name];
    assert(
      entry &&
        hex(entry.sha256) &&
        Number.isSafeInteger(entry.bytes) &&
        entry.bytes > 0 &&
        entry.bytes <= maximum,
      `invalid approved hash/size: ${name}`
    );
    assert.equal(
      entry.url,
      `https://github.com/linkasu/linka.predictor-rust/releases/download/${value.releaseTag}/${name}`,
      `invalid approved URL: ${name}`
    );
  }
  assert.equal(
    value.downloads["model.lpk"].sha256,
    value.modelSha256,
    "model approval disagreement"
  );
  assert.equal(
    value.downloads["lp-electron.exe"].sha256,
    value.binaries["win32-x64"],
    "binary approval disagreement"
  );
  return value;
}

function response(url, redirects = 0) {
  const parsed = new URL(url);
  assert(
    parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port,
    "HTTPS without credentials required"
  );
  assert(
    [
      "github.com",
      "release-assets.githubusercontent.com",
      "objects.githubusercontent.com",
      "github-releases.githubusercontent.com"
    ].includes(parsed.hostname),
    "untrusted redirect host"
  );
  assert(redirects <= 5, "too many redirects");
  return new Promise((resolve, reject) => {
    const request = https.get(
      parsed,
      { headers: { "User-Agent": "linka-approved-predictor", "Accept-Encoding": "identity" } },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.destroy();
          try {
            assert(typeof res.headers.location === "string", "missing redirect location");
            resolve(response(new URL(res.headers.location, parsed), redirects + 1));
          } catch (error) {
            reject(error);
          }
        } else if (
          res.statusCode !== 200 ||
          (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")
        ) {
          res.destroy();
          reject(new Error("unexpected download response"));
        } else resolve(res);
      }
    );
    request.once("error", reject);
    request.setTimeout(30000, () => request.destroy(new Error("download timeout")));
  });
}

async function download(entry, file) {
  const res = await response(entry.url);
  let bytes = 0;
  const hash = createHash("sha256");
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > entry.bytes) return callback(new Error("download exceeds approved size"));
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  const deadline = setTimeout(() => res.destroy(new Error("download deadline exceeded")), 120000);
  try {
    await pipeline(res, meter, fs.createWriteStream(file, { flags: "wx", mode: 0o600 }));
    assert.equal(bytes, entry.bytes, "download size mismatch");
    assert.equal(hash.digest("hex"), entry.sha256, "download hash mismatch");
  } finally {
    clearTimeout(deadline);
  }
}

async function validate(root, manifest) {
  const directory = path.join(root, "predictor-resources");
  assert(fs.lstatSync(directory).isDirectory(), "predictor-resources must not be a symlink");
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    Object.keys(limits).sort(),
    "unexpected or missing resources; refusing to overwrite local files"
  );
  for (const [name, entry] of Object.entries(manifest.downloads)) {
    const file = path.join(directory, name);
    assert.equal(regular(file, limits[name]).size, entry.bytes, `resource size mismatch: ${name}`);
    const hash = createHash("sha256");
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    assert.equal(hash.digest("hex"), entry.sha256, `resource hash mismatch: ${name}`);
  }
  architecture(path.join(directory, "lp-electron.exe"), "win32", "x64");
}

async function stage(root, approvalPath = path.join(root, "build/predictor-approval.json")) {
  root = fs.realpathSync(root);
  approvalPath = path.resolve(approvalPath);
  const manifest = approval(approvalPath); // Validate every approval field before any network or staging.
  const destination = path.join(root, "predictor-resources");
  try {
    fs.lstatSync(destination);
    await validate(root, manifest);
    return;
  } catch (error) {
    if (error.code !== "ENOENT" || fs.existsSync(destination)) throw error;
  }
  const owned = fs.mkdtempSync(path.join(root, ".predictor-stage-"));
  const prepared = path.join(owned, "predictor-resources");
  let reserved = false;
  try {
    fs.mkdirSync(prepared);
    for (const [name, entry] of Object.entries(manifest.downloads))
      await download(entry, path.join(prepared, name));
    await validate(owned, manifest);
    // POSIX rename replaces empty directories; Windows directory rename refuses existing targets.
    if (process.platform !== "win32") {
      fs.mkdirSync(destination);
      reserved = true;
    }
    fs.renameSync(prepared, destination);
    reserved = false;
  } finally {
    if (reserved) fs.rmdirSync(destination);
    fs.rmSync(owned, { recursive: true, force: true });
  }
}

if (require.main === module) {
  Promise.resolve()
    .then(() => {
      assert(
        process.platform === "win32" && process.arch === "x64",
        "4.x packaging supports only Windows x64; macOS remains frozen at 3.3.1"
      );
      return stage(path.resolve(__dirname, "../.."));
    })
    .catch((error) => {
      console.error(`Approved predictor staging BLOCKED: ${error.message}`);
      process.exitCode = 1;
    });
}
module.exports = { stage };
