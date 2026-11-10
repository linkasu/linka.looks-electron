const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const { RUNTIMES, verifyFile } = require("./provision-bubble-runtime.cjs");

const bytes = Buffer.from("synthetic offline installer fixture");
const expected = { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };

test("signature verification never waits for stdin and still requires a valid Microsoft signature", async () => {
  const source = await fs.readFile(path.join(__dirname, "provision-bubble-runtime.cjs"), "utf8");
  const calls = [];
  let response = { status: 0 };
  const module = { exports: {} };
  const root = path.resolve("windows-fixture");
  vm.runInNewContext(source, {
    module,
    Buffer,
    process: { env: { SystemRoot: root, GH_TOKEN: "must-not-be-forwarded" } },
    require: (id) =>
      id === "node:child_process"
        ? {
            spawnSync: (...args) => {
              calls.push(args);
              return response;
            }
          }
        : require(id)
  });
  const verify = module.exports.verifyAuthenticode;
  assert.equal(typeof verify, "function");
  const filename = path.resolve("runtime 'quoted' Ж.exe");
  verify(filename);
  const [, args, options] = calls[0];
  const script = args.at(-1);
  assert(script.includes(Buffer.from(filename, "utf8").toString("base64")));
  assert(!script.includes(filename));
  assert(!script.includes("ReadToEnd"));
  assert(script.includes("Get-AuthenticodeSignature"));
  assert(script.includes("Microsoft Corporation"));
  assert(script.includes("$signature.Status -ne 'Valid'"));
  assert.equal(options.input, undefined);
  assert.equal(options.env.GH_TOKEN, undefined);
  assert(script.includes("Microsoft.PowerShell.Security.psd1"));
  response = { status: null, error: { code: "ETIMEDOUT" } };
  assert.throws(() => verify(filename), /RUNTIME_SIGNATURE_TIMEOUT/);
  response = { status: 1 };
  assert.throws(() => verify(filename), /RUNTIME_SIGNATURE_INVALID/);
});

test(
  "Windows cold Authenticode rejects an unsigned file without timing out",
  { skip: process.platform !== "win32" },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-signature-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const file = path.join(directory, "unsigned 'Ж'.exe");
    await fs.writeFile(file, "unsigned synthetic fixture");
    assert.throws(
      () => require("./provision-bubble-runtime.cjs").verifyAuthenticode(file),
      /RUNTIME_SIGNATURE_INVALID/
    );
  }
);

for (const scenario of ["valid", "missing", "truncated", "oversized", "wrong hash", "directory"]) {
  test(`runtime verification: ${scenario}`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bubble-prerequisite-test-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const filename = path.join(directory, "ndp48.exe");
    if (scenario === "directory") await fs.mkdir(filename);
    else if (scenario !== "missing") {
      let content = bytes;
      if (scenario === "truncated") content = bytes.subarray(1);
      if (scenario === "oversized") content = Buffer.concat([bytes, Buffer.from("extra")]);
      if (scenario === "wrong hash") content = Buffer.alloc(bytes.length);
      await fs.writeFile(filename, content);
    }
    if (scenario === "valid") await verifyFile(filename, expected);
    else await assert.rejects(verifyFile(filename, expected));
  });
}

test("only .NET 4.8 and VC++ 2012 Update 4 x64 have fixed official download pins", () => {
  assert.deepEqual(RUNTIMES, [
    {
      filename: "ndp48.exe",
      url: "https://download.microsoft.com/download/f/3/a/f3a6af84-da23-40a5-8d1c-49cc10c8e76f/NDP48-x86-x64-AllOS-ENU.exe",
      size: 121346568,
      sha256: "0a3a390c47e639d0f7fc65b21195fee6b7f65b066f80f70c60fab191d14b7e40"
    },
    {
      filename: "vcredist_x64.exe",
      url: "https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x64.exe",
      size: 7186992,
      sha256: "681be3e5ba9fd3da02c09d7e565adfa078640ed66a0d58583efad2c1e3cc4064"
    }
  ]);
});

test("non-Windows skips without network, PowerShell or PATH", () => {
  const script = `
    globalThis.fetch = () => { throw new Error("unexpected network"); };
    require("node:child_process").spawnSync = () => { throw new Error("unexpected subprocess"); };
    require(${JSON.stringify(path.join(__dirname, "provision-bubble-runtime.cjs"))})
      .provision({ platform: "linux" }).catch(() => { process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    env: { PATH: "" },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipping Windows-only/);
});
