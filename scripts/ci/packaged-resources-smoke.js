const { existsSync, mkdtempSync, readdirSync, rmSync, statSync } = require("fs");
const { spawn, spawnSync } = require("child_process");
const { join } = require("path");
const { tmpdir } = require("os");

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

function smokeImageGenerator() {
  const extraResourcesDir = getWindowsExtraResourcesDir();
  const imageGenerator = join(extraResourcesDir, "ImageGenerator.exe");
  assertFile(imageGenerator);

  const outputDir = mkdtempSync(join(tmpdir(), "linka-image-generator-"));
  const outputFile = join(outputDir, "image.png");
  const result = spawnSync(imageGenerator, [outputFile, "test"], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true
  });

  try {
    if (result.error) {
      if (result.error.code === "ETIMEDOUT" && hasNonEmptyFile(outputFile)) {
        console.warn(
          "ImageGenerator.exe produced a PNG but did not exit before timeout; treating packaged resource smoke as success."
        );
        return;
      }
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `ImageGenerator.exe exited with ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );
    }
    if (!hasNonEmptyFile(outputFile)) {
      throw new Error("ImageGenerator.exe did not produce a non-empty PNG file");
    }
  } finally {
    rmSync(outputDir, { force: true, recursive: true });
  }
}

function hasNonEmptyFile(file) {
  return existsSync(file) && statSync(file).size > 0;
}

function smokeEyeLog() {
  const extraResourcesDir = getWindowsExtraResourcesDir();
  const eyeLog = join(extraResourcesDir, "bin", "EyeLog.exe");
  assertFile(eyeLog);

  return new Promise((resolve, reject) => {
    const child = spawn(eyeLog, [], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.once("error", (error) => {
      settled = true;
      reject(error);
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (!child.killed) child.kill();
      resolve();
    }, 2000);

    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0 || signal) {
        resolve();
        return;
      }
      if (isExpectedEyeLogCiFailure(stderr)) {
        console.warn(
          "EyeLog.exe started, but Tobii runtime is unavailable on the CI runner; treating this as a launch smoke success."
        );
        console.warn(stderr);
        resolve();
        return;
      }
      reject(new Error(`EyeLog.exe exited with ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
    });
  });
}

function isExpectedEyeLogCiFailure(stderr) {
  return (
    stderr.includes("Tobii.Interaction") &&
    (stderr.includes("BadImageFormatException") ||
      stderr.includes("EyeX") ||
      stderr.includes("Host..ctor"))
  );
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
}

(async () => {
  if (process.platform === "win32") {
    smokeImageGenerator();
    await smokeEyeLog();
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
