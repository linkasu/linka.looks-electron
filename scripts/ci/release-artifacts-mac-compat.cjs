// Published 3.3.1 bytes only: compatibility carry-forward, never a new macOS qualification.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const release = "https://github.com/linkasu/linka.looks-electron/releases/download/v3.3.1";
const pins = [
  ["latest-mac.yml", 839, "641fd547939bd340c9a46ac8ebbdf8bda9af9b8076120c26004042b0cabc937e"],
  [
    "linka.looks-3.3.1-mac-arm64.dmg",
    159521373,
    "3d767161e2497158bbaba1e9e571417ed52040cd7edab35c8de818e3054f992a"
  ],
  [
    "linka.looks-3.3.1-mac-arm64.dmg.blockmap",
    166611,
    "6508d8a33dbaabdc87b769d0e5c0600b54c599a8ab5a49001f0419016faf2e38"
  ],
  [
    "linka.looks-3.3.1-mac-arm64.zip",
    153722792,
    "dad37f901c0de74f13a2b3da0df05012453f054f9d283425bee72b055d0f6034"
  ],
  [
    "linka.looks-3.3.1-mac-arm64.zip.blockmap",
    160263,
    "96e687f4962e6b5663a853757850d57e6325f286608429bc194244f7c43b4e2b"
  ],
  [
    "linka.looks-3.3.1-mac-x64.dmg",
    166798249,
    "e4c6b2d86fe5723439642b218dedfbd3b690f7956368a1406935e578ccb8f974"
  ],
  [
    "linka.looks-3.3.1-mac-x64.dmg.blockmap",
    174740,
    "b17845e6000a28d875383f8470ac852df587dfd1beda6390151685c1fede6c1f"
  ],
  [
    "linka.looks-3.3.1-mac-x64.zip",
    160967612,
    "287af1dab182c58c29049ca04f4f80c98b7d0e3f73b22c3cb4b9e1d82d521f22"
  ],
  [
    "linka.looks-3.3.1-mac-x64.zip.blockmap",
    167341,
    "e16acfc50b4dc9822ec22cb59c576a3b7a120bf4204d5d91911e46aa00bfec8a"
  ]
].map(([name, size, sha256]) => ({ name, size, sha256 }));
const manifestName = "macos-compatibility.json";
const manifest = {
  schema: 1,
  purpose: "unchanged published macOS 3.3.1 compatibility; not a 4.0.0 macOS build",
  release,
  version: "3.3.1",
  files: pins
};
const names = [...pins.map((pin) => pin.name), manifestName];
function checkRecords(records) {
  assert.deepEqual(records, pins, "legacy macOS compatibility bytes changed");
}
function verify(directory) {
  checkRecords(
    pins.map(({ name }) => {
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      assert(stat.isFile(), "compatibility asset must be a regular file");
      const bytes = fs.readFileSync(file);
      return { name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    })
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, manifestName))), manifest);
  return names;
}
async function download(directory) {
  for (const pin of pins) {
    let url = new URL(`${release}/${pin.name}`);
    let response;
    const signal = AbortSignal.timeout(300000);
    for (let redirects = 0; ; redirects++) {
      assert.equal(url.protocol, "https:", "legacy asset transport must remain HTTPS");
      response = await fetch(url, { signal, redirect: "manual" });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      assert(redirects < 5 && response.headers.get("location"), "invalid legacy asset redirect");
      url = new URL(response.headers.get("location"), url);
    }
    assert(response.ok, `legacy asset download failed: ${pin.name}`);
    const file = path.join(directory, pin.name);
    const fd = fs.openSync(file, "wx");
    const hash = createHash("sha256");
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        assert(size <= pin.size, "legacy asset exceeds pinned size");
        hash.update(chunk);
        fs.writeFileSync(fd, chunk);
      }
    } finally {
      fs.closeSync(fd);
    }
    assert.equal(size, pin.size, "legacy asset size mismatch");
    assert.equal(hash.digest("hex"), pin.sha256, "legacy asset hash mismatch");
  }
  fs.writeFileSync(path.join(directory, manifestName), JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx"
  });
  verify(directory);
}
module.exports = { release, pins, manifest, names, checkRecords, verify, download };
if (require.main === module)
  download(process.argv[2]).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
