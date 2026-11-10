const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RUNTIMES = Object.freeze([
  Object.freeze({
    filename: "ndp48.exe",
    url: "https://download.microsoft.com/download/f/3/a/f3a6af84-da23-40a5-8d1c-49cc10c8e76f/NDP48-x86-x64-AllOS-ENU.exe",
    size: 121346568,
    sha256: "0a3a390c47e639d0f7fc65b21195fee6b7f65b066f80f70c60fab191d14b7e40"
  }),
  Object.freeze({
    filename: "vcredist_x64.exe",
    url: "https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x64.exe",
    size: 7186992,
    sha256: "681be3e5ba9fd3da02c09d7e565adfa078640ed66a0d58583efad2c1e3cc4064"
  })
]);

async function verifyFile(filename, expected) {
  assert.match(expected.sha256, /^[a-f0-9]{64}$/, "runtime SHA-256 pin is required");
  const stat = await fs.lstat(filename);
  assert(stat.isFile() && !stat.isSymbolicLink(), "runtime must be a regular file");
  assert.equal(stat.size, expected.size, "runtime size mismatch");
  const handle = await fs.open(filename, "r");
  try {
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      assert(size <= expected.size, "runtime exceeds expected size");
      hash.update(chunk);
    }
    assert.equal(size, expected.size, "runtime size mismatch");
    assert.equal(hash.digest("hex"), expected.sha256, "runtime SHA-256 mismatch");
  } finally {
    await handle.close();
  }
}

function verifyAuthenticode(filename) {
  const systemRoot = process.env.SystemRoot;
  assert(systemRoot && path.isAbsolute(systemRoot), "Windows SystemRoot is required");
  const env = { SystemRoot: systemRoot, WINDIR: systemRoot };
  for (const [key, value] of Object.entries(process.env)) {
    if (
      /^(PATH|SYSTEMDRIVE|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA)$/i.test(
        key
      )
    )
      env[key] = value;
  }
  const result = spawnSync(
    path.join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; " +
        "$file = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
        Buffer.from(filename, "utf8").toString("base64") +
        "')); " +
        "Import-Module ([IO.Path]::Combine($PSHOME,'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1')) -ErrorAction Stop; " +
        "$signature = Get-AuthenticodeSignature -LiteralPath $file; " +
        "if ($signature.Status -ne 'Valid' -or " +
        "$signature.SignerCertificate.Subject -notmatch '(^|,\\s*)CN=Microsoft Corporation(,|$)') " +
        "{ exit 1 }; exit 0"
    ],
    {
      encoding: "utf8",
      env,
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 65536
    }
  );
  if (result.error?.code === "ETIMEDOUT") throw new Error("RUNTIME_SIGNATURE_TIMEOUT");
  assert(!result.error && result.status === 0, "RUNTIME_SIGNATURE_INVALID");
}

async function provisionRuntime(runtime, directory) {
  const target = path.join(directory, runtime.filename);
  try {
    await verifyFile(target, runtime);
    verifyAuthenticode(target);
    console.log(`Reusing verified ${runtime.filename}`);
    return target;
  } catch {
    // Invalid existing artifacts stay untouched until a verified replacement is ready.
  }
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${runtime.filename}-${randomUUID()}.exe`);
  const handle = await fs.open(temporary, "wx");
  const controller = new AbortController();
  try {
    try {
      const response = await fetch(runtime.url, {
        redirect: "error",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)])
      });
      assert.equal(response.status, 200, "runtime download failed");
      const length = response.headers.get("content-length");
      assert(length === null || Number(length) === runtime.size, "runtime size mismatch");
      assert(response.body, "runtime response body is missing");
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        assert(size <= runtime.size, "runtime download exceeds expected size");
        await handle.writeFile(chunk);
      }
      assert.equal(size, runtime.size, "runtime download is truncated");
    } finally {
      controller.abort();
      await handle.close();
    }
    await verifyFile(temporary, runtime);
    verifyAuthenticode(temporary);
    await fs.rename(temporary, target);
    console.log(`Provisioned verified ${runtime.filename}; not executed`);
    return target;
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function provision({ platform = process.platform } = {}) {
  if (platform !== "win32") {
    console.log("Skipping Windows-only Bubble runtime provisioning");
    return;
  }
  const directory = path.resolve(__dirname, "../../build/prerequisites");
  for (const runtime of RUNTIMES) {
    console.log(`Verifying ${runtime.filename}: pinned SHA-256 and Microsoft Authenticode`);
    await provisionRuntime(runtime, directory);
  }
}

module.exports = { RUNTIMES, verifyFile, verifyAuthenticode, provision };

if (require.main === module) {
  provision().catch((error) => {
    const code = ["RUNTIME_SIGNATURE_TIMEOUT", "RUNTIME_SIGNATURE_INVALID"].includes(error.message)
      ? error.message
      : "RUNTIME_PROVISION_FAILED";
    console.error(`Pinned Bubble runtime provisioning failed (${code}); build must stop`);
    process.exitCode = 1;
  });
}
