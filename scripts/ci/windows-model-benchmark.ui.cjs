const assert = require("node:assert/strict");
const { _electron: electron } = require("@playwright/test");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { summarize, hash } = require("./windows-model-benchmark.cjs");

async function benchmark() {
  assert.equal(process.platform, "win32");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const source = JSON.parse(readFileSync("qualification/source.json"));
  assert.equal(hash(readFileSync("predictor-resources/lp-electron.exe")), source.exe_sha256);
  assert.equal(hash(readFileSync("predictor-resources/model.lpk")), source.model_sha256);
  const root = mkdtempSync(join(tmpdir(), "windows-model-benchmark-"));
  const userData = join(root, "profile"),
    home = join(root, "home");
  mkdirSync(userData);
  mkdirSync(home);
  writeFileSync(
    join(userData, "config.json"),
    JSON.stringify({
      pcHash: "test",
      telemetryConsent: "disabled",
      first_calibrate: true,
      defaultSetsDownloaded: 1,
      button_clickSound: false,
      eyeTypingDraftV1: { text: "я хо", caret: 4 }
    })
  );
  writeFileSync(
    join(userData, "telemetry-preference-v3.json"),
    JSON.stringify({ schemaVersion: 3, preference: "disabled" })
  );
  // Do not give downloaded app code an Actions credential or runner command-file capability.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !/TOKEN|SECRET|PASSWORD|ACTIONS_|GITHUB_|^GH_|^MODEL_|^RUNTIME_/i.test(k)
    )
  );
  let app;
  try {
    app = await electron.launch({
      timeout: 30000,
      args: [
        "-r",
        resolve("scripts/ci/windows-model-benchmark.fixture.cjs"),
        resolve("dist-electron/main.js")
      ],
      env: {
        ...env,
        IS_TEST: "1",
        NODE_ENV: "production",
        VITE_DEV_SERVER_URL: "",
        TEST_USER_DATA_DIR: userData,
        LINKA_HOME_DIR: home,
        UPDATE_FEED_URL: "http://127.0.0.1:1/"
      }
    });
    assert.equal(
      await app.evaluate(({ app }) => app.isPackaged),
      false,
      "this is built-file Electron, NOT packaged qualification"
    );
    const page = await app.firstWindow();
    await page.locator(".root").waitFor({ timeout: 30000 });
    // Public ipcRenderer API only; no source replacements, private Vue instances or predictor stubs.
    await page.evaluate(() => {
      const ipc = window.require("electron").ipcRenderer;
      const original = ipc.invoke.bind(ipc);
      const state = { samples: [], failed: 0, pending: 0, probe: false, probeCompleted: 0 };
      window.__windowsModel = state;
      ipc.invoke = function (channel, ...args) {
        if (channel !== "typing:predict") return original(channel, ...args);
        const id = args[0],
          start = performance.now(),
          probe = state.probe;
        state.pending++;
        const result = original(channel, ...args);
        result.then(
          (response) => {
            // Vue's await continuation and DOM patch run as microtasks before the next animation frame.
            requestAnimationFrame(() => {
              state.pending--;
              if (!response.ok) {
                if (!probe) state.failed++;
                return;
              }
              const expected = response.value
                .filter(
                  (edit, index, all) =>
                    /^[а-яё]+$/iu.test(edit.word) &&
                    all.findIndex((e) => e.word === edit.word) === index
                )
                .slice(0, 3)
                .map((e) => e.word);
              const buttons = [
                ...document.querySelectorAll('[aria-label="Подсказки слов"] button')
              ];
              const actual = buttons
                .filter((b) => !b.disabled)
                .map((b) => b.getAttribute("aria-label"));
              if (buttons.length !== 3 || JSON.stringify(actual) !== JSON.stringify(expected)) {
                state.failed++;
                return;
              }
              if (probe) state.probeCompleted++;
              else state.samples.push({ id, start, end: performance.now(), count: actual.length });
            });
          },
          () => {
            state.pending--;
            if (!probe) state.failed++;
          }
        );
        return result;
      };
    });
    await page.getByRole("button", { name: "Печать глазами", exact: true }).click();
    await page.waitForURL(/#\/eye-typing$/);
    const waitCount = async (n) =>
      page.waitForFunction(
        (n) => window.__windowsModel.failed || window.__windowsModel.samples.length >= n,
        n,
        { timeout: 10000 }
      );
    await waitCount(1);
    assert.equal(await page.evaluate(() => window.__windowsModel.failed), 0);
    const first = await page.evaluate(() => window.__windowsModel.samples[0]);
    assert.ok(first && first.end - first.start <= 3000, "initial process query exceeds 3 seconds");
    // DEV-only synthetic repeat workload, not independent FINAL quality evaluation.
    // Each edit uses the public keyboard and completes the real IPC/TypingSession/sidecar/DOM path.
    for (let n = 2; n <= 1001; n++) {
      await page
        .getByRole("button", { name: n % 2 === 0 ? "ч" : "Убрать символ", exact: true })
        .click();
      await waitCount(n);
      assert.equal(
        await page.evaluate(() => window.__windowsModel.failed),
        0,
        "a request or DOM commit failed"
      );
    }
    const samples = await page.evaluate(() => window.__windowsModel.samples);
    const metrics = summarize(samples.slice(1));
    // Numeric-only request trace permits auditing zero-suggestion completions without query content.
    writeFileSync(
      "qualification/requests.json",
      JSON.stringify({ schema: "windows-model-request-timing-v1", requests: samples })
    );
    // Manual typing while a prediction is in flight: two public key events, no awaiting inference.
    const responsive = await page.evaluate(async () => {
      const state = window.__windowsModel;
      state.probe = true;
      const before = document.querySelector('[aria-label="Черновик"]').textContent;
      const button = [...document.querySelectorAll('[aria-label="Клавиши"] button')].find(
        (b) => b.getAttribute("aria-label") === "а"
      );
      const start = performance.now();
      button.click();
      const duringPrediction = state.pending > 0;
      button.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        ms: performance.now() - start,
        duringPrediction,
        textChanged: document.querySelector('[aria-label="Черновик"]').textContent === before + "аа"
      };
    });
    assert.ok(
      responsive.duringPrediction && responsive.textChanged && responsive.ms <= 300,
      "manual input blocked during prediction"
    );
    await page.waitForFunction(() => window.__windowsModel.pending === 0, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__windowsModel.failed), 0, "probe DOM mismatch");
    assert.ok(
      await page.evaluate(() => window.__windowsModel.probeCompleted >= 1),
      "latest manual edit did not complete inference"
    );
    const appMemory = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({ type: p.type, memory: p.memory, cpu: p.cpu }))
    );
    const children = await app.evaluate(() => {
      const s = global.__windowsModelChildren;
      return { spawned: s.spawned, closed: s.closed, failed: s.failed, live: s.live.size };
    });
    assert.ok(
      children.spawned >= 1001 &&
        children.live === 0 &&
        children.failed === 0 &&
        children.closed === children.spawned,
      "owned sidecar leak or missing real inference"
    );
    assert.equal(app.windows().length, 1);
    writeFileSync(
      "qualification/ui.json",
      JSON.stringify(
        {
          schema: "windows-model-ui-v1",
          status: metrics.within_budget ? "PASS" : "FAIL",
          ...metrics,
          initial_process_query_ms: first.end - first.start,
          manual_input: responsive,
          children,
          window_responses: { expected_windows: 1, actual_windows: app.windows().length },
          scope:
            "built-file Electron EyeTyping route -> IPC -> TypingSession -> real Windows sidecar -> prediction DOM + rAF; NOT packaged",
          workload:
            "1000 completed repeated DEV-only synthetic edits after initial query; not FINAL or quality approval",
          app_memory: {
            scope: "Electron app.getAppMetrics snapshot, not peak or private-commit enforcement",
            processes: appMemory
          },
          hardware: "NOT_TESTED",
          production_approved: false
        },
        null,
        2
      )
    );
    assert.ok(metrics.within_budget, "UI latency budget exceeded; aggregate metrics retained");
  } finally {
    if (app) await app.close();
    rmSync(root, { recursive: true, force: true });
  }
}
benchmark().catch(() => {
  console.error("Windows UI benchmark failed (queries and profile paths suppressed)");
  process.exitCode = 1;
});
