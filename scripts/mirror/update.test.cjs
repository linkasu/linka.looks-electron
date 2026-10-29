const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const { prepare, updateMirror, rollback } = require("./update.cjs");

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const old = Buffer.from("existing reviewed installer");
const next = Buffer.from("new reviewed installer");
const version = "3.3.0";
const assetUrl = `https://github.com/linkasu/linka.looks-electron/releases/download/v${version}/linka.looks-${version}-win-x64.exe`;

test("SSH stdin transport executes the CLI and fails closed without explicit arguments", async () => {
  const source = await fs.readFile(path.join(__dirname, "update.cjs"), "utf8");
  const result = spawnSync(process.execPath, ["-"], {
    input: source,
    encoding: "utf8",
    timeout: 10000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node update.cjs/);
});

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "mirror-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "linka.looks.setup.exe"), old);
  await fs.writeFile(path.join(root, "version.json"), JSON.stringify({ version: "3.2.13" }));
  await fs.writeFile(path.join(root, "old.exe"), "historical installer");
  await prepare(root, "3.2.13", digest(old));
  return root;
}

async function snapshot(root) {
  return Promise.all(
    ["linka.looks.setup.exe", "version.json", "manifest.json", "old.exe"].map((file) =>
      fs.readFile(path.join(root, file), "utf8")
    )
  );
}

function mockFetch({
  metadata = {},
  asset = {},
  body = next,
  status = 200,
  interrupted = false
} = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      assert.equal(
        url,
        `https://api.github.com/repos/linkasu/linka.looks-electron/releases/tags/v${version}`
      );
      return Response.json({
        tag_name: `v${version}`,
        draft: false,
        prerelease: false,
        assets: [
          {
            name: `linka.looks-${version}-win-x64.exe`,
            browser_download_url: assetUrl,
            size: next.length,
            digest: `sha256:${digest(next)}`,
            ...asset
          }
        ],
        ...metadata
      });
    }
    assert.equal(url, assetUrl);
    if (interrupted) {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(next.subarray(0, 2));
            controller.error(new Error("connection interrupted"));
          }
        })
      );
    }
    return new Response(body, { status });
  };
  return { fetchImpl, calls };
}

test("prepare preserves every historical installer and exact old pair", async (t) => {
  const root = await fixture(t);
  assert.deepEqual((await snapshot(root)).slice(0, 2), [old.toString(), '{"version":"3.2.13"}']);
  assert.equal(
    await fs.readlink(path.join(root, "linka.looks.setup.exe")),
    "current/linka.looks.setup.exe"
  );
  assert.equal(await fs.readlink(path.join(root, "version.json")), "current/version.json");
  assert.equal(JSON.parse((await snapshot(root))[2]).sha256, digest(old));
});

for (const [name, options] of [
  ["HTTP failure", { status: 503 }],
  ["interrupted download", { interrupted: true }],
  ["hash failure", { body: Buffer.alloc(next.length, 1) }],
  ["short download", { body: next.subarray(0, 2) }],
  ["wrong release version", { metadata: { tag_name: "v3.3.1" } }],
  ["draft release", { metadata: { draft: true } }],
  ["wrong asset version", { asset: { browser_download_url: assetUrl.replace("3.3.0", "3.3.1") } }],
  ["wrong published hash", { asset: { digest: `sha256:${"0".repeat(64)}` } }]
]) {
  test(`${name} leaves old installer, manifest and version working`, async (t) => {
    const root = await fixture(t);
    const before = await snapshot(root);
    const pointer = await fs.readlink(path.join(root, "current"));
    await assert.rejects(
      updateMirror({ root, version, sha256: digest(next), ...mockFetch(options) })
    );
    assert.deepEqual(await snapshot(root), before);
    assert.equal(await fs.readlink(path.join(root, "current")), pointer);
  });
}

test("full-download dry-run writes nothing; atomic switch and exact rollback keep both versions", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  const entries = await fs.readdir(root);
  const dry = mockFetch();
  const result = await updateMirror({ root, version, sha256: digest(next), dryRun: true, ...dry });
  assert.equal(result.dryRun, true);
  assert.equal(dry.calls.length, 2);
  assert.deepEqual(await snapshot(root), before);
  assert.deepEqual(await fs.readdir(root), entries);
  const update = await updateMirror({ root, version, sha256: digest(next), ...mockFetch() });
  assert.equal(await fs.readlink(path.join(root, "current")), update.current);
  assert.equal((await snapshot(root))[0], next.toString());
  assert.equal(JSON.parse((await snapshot(root))[1]).version, version);
  assert.equal(JSON.parse((await snapshot(root))[2]).previous, update.previous);
  await rollback(root, "3.2.13", digest(old));
  assert.deepEqual(await snapshot(root), before);
  assert.equal(
    await fs.readFile(path.join(root, update.current, "linka.looks.setup.exe"), "utf8"),
    next.toString()
  );
});

test("runner-supplied release metadata avoids unauthenticated API but is still validated", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  const metadataResponse = await mockFetch().fetchImpl(
    `https://api.github.com/repos/linkasu/linka.looks-electron/releases/tags/v${version}`
  );
  const releaseMetadata = await metadataResponse.json();
  let downloads = 0;
  const fetchImpl = async (url) => {
    assert.equal(url, assetUrl);
    downloads++;
    return new Response(next);
  };
  await updateMirror({
    root,
    version,
    sha256: digest(next),
    releaseMetadata,
    fetchImpl,
    dryRun: true
  });
  assert.equal(downloads, 1);
  await assert.rejects(
    updateMirror({
      root,
      version,
      sha256: digest(next),
      releaseMetadata: { ...releaseMetadata, tag_name: "v3.2.13" },
      fetchImpl
    }),
    /mismatch/
  );
  assert.equal(downloads, 1);
  assert.deepEqual(await snapshot(root), before);
});

test("incomplete immutable destination and concurrent writer fail without switching", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  await fs.mkdir(path.join(root, "releases", `${version}-${digest(next)}`));
  await assert.rejects(
    updateMirror({ root, version, sha256: digest(next), ...mockFetch() }),
    /Incomplete/
  );
  assert.deepEqual(await snapshot(root), before);
  await fs.mkdir(path.join(root, ".mirror-update.lock"));
  await assert.rejects(
    updateMirror({ root, version, sha256: digest(next), ...mockFetch() }),
    /EEXIST/
  );
  assert.deepEqual(await snapshot(root), before);
});

test("process killed during download leaves the entire old generation working", async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  const temporary = path.join(root, "download-temp");
  await fs.mkdir(temporary);
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
    const { updateMirror } = require(${JSON.stringify(path.join(__dirname, "update.cjs"))});
    let count = 0;
    updateMirror({root: process.argv[1], version: '${version}', sha256: '${digest(next)}', fetchImpl: async () => {
      if (++count === 1) return Response.json({tag_name:'v${version}', assets:[{
        name:'linka.looks-${version}-win-x64.exe', browser_download_url:'${assetUrl}', size:${next.length}
      }]});
      return new Response(new ReadableStream({start(controller) {
        controller.enqueue(new Uint8Array([1,2]));
        setInterval(() => {}, 1000);
        console.log('DOWNLOAD_STARTED');
      }}));
    }}).catch(error => { console.error(error); process.exit(1); });
  `,
      root
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TMPDIR: temporary } }
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });
  await Promise.race([
    new Promise((resolve, reject) => {
      child.stdout.on("data", (data) => {
        if (data.toString().includes("DOWNLOAD_STARTED")) resolve();
      });
      child.once("exit", (code) => reject(new Error(`Child exited early: ${code}`)));
    }),
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Download startup timeout")), 10000);
      timer.unref();
    })
  ]);
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  assert.deepEqual(await snapshot(root), before);
  await assert.rejects(
    updateMirror({ root, version, sha256: digest(next), ...mockFetch() }),
    /EEXIST/
  );
});
