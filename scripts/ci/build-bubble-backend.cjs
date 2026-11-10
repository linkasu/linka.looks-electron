const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REQUIRED = [
  "Linka.TobiiBackend.exe",
  "Tobii.EyeX.Client.dll",
  "Tobii.Interaction.Model.dll",
  "Tobii.Interaction.Net.dll"
];
const OPTIONAL = ["Linka.TobiiBackend.exe.config"];

function inspectPe(bytes, name) {
  assert(
    bytes.length >= 64 && bytes.toString("ascii", 0, 2) === "MZ",
    `${name}: invalid DOS header`
  );
  const pe = bytes.readUInt32LE(60);
  assert(
    pe <= bytes.length - 24 && bytes.readUInt32LE(pe) === 0x4550,
    `${name}: invalid PE header`
  );
  const optional = pe + 24;
  const size = bytes.readUInt16LE(pe + 20);
  assert(optional + size <= bytes.length && size >= 2, `${name}: truncated optional header`);
  const magic = bytes.readUInt16LE(optional);
  assert([0x10b, 0x20b].includes(magic), `${name}: unsupported PE optional header`);
  const directories = optional + (magic === 0x20b ? 112 : 96);
  const clr = directories + 14 * 8;
  assert(clr + 8 <= optional + size, `${name}: missing CLR data directory`);
  return { machine: bytes.readUInt16LE(pe + 4), managed: bytes.readUInt32LE(clr) !== 0 };
}

function validateRuntime(directory) {
  const names = fs.readdirSync(directory);
  for (const name of names) {
    assert(
      REQUIRED.includes(name) || OPTIONAL.includes(name) || /\.(pdb|xml)$/i.test(name),
      `Unexpected Bubble runtime output: ${name}; review and update the explicit runtime list`
    );
    const stat = fs.lstatSync(path.join(directory, name));
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.size > 0,
      `${name}: invalid runtime file`
    );
  }
  for (const name of REQUIRED) {
    assert(names.includes(name), `Missing Bubble runtime file: ${name}`);
    const pe = inspectPe(fs.readFileSync(path.join(directory, name)), name);
    if (name === "Tobii.EyeX.Client.dll") {
      assert(pe.machine === 0x8664 && !pe.managed, `${name}: native x64 DLL required`);
    } else if (name.endsWith(".exe")) {
      assert(pe.machine === 0x8664 && pe.managed, `${name}: managed x64 executable required`);
    } else {
      assert(
        pe.managed && [0x14c, 0x8664].includes(pe.machine),
        `${name}: managed SDK DLL required`
      );
    }
  }
  return [...REQUIRED, ...OPTIONAL.filter((name) => names.includes(name))];
}

function run(args, root) {
  const result = spawnSync("dotnet", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `dotnet ${args[0]} failed (${result.signal || result.status})`);
}

function main(args = process.argv.slice(2)) {
  assert(
    args.length === 0 || (args.length === 1 && args[0] === "--check"),
    "Usage: build-bubble-backend.cjs [--check]"
  );
  const root = path.resolve(__dirname, "../..");
  if (args[0] === "--check") {
    run(["run", "--project", "native/tobii-backend/Checks/Checks.csproj", "-c", "Release"], root);
    return;
  }
  if (process.platform !== "win32") {
    console.log("Bubble backend packaging is Windows-only; skipped on", process.platform);
    return;
  }
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "linka-bubble-backend-"));
  try {
    run(
      [
        "build",
        "native/tobii-backend/TobiiBackend.csproj",
        "-c",
        "Release",
        "-p:Platform=x64",
        "-p:RestoreLockedMode=true",
        "-o",
        output
      ],
      root
    );
    const files = validateRuntime(output);
    const target = path.join(root, "extraResources/bubble-backend");
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(target)) {
      assert([...REQUIRED, ...OPTIONAL].includes(name), `Unexpected staged Bubble file: ${name}`);
      fs.unlinkSync(path.join(target, name));
    }
    for (const name of files) fs.copyFileSync(path.join(output, name), path.join(target, name));
    console.log(`Bubble backend staged (${files.join(", ")}); SDK was not executed`);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { REQUIRED, OPTIONAL, inspectPe, validateRuntime, main };
