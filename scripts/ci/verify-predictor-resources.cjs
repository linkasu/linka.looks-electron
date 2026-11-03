// Static approval check only: never launches the predictor or qualifies hardware/model behavior.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function regular(file) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && stat.size > 0, `expected nonempty regular file: ${file}`);
  return stat;
}

function architecture(file, platform, arch) {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  function read(offset, length) {
    assert(
      Number.isSafeInteger(offset) && offset >= 0 && offset + length <= size,
      `invalid executable header bounds: ${file}`
    );
    const data = Buffer.alloc(length);
    assert.equal(fs.readSync(fd, data, 0, length, offset), length, "truncated executable header");
    return data;
  }
  function thin(offset, length, cpu) {
    assert(length >= 32, "truncated Mach-O header");
    const data = read(offset, 32);
    const magic = data.readUInt32BE(0);
    assert(magic === 0xcffaedfe || magic === 0xfeedfacf, "invalid Mach-O header");
    const u32 = (at) => (magic === 0xcffaedfe ? data.readUInt32LE(at) : data.readUInt32BE(at));
    assert.equal(u32(4), cpu, `wrong predictor architecture: expected ${arch}`);
    assert.equal(u32(12), 2, "Mach-O header is not an executable");
  }
  try {
    if (platform === "win32") {
      const dos = read(0, 64);
      assert.equal(dos.toString("ascii", 0, 2), "MZ", "invalid DOS header");
      const offset = dos.readUInt32LE(60);
      const pe = read(offset, 26);
      assert.equal(pe.readUInt32LE(0), 0x4550, "invalid PE header");
      assert.equal(pe.readUInt16LE(4), 0x8664, "wrong predictor architecture: expected x64");
      assert(pe.readUInt16LE(22) & 2, "PE header is not executable");
      assert.equal(pe.readUInt16LE(24), 0x20b, "invalid PE32+ header");
      assert(pe.readUInt16LE(20) >= 112, "truncated PE optional header");
      read(offset + 24, pe.readUInt16LE(20));
      return;
    }
    const cpu = arch === "x64" ? 0x01000007 : 0x0100000c;
    const header = read(0, 8);
    const magic = header.readUInt32BE(0);
    if (![0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(magic)) {
      thin(0, size, cpu);
      return;
    }
    const little = magic === 0xbebafeca || magic === 0xbfbafeca;
    const wide = magic === 0xcafebabf || magic === 0xbfbafeca;
    const u32 = (data, at) => (little ? data.readUInt32LE(at) : data.readUInt32BE(at));
    const u64 = (data, at) => Number(little ? data.readBigUInt64LE(at) : data.readBigUInt64BE(at));
    const count = u32(header, 4);
    const stride = wide ? 32 : 20;
    const tableEnd = 8 + count * stride;
    assert(count > 0 && tableEnd <= size, "invalid universal Mach-O header table");
    let found = false;
    for (let i = 0; i < count; i++) {
      const entry = read(8 + i * stride, stride);
      const offset = wide ? u64(entry, 8) : u32(entry, 8);
      const length = wide ? u64(entry, 16) : u32(entry, 12);
      assert(
        Number.isSafeInteger(offset) &&
          Number.isSafeInteger(length) &&
          offset >= tableEnd &&
          length >= 32 &&
          offset + length <= size,
        "invalid universal Mach-O header slice"
      );
      if (u32(entry, 0) === cpu) {
        thin(offset, length, cpu);
        found = true;
      }
    }
    assert(found, `wrong predictor architecture: missing ${arch} slice`);
  } finally {
    fs.closeSync(fd);
  }
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function main(args) {
  assert.equal(
    args.length,
    4,
    "usage: verify-predictor-resources.cjs resourcesDir platform arch trustedApprovalJsonPath"
  );
  const [resourcesDir, platform, arch, approvalPath] = args;
  const target = `${platform}-${arch}`;
  const targets = ["win32-x64", "darwin-arm64", "darwin-x64"];
  assert(targets.includes(target), `unsupported predictor target: ${target}`);
  let approval;
  try {
    regular(approvalPath);
    approval = JSON.parse(fs.readFileSync(approvalPath, "utf8"));
    const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
    assert(approval && hex(approval.modelSha256) && hex(approval.binaries?.[target]));
  } catch (error) {
    throw new Error(
      `missing or invalid trusted predictor approval: ${approvalPath}: ${error.message}`,
      { cause: error }
    );
  }
  const resources = fs.realpathSync(resourcesDir);
  const relativeApproval = path.relative(resources, fs.realpathSync(approvalPath));
  assert(
    relativeApproval === ".." ||
      relativeApproval.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeApproval),
    "trusted approval must be outside packaged resources"
  );
  const predictor = path.join(resources, "predictor-resources");
  assert(fs.lstatSync(predictor).isDirectory(), "predictor-resources must be a regular directory");
  const executable = path.join(predictor, platform === "win32" ? "lp-electron.exe" : "lp-electron");
  const model = path.join(predictor, "model.lpk");
  for (const file of [
    executable,
    model,
    path.join(predictor, "LICENSE"),
    path.join(predictor, "MODEL_NOTICE.md")
  ]) {
    const stat = regular(file);
    if (file === model) assert(stat.size <= 128 * 1024 * 1024, "predictor model exceeds 128 MiB");
    if (file === executable && platform === "darwin")
      assert(stat.mode & 0o111, "missing macOS executable bit");
  }
  architecture(executable, platform, arch);
  assert.equal(
    await sha256(executable),
    approval.binaries[target].toLowerCase(),
    `predictor binary hash mismatch: ${target}`
  );
  assert.equal(
    await sha256(model),
    approval.modelSha256.toLowerCase(),
    "predictor model hash mismatch"
  );
  console.log(
    `Static predictor resource approval verified: ${target} (not runtime/hardware qualification)`
  );
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Predictor resource gate BLOCKED: ${error.message}`);
    process.exitCode = 1;
  });
}
module.exports = { architecture };
