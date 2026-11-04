// CI-only real 3.3.1 updater exercise. No production flags or installed-code modifications.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { _electron: electron, expect } = require("@playwright/test");
const AdmZip = require("adm-zip");
const {
  candidateConfiguration,
  digest,
  metadata,
  verifyCandidate,
  waitForProcessExit
} = require("./real-upgrade-contract.cjs");

assert.equal(process.platform, "win32", "Never run the installer qualification locally");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
assert.equal(process.env.ImageOS, "win22");
const exe = process.env.UPGRADE_EXECUTABLE;
const work = process.env.UPGRADE_WORK;
const evidence = process.env.UPGRADE_EVIDENCE;
assert(process.env.UPGRADE_DESCRIPTOR, "Verified candidate descriptor is mandatory");
const configuration = candidateConfiguration(
  JSON.parse(fs.readFileSync(process.env.UPGRADE_DESCRIPTOR, "utf8"))
);
const OLD = configuration.old;
const INSTALLER = `linka.looks-${configuration.expected.version}-win-x64.exe`;
const accepted = verifyCandidate(process.env.UPGRADE_CANDIDATE, configuration.expected);
const bytes = fs.readFileSync(accepted.installer);
const result = {
  status: "RUNNING",
  old: OLD,
  candidate: accepted.provenance,
  resources: configuration.resources,
  harnessSha: process.env.GITHUB_SHA,
  feed: accepted.metadata,
  scope: "unsigned Windows x64, Microsoft-hosted disposable CI, software/no-device only",
  hardware: "NOT TESTED",
  clientOS: "WAIVED; windows-2022 runner is not client Windows qualification",
  stages: [],
  requests: []
};
const saveResult = () =>
  fs.writeFileSync(path.join(evidence, "upgrade-result.json"), JSON.stringify(result, null, 2));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
let application;
let profile;
let home;
let setFile;
let baseline;
let mode = "idle";
let oldPid;
const settings = {
  pcHash: "test",
  telemetryConsent: "disabled",
  first_calibrate: true,
  defaultSetsDownloaded: 1,
  colors_primary: "#123456",
  button_timeout: 1730,
  button_clickSound: false,
  layoutSettings_fontSize: 29,
  futureUnknownV9: { unicode: "Не удалять 😀", nested: [1, { untouched: true }] }
};
const preference = { schemaVersion: 3, preference: "disabled" };
const setName = "Вложенная папка/Мой набор 😀.linka";
const assets = {
  "изображения/Кот 😀.png": Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64"
  ),
  "звук/Тишина №1.wav": Buffer.from(
    "524946462600000057415645666d74201000000001000100401f0000401f00000100080064617461020000008080",
    "hex"
  )
};

async function until(label, predicate, milliseconds = 90000) {
  result.currentStage = label;
  saveResult();
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Deadline exceeded: ${label}`);
}

function ownedProcesses(close = false) {
  // Exact executable path only: never close a pre-existing or unrelated application window.
  const script = `
    $ErrorActionPreference = 'Stop'
    $ownedPaths = @($env:UPGRADE_EXECUTABLE, (Join-Path $env:UPGRADE_WORK 'historical-reader/LINKa. смотри.exe'))
    $items = @(Get-CimInstance Win32_Process | Where-Object { $ownedPaths -contains $_.ExecutablePath })
    $output = @($items | ForEach-Object {
      $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($p) {
        $hasWindow = $p.MainWindowHandle -ne 0
        if ($hasWindow -and $env:UPGRADE_CLOSE_WINDOW -eq '1') { [void]$p.CloseMainWindow() }
        [PSCustomObject]@{ pid = $p.Id; window = $hasWindow; title = $p.MainWindowTitle; responding = $p.Responding; version = $p.MainModule.FileVersionInfo.ProductVersion }
      }
    })
    ConvertTo-Json -InputObject $output -Compress
  `;
  return JSON.parse(
    execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, UPGRADE_CLOSE_WINDOW: close ? "1" : "0" }
    }).trim()
  );
}

function snapshot(label) {
  const config = readJson(path.join(profile, "config.json"));
  const consent = readJson(path.join(profile, "telemetry-preference-v3.json"));
  const zip = new AdmZip(setFile);
  const entries = {};
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory) entries[entry.entryName] = digest(entry.getData());
  }
  const record = { label, config, consent, archive: digest(fs.readFileSync(setFile)), entries };
  result.stages.push(record);
  saveResult();
  for (const [key, value] of Object.entries(settings)) assert.deepEqual(config[key], value, key);
  assert.deepEqual(consent, preference);
  for (const [name, value] of Object.entries(assets)) assert.equal(entries[name], digest(value));
  return record;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  result.requests.push({ mode, path: url.pathname, range: request.headers.range || null });
  if (url.pathname === "/latest.yml") {
    // JSON is a YAML subset, avoiding quoting ambiguity in filenames and digests.
    const feed = mode === "idle" ? metadata(bytes, OLD.version, INSTALLER) : accepted.metadata;
    response.writeHead(200, { "Content-Type": "application/yaml", "Cache-Control": "no-store" });
    response.end(JSON.stringify(feed));
  } else if (url.pathname === `/${INSTALLER}` && mode !== "idle") {
    response.writeHead(200, {
      "Content-Length": bytes.length,
      "Content-Type": "application/octet-stream",
      Connection: "close"
    });
    if (mode === "interruption") response.end(bytes.subarray(0, 65536));
    else if (mode === "corruption") {
      response.write(Buffer.from([bytes[0] ^ 1]));
      response.end(bytes.subarray(1));
    } else response.end(bytes);
  } else {
    // Blockmap absence deliberately forces a real full installer download.
    response.writeHead(404);
    response.end();
  }
});

async function launch(executable = exe) {
  // Do not pass workflow tokens, service credentials or arbitrary NODE_OPTIONS into the app/NSIS.
  const env = {};
  const allowed =
    /^(PATH|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMW6432|COMMONPROGRAMFILES(?:\(X86\))?|COMMONPROGRAMW6432|PROGRAMDATA|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|USERNAME|USERDOMAIN|PUBLIC|ALLUSERSPROFILE)$/i;
  for (const [key, value] of Object.entries(process.env)) if (allowed.test(key)) env[key] = value;
  Object.assign(env, {
    IS_TEST: "1",
    NODE_ENV: "production",
    VITE_DEV_SERVER_URL: "",
    UPDATE_FEED_URL: `http://127.0.0.1:${server.address().port}/`,
    UPDATE_LOG_PATH: path.join(evidence, "upgrade-updater.log")
  });
  application = await electron.launch({
    executablePath: executable,
    args: ["-r", path.resolve("tests/e2e/typing-tracker-fixture.cjs")],
    env,
    timeout: 45000
  });
  const child = application.process();
  for (const name of ["stdout", "stderr"]) {
    let remaining = 65536;
    child[name].on("data", (chunk) => {
      const retained = chunk.subarray(0, remaining);
      if (retained.length)
        fs.appendFileSync(
          path.join(evidence, `upgrade-process-${child.pid}-${name}.log`),
          retained
        );
      remaining -= retained.length;
    });
  }
  const page = await application.firstWindow({ timeout: 45000 });
  page.setDefaultTimeout(30000);
  return page;
}

const version = (page) =>
  page.evaluate(() => globalThis.require("electron").ipcRenderer.invoke("app_version"));
const updateState = (page) =>
  page.evaluate(() => globalThis.require("electron").ipcRenderer.invoke("updater:getState"));
async function closeApp() {
  if (!application) return;
  let timer;
  try {
    await Promise.race([
      application.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Application close exceeded deadline")), 30000);
      })
    ]);
    application = undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  saveResult();
  let page = await launch();
  assert.deepEqual(await version(page), {
    version: OLD.version,
    platform: "win32",
    isPackaged: true
  });
  result.installedExecutable = { old: digest(fs.readFileSync(exe)) };
  const paths = await application.evaluate(({ app }) => ({
    profile: app.getPath("userData"),
    home: app.getPath("home"),
    name: app.getName()
  }));
  profile = paths.profile;
  home = path.join(paths.home, "Documents", "LINKa");
  assert.equal(path.dirname(profile).toLowerCase(), process.env.APPDATA.toLowerCase());
  assert.match(path.basename(profile), /linka/i);
  assert.equal(paths.home.toLowerCase(), process.env.USERPROFILE.toLowerCase());
  result.paths = { ...paths, sets: home };
  await closeApp();
  fs.writeFileSync(path.join(profile, "config.json"), JSON.stringify(settings));
  fs.writeFileSync(path.join(profile, "telemetry-preference-v3.json"), JSON.stringify(preference));
  const zip = new AdmZip();
  zip.addFile(
    "config.json",
    Buffer.from(
      JSON.stringify({
        version: "3.0",
        withoutSpace: false,
        pages: [
          {
            id: "upgrade-page",
            mode: "standard",
            rows: 1,
            columns: 1,
            cards: [
              {
                id: "upgrade-card",
                cardType: 0,
                title: "Кот 😀",
                imagePath: Object.keys(assets)[0],
                audioPath: Object.keys(assets)[1]
              }
            ]
          }
        ]
      })
    )
  );
  for (const [name, value] of Object.entries(assets)) zip.addFile(name, value);
  setFile = path.join(home, setName);
  fs.mkdirSync(path.dirname(setFile), { recursive: true });
  zip.writeZip(setFile);
  baseline = snapshot("synthetic-old-profile");
  // Authentic historical binary copy only for an old-reader rollback probe, not an installer rollback claim.
  const rollback = path.join(work, "historical-reader");
  fs.cpSync(path.dirname(exe), rollback, { recursive: true, errorOnExist: true, force: false });

  for (const failure of ["corruption", "interruption"]) {
    mode = failure;
    page = await launch();
    await until(
      `${failure}: updater rejects download`,
      async () => (await updateState(page)).error
    );
    assert.equal((await updateState(page)).downloaded, false);
    assert.equal((await version(page)).version, OLD.version);
    result.stages.push({ label: `${failure}-rejected`, updater: await updateState(page) });
    assert(
      !fs.readFileSync(path.join(evidence, "upgrade-updater.log"), "utf8").includes("restart_app")
    );
    await page.screenshot({ path: path.join(evidence, `upgrade-${failure}.png`) });
    await closeApp();
    assert.equal(digest(fs.readFileSync(exe)), result.installedExecutable.old);
    assert.equal(snapshot(`after-${failure}`).archive, baseline.archive);
    assert(
      result.requests.some(
        (request) => request.mode === failure && request.path === `/${INSTALLER}`
      )
    );
  }

  mode = "valid";
  page = await launch();
  oldPid = application.process().pid;
  await until(
    "old app downloads accepted installer",
    async () => (await updateState(page)).downloaded,
    180000
  );
  assert.equal((await version(page)).version, OLD.version);
  assert(
    result.requests.some((request) => request.mode === "valid" && request.path === `/${INSTALLER}`),
    "historical updater must actually request the accepted installer"
  );
  assert.equal(snapshot("downloaded-before-confirmation").archive, baseline.archive);
  assert(
    !fs.readFileSync(path.join(evidence, "upgrade-updater.log"), "utf8").includes("restart_app")
  );
  await expect(page.getByText("установить сейчас?", { exact: false })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "upgrade-explicit-confirmation.png") });
  const oldProcess = application.process();
  await page.getByRole("button", { name: "Да", exact: true }).click();
  // Playwright close also waits for inherited stdio held by NSIS/restarted children.
  result.oldProcessExit = await waitForProcessExit(oldProcess, 180000);
  assert.equal(result.oldProcessExit.exitCode, 0, "historical app must exit normally");
  assert.equal(result.oldProcessExit.signalCode, null);
  saveResult();
  application = undefined;
  const restarted = await until(
    "NSIS installed and force-ran responsive candidate window",
    () =>
      ownedProcesses().find(
        (item) =>
          item.pid !== oldPid &&
          item.window &&
          item.title === "LINKa. смотри" &&
          item.responding &&
          (item.version === configuration.expected.version ||
            item.version.startsWith(`${configuration.expected.version}.`))
      ),
    240000
  );
  assert(
    fs.readFileSync(path.join(evidence, "upgrade-updater.log"), "utf8").includes("restart_app")
  );
  result.restart = { oldPid, ...restarted, automaticNSISRestart: true, inspectionReopen: true };
  result.installedExecutable.new = digest(fs.readFileSync(exe));
  assert.notEqual(result.installedExecutable.new, result.installedExecutable.old);
  snapshot("after-automatic-restart");
  ownedProcesses(true);
  await until("owned restarted window closes", () => ownedProcesses().length === 0);
  mode = "idle";

  page = await launch();
  assert.deepEqual(await version(page), {
    version: configuration.expected.version,
    platform: "win32",
    isPackaged: true
  });
  assert.equal(await application.evaluate(({ app }) => app.getPath("userData")), profile);
  await expect(page.locator(".root")).toBeVisible();
  await expect(page.getByText("Техническая статистика", { exact: true })).toHaveCount(0);
  const routeName = `§${setName.replaceAll("/", "§")}`;
  await page.evaluate((name) => {
    location.hash = `/set/${name}`;
  }, routeName);
  await expect(page.getByRole("button", { name: "Кот 😀", exact: true })).toBeVisible();
  assert.equal(snapshot("new-reader-no-save").archive, baseline.archive);
  await page.evaluate((name) => {
    location.hash = `/edit/${name}`;
  }, routeName);
  await page.getByRole("button", { name: "Открыть настройки набора" }).click();
  await page.getByLabel("Количество строк").fill("2");
  await page.keyboard.press("Escape");
  assert.equal(snapshot("new-editor-unsaved").archive, baseline.archive);
  await page.locator(".v-app-bar button").last().click();
  await page.getByRole("button", { name: /^Сохранить$/ }).click();
  await until(
    "explicit save persists rows",
    () => JSON.parse(new AdmZip(setFile).readAsText("config.json")).pages[0].rows === 2
  );
  const saved = snapshot("new-editor-explicit-save");
  assert.notEqual(saved.archive, baseline.archive);

  await page.evaluate(() => {
    location.hash = "/eye-typing";
  });
  await expect(page.getByRole("textbox", { name: "Черновик" })).toBeVisible();
  for (const name of ["х", "о"]) await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator('[aria-label="Подсказки слов"] button').first()).toBeEnabled({
    timeout: 45000
  });
  await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveText("хо");
  await page.screenshot({ path: path.join(evidence, "upgrade-new-model-and-draft.png") });
  await closeApp();
  const newConfig = snapshot("new-draft-persisted").config;
  assert.deepEqual(newConfig.eyeTypingDraftV1, { text: "хо", caret: 2 });
  result.model = {};
  for (const name of ["lp-electron.exe", "model.lpk"]) {
    const file = path.join(path.dirname(exe), "resources", "predictor-resources", name);
    result.model[name] = { size: fs.statSync(file).size, sha256: digest(fs.readFileSync(file)) };
  }
  assert.equal(
    result.model["model.lpk"].sha256,
    configuration.resources.modelSha256,
    "Installed model must match this candidate's approved model pin"
  );
  assert.equal(
    result.model["lp-electron.exe"].sha256,
    configuration.resources.runtimeSha256,
    "Installed runtime must match this candidate's approved runtime pin"
  );
  page = await launch();
  await expect(page.locator(".root")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/eye-typing";
  });
  await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveText("хо");
  await closeApp();
  page = await launch(path.join(rollback, path.basename(exe)));
  assert.equal((await version(page)).version, OLD.version);
  assert.equal(await application.evaluate(({ app }) => app.getPath("userData")), profile);
  await expect(page.locator(".root")).toBeVisible();
  await page.evaluate((name) => {
    location.hash = `/set/${name}`;
  }, routeName);
  await expect(page.getByRole("button", { name: "Кот 😀", exact: true })).toBeVisible();
  await closeApp();
  const rolledBack = snapshot("historical-reader-rollback-probe");
  assert.equal(rolledBack.archive, saved.archive);
  assert.deepEqual(rolledBack.config.eyeTypingDraftV1, newConfig.eyeTypingDraftV1);
  result.rollback = `Authentic installed ${OLD.version} binary copy reads new profile/set without modifying unknown draft; installer downgrade NOT TESTED`;
  result.status = "PASS";
}

run()
  .catch(async (error) => {
    result.status = "FAIL";
    result.error = String(error.stack || error).slice(0, 8192);
    try {
      const page = application?.windows()[0];
      if (page)
        await page.screenshot({
          path: path.join(evidence, "upgrade-first-failure.png"),
          timeout: 10000
        });
    } catch (screenshotError) {
      result.screenshotError = String(screenshotError).slice(0, 1000);
    }
    try {
      result.ownedProcessesAtFailure = ownedProcesses();
    } catch (inspectionError) {
      result.processInspectionError = String(inspectionError);
    }
    if (setFile && fs.existsSync(setFile)) {
      try {
        snapshot("failure-current-data");
      } catch (snapshotError) {
        result.failureSnapshotError = String(snapshotError);
      }
    }
    process.exitCode = 1;
    console.error(error);
  })
  .finally(async () => {
    try {
      await closeApp();
    } catch (error) {
      result.cleanupError = String(error);
      result.status = "FAIL";
      process.exitCode = 1;
    }
    try {
      ownedProcesses(true);
      await until(
        "owned application processes exit during cleanup",
        () => ownedProcesses().length === 0,
        30000
      );
    } catch (error) {
      result.windowCleanupError = String(error);
      result.status = "FAIL";
      process.exitCode = 1;
    }
    saveResult();
    server.closeAllConnections();
    server.close();
  });
