const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const {
  OLD,
  INSTALLER,
  digest,
  metadata,
  verifyCandidate
} = require("./real-upgrade-contract.cjs");

test("native firewall prefixes cover all IPv4 except loopback and all IPv6 before installation", () => {
  const script = fs.readFileSync(path.join(__dirname, "real-upgrade.ps1"), "utf8");
  const block = script.match(/-RemoteAddress @\(([\s\S]*?)\)/)[1];
  const addresses = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(
    addresses.filter((address) => address.includes(":")),
    ["::/1", "8000::/1"]
  );
  const ranges = addresses
    .filter((address) => !address.includes(":"))
    .map((address) => {
      const [ip, prefix] = address.split("/");
      const start = ip.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
      return [start, start + 2 ** (32 - Number(prefix))];
    });
  let boundary = 0;
  for (const [start, end] of ranges) {
    if (boundary === 127 * 2 ** 24) boundary = 128 * 2 ** 24;
    assert.equal(start, boundary);
    boundary = end;
  }
  assert.equal(boundary, 2 ** 32);
  assert(
    script.indexOf("New-NetFirewallRule") < script.indexOf("[System.Diagnostics.Process]::Start")
  );
});

test(
  "Windows firewall accepts the exact upgrade isolation prefixes",
  {
    skip:
      process.platform !== "win32" ||
      process.env.GITHUB_ACTIONS !== "true" ||
      process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
      process.env.ImageOS !== "win22" ||
      process.env.GITHUB_REPOSITORY !== "linkasu/linka.looks-electron"
  },
  () => {
    const script = fs.readFileSync(path.join(__dirname, "real-upgrade.ps1"), "utf8");
    const block = script.match(/-RemoteAddress @\(([\s\S]*?)\)/)[1];
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$ErrorActionPreference = 'Stop'; try {
          New-NetFirewallRule -DisplayName $env:LINKA_FIREWALL_PROBE_NAME -Direction Outbound -Program $env:LINKA_FIREWALL_PROBE_EXE -Action Block -RemoteAddress @(${block}) | Out-Null
        } finally {
          Get-NetFirewallRule -DisplayName $env:LINKA_FIREWALL_PROBE_NAME -ErrorAction SilentlyContinue | Remove-NetFirewallRule
        }`
      ],
      {
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          LINKA_FIREWALL_PROBE_NAME: `LINKa-upgrade-probe-${randomUUID()}`,
          LINKA_FIREWALL_PROBE_EXE: process.execPath
        }
      }
    );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
);

test("feed metadata binds filename, size and sha512 to actual installer bytes", () => {
  const bytes = Buffer.from("synthetic installer — not executable");
  const feed = metadata(bytes);
  assert.equal(feed.version, "4.0.0");
  assert.equal(feed.path, INSTALLER);
  assert.equal(feed.size, bytes.length);
  assert.deepEqual(feed.files, [
    { url: INSTALLER, size: bytes.length, sha512: digest(bytes, "sha512", "base64") }
  ]);
  assert.equal(feed.sha512, feed.files[0].sha512);
  const corrupted = Buffer.from(bytes);
  corrupted[0] ^= 1;
  assert.notEqual(metadata(corrupted).sha512, feed.sha512);
  assert.notEqual(metadata(bytes.subarray(0, 5)).size, feed.size);
  assert.equal(OLD.version, "3.3.1");
  assert.equal(OLD.size, 148213565);
});

test("execution guard rejects untrusted provenance, ambiguous records and corrupted bytes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "upgrade-contract-"));
  try {
    const bytes = Buffer.from("synthetic installer");
    const expected = {
      app: "a".repeat(40),
      tooling: "b".repeat(40),
      run: "123",
      sha256: digest(bytes)
    };
    const provenance = {
      schema: 1,
      version: "4.0.0",
      platform: "windows",
      signing: "unsigned",
      app: expected.app,
      tooling: expected.tooling,
      run: expected.run,
      files: [{ name: INSTALLER, size: bytes.length, sha256: expected.sha256 }]
    };
    const write = (value) =>
      fs.writeFileSync(path.join(directory, "provenance-windows.json"), JSON.stringify(value));
    fs.writeFileSync(path.join(directory, INSTALLER), bytes);
    write(provenance);
    assert.equal(verifyCandidate(directory, expected).installer, path.join(directory, INSTALLER));
    for (const key of ["app", "tooling", "run", "version", "platform", "signing", "schema"]) {
      write({ ...provenance, [key]: "wrong" });
      assert.throws(() => verifyCandidate(directory, expected), /provenance/);
    }
    write({ ...provenance, files: [...provenance.files, ...provenance.files] });
    assert.throws(() => verifyCandidate(directory, expected), /exactly one/);
    write(provenance);
    assert.throws(() => verifyCandidate(directory, { ...expected, sha256: "0".repeat(64) }));
    fs.writeFileSync(path.join(directory, INSTALLER), Buffer.alloc(bytes.length));
    assert.throws(() => verifyCandidate(directory, expected), /bytes mismatch/);
    fs.writeFileSync(path.join(directory, INSTALLER), bytes.subarray(0, 2));
    assert.throws(() => verifyCandidate(directory, expected), /size mismatch/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
