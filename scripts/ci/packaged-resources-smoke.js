const { existsSync, mkdtempSync, rmSync, statSync } = require("fs");
const { spawn, spawnSync } = require("child_process");
const { join } = require("path");
const { tmpdir } = require("os");

if (process.platform !== "win32") {
  console.log("Packaged resource smoke test is Windows-only; skipping on", process.platform);
  process.exit(0);
}

const projectRoot = join(__dirname, "..", "..");
const extraResourcesDir = join(projectRoot, "dist", "win-unpacked", "resources", "extraResources");
const imageGenerator = join(extraResourcesDir, "ImageGenerator.exe");
const eyeLog = join(extraResourcesDir, "bin", "EyeLog.exe");

function assertFile (file) {
  if (!existsSync(file)) {
    throw new Error(`Required packaged resource is missing: ${file}`);
  }
}

function smokeImageGenerator () {
  assertFile(imageGenerator);

  const outputDir = mkdtempSync(join(tmpdir(), "linka-image-generator-"));
  const outputFile = join(outputDir, "image.png");
  const result = spawnSync(imageGenerator, [outputFile, "test"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true
  });

  try {
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`ImageGenerator.exe exited with ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    }
    if (!existsSync(outputFile) || statSync(outputFile).size === 0) {
      throw new Error("ImageGenerator.exe did not produce a non-empty PNG file");
    }
  } finally {
    rmSync(outputDir, { force: true, recursive: true });
  }
}

function smokeEyeLog () {
  assertFile(eyeLog);

  return new Promise((resolve, reject) => {
    const child = spawn(eyeLog, [], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
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
        console.warn("EyeLog.exe started, but Tobii runtime is unavailable on the CI runner; treating this as a launch smoke success.");
        console.warn(stderr);
        resolve();
        return;
      }
      reject(new Error(`EyeLog.exe exited with ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
    });
  });
}

function isExpectedEyeLogCiFailure (stderr) {
  return stderr.includes("Tobii.Interaction") &&
    (
      stderr.includes("BadImageFormatException") ||
      stderr.includes("EyeX") ||
      stderr.includes("Host..ctor")
    );
}

(async () => {
  smokeImageGenerator();
  await smokeEyeLog();
  console.log("Packaged resource smoke test passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
