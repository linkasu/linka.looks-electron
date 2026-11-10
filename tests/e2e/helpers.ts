import { _electron as electron, ElectronApplication, expect, Page, test } from "@playwright/test";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BubbleResult } from "../../src/common/bubble/contract";
import { connectBubbleControl } from "../../src/electron/bubble/controlChannel";

export const devServerUrl = process.env.E2E_DEV_SERVER_URL || "http://127.0.0.1:5174";
const testElectronRemoteDebuggingPort =
  process.env.E2E_TEST_ELECTRON_REMOTE_DEBUGGING_PORT || "9323";

export interface E2EContext {
  root: string;
  homeDir: string;
  userDataDir: string;
}

export interface TestSetConfig {
  version: string;
  withoutSpace: boolean;
  directSet?: boolean;
  quizAutoNext?: boolean;
  quizReadQuestion?: boolean;
  pages: Array<{
    id: string;
    mode: "standard" | "quiz" | "match";
    columns: number;
    rows: number;
    cards: Array<Record<string, unknown>>;
    question?: string;
  }>;
}

export function createE2EContext(explicitTelemetryChoice = true): E2EContext {
  const root = mkdtempSync(
    join(
      process.platform === "win32" && process.env.APPDATA ? process.env.APPDATA : tmpdir(),
      "linka-e2e-"
    )
  );
  const userDataDir = join(root, "userData");
  const homeDir = join(root, "LINKa");

  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(
    join(userDataDir, "config.json"),
    JSON.stringify({
      pcHash: "test",
      telemetryConsent: "disabled",
      first_calibrate: true,
      defaultSetsDownloaded: 1
    })
  );
  if (explicitTelemetryChoice) {
    writeFileSync(
      join(userDataDir, "telemetry-preference-v3.json"),
      JSON.stringify({ schemaVersion: 3, preference: "disabled" })
    );
  }

  return { root, homeDir, userDataDir };
}

export function cleanupE2EContext(context: E2EContext) {
  rmSync(context.root, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
}

export function writeLinkaSet(
  homeDir: string,
  setName: string,
  config: TestSetConfig,
  entries: Record<string, Buffer> = {}
) {
  const zip = new AdmZip();
  zip.addFile("config.json", Buffer.from(JSON.stringify(config)));
  Object.entries(entries).forEach(([entryName, buffer]) => {
    zip.addFile(entryName, buffer);
  });
  zip.writeZip(join(homeDir, setName));
}

export async function launchTestElectron(context: E2EContext): Promise<ElectronApplication> {
  const app = await electron.launch({
    timeout: 20000,
    args: [
      "-r",
      resolve("scripts/ci/startup-diagnostics.cjs"),
      "-r",
      resolve("tests/e2e/typing-tracker-fixture.cjs"),
      `--remote-debugging-port=${testElectronRemoteDebuggingPort}`,
      "dist-electron/main.js"
    ],
    env: {
      ...process.env,
      ELECTRON_REMOTE_DEBUGGING_PORT: testElectronRemoteDebuggingPort,
      IS_TEST: "1",
      LINKA_HOME_DIR: context.homeDir,
      LOCALAPPDATA: context.root,
      NODE_ENV: "development",
      NO_PROXY: [process.env.NO_PROXY, "localhost", "127.0.0.1", "::1"].filter(Boolean).join(","),
      TEST_USER_DATA_DIR: context.userDataDir,
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });
  return withTestBubbleCleanup(app, context);
}

export async function withTestBubbleCleanup(
  app: ElectronApplication,
  context: E2EContext
): Promise<ElectronApplication> {
  if (process.platform === "win32") {
    const appRoot = await app.evaluate(({ app }) => app.getAppPath());
    const installationId = createHash("sha256")
      .update(resolve(appRoot).toLowerCase())
      .digest("hex");
    const close = app.close.bind(app);
    app.close = async () => {
      try {
        try {
          if (
            app.process().exitCode === null &&
            app.process().signalCode === null &&
            app.windows().length
          )
            await readTestBubbleState(app);
        } finally {
          await stopTestBubbleAgent(context, installationId);
        }
      } finally {
        await close();
      }
    };
  }
  return app;
}

async function stopTestBubbleAgent(context: E2EContext, installationId: string) {
  let stopped = false;
  let control: Awaited<ReturnType<typeof connectBubbleControl>>;
  try {
    control = await connectBubbleControl(
      join(context.userDataDir, "bubble-agent"),
      installationId,
      () => {},
      () => {
        stopped = true;
      }
    );
  } catch (error) {
    if (["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code || "")) return;
    throw error;
  }
  try {
    const result = await control.request("prepare-update");
    if (!result.ok) throw new Error(result.code || "UPDATE_PREPARE_FAILED");
    await expect.poll(() => stopped, { timeout: 10000 }).toBe(true);
  } finally {
    control.close();
  }
}

export async function readTestBubbleState(app: ElectronApplication): Promise<BubbleResult> {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("BUBBLE_TEST_WINDOW_MISSING");
    return window.webContents.executeJavaScript(
      "require('electron').ipcRenderer.invoke('bubble:getState')"
    );
  });
}

export async function firstTestWindow(electronApp: ElectronApplication): Promise<Page> {
  const window = await electronApp.firstWindow();
  const errors: string[] = [];
  window.on("pageerror", (error) => errors.push(error.message));
  window.on("requestfailed", (request) => {
    if (request.url().startsWith(devServerUrl)) {
      errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
    }
  });
  await mockExternalServices(window);
  try {
    // Legacy reference builds and the redesign share .root, not .folder-grid.
    await window.locator(".root").waitFor({ state: "visible", timeout: 20000 });
    await window.waitForURL(/#\/(?:%C2%A7|§)$/, { timeout: 20000 });
  } catch (error) {
    console.error("E2E_STARTUP_DIAGNOSTIC", {
      url: window.url(),
      errors,
      windows: await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((window) => ({
          url: window.webContents.getURL(),
          visible: window.isVisible()
        }))
      )
    });
    try {
      await window.screenshot({
        path: test.info().outputPath("startup-failure.png"),
        timeout: 2000
      });
    } catch (captureError) {
      console.error("E2E_STARTUP_CAPTURE_FAILED", String(captureError));
    }
    throw error;
  }
  return window;
}

export async function mockExternalServices(page: Page) {
  await page.route("https://tts.linka.su/**", async (route) => {
    await route.fulfill({
      body: Buffer.from([0]),
      contentType: "audio/mpeg",
      status: 200
    });
  });
  await page.route("https://metric.linka.su/**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({}),
      contentType: "application/json",
      status: 200
    });
  });
}

export function standardConfig(
  cards: Array<Record<string, unknown>>,
  overrides: Partial<TestSetConfig> = {}
): TestSetConfig {
  return {
    version: "3.0",
    withoutSpace: false,
    directSet: false,
    quizAutoNext: true,
    quizReadQuestion: false,
    pages: [
      {
        id: "page-1",
        mode: "standard",
        columns: cards.length,
        rows: 1,
        cards
      }
    ],
    ...overrides
  };
}
