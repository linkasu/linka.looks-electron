import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
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

const modes = [
  { value: "hidden", label: "Стрелки скрыты" },
  { value: "mouseOnly", label: "Только мышь" },
  { value: "mouseAndEyes", label: "Мышь и глаза" }
];

for (const viewport of [
  { width: 1024, height: 600 },
  { width: 1366, height: 768 }
]) {
  for (const pagination of [true, false]) {
    for (const exitEnabled of [true, false]) {
      test(`page arrows: geometry ${viewport.width}x${viewport.height}, pagination=${pagination}, exit=${exitEnabled}`, async () => {
        const context = createArrowContext();
        const configPath = join(context.userDataDir, "config.json");
        const config = JSON.parse(readFileSync(configPath, "utf8"));
        config.ui_exitButton = exitEnabled;
        config.button_pageTurnMode = pagination ? "mouseAndEyes" : "hidden";
        writeFileSync(configPath, JSON.stringify(config));
        const setName = "arrow-geometry.linka";
        writeLinkaSet(
          context.homeDir,
          setName,
          standardConfig([], {
            directSet: true,
            pages: [0, 1].map((index) => ({
              id: `page-${index}`,
              mode: "standard",
              columns: 1,
              rows: 1,
              cards: [{ id: `card-${index}`, cardType: 0, title: `Card ${index}` }]
            }))
          })
        );
        const app = await launchTestElectron(context);
        try {
          await app.evaluate(({ ipcMain }) => {
            ipcMain.on("eye-elements", (_event, targets: GazeTargets) => {
              (globalThis as typeof globalThis & { arrowTargets?: GazeTargets }).arrowTargets =
                targets;
            });
          });
          const window = await firstTestWindow(app);
          await app.evaluate(({ BrowserWindow }, size) => {
            const window = BrowserWindow.getAllWindows()[0];
            window.unmaximize();
            window.setContentSize(size.width, size.height);
          }, viewport);
          const windowSizes = async () => ({
            content: await app.evaluate(({ BrowserWindow }) =>
              BrowserWindow.getAllWindows()[0].getContentBounds()
            ),
            renderer: await window.evaluate(() => ({ width: innerWidth, height: innerHeight }))
          });
          try {
            await expect.poll(windowSizes).toMatchObject({ content: viewport, renderer: viewport });
          } finally {
            writeFileSync(
              test.info().outputPath("window-sizes.json"),
              JSON.stringify({ requested: viewport, ...(await windowSizes()) }, null, 2)
            );
            await window.screenshot({ path: test.info().outputPath("native-window.png") });
          }
          await window.goto(`${devServerUrl}/#/set/§${setName}`);
          for (const [index, output] of [false, true, false].entries()) {
            const name = `${index}-${output ? "output-visible" : "output-hidden"}`;
            await expect(window.locator(".output-text")).toHaveCount(output ? 1 : 0);
            await checkGridGeometry(app, window, pagination, exitEnabled && !output, name);
            if (index < 2) {
              await window
                .getByRole("button", {
                  name: output ? "Скрыть строку вывода" : "Показать строку вывода",
                  exact: true
                })
                .click();
            }
          }
          if (exitEnabled) {
            await window.getByRole("button", { name: "Вернуться к наборам", exact: true }).click();
            await expect(window.locator(".folder-grid")).toBeVisible();
          }
        } finally {
          await app.close();
          cleanupE2EContext(context);
        }
      });
    }
  }
}

type Box = { x: number; y: number; width: number; height: number };
type GazeTargets = { id: string; bounds: Box[] };

async function checkGridGeometry(
  app: ElectronApplication,
  page: Page,
  pagination: boolean,
  exit: boolean,
  name: string
) {
  const arrows = page.locator(".grid button.lock");
  const exitButton = page.locator('.grid [aria-label="Вернуться к наборам"]');
  await expect(arrows).toHaveCount(pagination ? 2 : 0);
  await expect(exitButton).toHaveCount(exit ? 1 : 0);
  await expect(page.locator(".right-grid")).toHaveCount(pagination ? 1 : 0);
  try {
    await expect
      .poll(async () => {
        const grid = await page.locator(".grid").boundingBox();
        const cards = await page.locator(".grid > .cards").boundingBox();
        if (!grid || !cards) return Infinity;
        const sideWidth = pagination || exit ? grid.width / 10 : 0;
        const errors = [
          Math.abs(cards.x - grid.x - sideWidth),
          Math.abs(cards.width - (grid.width - sideWidth * (pagination ? 2 : 1))),
          Math.abs(cards.y - grid.y - 1),
          Math.abs(cards.height - grid.height + 1),
          Math.max(
            0,
            -grid.x,
            -grid.y,
            grid.x + grid.width - (await page.evaluate(() => innerWidth)),
            grid.y + grid.height - (await page.evaluate(() => innerHeight))
          )
        ];
        if (pagination) {
          const left = await arrows.nth(0).boundingBox();
          const right = await arrows.nth(1).boundingBox();
          if (!left || !right) return Infinity;
          errors.push(
            Math.abs(left.width - right.width),
            Math.abs(left.height - right.height),
            Math.abs(left.y - right.y),
            Math.abs(left.y + left.height - right.y - right.height),
            Math.abs(left.y - cards.y - (exit ? cards.height / 6 : 0)),
            Math.abs(left.height - cards.height * (exit ? 5 / 6 : 1))
          );
        }
        if (exit) {
          const bounds = await exitButton.boundingBox();
          if (!bounds) return Infinity;
          errors.push(
            Math.abs(bounds.y - cards.y),
            Math.abs(bounds.height - cards.height / (pagination ? 6 : 1))
          );
        }
        return Math.max(...errors);
      })
      .toBeLessThanOrEqual(1);
    await expect
      .poll(async () => {
        const actual = await page
          .locator(".eye")
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().toJSON())
          );
        const recorded = await app.evaluate(
          () => (globalThis as typeof globalThis & { arrowTargets?: GazeTargets }).arrowTargets
        );
        return (
          recorded?.bounds.length === actual.length &&
          actual.every((rect, index) =>
            ["x", "y", "width", "height"].every(
              (key) => Math.abs(rect[key] - recorded.bounds[index][key as keyof Box]) <= 1
            )
          )
        );
      })
      .toBe(true);
    if (pagination && exit) {
      expect(
        await page.locator(".right-grid").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return !!document
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 12)
            ?.closest("button, .eye, [tabindex]");
        })
      ).toBe(false);
    }
  } finally {
    writeFileSync(
      test.info().outputPath(`${name}-boxes.json`),
      JSON.stringify(
        {
          elements: await page
            .locator(".grid, .grid > .cards, .grid button")
            .evaluateAll((elements) =>
              elements.map((element) => ({
                label: element.getAttribute("aria-label"),
                bounds: element.getBoundingClientRect().toJSON()
              }))
            ),
          gaze: await app.evaluate(
            () => (globalThis as typeof globalThis & { arrowTargets?: GazeTargets }).arrowTargets
          )
        },
        null,
        2
      )
    );
    await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  }
}

for (const mode of modes) {
  test(`page arrows: settings and restart preserve ${mode.value}`, async () => {
    // Two launches each allow up to 20s for the first usable window.
    test.setTimeout(60000);
    const context = createArrowContext();
    const setName = "page-arrows.linka";
    writeLinkaSet(
      context.homeDir,
      setName,
      standardConfig([], {
        pages: ["А", "Б"].map((title, index) => ({
          id: `page-${index}`,
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: `card-${index}`, cardType: 0, title }]
        }))
      })
    );

    let app = await launchTestElectron(context);
    try {
      let window = await firstTestWindow(app);
      await window.goto(`${devServerUrl}/#/settings`);
      await window.getByText("Перелистывание и выход из набора", { exact: true }).click();
      const select = window.getByRole("combobox", { name: "Способ перелистывания" });
      await select.press("Enter");
      for (const option of modes) {
        await expect(window.getByRole("option", { name: option.label, exact: true })).toBeVisible();
      }
      await window.getByRole("option", { name: mode.label, exact: true }).click();
      const configPath = join(context.userDataDir, "config.json");
      await expect
        .poll(() => JSON.parse(readFileSync(configPath, "utf8")).button_pageTurnMode)
        .toBe(mode.value);

      await window.screenshot({ path: test.info().outputPath("settings.png") });
      await app.close();
      app = await launchTestElectron(context);
      window = await firstTestWindow(app);
      await window.goto(`${devServerUrl}/#/settings`);
      await window.getByText("Перелистывание и выход из набора", { exact: true }).click();
      await expect(window.getByRole("combobox", { name: "Способ перелистывания" })).toHaveValue(
        mode.label
      );
      await window.goto(`${devServerUrl}/#/set/§${setName}`);
      await expect(window.getByText("1 из 2")).toBeVisible();
      const arrows = window.locator(".grid button.lock");
      if (mode.value === "hidden") {
        await expect(arrows).toHaveCount(0);
        await expect(window.locator(".grid .mdi-arrow-left, .grid .mdi-arrow-right")).toHaveCount(
          0
        );
        await window.getByRole("button", { name: "А", exact: true }).click();
        await expect(window.locator(".output-text .text")).toContainText("А");
      } else {
        await expect(arrows).toHaveCount(2);
        if (mode.value === "mouseOnly") {
          await expect(arrows.nth(1)).toHaveAttribute("data-eye-disabled", "1");
        } else {
          await expect(arrows.nth(1)).not.toHaveAttribute("data-eye-disabled");
        }
        await arrows.nth(0).click();
        await expect(window.getByText("1 из 2")).toBeVisible();
        await window.getByRole("button", { name: "А", exact: true }).click();
        await arrows.nth(1).click();
        await expect(window.getByText("2 из 2")).toBeVisible();
        await expect(window.locator(".output-text .text")).toContainText("А");
        await arrows.nth(1).click();
        await expect(window.getByText("2 из 2")).toBeVisible();

        const bounds = await arrows.nth(0).boundingBox();
        if (!bounds) throw new Error("Previous-page arrow has no touch target");
        const cdp = await window.context().newCDPSession(window);
        try {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }]
          });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } finally {
          await cdp.detach();
        }
        await expect(window.getByText("1 из 2")).toBeVisible();
        await expect(window.locator(".output-text .text")).toContainText("А");
        await arrows.nth(1).press("Space");
        await expect(window.getByText("2 из 2")).toBeVisible();
        await arrows.nth(0).press("Space");
        await expect(window.getByText("1 из 2")).toBeVisible();
      }
      await window.screenshot({ path: test.info().outputPath("set.png") });
    } finally {
      await app.close();
      cleanupE2EContext(context);
    }
  });
}

for (const value of [undefined, "mouseOnly", "mouseAndEyes"]) {
  test(`page arrows: loads legacy ${value ?? "absent"} setting`, async () => {
    const context = createArrowContext();
    const configPath = join(context.userDataDir, "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (value) config.button_pageTurnMode = value;
    writeFileSync(configPath, JSON.stringify(config));
    const app = await launchTestElectron(context);
    try {
      const window = await firstTestWindow(app);
      await window.goto(`${devServerUrl}/#/settings`);
      await window.getByText("Перелистывание и выход из набора", { exact: true }).click();
      await expect(window.getByRole("combobox", { name: "Способ перелистывания" })).toHaveValue(
        value === "mouseOnly" ? "Только мышь" : "Мышь и глаза"
      );
    } finally {
      await app.close();
      cleanupE2EContext(context);
    }
  });
}

function createArrowContext() {
  const context = createE2EContext();
  writeFileSync(
    join(context.userDataDir, "telemetry-preference-v3.json"),
    JSON.stringify({ schemaVersion: 3, preference: "disabled" })
  );
  return context;
}
