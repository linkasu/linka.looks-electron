import { _electron as electron, ElectronApplication, expect, test } from "@playwright/test";
import AdmZip from "adm-zip";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const devServerUrl = "http://localhost:5173";

test("editor settings expose row and column controls", async () => {
  const root = mkdtempSync(join(tmpdir(), "linka-e2e-"));
  const userDataDir = join(root, "userData");
  const homeDir = join(root, "LINKa");

  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(join(userDataDir, "config.json"), JSON.stringify({
    pcHash: "00000000-0000-4000-8000-000000000000",
    first_calibrate: true,
    defaultSetsDownloaded: 1
  }));

  const setName = "agent-e2e.linka";
  const zip = new AdmZip();
  zip.addFile("config.json", Buffer.from(JSON.stringify({
    version: "3.0",
    withoutSpace: false,
    directSet: false,
    quizAutoNext: true,
    quizReadQuestion: false,
    pages: [
      {
        id: "page-1",
        mode: "standard",
        columns: 3,
        rows: 3,
        cards: [{ id: "card-1", cardType: 3 }]
      }
    ]
  })));
  zip.writeZip(join(homeDir, setName));

  let electronApp: ElectronApplication | null = null;

  try {
    electronApp = await electron.launch({
      args: ["dist-electron/main.js"],
      env: {
        ...process.env,
        IS_TEST: "1",
        LINKA_HOME_DIR: homeDir,
        NODE_ENV: "development",
        TEST_USER_DATA_DIR: userDataDir,
        VITE_DEV_SERVER_URL: devServerUrl
      }
    });

    const window = await electronApp.firstWindow();
    await window.goto(`${devServerUrl}/#/edit/§${setName}`);

    await window.getByRole("button", { name: "Открыть настройки набора" }).click();
    await expect(window.getByLabel("Количество колонок")).toBeVisible();
    await expect(window.getByLabel("Количество строк")).toBeVisible();

    await window.getByLabel("Количество строк").fill("2");
    await expect(window.getByLabel("Количество строк")).toHaveValue("2");
  } finally {
    await electronApp?.close();
  }
});

test("set explorer grid fills the viewport above footer", async () => {
  const root = mkdtempSync(join(tmpdir(), "linka-e2e-"));
  const userDataDir = join(root, "userData");
  const homeDir = join(root, "LINKa");

  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(join(userDataDir, "config.json"), JSON.stringify({
    pcHash: "00000000-0000-4000-8000-000000000000",
    first_calibrate: true,
    defaultSetsDownloaded: 1
  }));

  const setName = "layout-e2e.linka";
  const cards = Array.from({ length: 48 }, (_, index) => ({
    id: `card-${index}`,
    cardType: 0,
    title: String(index),
    imagePath: "missing.png"
  }));
  const zip = new AdmZip();
  zip.addFile("config.json", Buffer.from(JSON.stringify({
    version: "3.0",
    withoutSpace: false,
    directSet: false,
    quizAutoNext: true,
    quizReadQuestion: false,
    pages: [0, 1].map((pageIndex) => ({
      id: `page-${pageIndex}`,
      mode: "standard",
      columns: 12,
      rows: 4,
      cards
    }))
  })));
  zip.writeZip(join(homeDir, setName));

  let electronApp: ElectronApplication | null = null;

  try {
    electronApp = await electron.launch({
      args: ["dist-electron/main.js"],
      env: {
        ...process.env,
        IS_TEST: "1",
        LINKA_HOME_DIR: homeDir,
        NODE_ENV: "development",
        TEST_USER_DATA_DIR: userDataDir,
        VITE_DEV_SERVER_URL: devServerUrl
      }
    });

    const window = await electronApp.firstWindow();
    await window.goto(`${devServerUrl}/#/set/§${setName}`);
    await expect(window.getByText("1 из 2")).toBeVisible();

    const metrics = await window.evaluate(() => {
      const grid = document.querySelector(".grid")?.getBoundingClientRect();
      const footer = document.querySelector(".footer")?.getBoundingClientRect();
      const leftButton = document.querySelector(".left-grid > button")?.getBoundingClientRect();
      const rightButton = document.querySelector(".grid > button")?.getBoundingClientRect();
      return {
        footerBottom: footer?.bottom ?? 0,
        footerTop: footer?.top ?? 0,
        gridBottom: grid?.bottom ?? 0,
        gridHeight: grid?.height ?? 0,
        leftButtonHeight: leftButton?.height ?? 0,
        rightButtonHeight: rightButton?.height ?? 0,
        viewportHeight: window.innerHeight
      };
    });

    expect(metrics.footerBottom).toBeCloseTo(metrics.viewportHeight, 1);
    expect(metrics.gridBottom).toBeLessThanOrEqual(metrics.footerTop + 1);
    expect(metrics.leftButtonHeight).toBeGreaterThan(metrics.gridHeight * 0.95);
    expect(metrics.rightButtonHeight).toBeGreaterThan(metrics.gridHeight * 0.95);
  } finally {
    await electronApp?.close();
  }
});
