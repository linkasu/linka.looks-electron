import { expect, test, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupE2EContext,
  createE2EContext,
  devServerUrl,
  firstTestWindow,
  launchTestElectron,
  standardConfig,
  writeLinkaSet
} from "./helpers";

type Targets = {
  id: string;
  bounds: Array<{ x: number; y: number; width: number; height: number }>;
};
const modes = [
  { value: "hidden", label: "Стрелки скрыты" },
  { value: "mouseOnly", label: "Только мышь" },
  { value: "mouseAndEyes", label: "Мышь и глаза" }
];

test("functional parity: offline boot uses bundled icons without requesting a CDN stylesheet", async () => {
  const context = createE2EContext();
  const app = await launchTestElectron(context);
  try {
    const page = await firstTestWindow(app);
    let externalStyles = 0;
    await page.route("https://cdn.jsdelivr.net/**", async (route) => {
      externalStyles++;
      await route.abort();
    });
    await page.reload();
    await expect(page.locator(".folder-grid")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(externalStyles).toBe(0);
    await expect(page.locator('link[rel="stylesheet"][href^="https://"]')).toHaveCount(0);
    await expect(page.locator(".mdi").first()).toBeVisible();
    expect(
      await page
        .locator(".mdi")
        .first()
        .evaluate((element) => getComputedStyle(element, "::before").fontFamily)
    ).toContain("Material Design Icons");
    const fontSources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.includes("materialdesignicons-webfont"))
    );
    expect(fontSources.some((url) => url.startsWith(devServerUrl))).toBe(true);
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});

async function recordTargets(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.on("eye-elements", (_event, targets) => {
      (globalThis as typeof globalThis & { parityTargets: Targets }).parityTargets = targets;
    });
  });
}

async function waitForLayout(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().iterations !== Infinity
            ).length
      )
    )
    .toBe(0);
}

async function gaze(app: ElectronApplication, button: Locator) {
  const find = async () =>
    app.evaluate(
      (_electron, rect) => {
        const targets = (globalThis as typeof globalThis & { parityTargets?: Targets })
          .parityTargets;
        return {
          id: targets?.id,
          elementIndex:
            targets?.bounds.findIndex(
              (bounds) =>
                rect &&
                ["x", "y", "width", "height"].every(
                  (key) =>
                    Math.abs(bounds[key as keyof typeof bounds] - rect[key as keyof typeof rect]) <
                    1
                )
            ) ?? -1
        };
      },
      await button.boundingBox()
    );
  let previous = "";
  await expect
    .poll(async () => {
      const current = await find();
      const epoch = `${current.id}:${current.elementIndex}`;
      const stable = current.elementIndex >= 0 && epoch === previous;
      previous = epoch;
      return stable;
    })
    .toBe(true);
  const target = await find();
  await app.evaluate(({ BrowserWindow }, data) => {
    if (
      (globalThis as typeof globalThis & { parityTargets?: Targets }).parityTargets?.id !== data.id
    ) {
      throw new Error("Gaze target map changed before dispatch");
    }
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.send("eye-enter", data);
    window.webContents.send("eye-click", { ...data, count: 1 });
  }, target);
}

for (const mode of modes) {
  test(`functional parity: settings restart and input preserve ${mode.value}`, async () => {
    test.setTimeout(60000);
    const context = createE2EContext();
    writeLinkaSet(
      context.homeDir,
      "parity.linka",
      standardConfig([], {
        withoutSpace: true,
        pages: ["А", "Б"].map((title, index) => ({
          id: `p${index}`,
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: `c${index}`, cardType: 0, title }]
        }))
      })
    );
    let app = await launchTestElectron(context);
    try {
      let page = await firstTestWindow(app);
      await page.goto(`${devServerUrl}/#/settings`);
      await page.getByText("Перелистывание и выход из набора", { exact: true }).click();
      await page.getByRole("combobox", { name: "Способ перелистывания" }).press("Enter");
      await page.getByRole("option", { name: mode.label, exact: true }).click();
      await expect
        .poll(
          () =>
            JSON.parse(readFileSync(join(context.userDataDir, "config.json"), "utf8"))
              .button_pageTurnMode
        )
        .toBe(mode.value);
      await app.close();
      app = await launchTestElectron(context);
      await recordTargets(app);
      page = await firstTestWindow(app);
      await page.goto(`${devServerUrl}/#/settings`);
      await page.getByText("Перелистывание и выход из набора", { exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Способ перелистывания" })).toHaveValue(
        mode.label
      );
      await page.goto(`${devServerUrl}/#/set/§parity.linka`);
      await page.getByRole("button", { name: "А", exact: true }).click();
      const arrows = page.locator(".grid button.lock");
      if (mode.value === "hidden") {
        await expect(arrows).toHaveCount(0);
      } else {
        await app.evaluate(({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0];
          window.unmaximize();
          // macOS CI can clamp 768px content to its smaller desktop work area.
          window.setContentSize(1024, 600);
        });
        await expect
          .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
          .toEqual({ width: 1024, height: 600 });
        await waitForLayout(page);
        await gaze(app, arrows.nth(1));
        if (mode.value === "mouseOnly") {
          await expect(page.getByRole("button", { name: "А", exact: true })).toBeVisible();
          await arrows.nth(1).click();
        }
        await expect(page.getByRole("button", { name: "Б", exact: true })).toBeVisible();
        await arrows.nth(1).click();
        await expect(page.getByRole("button", { name: "Б", exact: true })).toBeVisible();
      }
      await expect(page.locator(".output-text .text")).toContainText("А");
      await page.screenshot({ path: test.info().outputPath(`${mode.value}.png`) });
    } finally {
      await app.close();
      cleanupE2EContext(context);
    }
  });
}

test("functional parity: hidden output gives grid space and retains gaze pause and paused mouse paging", async () => {
  const context = createE2EContext();
  writeLinkaSet(
    context.homeDir,
    "parity.linka",
    standardConfig([], {
      pages: ["А", "Б"].map((title, index) => ({
        id: `p${index}`,
        mode: "standard",
        columns: 1,
        rows: 1,
        cards: [{ id: `c${index}`, cardType: 0, title }]
      }))
    })
  );
  const app = await launchTestElectron(context);
  try {
    await recordTargets(app);
    const page = await firstTestWindow(app);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.unmaximize();
      window.setContentSize(800, 600);
    });
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual({ width: 800, height: 600 });
    await page.goto(`${devServerUrl}/#/set/§parity.linka`);
    await expect(page.getByRole("button", { name: "А", exact: true })).toBeVisible();
    await waitForLayout(page);
    await expect
      .poll(() =>
        page.locator(".grid").evaluate((element) => element.getBoundingClientRect().bottom)
      )
      .toBeLessThanOrEqual(600);
    const height = await page
      .locator(".grid")
      .evaluate((element) => element.getBoundingClientRect().height);
    await page.getByRole("button", { name: "Скрыть строку вывода", exact: true }).click();
    await expect
      .poll(() =>
        page.locator(".grid").evaluate((element) => element.getBoundingClientRect().height)
      )
      .toBeGreaterThan(height + 100);
    await gaze(app, page.getByRole("button", { name: "Приостановить управление", exact: true }));
    await expect(page.getByRole("button", { name: "А", exact: true })).toBeDisabled();
    await gaze(app, page.getByRole("button", { name: "Следующая страница", exact: true }));
    await expect(page.getByRole("button", { name: "А", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Следующая страница", exact: true }).click();
    await expect(page.getByRole("button", { name: "Б", exact: true })).toBeVisible();
    await gaze(app, page.getByRole("button", { name: "Возобновить управление", exact: true }));
    await expect(page.getByRole("button", { name: "Б", exact: true })).toBeEnabled();
    const bounds = await page
      .locator(".v-app-bar button")
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getBoundingClientRect().toJSON())
          .filter((rect) => rect.width && rect.height)
      );
    for (const rect of bounds) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(800);
    }
    await page.screenshot({ path: test.info().outputPath("output-hidden.png") });
  } finally {
    await app.close();
    cleanupE2EContext(context);
  }
});
