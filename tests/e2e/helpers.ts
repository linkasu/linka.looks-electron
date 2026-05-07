import { _electron as electron, ElectronApplication, Page } from "@playwright/test";
import AdmZip from "adm-zip";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const devServerUrl = "http://localhost:5173";

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

export function createE2EContext (): E2EContext {
  const root = mkdtempSync(join(tmpdir(), "linka-e2e-"));
  const userDataDir = join(root, "userData");
  const homeDir = join(root, "LINKa");

  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(join(userDataDir, "config.json"), JSON.stringify({
    pcHash: "test",
    first_calibrate: true,
    defaultSetsDownloaded: 1
  }));

  return { root, homeDir, userDataDir };
}

export function cleanupE2EContext (context: E2EContext) {
  rmSync(context.root, { force: true, recursive: true });
}

export function writeLinkaSet (homeDir: string, setName: string, config: TestSetConfig, entries: Record<string, Buffer> = {}) {
  const zip = new AdmZip();
  zip.addFile("config.json", Buffer.from(JSON.stringify(config)));
  Object.entries(entries).forEach(([entryName, buffer]) => {
    zip.addFile(entryName, buffer);
  });
  zip.writeZip(join(homeDir, setName));
}

export async function launchTestElectron (context: E2EContext): Promise<ElectronApplication> {
  return electron.launch({
    args: ["dist-electron/main.js"],
    env: {
      ...process.env,
      IS_TEST: "1",
      LINKA_HOME_DIR: context.homeDir,
      NODE_ENV: "development",
      TEST_USER_DATA_DIR: context.userDataDir,
      VITE_DEV_SERVER_URL: devServerUrl
    }
  });
}

export async function firstTestWindow (electronApp: ElectronApplication): Promise<Page> {
  const window = await electronApp.firstWindow();
  await mockExternalServices(window);
  return window;
}

export async function mockExternalServices (page: Page) {
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

export function standardConfig (cards: Array<Record<string, unknown>>, overrides: Partial<TestSetConfig> = {}): TestSetConfig {
  return {
    version: "3.0",
    withoutSpace: false,
    directSet: false,
    quizAutoNext: true,
    quizReadQuestion: false,
    pages: [{
      id: "page-1",
      mode: "standard",
      columns: cards.length,
      rows: 1,
      cards
    }],
    ...overrides
  };
}
