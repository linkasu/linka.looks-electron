// External tooling config: the immutable app checkout supplies every packaging option.
const fs = require("node:fs/promises");
const path = require("node:path");
const nodeCrypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");

async function snapshot(context, stage) {
  const arch = { 1: "x64", 3: "arm64" }[context.arch];
  assert(arch && context.electronPlatformName === "darwin", "unsupported snapshot target");
  const project = context.packager.projectDir;
  const directory = arch === "x64" ? "mac" : "mac-arm64";
  assert.equal(path.resolve(context.appOutDir), path.join(project, "dist", directory));
  const root = path.resolve(process.env.MACOS_EVIDENCE_ROOT);
  assert(
    root !== project && !root.startsWith(project + path.sep),
    "evidence must stay outside app"
  );
  const name = context.packager.appInfo.productFilename + ".app";
  const source = path.join(context.appOutDir, name);
  const output = path.join(root, "apps", stage, arch, name);
  if (stage === "signed-rebuild") {
    // Legacy schema stage name; this snapshot is from the SAME build, never a rebuild.
    await fs.access(path.join(root, "payload", "unsigned-before", arch, "manifest.json"));
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output); // Exclusive claim: ditto must never merge into another snapshot.
  if (process.platform === "darwin") {
    execFileSync("ditto", [source, output], { stdio: "pipe" });
  } else {
    // Synthetic Linux fixtures only; real macOS copies must retain stapling xattrs.
    await fs.cp(source, output, { recursive: true, verbatimSymlinks: true });
  }
  const asar = path.join(output, "Contents", "Resources", "app.asar");
  execFileSync(
    "python3",
    [
      path.join(__dirname, "asar-evidence.py"),
      "capture-one",
      asar,
      path.join(root, "payload", stage, arch)
    ],
    { stdio: "pipe" }
  );
  if (stage === "unsigned-before") {
    const hash = nodeCrypto
      .createHash("sha256")
      .update(await fs.readFile(asar))
      .digest("hex");
    await fs.writeFile(
      path.join(root, `app-asar-${arch}.sha256`),
      `${hash}  app/dist/${directory}/${name}/Contents/Resources/app.asar\n`,
      { flag: "wx" }
    );
  }
}

module.exports = {
  ...require(path.join(process.cwd(), "package.json")).build,
  afterPack: (context) => snapshot(context, "unsigned-before"),
  afterSign: (context) => snapshot(context, "signed-rebuild")
};
