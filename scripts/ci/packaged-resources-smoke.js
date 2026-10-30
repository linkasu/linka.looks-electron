const { existsSync, readdirSync, statSync, readFileSync } = require("fs");
const { join, dirname } = require("path");
const { createRequire } = require("node:module");
const assert = require("node:assert/strict");

const projectRoot = join(__dirname, "..", "..");
const distDir = join(projectRoot, "dist");

function assertFile(file) {
  if (!existsSync(file)) {
    throw new Error(`Required packaged resource is missing: ${file}`);
  }
  if (!statSync(file).isFile()) {
    throw new Error(`Required packaged resource is not a file: ${file}`);
  }
}

function assertDirectory(directory) {
  if (!existsSync(directory)) {
    throw new Error(`Required packaged directory is missing: ${directory}`);
  }
  if (!statSync(directory).isDirectory()) {
    throw new Error(`Required packaged resource is not a directory: ${directory}`);
  }
}

function assertPinnedEyeLog(extraResourcesDir) {
  const resolveTobii = createRequire(
    join(projectRoot, "node_modules/@linkasu/tobii-electron/package.json")
  );
  const root = dirname(resolveTobii.resolve("eyelog/package.json"));
  const { REQUIRED } = require(join(root, "download.js"));
  for (const name of REQUIRED) {
    const source = join(root, "bin", name);
    const packaged = join(extraResourcesDir, "bin", name);
    assertFile(source);
    assertFile(packaged);
    const expected = readFileSync(source);
    assert(
      expected.length > 0 && expected.equals(readFileSync(packaged)),
      "Packaged EyeLog SDK differs from pinned provisioning"
    );
  }
}

function getWindowsExtraResourcesDir() {
  return join(distDir, "win-unpacked", "resources", "extraResources");
}

function findMacAppBundle() {
  const appBundles = [];

  function scan(directory, depth) {
    if (!existsSync(directory) || depth > 3) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entryPath = join(directory, entry.name);
      if (entry.name.endsWith(".app")) {
        appBundles.push(entryPath);
        continue;
      }
      scan(entryPath, depth + 1);
    }
  }

  scan(distDir, 0);
  return appBundles.sort()[0];
}

function assertMacIcon(resourcesDir) {
  const icons = readdirSync(resourcesDir).filter((name) => name.endsWith(".icns"));
  if (icons.length === 0) {
    throw new Error(`No macOS .icns icon found in ${resourcesDir}`);
  }
  assertFile(join(resourcesDir, icons[0]));
}

function smokeMacNativeAddon(resourcesDir) {
  const candidates = [
    join(
      resourcesDir,
      "app.asar.unpacked",
      "node_modules",
      "@linkasu",
      "tobii-electron",
      "native",
      "tobiifree-native"
    ),
    join(
      resourcesDir,
      "app.asar.unpacked",
      "node_modules",
      "@linkasu",
      "tobii-electron",
      "node_modules",
      "@linka",
      "tobiifree-native"
    ),
    join(resourcesDir, "app.asar.unpacked", "node_modules", "@linka", "tobiifree-native")
  ];
  const unpackedDir = candidates.find((candidate) => existsSync(candidate));
  if (!unpackedDir) {
    console.warn("Native Tobii addon is not packaged; helper fallback remains available.");
    return;
  }

  assertFile(join(unpackedDir, "package.json"));
  assertFile(join(unpackedDir, "index.js"));
}

function smokeMacPackage() {
  const appBundle = findMacAppBundle();
  if (!appBundle) {
    throw new Error(`No packaged .app bundle found in ${distDir}`);
  }

  const contentsDir = join(appBundle, "Contents");
  const resourcesDir = join(contentsDir, "Resources");
  const extraResourcesDir = join(resourcesDir, "extraResources");

  assertFile(join(contentsDir, "Info.plist"));
  assertMacIcon(resourcesDir);
  assertDirectory(extraResourcesDir);
  assertDirectory(join(extraResourcesDir, "defaultSets"));
  assertFile(join(extraResourcesDir, "bin", "tobiifree-helper", "index.mjs"));
  assertFile(join(extraResourcesDir, "bin", "tobiifree-sdk", "package.json"));
  assertFile(join(extraResourcesDir, "bin", "node_modules", "usb", "package.json"));
  assertDirectory(join(extraResourcesDir, "bin", "node_modules", "usb", "prebuilds"));
  assertFile(join(extraResourcesDir, "bin", "node_modules", "node-gyp-build", "package.json"));
  smokeMacNativeAddon(resourcesDir);
  assertPinnedEyeLog(extraResourcesDir);
}

(async () => {
  if (process.platform === "win32") {
    assertPinnedEyeLog(getWindowsExtraResourcesDir());
  } else if (process.platform === "darwin") {
    smokeMacPackage();
  } else {
    console.log(
      "Packaged resource smoke test is supported on Windows and macOS; skipping on",
      process.platform
    );
    return;
  }
  console.log("Packaged resource smoke test passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
